import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, mutation, type MutationCtx } from "./_generated/server";
import { redemptionsByCampaignAmount, redemptionsByOwnerAmount } from "./analytics";
import { isRenderableCampaignAsset, rejectCampaignAssetAndScheduleObjectDelete } from "./assets";
import { listOwnerBudgetsForScope } from "./budgetScope";
import {
  displayNameFromUser,
  ensureHostProfileForOwner,
  getHostProfileForOwner,
} from "./hostProfiles";
import { isValidMigrationToken, migrationTokenEnvNames } from "./migrationToken";
import {
  getPublicLinkExpiresAt,
  isExpiredPendingLinkSession,
  resolvePublicLinkExpiresAt,
} from "./publicLinks";

const visibleCampaignStatuses = ["active", "draft"] as const;
const MAX_BACKFILL_AUDIT_DECISIONS = 50;

type BackfillAuditDecision = {
  source: "session" | "redemption";
  rowId: Id<"drawSessions"> | Id<"redemptions">;
  action: "skip";
  reason: "foreign_campaign" | "foreign_session" | "invalid_public_code_expiry";
  campaignId: Id<"campaigns"> | null;
  drawSessionId: Id<"drawSessions"> | null;
  createdAt: number;
};

async function listVisibleCampaignsForOwner(ctx: MutationCtx, ownerId: Id<"users">) {
  const groups = await Promise.all(
    visibleCampaignStatuses.map((status) =>
      ctx.db
        .query("campaigns")
        .withIndex("by_owner_status", (q) => q.eq("ownerId", ownerId).eq("status", status))
        .collect()
    )
  );
  return groups.flat();
}

function sortByCreatedAtThenId<T extends { _id: string; createdAt: number }>(rows: T[]) {
  return [...rows].sort((left, right) => {
    const leftCreatedAt = Number.isFinite(left.createdAt)
      ? left.createdAt
      : Number.POSITIVE_INFINITY;
    const rightCreatedAt = Number.isFinite(right.createdAt)
      ? right.createdAt
      : Number.POSITIVE_INFINITY;
    if (leftCreatedAt !== rightCreatedAt) {
      return leftCreatedAt - rightCreatedAt;
    }
    return left._id.localeCompare(right._id);
  });
}

async function assertMigrationAccess(
  ctx: MutationCtx,
  migrationToken: string | undefined
): Promise<Id<"users"> | null> {
  const authUserId = await getAuthUserId(ctx);
  if (authUserId) {
    return authUserId;
  }

  if (isValidMigrationToken(migrationToken)) {
    return null;
  }

  throw new Error(
    `Cần đăng nhập hoặc ${migrationTokenEnvNames.join(" / ")} để chạy migration`
  );
}

async function requireMigrationOwner(
  ctx: MutationCtx,
  requestedOwnerId: Id<"users"> | undefined,
  migrationToken: string | undefined,
  options: {
    notFoundMessage: string;
    forbiddenMessage: string;
    missingOwnerMessage?: string;
  }
) {
  const authUserId = await assertMigrationAccess(ctx, migrationToken);

  if (authUserId) {
    if (requestedOwnerId && requestedOwnerId !== authUserId) {
      throw new Error(options.forbiddenMessage);
    }
    const owner = await ctx.db.get(authUserId);
    if (!owner) {
      throw new Error(options.notFoundMessage);
    }
    return { owner, ownerId: authUserId };
  }

  if (!requestedOwnerId) {
    throw new Error(
      options.missingOwnerMessage ?? "ownerId là bắt buộc khi chạy migration bằng token"
    );
  }

  const owner = await ctx.db.get(requestedOwnerId);
  if (!owner) {
    throw new Error(options.notFoundMessage);
  }
  return { owner, ownerId: requestedOwnerId };
}

type BackfillStats = {
  hostProfilesCreated: number;
  hostProfilesUpdated: number;
  sessionsScanned: number;
  sessionsPatchedDeliveryMode: number;
  sessionsPatchedPublicCodeExpiry: number;
  sessionsPatchedCampaign: number;
  sessionsPatchedSnapshots: number;
  redemptionsScanned: number;
  redemptionsPatchedCampaign: number;
  redemptionsPatchedSnapshots: number;
  redemptionsBackfilledAggregate: number;
  budgetsPatchedCampaign: number;
  budgetItemsPatchedCampaign: number;
  skippedNoCampaign: number;
  skippedAmbiguousCampaign: number;
  skippedExistingCampaignBudget: number;
  skippedExistingCampaignItems: number;
  skippedForeignCampaignReferences: number;
  skippedForeignSessionReferences: number;
  skippedInvalidPublicCodeExpiry: number;
  auditDecisions: BackfillAuditDecision[];
};

type CleanupExpiredPublicLinksStats = {
  sessionsScanned: number;
  expiredPublicLinksCancelled: number;
  sessionDecisions: {
    sessionId: Id<"drawSessions">;
    action: "keep" | "cancel";
    reason: "expired" | "invalid_expiry" | "not_expired" | "not_link_session";
    deliveryMode: "link" | "legacy-missing-delivery";
    hasPublicCode: boolean;
    campaignId: Id<"campaigns"> | null;
    createdAt: number;
    publicCodeExpiresAt: number | null;
    resolvedPublicCodeExpiresAt: number;
  }[];
};

type RepairHostProfileDefaultCampaignStats = {
  profilesScanned: number;
  profilesPatched: number;
  clearedInvalidDefaultCampaign: boolean;
  replacementCampaignId: Id<"campaigns"> | null;
  profileDecision: {
    profileId: Id<"hostProfiles"> | null;
    action: "keep" | "replace" | "clear" | "skip_no_profile";
    reason:
      | "valid_default"
      | "no_default_campaign"
      | "missing_profile"
      | "archived_default"
      | "foreign_default"
      | "missing_default";
    previousDefaultCampaignId: Id<"campaigns"> | null;
    replacementCampaignId: Id<"campaigns"> | null;
  };
};

