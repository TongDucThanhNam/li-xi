import { v } from "convex/values";
import { mutation, MutationCtx, query, QueryCtx } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { recordRedemptionCreated, recordSessionCreated } from "./analytics";
import { getRenderableCampaignAssetUrl, isRenderableCampaignAsset } from "./assets";
import { requireResolvedOwner } from "./authorization";
import { getCompletedOwnerBudgetForScope } from "./budgetScope";
import {
  DEFAULT_CAMPAIGN_BRAND,
  DEFAULT_CAMPAIGN_DESCRIPTION,
  DEFAULT_CAMPAIGN_NAME,
  createUniqueDefaultCampaignSlug,
  getPreferredActiveCampaignForOwner,
  listVisibleCampaignsForOwner,
} from "./campaignIdentity";
import {
  assertCanCreateCampaign,
  assertCanCreateSession,
  assertCanRedeem,
} from "./entitlements";
import {
  PENDING_STATION_SESSION_DELIVERY_MODES,
  listPendingCampaignSessionsByDelivery,
  listPendingOwnerSessionsByDelivery,
} from "./drawSessionPolicy";
import {
  displayNameFromUser,
  ensureHostProfileForOwner,
} from "./hostProfiles";
import {
  PUBLIC_CODE_BYTES,
  getPublicLinkExpiresAt,
  isExpiredPendingLinkSession,
  isPendingLinkSession,
  isOpenPendingSession,
  normalizePublicCode,
  resolvePublicLinkExpiresAt,
} from "./publicLinks";
import {
  ENVELOPE_COUNT,
  normalizeGuestName,
  validateGuestName,
  validatePin,
} from "../lib/lixiPolicy";
import { verifyPinHash } from "./security";

type ConvexCtx = QueryCtx | MutationCtx;
type DeliveryMode = "station" | "link";

const deliveryModeValidator = v.union(v.literal("station"), v.literal("link"));

function resolveDeliveryMode(deliveryMode: DeliveryMode | undefined): DeliveryMode {
  return deliveryMode ?? "station";
}

function resolveSessionDeliveryMode(session: Doc<"drawSessions">): DeliveryMode {
  return session.deliveryMode ?? (session.publicCode ? "link" : "station");
}

function isStationSession(session: Doc<"drawSessions">) {
  return resolveSessionDeliveryMode(session) === "station";
}

function secureRandomInt(maxExclusive: number) {
  if (!Number.isSafeInteger(maxExclusive) || maxExclusive <= 0) {
    throw new Error("Khoảng random không hợp lệ");
  }

  const uint32Range = 0x100000000;
  if (maxExclusive > uint32Range) {
    throw new Error("Tổng số lượng phần thưởng vượt giới hạn random an toàn");
  }
  const rejectionThreshold = uint32Range - (uint32Range % maxExclusive);
  const buffer = new Uint32Array(1);

  do {
    crypto.getRandomValues(buffer);
  } while (buffer[0] >= rejectionThreshold);

  return buffer[0] % maxExclusive;
}

async function buildSessionSnapshot(
  ctx: MutationCtx,
  owner: Doc<"users">,
  ownerId: Id<"users">,
  campaignId: Id<"campaigns">
) {
  const campaign = await ctx.db.get(campaignId);
  if (!campaign || campaign.ownerId !== ownerId) {
    throw new Error("Chiến dịch không hợp lệ");
  }
  const hostProfile = await ensureHostProfileForOwner(ctx, owner, {
    defaultCampaignId: campaignId,
  });

  const heroAssetCandidate =
    campaign.heroAssetId ? await ctx.db.get(campaign.heroAssetId) : null;
  const heroAsset =
    isRenderableCampaignAsset(heroAssetCandidate, ownerId) &&
    heroAssetCandidate.campaignId === campaign._id
      ? heroAssetCandidate
      : null;

  return {
    hostDisplayNameSnapshot: hostProfile.displayName ?? displayNameFromUser(owner),
    hostSlugSnapshot: hostProfile.slug,
    campaignNameSnapshot: campaign.name,
    campaignBrandNameSnapshot: campaign.brandName ?? undefined,
    campaignDescriptionSnapshot: campaign.description ?? undefined,
    campaignClaimHeadlineSnapshot: campaign.claimHeadline ?? undefined,
    campaignClaimSubtitleSnapshot: campaign.claimSubtitle ?? undefined,
    campaignClaimCtaLabelSnapshot: campaign.claimCtaLabel ?? undefined,
    campaignClaimCollectLabelSnapshot: campaign.claimCollectLabel ?? undefined,
    campaignClaimWaitingMessageSnapshot: campaign.claimWaitingMessage ?? undefined,
    campaignThemeSnapshot: campaign.theme,
    campaignHeroAssetKeySnapshot: heroAsset?.key,
  };
}

function validateEnvelopeIndex(envelopeIndex: number) {
  if (!Number.isInteger(envelopeIndex) || envelopeIndex < 0 || envelopeIndex >= ENVELOPE_COUNT) {
    throw new Error(`Phong bao không hợp lệ (0-${ENVELOPE_COUNT - 1})`);
  }
  return envelopeIndex;
}

function generatePublicCode() {
  const bytes = new Uint8Array(PUBLIC_CODE_BYTES);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function sanitizePublicCode(value: string) {
  return normalizePublicCode(value);
}

async function findPendingLinkSessionByPublicCode(
  ctx: ConvexCtx,
  publicCode: string
) {
  const sessions = await ctx.db
    .query("drawSessions")
    .withIndex("by_publicCode_status", (q) =>
      q.eq("publicCode", publicCode).eq("status", "pending")
    )
    .collect();
  const pendingLinkSessions = sessions.filter((session) => {
    return (
      isPendingLinkSession(session) &&
      !isExpiredPendingLinkSession(session)
    );
  });

  if (pendingLinkSessions.length !== 1) {
    return null;
  }

  const session = pendingLinkSessions[0];
  const campaign = session.campaignId ? await ctx.db.get(session.campaignId) : null;
  if (!campaign || campaign.ownerId !== session.ownerId || campaign.status !== "active") {
    return null;
  }

  return session;
}

async function generateUniquePublicCode(ctx: ConvexCtx) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const publicCode = generatePublicCode();
    const existing = await ctx.db
      .query("drawSessions")
      .withIndex("by_publicCode", (q) => q.eq("publicCode", publicCode))
      .collect();

    if (existing.length === 0) {
      return publicCode;
    }
  }

  throw new Error("Không thể tạo mã chia sẻ, vui lòng thử lại");
}

async function assertPublicCodeRemainsUnambiguous(ctx: ConvexCtx, publicCode: string) {
  const pendingSessions = await ctx.db
    .query("drawSessions")
    .withIndex("by_publicCode_status", (q) =>
      q.eq("publicCode", publicCode).eq("status", "pending")
    )
    .collect();
  const openLinkSessions = pendingSessions.filter(
    (session) => isPendingLinkSession(session) && !isExpiredPendingLinkSession(session)
  );

  if (openLinkSessions.length !== 1) {
    throw new Error("Mã chia sẻ bị trùng, vui lòng tạo lại link rút");
  }
}

async function getOwnerBudgetOrThrow(
  ctx: ConvexCtx,
  ownerId: Id<"users">,
  campaignId?: Id<"campaigns">
): Promise<Doc<"ownerBudgets">> {
  return getCompletedOwnerBudgetForScope(ctx, ownerId, campaignId);
}

function hasSpendableBudget(budget: Doc<"ownerBudgets"> | null): budget is Doc<"ownerBudgets"> {
  return Boolean(budget && budget.remainingBudget > 0);
}

function getPayableBudgetItemsForRemainingBudget(
  items: Doc<"budgetItems">[],
  remainingBudget: number
) {
  return items.filter(
    (item) =>
      item.isActive &&
      Number.isSafeInteger(item.amount) &&
      item.amount > 0 &&
      Number.isSafeInteger(item.remainingQuantity) &&
      item.remainingQuantity > 0 &&
      item.amount <= remainingBudget
  );
}

function getPayableBudgetItems(items: Doc<"budgetItems">[], budget: Doc<"ownerBudgets">) {
  return getPayableBudgetItemsForRemainingBudget(items, budget.remainingBudget);
}

function getPayablePrizeUnitCapacityForRemainingBudget(
  items: Doc<"budgetItems">[],
  startingRemainingBudget: number
) {
  let remainingBudget = startingRemainingBudget;
  let payableUnits = 0;
  const itemsByAscendingAmount = getPayableBudgetItemsForRemainingBudget(
    items,
    remainingBudget
  ).sort((left, right) => left.amount - right.amount);

  for (const item of itemsByAscendingAmount) {
    const affordableUnits = Math.min(
      item.remainingQuantity,
      Math.floor(remainingBudget / item.amount)
    );
    if (affordableUnits <= 0) {
      break;
    }

    payableUnits += affordableUnits;
    remainingBudget -= affordableUnits * item.amount;
  }

  return payableUnits;
}

function getPayablePrizeUnitCapacity(
  items: Doc<"budgetItems">[],
  budget: Doc<"ownerBudgets">
) {
  return getPayablePrizeUnitCapacityForRemainingBudget(items, budget.remainingBudget);
}

function getCapacityPreservingBudgetItems(
  items: Doc<"budgetItems">[],
  budget: Doc<"ownerBudgets">,
  pendingSessionsToPreserve: number
) {
  if (pendingSessionsToPreserve <= 0) {
    return items;
  }

  return items.filter((item) => {
    const nextRemainingBudget = budget.remainingBudget - item.amount;
    const nextItems = items.map((candidate) =>
      candidate._id === item._id
        ? {
            ...candidate,
            remainingQuantity: candidate.remainingQuantity - 1,
            isActive: candidate.remainingQuantity > 1,
          }
        : candidate
    );

    return (
      getPayablePrizeUnitCapacityForRemainingBudget(nextItems, nextRemainingBudget) >=
      pendingSessionsToPreserve
    );
  });
}