type RepairOwnerActiveCampaignsStats = {
  activeCampaignsScanned: number;
  activeCampaignsDemoted: number;
  hostProfilesPatched: number;
  keptActiveCampaignId: Id<"campaigns"> | null;
  campaignDecisions: {
    campaignId: Id<"campaigns">;
    action: "keep" | "demote";
    name: string;
    defaultSelected: boolean;
    createdAt: number;
    updatedAt: number;
  }[];
  profileDecision: {
    profileId: Id<"hostProfiles"> | null;
    action: "keep" | "point_to_kept_campaign" | "skip_no_profile";
    previousDefaultCampaignId: Id<"campaigns"> | null;
    nextDefaultCampaignId: Id<"campaigns"> | null;
  };
};

type RepairDuplicateOwnerBudgetsStats = {
  budgetsScanned: number;
  duplicateBudgetScopes: number;
  duplicateBudgetsDeleted: number;
  budgetDecisions: {
    budgetId: Id<"ownerBudgets">;
    action: "keep" | "delete";
    scope: string;
    campaignId: Id<"campaigns"> | null;
    totalBudget: number;
    remainingBudget: number;
    createdAt: number;
    updatedAt: number;
  }[];
};

type RepairDuplicateHostProfilesStats = {
  profilesScanned: number;
  duplicateProfilesDeleted: number;
  keptProfileId: Id<"hostProfiles"> | null;
  profileDecisions: {
    profileId: Id<"hostProfiles">;
    action: "keep" | "delete";
    slug: string;
    defaultCampaignId: Id<"campaigns"> | null;
    onboardingCompleted: boolean;
    createdAt: number;
    updatedAt: number;
  }[];
};

type CleanupStaleReservedAssetsStats = {
  assetsScanned: number;
  staleReservedAssetsRejected: number;
  assetDecisions: {
    assetId: Id<"campaignAssets">;
    action: "keep" | "reject";
    bucket: string;
    key: string;
    campaignId: Id<"campaigns"> | null;
    fileName: string | null;
    contentType: string | null;
    size: number | null;
    createdAt: number;
    ageMs: number | null;
    rejectedReason: string | null;
  }[];
};

const DEFAULT_STALE_RESERVED_ASSET_AGE_MS = 24 * 60 * 60 * 1000;
const SCHEDULED_PUBLIC_LINK_CLEANUP_LIMIT = 250;
const SCHEDULED_STALE_ASSET_CLEANUP_LIMIT = 250;

async function getOwnedCampaign(
  ctx: MutationCtx,
  ownerId: Id<"users">,
  campaignId: Id<"campaigns"> | null | undefined
) {
  if (!campaignId) {
    return null;
  }
  const campaign = await ctx.db.get(campaignId);
  return campaign && campaign.ownerId === ownerId ? campaign : null;
}

async function getTargetCampaignId(ctx: MutationCtx, ownerId: Id<"users">) {
  const profile = await getHostProfileForOwner(ctx, ownerId);
  if (profile?.defaultCampaignId) {
    const defaultCampaign = await ctx.db.get(profile.defaultCampaignId);
    if (defaultCampaign && defaultCampaign.ownerId === ownerId && defaultCampaign.status !== "archived") {
      return {
        campaignId: defaultCampaign._id,
        ambiguous: false,
        profile,
      };
    }
  }

  const visibleCampaigns = await listVisibleCampaignsForOwner(ctx, ownerId);
  const activeCampaigns = visibleCampaigns.filter((campaign) => campaign.status === "active");

  if (activeCampaigns.length === 1) {
    return {
      campaignId: activeCampaigns[0]._id,
      ambiguous: false,
      profile,
    };
  }
  if (visibleCampaigns.length === 1) {
    return {
      campaignId: visibleCampaigns[0]._id,
      ambiguous: false,
      profile,
    };
  }

  return {
    campaignId: null,
    ambiguous: visibleCampaigns.length > 1,
    profile,
  };
}

async function listPendingPublicLinkCleanupCandidates(
  ctx: MutationCtx,
  ownerId: Id<"users"> | undefined,
  limit: number
) {
  const pendingLinkBuckets = await Promise.all(
    (["link", undefined] as const).map((deliveryMode) => {
      if (ownerId) {
        return ctx.db
          .query("drawSessions")
          .withIndex("by_owner_status_delivery_createdAt", (q) =>
            q.eq("ownerId", ownerId).eq("status", "pending").eq("deliveryMode", deliveryMode)
          )
          .order("asc")
          .take(limit);
      }

      return ctx.db
        .query("drawSessions")
        .withIndex("by_status_delivery_createdAt", (q) =>
          q.eq("status", "pending").eq("deliveryMode", deliveryMode)
        )
        .order("asc")
        .take(limit);
    })
  );
  return sortByCreatedAtThenId(pendingLinkBuckets.flat()).slice(0, limit);
}

async function applyExpiredPublicLinkCleanup(
  ctx: MutationCtx,
  ownerId: Id<"users"> | undefined,
  limit: number,
  dryRun: boolean
): Promise<CleanupExpiredPublicLinksStats> {
  const now = Date.now();
  const sessions = await listPendingPublicLinkCleanupCandidates(ctx, ownerId, limit);
  let expiredPublicLinksCancelled = 0;
  const sessionDecisions: CleanupExpiredPublicLinksStats["sessionDecisions"] = [];

  for (const session of sessions) {
    const resolvedPublicCodeExpiresAt = resolvePublicLinkExpiresAt(session);
    const isLinkMode = session.deliveryMode === "link" || Boolean(session.publicCode);
    const expired = isExpiredPendingLinkSession(session, now);
    const reason = !isLinkMode
      ? "not_link_session"
      : resolvedPublicCodeExpiresAt <= 0
        ? "invalid_expiry"
        : expired
          ? "expired"
          : "not_expired";

    if (!expired) {
      sessionDecisions.push({
        sessionId: session._id,
        action: "keep",
        reason,
        deliveryMode: session.deliveryMode === "link" ? "link" : "legacy-missing-delivery",
        hasPublicCode: Boolean(session.publicCode),
        campaignId: session.campaignId ?? null,
        createdAt: session.createdAt,
        publicCodeExpiresAt: session.publicCodeExpiresAt ?? null,
        resolvedPublicCodeExpiresAt,
      });
      continue;
    }

    expiredPublicLinksCancelled += 1;
    sessionDecisions.push({
      sessionId: session._id,
      action: "cancel",
      reason,
      deliveryMode: session.deliveryMode === "link" ? "link" : "legacy-missing-delivery",
      hasPublicCode: Boolean(session.publicCode),
      campaignId: session.campaignId ?? null,
      createdAt: session.createdAt,
      publicCodeExpiresAt: session.publicCodeExpiresAt ?? null,
      resolvedPublicCodeExpiresAt,
    });
    if (!dryRun) {
      await ctx.db.patch(session._id, {
        status: "cancelled",
        cancelledAt: now,
      });
    }
  }

  return {
    sessionsScanned: sessions.length,
    expiredPublicLinksCancelled,
    sessionDecisions,
  };
}