async function getAvailableBudgetItems(
  ctx: ConvexCtx,
  ownerId: Id<"users">,
  campaignId?: Id<"campaigns">
): Promise<Doc<"budgetItems">[]> {
  const items = campaignId
    ? (await ctx.db
        .query("budgetItems")
        .withIndex("by_campaign_owner_active", (q) =>
          q.eq("campaignId", campaignId).eq("ownerId", ownerId).eq("isActive", true)
        )
        .collect())
    : (await ctx.db
        .query("budgetItems")
        .withIndex("by_owner_campaign_active", (q) =>
          q.eq("ownerId", ownerId).eq("campaignId", undefined).eq("isActive", true)
        )
        .collect());

  return items.filter(
    (item) =>
      Number.isSafeInteger(item.amount) &&
      item.amount > 0 &&
      Number.isSafeInteger(item.remainingQuantity) &&
      item.remainingQuantity > 0
  );
}

async function getCampaignForSession(
  ctx: MutationCtx,
  owner: Doc<"users">,
  ownerId: Id<"users">,
  requestedCampaignId?: Id<"campaigns">
) {
  if (requestedCampaignId) {
    const campaign = await ctx.db.get(requestedCampaignId);
    if (!campaign || campaign.ownerId !== ownerId) {
      throw new Error("Chiến dịch không hợp lệ");
    }
    if (campaign.status !== "active") {
      throw new Error("Chỉ có chiến dịch đang chạy mới được tạo lượt rút");
    }
    await ensureHostProfileForOwner(ctx, owner, { defaultCampaignId: campaign._id });
    return campaign._id;
  }

  const activeCampaign = await getPreferredActiveCampaignForOwner(ctx, ownerId);
  if (activeCampaign) {
    await ensureHostProfileForOwner(ctx, owner, { defaultCampaignId: activeCampaign._id });
    return activeCampaign._id;
  }

  const visibleCampaigns = await listVisibleCampaignsForOwner(ctx, ownerId);
  if (visibleCampaigns.length > 0) {
    throw new Error("Hãy kích hoạt một chiến dịch trước khi tạo lượt rút");
  }

  await assertCanCreateCampaign(ctx, ownerId);
  const now = Date.now();
  const slug = await createUniqueDefaultCampaignSlug(ctx, ownerId);
  const campaignId = await ctx.db.insert("campaigns", {
    ownerId,
    name: DEFAULT_CAMPAIGN_NAME,
    slug,
    brandName: DEFAULT_CAMPAIGN_BRAND,
    description: DEFAULT_CAMPAIGN_DESCRIPTION,
    theme: "lunar",
    status: "active",
    createdAt: now,
    updatedAt: now,
  });
  await ensureHostProfileForOwner(ctx, owner, { defaultCampaignId: campaignId });
  return campaignId;
}

async function requireRedeemableSessionCampaign(
  ctx: MutationCtx,
  session: Doc<"drawSessions">
) {
  if (!session.campaignId) {
    throw new Error("Chiến dịch của lượt rút không còn hiệu lực");
  }

  const campaignId = session.campaignId;
  const campaign = await ctx.db.get(campaignId);
  if (!campaign || campaign.ownerId !== session.ownerId || campaign.status !== "active") {
    throw new Error("Chiến dịch của lượt rút không còn hiệu lực");
  }

  return campaignId;
}

async function getCampaignGuestRedemption(
  ctx: ConvexCtx,
  ownerId: Id<"users">,
  campaignId: Id<"campaigns">,
  guestNameNormalized: string
) {
  const redemption = await ctx.db
    .query("redemptions")
    .withIndex("by_campaign_owner_guestName", (q) =>
      q
        .eq("campaignId", campaignId)
        .eq("ownerId", ownerId)
        .eq("guestNameNormalized", guestNameNormalized)
    )
    .first();

  return redemption ?? null;
}

async function getPendingCampaignGuestSession(
  ctx: ConvexCtx,
  ownerId: Id<"users">,
  campaignId: Id<"campaigns">,
  guestNameNormalized: string
) {
  const session = await ctx.db
    .query("drawSessions")
    .withIndex("by_campaign_owner_guest_status", (q) =>
      q
        .eq("campaignId", campaignId)
        .eq("ownerId", ownerId)
        .eq("guestNameNormalized", guestNameNormalized)
        .eq("status", "pending")
    )
    .collect();

  return session.find(isOpenPendingSession) ?? null;
}

async function countOpenPendingCampaignSessions(
  ctx: ConvexCtx,
  ownerId: Id<"users">,
  campaignId?: Id<"campaigns">
) {
  const pendingSessions = await listPendingCampaignSessionsByDelivery(ctx, ownerId, campaignId);

  return pendingSessions.filter(isOpenPendingSession).length;
}

function pickBudgetItemByQuantity(items: Doc<"budgetItems">[]) {
  const totalUnits = items.reduce((sum, item) => sum + item.remainingQuantity, 0);
  if (totalUnits <= 0) {
    return null;
  }

  let random = secureRandomInt(totalUnits);
  for (const item of items) {
    random -= item.remainingQuantity;
    if (random < 0) {
      return item;
    }
  }
  return items[items.length - 1] ?? null;
}

function publicRewardPoolView(items: Doc<"budgetItems">[]) {
  const unique = new Map<string, { amount: number; rarity: Doc<"budgetItems">["rarity"] }>();
  for (const item of items) {
    if (item.remainingQuantity <= 0) {
      continue;
    }
    const key = `${item.amount}:${item.rarity}`;
    if (!unique.has(key)) {
      unique.set(key, {
        amount: item.amount,
        rarity: item.rarity,
      });
    }
  }

  return Array.from(unique.values()).map((item) => ({
    ...item,
    remainingQuantity: 1,
  }));
}

function rewardPoolView(items: Doc<"budgetItems">[]) {
  return items.map((item) => ({
    amount: item.amount,
    rarity: item.rarity,
    remainingQuantity: item.remainingQuantity,
  }));
}

function hasSessionCampaignSnapshot(session: Doc<"drawSessions">) {
  return Boolean(session.campaignNameSnapshot && session.campaignThemeSnapshot);
}

async function stationSessionCampaignView(
  ctx: ConvexCtx,
  ownerId: Id<"users">,
  session: Doc<"drawSessions">
) {
  const hasSnapshot = hasSessionCampaignSnapshot(session);
  const campaignCandidate = session.campaignId ? await ctx.db.get(session.campaignId) : null;
  const campaign =
    !hasSnapshot && campaignCandidate && campaignCandidate.ownerId === ownerId
      ? campaignCandidate
      : null;
  const campaignHeroAssetCandidate =
    campaign?.heroAssetId ? await ctx.db.get(campaign.heroAssetId) : null;
  const campaignHeroAsset =
    campaign &&
    isRenderableCampaignAsset(campaignHeroAssetCandidate, ownerId) &&
    campaignHeroAssetCandidate.campaignId === campaign._id
      ? campaignHeroAssetCandidate
      : null;
  const heroAssetUrl =
    (hasSnapshot && session.campaignId
      ? await getRenderableCampaignAssetUrl(
          ctx,
          ownerId,
          session.campaignHeroAssetKeySnapshot,
          session.campaignId
        )
      : null) ??
    (campaign && campaignHeroAsset
      ? await getRenderableCampaignAssetUrl(
          ctx,
          ownerId,
          campaignHeroAsset.key,
          campaign._id
        )
      : null);

  return {
    name: hasSnapshot
      ? session.campaignNameSnapshot!
      : campaign?.name ?? DEFAULT_CAMPAIGN_NAME,
    brandName: hasSnapshot
      ? session.campaignBrandNameSnapshot ?? null
      : campaign?.brandName ?? null,
    description: hasSnapshot
      ? session.campaignDescriptionSnapshot ?? null
      : campaign?.description ?? null,
    claimHeadline: hasSnapshot
      ? session.campaignClaimHeadlineSnapshot ?? null
      : campaign?.claimHeadline ?? null,
    claimSubtitle: hasSnapshot
      ? session.campaignClaimSubtitleSnapshot ?? null
      : campaign?.claimSubtitle ?? null,
    claimCtaLabel: hasSnapshot
      ? session.campaignClaimCtaLabelSnapshot ?? null
      : campaign?.claimCtaLabel ?? null,
    claimCollectLabel: hasSnapshot
      ? session.campaignClaimCollectLabelSnapshot ?? null
      : campaign?.claimCollectLabel ?? null,
    claimWaitingMessage: hasSnapshot
      ? session.campaignClaimWaitingMessageSnapshot ?? null
      : campaign?.claimWaitingMessage ?? null,
    theme: hasSnapshot ? session.campaignThemeSnapshot! : campaign?.theme ?? "lunar",
    heroAssetUrl,
  };
}