async function listReservedAssetCleanupCandidates(
  ctx: MutationCtx,
  ownerId: Id<"users"> | undefined,
  limit: number
) {
  if (ownerId) {
    return await ctx.db
      .query("campaignAssets")
      .withIndex("by_owner_status_createdAt", (q) =>
        q.eq("ownerId", ownerId).eq("status", "reserved")
      )
      .order("asc")
      .take(limit);
  }

  return await ctx.db
    .query("campaignAssets")
    .withIndex("by_status_createdAt", (q) => q.eq("status", "reserved"))
    .order("asc")
    .take(limit);
}

async function applyStaleReservedAssetCleanup(
  ctx: MutationCtx,
  ownerId: Id<"users"> | undefined,
  limit: number,
  olderThanMs: number,
  dryRun: boolean
): Promise<CleanupStaleReservedAssetsStats> {
  const now = Date.now();
  const cutoff = now - olderThanMs;
  const reservedAssets = await listReservedAssetCleanupCandidates(ctx, ownerId, limit);
  let staleReservedAssetsRejected = 0;
  const assetDecisions: CleanupStaleReservedAssetsStats["assetDecisions"] = [];

  for (const asset of reservedAssets) {
    const ageMs = Number.isSafeInteger(asset.createdAt) ? now - asset.createdAt : null;

    if (!Number.isSafeInteger(asset.createdAt) || asset.createdAt > cutoff) {
      assetDecisions.push({
        assetId: asset._id,
        action: "keep",
        bucket: asset.bucket,
        key: asset.key,
        campaignId: asset.campaignId ?? null,
        fileName: asset.fileName ?? null,
        contentType: asset.contentType ?? null,
        size: asset.size ?? null,
        createdAt: asset.createdAt,
        ageMs,
        rejectedReason: null,
      });
      continue;
    }

    staleReservedAssetsRejected += 1;
    assetDecisions.push({
      assetId: asset._id,
      action: "reject",
      bucket: asset.bucket,
      key: asset.key,
      campaignId: asset.campaignId ?? null,
      fileName: asset.fileName ?? null,
      contentType: asset.contentType ?? null,
      size: asset.size ?? null,
      createdAt: asset.createdAt,
      ageMs,
      rejectedReason: "Asset upload reservation expired before R2 upload completed",
    });
    if (!dryRun) {
      await rejectCampaignAssetAndScheduleObjectDelete(
        ctx,
        asset,
        now,
        "Asset upload reservation expired before R2 upload completed"
      );
    }
  }

  return {
    assetsScanned: reservedAssets.length,
    staleReservedAssetsRejected,
    assetDecisions,
  };
}

async function getVisibleDefaultReplacementCampaignId(ctx: MutationCtx, ownerId: Id<"users">) {
  const visibleCampaigns = await listVisibleCampaignsForOwner(ctx, ownerId);
  const activeCampaign = visibleCampaigns
    .filter((campaign) => campaign.status === "active")
    .sort((left, right) => right.updatedAt - left.updatedAt)[0];
  if (activeCampaign) {
    return activeCampaign._id;
  }

  return visibleCampaigns.sort((left, right) => right.updatedAt - left.updatedAt)[0]?._id ?? null;
}

function sortCampaignsByRecency(campaigns: Doc<"campaigns">[]) {
  return [...campaigns].sort((left, right) => {
    const updatedDelta = right.updatedAt - left.updatedAt;
    if (updatedDelta !== 0) {
      return updatedDelta;
    }
    return right.createdAt - left.createdAt;
  });
}

function selectKeptActiveCampaign(
  activeCampaigns: Doc<"campaigns">[],
  defaultCampaignId: Id<"campaigns"> | undefined
) {
  const defaultActiveCampaign = activeCampaigns.find(
    (campaign) => campaign._id === defaultCampaignId
  );
  return defaultActiveCampaign ?? sortCampaignsByRecency(activeCampaigns)[0] ?? null;
}

function sortBudgetsByRecency(budgets: Doc<"ownerBudgets">[]) {
  return [...budgets].sort((left, right) => {
    const updatedDelta = right.updatedAt - left.updatedAt;
    if (updatedDelta !== 0) {
      return updatedDelta;
    }
    return right.createdAt - left.createdAt;
  });
}

function budgetScopeKey(budget: Doc<"ownerBudgets">) {
  return budget.campaignId ?? "legacy-owner";
}

function sortHostProfilesByRecency(profiles: Doc<"hostProfiles">[]) {
  return [...profiles].sort((left, right) => {
    const updatedDelta = right.updatedAt - left.updatedAt;
    if (updatedDelta !== 0) {
      return updatedDelta;
    }
    return right.createdAt - left.createdAt;
  });
}

function pushBackfillAuditDecision(
  auditDecisions: BackfillAuditDecision[],
  decision: BackfillAuditDecision
) {
  if (auditDecisions.length < MAX_BACKFILL_AUDIT_DECISIONS) {
    auditDecisions.push(decision);
  }
}