export const getStationState = query({
  args: {},
  handler: async (ctx) => {
    const { ownerId } = await requireResolvedOwner(ctx, undefined, {
      notFoundMessage: "Không tìm thấy host",
      forbiddenMessage: "Bạn không có quyền truy cập trạm rút này",
    });

    const activeCampaign = await getPreferredActiveCampaignForOwner(ctx, ownerId);
    const activeHeroAssetCandidate =
      activeCampaign?.heroAssetId ? await ctx.db.get(activeCampaign.heroAssetId) : null;
    const activeHeroAsset =
      activeCampaign &&
      isRenderableCampaignAsset(activeHeroAssetCandidate, ownerId) &&
      activeHeroAssetCandidate.campaignId === activeCampaign._id
        ? activeHeroAssetCandidate
        : null;
    const pendingSessions = await listPendingOwnerSessionsByDelivery(ctx, ownerId);
    const now = Date.now();
    const pendingSessionCandidate =
      pendingSessions.find((session) => isStationSession(session) && isOpenPendingSession(session)) ??
      null;
    const pendingSessionCampaignCandidate = pendingSessionCandidate?.campaignId
      ? await ctx.db.get(pendingSessionCandidate.campaignId)
      : null;
    const pendingSession =
      pendingSessionCandidate &&
      pendingSessionCampaignCandidate &&
      pendingSessionCampaignCandidate.ownerId === ownerId &&
      pendingSessionCampaignCandidate.status === "active"
        ? pendingSessionCandidate
        : null;
    const activeCampaignId = activeCampaign?._id;
    const stationCampaignId = pendingSession?.campaignId ?? activeCampaignId;
    const budget = await getOwnerBudgetOrThrow(ctx, ownerId, stationCampaignId).catch(() => null);

    const budgetItems = stationCampaignId
      ? (await ctx.db
          .query("budgetItems")
          .withIndex("by_campaign_owner_amount", (q) =>
            q.eq("campaignId", stationCampaignId).eq("ownerId", ownerId)
          )
          .collect())
      : (await ctx.db
          .query("budgetItems")
          .withIndex("by_owner_campaign_amount", (q) =>
            q.eq("ownerId", ownerId).eq("campaignId", undefined)
          )
          .collect());
    const pendingLinkSessions = pendingSessions
      .flatMap((session) => {
        const publicCode = session.publicCode ? normalizePublicCode(session.publicCode) : null;
        return isPendingLinkSession(session) &&
          publicCode &&
          !isExpiredPendingLinkSession(session, now)
          ? [{ session, publicCode }]
          : [];
      })
      .sort((left, right) => right.session.createdAt - left.session.createdAt)
      .slice(0, 12);

    const recentRedemptions = await ctx.db
      .query("redemptions")
      .withIndex("by_owner_createdAt", (q) => q.eq("ownerId", ownerId))
      .order("desc")
      .take(10);

    const availableUnits = budget ? getPayablePrizeUnitCapacity(budgetItems, budget) : 0;
    const pendingSessionBudget = pendingSession
      ? await getOwnerBudgetOrThrow(ctx, ownerId, pendingSession.campaignId).catch(() => null)
      : null;
    const pendingSessionOpenCampaignSessions = pendingSession
      ? Math.max(
          0,
          (await countOpenPendingCampaignSessions(ctx, ownerId, pendingSession.campaignId)) - 1
        )
      : 0;
    const pendingSessionRewardPool =
      pendingSession && pendingSessionBudget
        ? rewardPoolView(
            getCapacityPreservingBudgetItems(
              getPayableBudgetItems(
                await getAvailableBudgetItems(ctx, ownerId, pendingSession.campaignId),
                pendingSessionBudget
              ),
              pendingSessionBudget,
              pendingSessionOpenCampaignSessions
            )
          )
        : [];
    const pendingSessionCampaign = pendingSession
      ? await stationSessionCampaignView(ctx, ownerId, pendingSession)
      : null;

    return {
      hasSetup: Boolean(budget?.isSetupCompleted),
      budget: budget
        ? {
            totalBudget: budget.totalBudget,
            remainingBudget: budget.remainingBudget,
          }
        : null,
      activeCampaign: activeCampaign
        ? {
            id: activeCampaign._id,
            name: activeCampaign.name,
            brandName: activeCampaign.brandName ?? null,
            description: activeCampaign.description ?? null,
            claimHeadline: activeCampaign.claimHeadline ?? null,
            claimSubtitle: activeCampaign.claimSubtitle ?? null,
            claimCtaLabel: activeCampaign.claimCtaLabel ?? null,
            claimCollectLabel: activeCampaign.claimCollectLabel ?? null,
            claimWaitingMessage: activeCampaign.claimWaitingMessage ?? null,
            theme: activeCampaign.theme,
            heroAssetUrl: activeHeroAsset
              ? await getRenderableCampaignAssetUrl(
                  ctx,
                  ownerId,
                  activeHeroAsset.key,
                  activeCampaign._id
                )
              : null,
          }
        : null,
      availableUnits,
      budgetItems: budgetItems.map((item) => ({
        id: item._id,
        amount: item.amount,
        rarity: item.rarity,
        remainingQuantity: item.remainingQuantity,
        totalQuantity: item.initialQuantity,
        isActive: item.isActive,
      })),
      pendingSession: pendingSession
        ? {
            id: pendingSession._id,
            publicCode: null,
            sharePath: null,
            guestNameDisplay: pendingSession.guestNameDisplay,
            campaign: pendingSessionCampaign,
            rewardPool: pendingSessionRewardPool,
            createdAt: pendingSession.createdAt,
          }
        : null,
      pendingLinkSessions: pendingLinkSessions.map(({ session, publicCode }) => ({
        id: session._id,
        publicCode,
        sharePath: `/claim/${publicCode}`,
        guestNameDisplay: session.guestNameDisplay,
        campaignName: session.campaignNameSnapshot ?? null,
        createdAt: session.createdAt,
        expiresAt: resolvePublicLinkExpiresAt(session),
      })),
      recentRedemptions: recentRedemptions.map((record) => ({
        id: record._id,
        guestNameDisplay: record.guestNameDisplay,
        amount: record.amount,
        rarity: record.rarity,
        redeemedAt: record.createdAt,
      })),
    };
  },
});