async function buildSnapshotPatch(
  ctx: MutationCtx,
  owner: Doc<"users">,
  ownerId: Id<"users">,
  campaignId: Id<"campaigns"> | null
) {
  const profile = await getHostProfileForOwner(ctx, ownerId);
  const campaign = await getOwnedCampaign(ctx, ownerId, campaignId);
  const heroAssetCandidate =
    campaign?.heroAssetId ? await ctx.db.get(campaign.heroAssetId) : null;
  const heroAsset =
    campaign &&
    isRenderableCampaignAsset(heroAssetCandidate, ownerId) &&
    heroAssetCandidate.campaignId === campaign._id
      ? heroAssetCandidate
      : null;
  return {
    hostDisplayNameSnapshot: profile?.displayName ?? displayNameFromUser(owner),
    hostSlugSnapshot: profile?.slug,
    campaignNameSnapshot: campaign?.name,
    campaignBrandNameSnapshot: campaign?.brandName,
    campaignDescriptionSnapshot: campaign?.description,
    campaignClaimHeadlineSnapshot: campaign?.claimHeadline,
    campaignClaimSubtitleSnapshot: campaign?.claimSubtitle,
    campaignClaimCtaLabelSnapshot: campaign?.claimCtaLabel,
    campaignClaimCollectLabelSnapshot: campaign?.claimCollectLabel,
    campaignClaimWaitingMessageSnapshot: campaign?.claimWaitingMessage,
    campaignThemeSnapshot: campaign?.theme,
    campaignHeroAssetKeySnapshot: heroAsset?.key,
  };
}

async function backfillDrawSessions(
  ctx: MutationCtx,
  owner: Doc<"users">,
  ownerId: Id<"users">,
  campaignId: Id<"campaigns"> | null,
  limit: number,
  dryRun: boolean
) {
  const stats = {
    sessionsScanned: 0,
    sessionsPatchedDeliveryMode: 0,
    sessionsPatchedPublicCodeExpiry: 0,
    skippedInvalidPublicCodeExpiry: 0,
    skippedForeignCampaignReferences: 0,
    sessionsPatchedCampaign: 0,
    sessionsPatchedSnapshots: 0,
    auditDecisions: [] as BackfillAuditDecision[],
  };

  const sessions = await ctx.db
    .query("drawSessions")
    .withIndex("by_owner_createdAt", (q) => q.eq("ownerId", ownerId))
    .order("desc")
    .take(limit);
  stats.sessionsScanned = sessions.length;

  for (const session of sessions) {
    const patch: Partial<Doc<"drawSessions">> = {};
    const ownedSessionCampaign = await getOwnedCampaign(ctx, ownerId, session.campaignId);
    if (session.campaignId && !ownedSessionCampaign) {
      stats.skippedForeignCampaignReferences += 1;
      pushBackfillAuditDecision(stats.auditDecisions, {
        source: "session",
        rowId: session._id,
        action: "skip",
        reason: "foreign_campaign",
        campaignId: session.campaignId,
        drawSessionId: session._id,
        createdAt: session.createdAt,
      });
    }
    const targetCampaignId = ownedSessionCampaign?._id ?? (session.campaignId ? null : campaignId);
    if (!session.deliveryMode) {
      patch.deliveryMode = session.publicCode ? "link" : "station";
      stats.sessionsPatchedDeliveryMode += 1;
    }
    const deliveryMode = session.deliveryMode ?? patch.deliveryMode;
    if (deliveryMode === "link" && session.publicCode && !session.publicCodeExpiresAt) {
      try {
        patch.publicCodeExpiresAt = getPublicLinkExpiresAt(session.createdAt);
        stats.sessionsPatchedPublicCodeExpiry += 1;
      } catch {
        stats.skippedInvalidPublicCodeExpiry += 1;
        pushBackfillAuditDecision(stats.auditDecisions, {
          source: "session",
          rowId: session._id,
          action: "skip",
          reason: "invalid_public_code_expiry",
          campaignId: session.campaignId ?? null,
          drawSessionId: session._id,
          createdAt: session.createdAt,
        });
      }
    }
    if (!session.campaignId && campaignId) {
      patch.campaignId = campaignId;
      stats.sessionsPatchedCampaign += 1;
    }
    if (
      !session.hostDisplayNameSnapshot ||
      !session.hostSlugSnapshot ||
      !session.campaignNameSnapshot ||
      !session.campaignThemeSnapshot
    ) {
      Object.assign(
        patch,
        await buildSnapshotPatch(ctx, owner, ownerId, targetCampaignId)
      );
      stats.sessionsPatchedSnapshots += 1;
    }
    if (!dryRun && Object.keys(patch).length > 0) {
      await ctx.db.patch(session._id, patch);
    }
  }

  return stats;
}