export const createSession = mutation({
  args: {
    campaignId: v.optional(v.id("campaigns")),
    deliveryMode: v.optional(deliveryModeValidator),
    guestName: v.string(),
    ownerPin: v.string(),
  },
  handler: async (ctx, args) => {
    const { owner, ownerId } = await requireResolvedOwner(ctx, undefined, {
      notFoundMessage: "Không tìm thấy host",
      forbiddenMessage: "Bạn không có quyền truy cập trạm rút này",
    });

    const guestNameDisplay = validateGuestName(args.guestName);
    const guestNameNormalized = normalizeGuestName(guestNameDisplay);
    const ownerPin = validatePin(args.ownerPin);
    const deliveryMode = resolveDeliveryMode(args.deliveryMode);

    if (
      typeof owner.pinHash !== "string" ||
      owner.pinHash.length === 0 ||
      typeof owner.pinSalt !== "string" ||
      owner.pinSalt.length === 0
    ) {
      throw new Error("Host chưa thiết lập PIN");
    }

    const pinMatches = await verifyPinHash(ownerPin, owner.pinSalt, owner.pinHash);
    if (!pinMatches) {
      throw new Error("PIN host không đúng");
    }

    await assertCanCreateSession(ctx, ownerId);
    const campaignId = await getCampaignForSession(ctx, owner, ownerId, args.campaignId);

    const duplicateGuest = await getCampaignGuestRedemption(
      ctx,
      ownerId,
      campaignId,
      guestNameNormalized
    );

    if (duplicateGuest) {
      throw new Error("Tên người rút này đã rút trong chiến dịch này, vui lòng dùng tên khác");
    }

    const pendingGuestSession = await getPendingCampaignGuestSession(
      ctx,
      ownerId,
      campaignId,
      guestNameNormalized
    );
    if (pendingGuestSession) {
      throw new Error("Tên người rút này đang có lượt chờ xử lý trong chiến dịch này");
    }

    const pendingStationSessions = await listPendingOwnerSessionsByDelivery(
      ctx,
      ownerId,
      PENDING_STATION_SESSION_DELIVERY_MODES
    );
    const pendingStationSession = pendingStationSessions.find(isStationSession);
    if (deliveryMode === "station" && pendingStationSession) {
      throw new Error("Đang có một lượt rút trực tiếp chờ xử lý, hãy hoàn tất hoặc hủy lượt hiện tại");
    }

    const budget = await getOwnerBudgetOrThrow(ctx, ownerId, campaignId);
    if (budget.remainingBudget <= 0) {
      throw new Error("Ngân sách đã hết");
    }

    const availableItems = getPayableBudgetItems(
      await getAvailableBudgetItems(ctx, ownerId, campaignId),
      budget
    );
    if (availableItems.length === 0) {
      throw new Error("Không còn mệnh giá nào phù hợp với ngân sách còn lại");
    }
    const availablePrizeUnits = getPayablePrizeUnitCapacity(availableItems, budget);
    const openPendingCampaignSessions = await countOpenPendingCampaignSessions(
      ctx,
      ownerId,
      campaignId
    );
    if (openPendingCampaignSessions >= availablePrizeUnits) {
      throw new Error("Không còn đủ phần thưởng cho các lượt rút đang chờ");
    }

    const now = Date.now();
    const publicCode = deliveryMode === "link" ? await generateUniquePublicCode(ctx) : undefined;
    const publicCodeExpiresAt =
      deliveryMode === "link" ? getPublicLinkExpiresAt(now) : undefined;
    const snapshot = await buildSessionSnapshot(ctx, owner, ownerId, campaignId);
    const sessionId = await ctx.db.insert("drawSessions", {
      ownerId,
      campaignId,
      publicCode,
      publicCodeExpiresAt,
      deliveryMode,
      ...snapshot,
      guestNameDisplay,
      guestNameNormalized,
      status: "pending",
      createdAt: now,
    });
    if (publicCode) {
      await assertPublicCodeRemainsUnambiguous(ctx, publicCode);
    }
    await recordSessionCreated(ctx, sessionId, ownerId, campaignId);

    return {
      sessionId,
      publicCode: publicCode ?? null,
      sharePath: publicCode ? `/claim/${publicCode}` : null,
      expiresAt: publicCodeExpiresAt ?? null,
      guestNameDisplay,
      deliveryMode,
    };
  },
});

export const getPublicSession = query({
  args: {
    publicCode: v.string(),
  },
  handler: async (ctx, args) => {
    const publicCode = sanitizePublicCode(args.publicCode);
    if (!publicCode) {
      return null;
    }
    const session = await findPendingLinkSessionByPublicCode(ctx, publicCode);

    if (!session) {
      return null;
    }

    const hasSnapshot = hasSessionCampaignSnapshot(session);
    const campaignCandidate = session.campaignId ? await ctx.db.get(session.campaignId) : null;
    const campaign =
      !hasSnapshot &&
      campaignCandidate &&
      campaignCandidate.ownerId === session.ownerId
        ? campaignCandidate
        : null;
    const campaignHeroAssetCandidate =
      campaign?.heroAssetId ? await ctx.db.get(campaign.heroAssetId) : null;
    const campaignHeroAsset =
      campaign &&
      isRenderableCampaignAsset(campaignHeroAssetCandidate, session.ownerId) &&
      campaignHeroAssetCandidate.campaignId === campaign._id
        ? campaignHeroAssetCandidate
        : null;
    const heroAssetUrl =
      (hasSnapshot && session.campaignId
        ? await getRenderableCampaignAssetUrl(
            ctx,
            session.ownerId,
            session.campaignHeroAssetKeySnapshot,
            session.campaignId
          )
        : null) ??
      (campaign && campaignHeroAsset
        ? await getRenderableCampaignAssetUrl(
            ctx,
            session.ownerId,
            campaignHeroAsset.key,
            campaign._id
          )
        : null);
    const budget = await getOwnerBudgetOrThrow(ctx, session.ownerId, session.campaignId).catch(
      () => null
    );
    if (!hasSpendableBudget(budget)) {
      return null;
    }

    const budgetItems = getPayableBudgetItems(
      await getAvailableBudgetItems(ctx, session.ownerId, session.campaignId),
      budget
    );
    const remainingOpenPendingSessions = Math.max(
      0,
      (await countOpenPendingCampaignSessions(ctx, session.ownerId, session.campaignId)) - 1
    );
    const capacityPreservingItems = getCapacityPreservingBudgetItems(
      budgetItems,
      budget,
      remainingOpenPendingSessions
    );
    if (capacityPreservingItems.length === 0) {
      return null;
    }

    return {
      guestNameDisplay: session.guestNameDisplay,
      expiresAt: resolvePublicLinkExpiresAt(session),
      campaign: hasSnapshot || campaign
        ? {
            name: hasSnapshot
              ? session.campaignNameSnapshot!
              : campaign?.name ?? DEFAULT_CAMPAIGN_NAME,
            brandName: hasSnapshot
              ? session.campaignBrandNameSnapshot ?? null
              : campaign?.brandName ?? null,
            description: hasSnapshot
              ? session.campaignDescriptionSnapshot ?? null
              : campaign?.description ?? null,
            claimHeadline: hasSnapshot
              ? session.campaignClaimHeadlineSnapshot ?? null
              : campaign?.claimHeadline ?? null,
            claimSubtitle: hasSnapshot
              ? session.campaignClaimSubtitleSnapshot ?? null
              : campaign?.claimSubtitle ?? null,
            claimCtaLabel: hasSnapshot
              ? session.campaignClaimCtaLabelSnapshot ?? null
              : campaign?.claimCtaLabel ?? null,
            claimCollectLabel: hasSnapshot
              ? session.campaignClaimCollectLabelSnapshot ?? null
              : campaign?.claimCollectLabel ?? null,
            claimWaitingMessage: hasSnapshot
              ? session.campaignClaimWaitingMessageSnapshot ?? null
              : campaign?.claimWaitingMessage ?? null,
            theme: hasSnapshot
              ? session.campaignThemeSnapshot!
              : campaign?.theme ?? "lunar",
            heroAssetUrl,
          }
        : null,
      rewardPool: publicRewardPoolView(capacityPreservingItems),
    };
  },
});

export const cancelSession = mutation({
  args: {
    sessionId: v.id("drawSessions"),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) {
      throw new Error("Không tìm thấy lượt rút");
    }
    const { ownerId } = await requireResolvedOwner(ctx, undefined, {
      notFoundMessage: "Không tìm thấy host",
      forbiddenMessage: "Bạn không có quyền truy cập trạm rút này",
    });
    if (session.ownerId !== ownerId) {
      throw new Error("Không tìm thấy lượt rút");
    }

    if (session.status !== "pending") {
      throw new Error("Chỉ có thể hủy lượt rút đang chờ");
    }
    if (isExpiredPendingLinkSession(session)) {
      throw new Error("Link rút đã hết hiệu lực");
    }

    await ctx.db.patch(session._id, {
      status: "cancelled",
      cancelledAt: Date.now(),
    });

    return { success: true };
  },
});