async function backfillRedemptions(
  ctx: MutationCtx,
  owner: Doc<"users">,
  ownerId: Id<"users">,
  campaignId: Id<"campaigns"> | null,
  limit: number,
  dryRun: boolean
) {
  const stats = {
    redemptionsScanned: 0,
    redemptionsPatchedCampaign: 0,
    redemptionsPatchedSnapshots: 0,
    redemptionsBackfilledAggregate: 0,
    skippedForeignCampaignReferences: 0,
    skippedForeignSessionReferences: 0,
    auditDecisions: [] as BackfillAuditDecision[],
  };

  const redemptions = await ctx.db
    .query("redemptions")
    .withIndex("by_owner_createdAt", (q) => q.eq("ownerId", ownerId))
    .order("desc")
    .take(limit);
  stats.redemptionsScanned = redemptions.length;

  for (const redemption of redemptions) {
    let targetRedemption = redemption;
    let targetCampaignId = await getOwnedCampaign(ctx, ownerId, redemption.campaignId);
    const patch: Partial<Doc<"redemptions">> = {};
    const session = await ctx.db.get(redemption.drawSessionId);
    const ownedSession = session?.ownerId === ownerId ? session : null;

    if (redemption.campaignId && !targetCampaignId) {
      stats.skippedForeignCampaignReferences += 1;
      pushBackfillAuditDecision(stats.auditDecisions, {
        source: "redemption",
        rowId: redemption._id,
        action: "skip",
        reason: "foreign_campaign",
        campaignId: redemption.campaignId,
        drawSessionId: redemption.drawSessionId,
        createdAt: redemption.createdAt,
      });
    }
    if (session && !ownedSession) {
      stats.skippedForeignSessionReferences += 1;
      pushBackfillAuditDecision(stats.auditDecisions, {
        source: "redemption",
        rowId: redemption._id,
        action: "skip",
        reason: "foreign_session",
        campaignId: redemption.campaignId ?? null,
        drawSessionId: redemption.drawSessionId,
        createdAt: redemption.createdAt,
      });
    }

    if (!targetCampaignId && !redemption.campaignId) {
      targetCampaignId =
        (await getOwnedCampaign(ctx, ownerId, campaignId)) ??
        (await getOwnedCampaign(ctx, ownerId, ownedSession?.campaignId));
      if (ownedSession?.campaignId && !targetCampaignId) {
        stats.skippedForeignCampaignReferences += 1;
        pushBackfillAuditDecision(stats.auditDecisions, {
          source: "redemption",
          rowId: redemption._id,
          action: "skip",
          reason: "foreign_campaign",
          campaignId: ownedSession.campaignId,
          drawSessionId: redemption.drawSessionId,
          createdAt: redemption.createdAt,
        });
      }
    }

    if (!redemption.campaignId && targetCampaignId) {
      stats.redemptionsPatchedCampaign += 1;
      targetRedemption = {
        ...redemption,
        campaignId: targetCampaignId._id,
      };
      patch.campaignId = targetCampaignId._id;
    }

    if (
      !redemption.deliveryMode ||
      !redemption.hostDisplayNameSnapshot ||
      !redemption.hostSlugSnapshot ||
      !redemption.campaignNameSnapshot ||
      !redemption.campaignThemeSnapshot
    ) {
      const snapshotPatch = ownedSession
        ? {
            publicCode: ownedSession.publicCode,
            deliveryMode: ownedSession.deliveryMode ?? "station",
            hostDisplayNameSnapshot: ownedSession.hostDisplayNameSnapshot,
            hostSlugSnapshot: ownedSession.hostSlugSnapshot,
            campaignNameSnapshot: ownedSession.campaignNameSnapshot,
            campaignBrandNameSnapshot: ownedSession.campaignBrandNameSnapshot,
            campaignDescriptionSnapshot: ownedSession.campaignDescriptionSnapshot,
            campaignClaimHeadlineSnapshot: ownedSession.campaignClaimHeadlineSnapshot,
            campaignClaimSubtitleSnapshot: ownedSession.campaignClaimSubtitleSnapshot,
            campaignClaimCtaLabelSnapshot: ownedSession.campaignClaimCtaLabelSnapshot,
            campaignClaimWaitingMessageSnapshot: ownedSession.campaignClaimWaitingMessageSnapshot,
            campaignThemeSnapshot: ownedSession.campaignThemeSnapshot,
            campaignHeroAssetKeySnapshot: ownedSession.campaignHeroAssetKeySnapshot,
          }
        : {
            deliveryMode: "station" as const,
            ...(await buildSnapshotPatch(ctx, owner, ownerId, targetCampaignId?._id ?? null)),
          };
      Object.assign(patch, snapshotPatch);
      targetRedemption = {
        ...targetRedemption,
        ...snapshotPatch,
      };
      stats.redemptionsPatchedSnapshots += 1;
    }

    if (!dryRun && Object.keys(patch).length > 0) {
      await ctx.db.patch(redemption._id, patch);
    }

    if (!dryRun) {
      await redemptionsByOwnerAmount.insertIfDoesNotExist(ctx, targetRedemption);
      stats.redemptionsBackfilledAggregate += 1;
      const ownedAggregateCampaign = await getOwnedCampaign(
        ctx,
        ownerId,
        targetRedemption.campaignId
      );
      if (ownedAggregateCampaign) {
        await redemptionsByCampaignAmount.insertIfDoesNotExist(ctx, {
          ...targetRedemption,
          campaignId: ownedAggregateCampaign._id,
        });
      }
    }
  }

  return stats;
}

async function backfillBudgetScope(
  ctx: MutationCtx,
  ownerId: Id<"users">,
  campaignId: Id<"campaigns"> | null,
  dryRun: boolean
) {
  const stats = {
    budgetsPatchedCampaign: 0,
    budgetItemsPatchedCampaign: 0,
    skippedExistingCampaignBudget: 0,
    skippedExistingCampaignItems: 0,
    auditDecisions: [] as BackfillAuditDecision[],
  };

  if (!campaignId) {
    return stats;
  }

  const [legacyBudgets, existingCampaignBudgets, ownerItems, existingCampaignItems] = await Promise.all([
    listOwnerBudgetsForScope(ctx, ownerId, undefined),
    listOwnerBudgetsForScope(ctx, ownerId, campaignId),
    ctx.db
      .query("budgetItems")
      .withIndex("by_owner_campaign_amount", (q) =>
        q.eq("ownerId", ownerId).eq("campaignId", undefined)
      )
      .collect(),
    ctx.db
      .query("budgetItems")
      .withIndex("by_campaign_owner_amount", (q) =>
        q.eq("campaignId", campaignId).eq("ownerId", ownerId)
      )
      .collect(),
  ]);

  if (existingCampaignBudgets.length > 0) {
    stats.skippedExistingCampaignBudget = legacyBudgets.length;
  } else {
    for (const budget of legacyBudgets) {
      stats.budgetsPatchedCampaign += 1;
      if (!dryRun) {
        await ctx.db.patch(budget._id, {
          campaignId,
        });
      }
    }
  }

  const legacyItems = ownerItems;
  if (existingCampaignItems.length > 0) {
    stats.skippedExistingCampaignItems = legacyItems.length;
  } else {
    for (const item of legacyItems) {
      stats.budgetItemsPatchedCampaign += 1;
      if (!dryRun) {
        await ctx.db.patch(item._id, {
          campaignId,
        });
      }
    }
  }

  return stats;
}