async function redeemPendingSession(
  ctx: MutationCtx,
  session: Doc<"drawSessions">,
  envelopeIndex: number
) {
  const deliveryMode = resolveSessionDeliveryMode(session);
  if (isExpiredPendingLinkSession(session)) {
    throw new Error("Link rút đã hết hiệu lực");
  }
  const campaignId = await requireRedeemableSessionCampaign(ctx, session);
  const budget = await getOwnerBudgetOrThrow(ctx, session.ownerId, campaignId);
  if (budget.remainingBudget <= 0) {
    throw new Error("Ngân sách đã hết");
  }
  await assertCanRedeem(ctx, session.ownerId);

  const availableItems = getPayableBudgetItems(
    await getAvailableBudgetItems(ctx, session.ownerId, campaignId),
    budget
  );
  if (availableItems.length === 0) {
    throw new Error("Không còn mệnh giá nào phù hợp với ngân sách còn lại");
  }
  const remainingOpenPendingSessions = Math.max(
    0,
    (await countOpenPendingCampaignSessions(ctx, session.ownerId, campaignId)) - 1
  );
  const capacityPreservingItems = getCapacityPreservingBudgetItems(
    availableItems,
    budget,
    remainingOpenPendingSessions
  );
  const selectedItem = pickBudgetItemByQuantity(capacityPreservingItems);
  if (!selectedItem) {
    throw new Error("Không còn mệnh giá nào giữ đủ phần thưởng cho các lượt rút đang chờ");
  }
  if (selectedItem.remainingQuantity <= 0) {
    throw new Error("Tồn kho mệnh giá không hợp lệ, vui lòng thử lại");
  }
  const nextRemainingQty = selectedItem.remainingQuantity - 1;
  await ctx.db.patch(selectedItem._id, {
    remainingQuantity: nextRemainingQty,
    isActive: nextRemainingQty > 0,
    updatedAt: Date.now(),
  });

  const nextBudget = budget.remainingBudget - selectedItem.amount;
  await ctx.db.patch(budget._id, {
    remainingBudget: nextBudget,
    updatedAt: Date.now(),
  });

  const redemptionId = await ctx.db.insert("redemptions", {
    ownerId: session.ownerId,
    campaignId,
    drawSessionId: session._id,
    publicCode: session.publicCode,
    deliveryMode,
    hostDisplayNameSnapshot: session.hostDisplayNameSnapshot,
    hostSlugSnapshot: session.hostSlugSnapshot,
    campaignNameSnapshot: session.campaignNameSnapshot,
    campaignBrandNameSnapshot: session.campaignBrandNameSnapshot,
    campaignDescriptionSnapshot: session.campaignDescriptionSnapshot,
    campaignClaimHeadlineSnapshot: session.campaignClaimHeadlineSnapshot,
    campaignClaimSubtitleSnapshot: session.campaignClaimSubtitleSnapshot,
    campaignClaimCtaLabelSnapshot: session.campaignClaimCtaLabelSnapshot,
    campaignClaimCollectLabelSnapshot: session.campaignClaimCollectLabelSnapshot,
    campaignClaimWaitingMessageSnapshot: session.campaignClaimWaitingMessageSnapshot,
    campaignThemeSnapshot: session.campaignThemeSnapshot,
    campaignHeroAssetKeySnapshot: session.campaignHeroAssetKeySnapshot,
    guestNameDisplay: session.guestNameDisplay,
    guestNameNormalized: session.guestNameNormalized,
    amount: selectedItem.amount,
    rarity: selectedItem.rarity,
    budgetItemId: selectedItem._id,
    envelopeIndex,
    createdAt: Date.now(),
  });
  const redemption = await ctx.db.get(redemptionId);
  if (!redemption) {
    throw new Error("Không thể ghi nhận kết quả rút");
  }
  await recordRedemptionCreated(ctx, redemption);

  await ctx.db.patch(session._id, {
    status: "redeemed",
    redeemedAt: Date.now(),
    envelopeIndex,
    redemptionId,
  });

  return {
    success: true,
    guestNameDisplay: session.guestNameDisplay,
    amount: selectedItem.amount,
    rarity: selectedItem.rarity,
    remainingBudget: nextBudget,
  };
}

export const redeem = mutation({
  args: {
    sessionId: v.id("drawSessions"),
    envelopeIndex: v.number(),
  },
  handler: async (ctx, args) => {
    const envelopeIndex = validateEnvelopeIndex(args.envelopeIndex);
    const session = await ctx.db.get(args.sessionId);
    if (!session) {
      throw new Error("Lượt rút không tồn tại");
    }
    if (session.status !== "pending") {
      throw new Error("Lượt rút này không còn hiệu lực");
    }
    if (!isStationSession(session)) {
      throw new Error("Lượt rút link phải được nhận qua link công khai");
    }

    const { ownerId } = await requireResolvedOwner(ctx, undefined, {
      notFoundMessage: "Không tìm thấy host",
      forbiddenMessage: "Bạn không có quyền rút lượt này",
    });
    if (ownerId !== session.ownerId) {
      throw new Error("Không tìm thấy lượt rút");
    }

    return redeemPendingSession(ctx, session, envelopeIndex);
  },
});

export const redeemPublicSession = mutation({
  args: {
    publicCode: v.string(),
    envelopeIndex: v.number(),
  },
  handler: async (ctx, args) => {
    const envelopeIndex = validateEnvelopeIndex(args.envelopeIndex);
    const publicCode = sanitizePublicCode(args.publicCode);
    const session = publicCode
      ? await findPendingLinkSessionByPublicCode(ctx, publicCode)
      : null;

    if (!session) {
      throw new Error("Link rút không hợp lệ hoặc đã hết hiệu lực");
    }

    const result = await redeemPendingSession(ctx, session, envelopeIndex);

    return {
      success: result.success,
      guestNameDisplay: result.guestNameDisplay,
      amount: result.amount,
      rarity: result.rarity,
    };
  },
});