export const backfillOwnerSaaSModel = mutation({
  args: {
    ownerId: v.optional(v.id("users")),
    limit: v.optional(v.number()),
    dryRun: v.optional(v.boolean()),
    migrationToken: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<BackfillStats & { targetCampaignId: Id<"campaigns"> | null }> => {
    const { owner, ownerId } = await requireMigrationOwner(ctx, args.ownerId, args.migrationToken, {
      notFoundMessage: "Không tìm thấy host để backfill",
      forbiddenMessage: "Bạn không có quyền backfill host này",
    });

    const limit = Math.min(Math.max(args.limit ?? 500, 1), 500);
    const dryRun = args.dryRun ?? false;
    const stats: BackfillStats = {
      hostProfilesCreated: 0,
      hostProfilesUpdated: 0,
      sessionsScanned: 0,
      sessionsPatchedDeliveryMode: 0,
      sessionsPatchedPublicCodeExpiry: 0,
      sessionsPatchedCampaign: 0,
      sessionsPatchedSnapshots: 0,
      redemptionsScanned: 0,
      redemptionsPatchedCampaign: 0,
      redemptionsPatchedSnapshots: 0,
      redemptionsBackfilledAggregate: 0,
      budgetsPatchedCampaign: 0,
      budgetItemsPatchedCampaign: 0,
      skippedNoCampaign: 0,
      skippedAmbiguousCampaign: 0,
      skippedExistingCampaignBudget: 0,
      skippedExistingCampaignItems: 0,
      skippedForeignCampaignReferences: 0,
      skippedForeignSessionReferences: 0,
      skippedInvalidPublicCodeExpiry: 0,
      auditDecisions: [],
    };

    const target = await getTargetCampaignId(ctx, ownerId);
    if (!target.profile) {
      stats.hostProfilesCreated = 1;
    } else {
      stats.hostProfilesUpdated = 1;
    }

    if (target.ambiguous) {
      stats.skippedAmbiguousCampaign = 1;
    }
    if (!target.campaignId) {
      stats.skippedNoCampaign = 1;
    }

    if (!dryRun) {
      await ensureHostProfileForOwner(ctx, owner, {
        defaultCampaignId: target.campaignId ?? undefined,
      });
    }

    const sessionStats = await backfillDrawSessions(ctx, owner, ownerId, target.campaignId, limit, dryRun);
    Object.assign(stats, {
      ...sessionStats,
      auditDecisions: stats.auditDecisions,
    });
    for (const decision of sessionStats.auditDecisions) {
      pushBackfillAuditDecision(stats.auditDecisions, decision);
    }

    const redemptionStats = await backfillRedemptions(ctx, owner, ownerId, target.campaignId, limit, dryRun);
    Object.assign(stats, {
      ...redemptionStats,
      auditDecisions: stats.auditDecisions,
      skippedForeignCampaignReferences:
        stats.skippedForeignCampaignReferences +
        redemptionStats.skippedForeignCampaignReferences,
    });
    for (const decision of redemptionStats.auditDecisions) {
      pushBackfillAuditDecision(stats.auditDecisions, decision);
    }

    const budgetStats = await backfillBudgetScope(ctx, ownerId, target.campaignId, dryRun);
    Object.assign(stats, {
      ...budgetStats,
      auditDecisions: stats.auditDecisions,
    });

    return {
      ...stats,
      targetCampaignId: target.campaignId,
    };
  },
});

export const cleanupExpiredPublicLinks = mutation({
  args: {
    ownerId: v.optional(v.id("users")),
    limit: v.optional(v.number()),
    dryRun: v.optional(v.boolean()),
    migrationToken: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<CleanupExpiredPublicLinksStats> => {
    const { ownerId } = await requireMigrationOwner(ctx, args.ownerId, args.migrationToken, {
      notFoundMessage: "Không tìm thấy host để dọn link public",
      forbiddenMessage: "Bạn không có quyền dọn link public của host này",
    });

    const limit = Math.min(Math.max(args.limit ?? 500, 1), 500);
    const dryRun = args.dryRun ?? false;
    return await applyExpiredPublicLinkCleanup(ctx, ownerId, limit, dryRun);
  },
});

export const cleanupExpiredPublicLinksCron = internalMutation({
  args: {},
  handler: async (ctx): Promise<CleanupExpiredPublicLinksStats> => {
    return await applyExpiredPublicLinkCleanup(
      ctx,
      undefined,
      SCHEDULED_PUBLIC_LINK_CLEANUP_LIMIT,
      false
    );
  },
});

export const repairHostProfileDefaultCampaign = mutation({
  args: {
    ownerId: v.optional(v.id("users")),
    dryRun: v.optional(v.boolean()),
    migrationToken: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<RepairHostProfileDefaultCampaignStats> => {
    const { ownerId } = await requireMigrationOwner(ctx, args.ownerId, args.migrationToken, {
      notFoundMessage: "Không tìm thấy host để sửa chiến dịch mặc định",
      forbiddenMessage: "Bạn không có quyền sửa chiến dịch mặc định của host này",
    });

    const profile = await getHostProfileForOwner(ctx, ownerId);
    if (!profile) {
      return {
        profilesScanned: 0,
        profilesPatched: 0,
        clearedInvalidDefaultCampaign: false,
        replacementCampaignId: null,
        profileDecision: {
          profileId: null,
          action: "skip_no_profile",
          reason: "missing_profile",
          previousDefaultCampaignId: null,
          replacementCampaignId: null,
        },
      };
    }
    if (!profile.defaultCampaignId) {
      return {
        profilesScanned: 1,
        profilesPatched: 0,
        clearedInvalidDefaultCampaign: false,
        replacementCampaignId: null,
        profileDecision: {
          profileId: profile._id,
          action: "keep",
          reason: "no_default_campaign",
          previousDefaultCampaignId: null,
          replacementCampaignId: null,
        },
      };
    }

    const defaultCampaign = await ctx.db.get(profile.defaultCampaignId);
    const defaultCampaignValid =
      defaultCampaign &&
      defaultCampaign.ownerId === ownerId &&
      defaultCampaign.status !== "archived";
    const invalidReason: RepairHostProfileDefaultCampaignStats["profileDecision"]["reason"] =
      !defaultCampaign
        ? "missing_default"
        : defaultCampaign.ownerId !== ownerId
          ? "foreign_default"
          : "archived_default";
    if (defaultCampaignValid) {
      return {
        profilesScanned: 1,
        profilesPatched: 0,
        clearedInvalidDefaultCampaign: false,
        replacementCampaignId: defaultCampaign._id,
        profileDecision: {
          profileId: profile._id,
          action: "keep",
          reason: "valid_default",
          previousDefaultCampaignId: profile.defaultCampaignId,
          replacementCampaignId: defaultCampaign._id,
        },
      };
    }

    const replacementCampaignId = await getVisibleDefaultReplacementCampaignId(ctx, ownerId);
    if (!args.dryRun) {
      await ctx.db.patch(profile._id, {
        defaultCampaignId: replacementCampaignId ?? undefined,
        updatedAt: Date.now(),
      });
    }

    return {
      profilesScanned: 1,
      profilesPatched: 1,
      clearedInvalidDefaultCampaign: replacementCampaignId === null,
      replacementCampaignId,
      profileDecision: {
        profileId: profile._id,
        action: replacementCampaignId === null ? "clear" : "replace",
        reason: invalidReason,
        previousDefaultCampaignId: profile.defaultCampaignId,
        replacementCampaignId,
      },
    };
  },
});

export const repairOwnerActiveCampaigns = mutation({
  args: {
    ownerId: v.optional(v.id("users")),
    dryRun: v.optional(v.boolean()),
    migrationToken: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<RepairOwnerActiveCampaignsStats> => {
    const { ownerId } = await requireMigrationOwner(ctx, args.ownerId, args.migrationToken, {
      notFoundMessage: "Không tìm thấy host để sửa chiến dịch đang chạy",
      forbiddenMessage: "Bạn không có quyền sửa chiến dịch đang chạy của host này",
    });

    const profile = await getHostProfileForOwner(ctx, ownerId);
    const activeCampaigns = await ctx.db
      .query("campaigns")
      .withIndex("by_owner_status", (q) => q.eq("ownerId", ownerId).eq("status", "active"))
      .collect();
    const keptActiveCampaign = selectKeptActiveCampaign(
      activeCampaigns,
      profile?.defaultCampaignId
    );
    const campaignDecisions: RepairOwnerActiveCampaignsStats["campaignDecisions"] =
      activeCampaigns.map((campaign) => ({
        campaignId: campaign._id,
        action:
          keptActiveCampaign && campaign._id !== keptActiveCampaign._id
            ? "demote"
            : "keep",
        name: campaign.name,
        defaultSelected: profile?.defaultCampaignId === campaign._id,
        createdAt: campaign.createdAt,
        updatedAt: campaign.updatedAt,
      }));
    const profileDecision: RepairOwnerActiveCampaignsStats["profileDecision"] =
      profile && keptActiveCampaign
        ? {
            profileId: profile._id,
            action:
              profile.defaultCampaignId === keptActiveCampaign._id
                ? "keep"
                : "point_to_kept_campaign",
            previousDefaultCampaignId: profile.defaultCampaignId ?? null,
            nextDefaultCampaignId: keptActiveCampaign._id,
          }
        : {
            profileId: profile?._id ?? null,
            action: profile ? "keep" : "skip_no_profile",
            previousDefaultCampaignId: profile?.defaultCampaignId ?? null,
            nextDefaultCampaignId: keptActiveCampaign?._id ?? null,
          };

    if (!keptActiveCampaign || activeCampaigns.length <= 1) {
      return {
        activeCampaignsScanned: activeCampaigns.length,
        activeCampaignsDemoted: 0,
        hostProfilesPatched: 0,
        keptActiveCampaignId: keptActiveCampaign?._id ?? null,
        campaignDecisions,
        profileDecision,
      };
    }

    const now = Date.now();
    let activeCampaignsDemoted = 0;
    for (const campaign of activeCampaigns) {
      if (campaign._id === keptActiveCampaign._id) {
        continue;
      }

      activeCampaignsDemoted += 1;
      if (!args.dryRun) {
        await ctx.db.patch(campaign._id, {
          status: "draft",
          updatedAt: now,
        });
      }
    }

    const shouldPatchProfile =
      Boolean(profile) && profile?.defaultCampaignId !== keptActiveCampaign._id;
    if (shouldPatchProfile && !args.dryRun) {
      await ctx.db.patch(profile!._id, {
        defaultCampaignId: keptActiveCampaign._id,
        updatedAt: now,
      });
    }

    return {
      activeCampaignsScanned: activeCampaigns.length,
      activeCampaignsDemoted,
      hostProfilesPatched: shouldPatchProfile ? 1 : 0,
      keptActiveCampaignId: keptActiveCampaign._id,
      campaignDecisions,
      profileDecision,
    };
  },
});

export const repairDuplicateOwnerBudgets = mutation({
  args: {
    ownerId: v.optional(v.id("users")),
    dryRun: v.optional(v.boolean()),
    migrationToken: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<RepairDuplicateOwnerBudgetsStats> => {
    const { ownerId } = await requireMigrationOwner(ctx, args.ownerId, args.migrationToken, {
      notFoundMessage: "Không tìm thấy host để sửa ngân sách trùng",
      forbiddenMessage: "Bạn không có quyền sửa ngân sách của host này",
    });

    const budgets = await ctx.db
      .query("ownerBudgets")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .collect();
    const budgetsByScope = new Map<string, Doc<"ownerBudgets">[]>();
    for (const budget of budgets) {
      const scopeKey = budgetScopeKey(budget);
      budgetsByScope.set(scopeKey, [...(budgetsByScope.get(scopeKey) ?? []), budget]);
    }

    let duplicateBudgetScopes = 0;
    let duplicateBudgetsDeleted = 0;
    const budgetDecisions: RepairDuplicateOwnerBudgetsStats["budgetDecisions"] = [];
    for (const scopedBudgets of budgetsByScope.values()) {
      if (scopedBudgets.length <= 1) {
        for (const budget of scopedBudgets) {
          budgetDecisions.push({
            budgetId: budget._id,
            action: "keep",
            scope: budgetScopeKey(budget),
            campaignId: budget.campaignId ?? null,
            totalBudget: budget.totalBudget,
            remainingBudget: budget.remainingBudget,
            createdAt: budget.createdAt,
            updatedAt: budget.updatedAt,
          });
        }
        continue;
      }

      duplicateBudgetScopes += 1;
      const [keptBudget, ...duplicateBudgets] = sortBudgetsByRecency(scopedBudgets);
      if (!keptBudget) {
        continue;
      }

      budgetDecisions.push({
        budgetId: keptBudget._id,
        action: "keep",
        scope: budgetScopeKey(keptBudget),
        campaignId: keptBudget.campaignId ?? null,
        totalBudget: keptBudget.totalBudget,
        remainingBudget: keptBudget.remainingBudget,
        createdAt: keptBudget.createdAt,
        updatedAt: keptBudget.updatedAt,
      });
      for (const duplicateBudget of duplicateBudgets) {
        budgetDecisions.push({
          budgetId: duplicateBudget._id,
          action: "delete",
          scope: budgetScopeKey(duplicateBudget),
          campaignId: duplicateBudget.campaignId ?? null,
          totalBudget: duplicateBudget.totalBudget,
          remainingBudget: duplicateBudget.remainingBudget,
          createdAt: duplicateBudget.createdAt,
          updatedAt: duplicateBudget.updatedAt,
        });
      }

      duplicateBudgetsDeleted += duplicateBudgets.length;
      if (!args.dryRun) {
        for (const duplicateBudget of duplicateBudgets) {
          await ctx.db.delete(duplicateBudget._id);
        }
      }
    }

    return {
      budgetsScanned: budgets.length,
      duplicateBudgetScopes,
      duplicateBudgetsDeleted,
      budgetDecisions,
    };
  },
});

export const repairDuplicateHostProfiles = mutation({
  args: {
    ownerId: v.optional(v.id("users")),
    dryRun: v.optional(v.boolean()),
    migrationToken: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<RepairDuplicateHostProfilesStats> => {
    const { ownerId } = await requireMigrationOwner(ctx, args.ownerId, args.migrationToken, {
      notFoundMessage: "Không tìm thấy host để sửa hồ sơ trùng",
      forbiddenMessage: "Bạn không có quyền sửa hồ sơ host này",
    });

    const profiles = await ctx.db
      .query("hostProfiles")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .collect();
    if (profiles.length <= 1) {
      return {
        profilesScanned: profiles.length,
        duplicateProfilesDeleted: 0,
        keptProfileId: profiles[0]?._id ?? null,
        profileDecisions: profiles.map((profile) => ({
          profileId: profile._id,
          action: "keep" as const,
          slug: profile.slug,
          defaultCampaignId: profile.defaultCampaignId ?? null,
          onboardingCompleted: profile.onboardingCompleted,
          createdAt: profile.createdAt,
          updatedAt: profile.updatedAt,
        })),
      };
    }

    const [keptProfile, ...duplicateProfiles] = sortHostProfilesByRecency(profiles);
    if (!keptProfile) {
      return {
        profilesScanned: profiles.length,
        duplicateProfilesDeleted: 0,
        keptProfileId: null,
        profileDecisions: [],
      };
    }

    const profileDecisions = [
      {
        profileId: keptProfile._id,
        action: "keep" as const,
        slug: keptProfile.slug,
        defaultCampaignId: keptProfile.defaultCampaignId ?? null,
        onboardingCompleted: keptProfile.onboardingCompleted,
        createdAt: keptProfile.createdAt,
        updatedAt: keptProfile.updatedAt,
      },
      ...duplicateProfiles.map((profile) => ({
        profileId: profile._id,
        action: "delete" as const,
        slug: profile.slug,
        defaultCampaignId: profile.defaultCampaignId ?? null,
        onboardingCompleted: profile.onboardingCompleted,
        createdAt: profile.createdAt,
        updatedAt: profile.updatedAt,
      })),
    ];

    if (!args.dryRun) {
      for (const duplicateProfile of duplicateProfiles) {
        await ctx.db.delete(duplicateProfile._id);
      }
    }

    return {
      profilesScanned: profiles.length,
      duplicateProfilesDeleted: duplicateProfiles.length,
      keptProfileId: keptProfile._id,
      profileDecisions,
    };
  },
});

export const cleanupStaleReservedAssets = mutation({
  args: {
    ownerId: v.optional(v.id("users")),
    limit: v.optional(v.number()),
    olderThanMs: v.optional(v.number()),
    dryRun: v.optional(v.boolean()),
    migrationToken: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<CleanupStaleReservedAssetsStats> => {
    const { ownerId } = await requireMigrationOwner(ctx, args.ownerId, args.migrationToken, {
      notFoundMessage: "Không tìm thấy host để dọn asset upload",
      forbiddenMessage: "Bạn không có quyền dọn asset upload của host này",
    });

    const limit = Math.min(Math.max(args.limit ?? 500, 1), 500);
    const olderThanMs = Math.min(
      Math.max(args.olderThanMs ?? DEFAULT_STALE_RESERVED_ASSET_AGE_MS, 60 * 60 * 1000),
      30 * 24 * 60 * 60 * 1000
    );
    return await applyStaleReservedAssetCleanup(
      ctx,
      ownerId,
      limit,
      olderThanMs,
      args.dryRun ?? false
    );
  },
});

export const cleanupStaleReservedAssetsCron = internalMutation({
  args: {},
  handler: async (ctx): Promise<CleanupStaleReservedAssetsStats> => {
    return await applyStaleReservedAssetCleanup(
      ctx,
      undefined,
      SCHEDULED_STALE_ASSET_CLEANUP_LIMIT,
      DEFAULT_STALE_RESERVED_ASSET_AGE_MS,
      false
    );
  },
});
