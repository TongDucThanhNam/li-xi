import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { MutationCtx, query, QueryCtx, mutation } from "./_generated/server";
import { requireResolvedOwner } from "./authorization";
import {
  assertCampaignAssetBucketMatchesConfigured,
  getRenderableCampaignAssetUrl,
  getOwnedAssetsByKey,
  getUniqueOwnedCampaignAssetByKey,
  isRenderableCampaignAsset,
  rejectAmbiguousOwnedAssets,
  rejectCampaignAssetAndScheduleObjectDelete,
  r2,
} from "./assets";
import {
  DEFAULT_CAMPAIGN_BRAND,
  DEFAULT_CAMPAIGN_DESCRIPTION,
  DEFAULT_CAMPAIGN_NAME,
  assertCampaignSlugAvailable,
  createUniqueDefaultCampaignSlug,
  getPreferredActiveCampaignForOwner,
  listVisibleCampaignsForOwner,
  slugifyCampaign,
  sortCampaignsByRecency,
} from "./campaignIdentity";
import { assertCanCreateCampaign } from "./entitlements";
import {
  displayNameFromUser,
  ensureHostProfileForOwner,
  getHostProfileForOwner,
} from "./hostProfiles";
import { isOpenPendingSession } from "./publicLinks";
import { validateCampaignAssetPolicy } from "../lib/assetPolicy";

const campaignThemeValidator = v.union(v.literal("lunar"), v.literal("brand"));
const campaignStatusValidator = v.union(
  v.literal("draft"),
  v.literal("active"),
  v.literal("archived")
);

type CampaignStatus = "draft" | "active" | "archived";
type PendingCampaignSessionDeliveryMode = "station" | "link" | undefined;
const PENDING_CAMPAIGN_SESSION_DELIVERY_MODES: PendingCampaignSessionDeliveryMode[] = [
  "station",
  "link",
  undefined,
];
const attachableCampaignAssetStatuses = new Set(["reserved", "uploaded"]);

function sanitizeText(value: string, fieldName: string, minLength: number, maxLength: number) {
  const clean = value.trim().replace(/\s+/g, " ");
  if (clean.length < minLength || clean.length > maxLength) {
    throw new Error(`${fieldName} phải từ ${minLength}-${maxLength} ký tự`);
  }
  return clean;
}

function maybeText(value: string | undefined, fieldName: string, maxLength: number) {
  if (value === undefined) {
    return undefined;
  }
  const clean = value.trim().replace(/\s+/g, " ");
  if (!clean) {
    return undefined;
  }
  if (clean.length > maxLength) {
    throw new Error(`${fieldName} tối đa ${maxLength} ký tự`);
  }
  return clean;
}

async function activateOnlyCampaign(
  ctx: MutationCtx,
  ownerId: Id<"users">,
  activeCampaignId: Id<"campaigns">
) {
  const activeCampaigns = await ctx.db
    .query("campaigns")
    .withIndex("by_owner_status", (q) => q.eq("ownerId", ownerId).eq("status", "active"))
    .collect();

  for (const campaign of activeCampaigns) {
    if (campaign._id !== activeCampaignId) {
      if (await hasOpenPendingSessionForCampaign(ctx, ownerId, campaign._id)) {
        throw new Error("Không thể kích hoạt chiến dịch khác khi chiến dịch hiện tại còn lượt rút đang chờ");
      }
      await ctx.db.patch(campaign._id, {
        status: "draft",
        updatedAt: Date.now(),
      });
    }
  }
}

async function hasOpenPendingSessionForCampaign(
  ctx: MutationCtx,
  ownerId: Id<"users">,
  campaignId: Id<"campaigns">
) {
  const groups = await Promise.all(
    PENDING_CAMPAIGN_SESSION_DELIVERY_MODES.map((deliveryMode) =>
      ctx.db
        .query("drawSessions")
        .withIndex("by_campaign_owner_status_delivery", (q) =>
          q
            .eq("campaignId", campaignId)
            .eq("ownerId", ownerId)
            .eq("status", "pending")
            .eq("deliveryMode", deliveryMode)
        )
        .collect()
    )
  );
  const pendingSessions = groups.flat();

  return pendingSessions.some((session) => isOpenPendingSession(session));
}

async function campaignView(ctx: QueryCtx, campaignId: Id<"campaigns">) {
  const campaign = await ctx.db.get(campaignId);
  if (!campaign) {
    return null;
  }

  const heroAssetCandidate = campaign.heroAssetId
    ? await ctx.db.get(campaign.heroAssetId)
    : null;
  const heroAsset =
    isRenderableCampaignAsset(heroAssetCandidate, campaign.ownerId) &&
    heroAssetCandidate.campaignId === campaign._id
      ? heroAssetCandidate
      : null;
  const heroAssetUrl = heroAsset
    ? await getRenderableCampaignAssetUrl(ctx, campaign.ownerId, heroAsset.key, campaign._id)
    : null;

  return {
    id: campaign._id,
    name: campaign.name,
    slug: campaign.slug,
    brandName: campaign.brandName ?? "",
    description: campaign.description ?? "",
    claimHeadline: campaign.claimHeadline ?? "",
    claimSubtitle: campaign.claimSubtitle ?? "",
    claimCtaLabel: campaign.claimCtaLabel ?? "",
    claimCollectLabel: campaign.claimCollectLabel ?? "",
    claimWaitingMessage: campaign.claimWaitingMessage ?? "",
    theme: campaign.theme,
    status: campaign.status,
    heroAsset: heroAsset
      ? {
          id: heroAsset._id,
          key: heroAsset.key,
          fileName: heroAsset.fileName ?? "Campaign asset",
          contentType: heroAsset.contentType ?? null,
          url: heroAssetUrl,
        }
      : null,
    createdAt: campaign.createdAt,
    updatedAt: campaign.updatedAt,
  };
}

export const getWorkspace = query({
  args: {
    selectedCampaignId: v.optional(v.id("campaigns")),
  },
  handler: async (ctx, args) => {
    const { owner, ownerId } = await requireResolvedOwner(ctx, undefined, {
      notFoundMessage: "Không tìm thấy host",
      forbiddenMessage: "Bạn không có quyền chỉnh chiến dịch này",
    });
    const hostProfile = await getHostProfileForOwner(ctx, ownerId);

    const visibleCampaigns = await listVisibleCampaignsForOwner(ctx, ownerId);
    const sortedCampaigns = sortCampaignsByRecency(visibleCampaigns);
    const activeCampaign = await getPreferredActiveCampaignForOwner(ctx, ownerId);
    const selectedCampaign =
      args.selectedCampaignId
        ? sortedCampaigns.find((campaign) => campaign._id === args.selectedCampaignId) ?? null
        : null;
    if (args.selectedCampaignId && !selectedCampaign) {
      throw new Error("Không tìm thấy chiến dịch");
    }
    const recentAssetsCampaignId = selectedCampaign?._id ?? activeCampaign?._id ?? sortedCampaigns[0]?._id;

    const recentAssets = recentAssetsCampaignId
      ? await ctx.db
          .query("campaignAssets")
          .withIndex("by_campaign_owner_status_createdAt", (q) =>
            q
              .eq("campaignId", recentAssetsCampaignId)
              .eq("ownerId", ownerId)
              .eq("status", "attached")
          )
          .order("desc")
          .take(12)
      : [];
    const displayableRecentAssets = recentAssets.filter((asset) =>
      isRenderableCampaignAsset(asset, ownerId)
    );
    const campaignViews = (
      await Promise.all(sortedCampaigns.map((campaign) => campaignView(ctx, campaign._id)))
    ).filter((campaign) => campaign !== null);

    const recentAssetViews = await Promise.all(
      displayableRecentAssets.map(async (asset) => {
        const url = await getRenderableCampaignAssetUrl(
          ctx,
          ownerId,
          asset.key,
          recentAssetsCampaignId
        );
        if (!url) {
          return null;
        }
        return {
          id: asset._id,
          campaignId: asset.campaignId ?? null,
          key: asset.key,
          fileName: asset.fileName ?? "Campaign asset",
          contentType: asset.contentType ?? null,
          size: asset.size ?? null,
          url,
          createdAt: asset.createdAt,
        };
      })
    );

    return {
      hostProfile: {
        displayName: hostProfile?.displayName ?? displayNameFromUser(owner),
        slug: hostProfile?.slug ?? null,
        defaultCampaignId: hostProfile?.defaultCampaignId ?? null,
        onboardingCompleted: hostProfile?.onboardingCompleted ?? false,
      },
      activeCampaign: activeCampaign ? await campaignView(ctx, activeCampaign._id) : null,
      campaigns: campaignViews,
      recentAssets: recentAssetViews.filter((asset) => asset !== null),
    };
  },
});

export const saveCampaign = mutation({
  args: {
    campaignId: v.optional(v.id("campaigns")),
    name: v.string(),
    slug: v.optional(v.string()),
    brandName: v.optional(v.string()),
    description: v.optional(v.string()),
    claimHeadline: v.optional(v.string()),
    claimSubtitle: v.optional(v.string()),
    claimCtaLabel: v.optional(v.string()),
    claimCollectLabel: v.optional(v.string()),
    claimWaitingMessage: v.optional(v.string()),
    theme: campaignThemeValidator,
    status: campaignStatusValidator,
    heroAssetId: v.optional(v.id("campaignAssets")),
  },
  handler: async (ctx, args) => {
    const { owner, ownerId } = await requireResolvedOwner(ctx, undefined, {
      notFoundMessage: "Không tìm thấy host",
      forbiddenMessage: "Bạn không có quyền chỉnh chiến dịch này",
    });

    const name = sanitizeText(args.name, "Tên chiến dịch", 3, 80);
    const slug = slugifyCampaign(args.slug ?? name);
    const brandName = maybeText(args.brandName, "Tên thương hiệu", 80);
    const description = maybeText(args.description, "Mô tả chiến dịch", 180);
    const claimHeadline = maybeText(args.claimHeadline, "Headline claim", 72);
    const claimSubtitle = maybeText(args.claimSubtitle, "Subtitle claim", 120);
    const claimCtaLabel = maybeText(args.claimCtaLabel, "Nhãn CTA claim", 28);
    const claimCollectLabel = maybeText(args.claimCollectLabel, "Nhãn nhận thưởng", 28);
    const claimWaitingMessage = maybeText(args.claimWaitingMessage, "Thông điệp chờ", 120);
    const now = Date.now();

    await assertCampaignSlugAvailable(ctx, ownerId, slug, args.campaignId);

    let campaignId = args.campaignId;
    if (campaignId) {
      const campaign = await ctx.db.get(campaignId);
      if (!campaign || campaign.ownerId !== ownerId) {
        throw new Error("Không tìm thấy chiến dịch");
      }
      if (args.heroAssetId) {
        const heroAsset = await ctx.db.get(args.heroAssetId);
        if (
          !isRenderableCampaignAsset(heroAsset, ownerId) ||
          heroAsset.campaignId !== campaign._id
        ) {
          throw new Error("Ảnh hero phải thuộc chiến dịch này");
        }
      }
      if (
        campaign.status === "active" &&
        args.status !== "active" &&
        (await hasOpenPendingSessionForCampaign(ctx, ownerId, campaignId))
      ) {
        throw new Error("Không thể tắt chiến dịch khi còn lượt rút đang chờ");
      }

      await ctx.db.patch(campaignId, {
        name,
        slug,
        brandName,
        description,
        claimHeadline,
        claimSubtitle,
        claimCtaLabel,
        claimCollectLabel,
        claimWaitingMessage,
        theme: args.theme,
        status: args.status as CampaignStatus,
        heroAssetId: args.heroAssetId,
        updatedAt: now,
      });
    } else {
      if (args.heroAssetId) {
        throw new Error("Hãy lưu chiến dịch trước khi gắn ảnh hero");
      }
      await assertCanCreateCampaign(ctx, ownerId);
      campaignId = await ctx.db.insert("campaigns", {
        ownerId,
        name,
        slug,
        brandName,
        description,
        claimHeadline,
        claimSubtitle,
        claimCtaLabel,
        claimCollectLabel,
        claimWaitingMessage,
        theme: args.theme,
        status: args.status as CampaignStatus,
        heroAssetId: args.heroAssetId,
        createdAt: now,
        updatedAt: now,
      });
    }

    if (args.status === "active") {
      await activateOnlyCampaign(ctx, ownerId, campaignId);
      await ensureHostProfileForOwner(ctx, owner, { defaultCampaignId: campaignId });
    }

    return {
      campaignId,
      slug,
    };
  },
});

export const ensureDefaultCampaign = mutation({
  args: {},
  handler: async (ctx) => {
    const { owner, ownerId } = await requireResolvedOwner(ctx, undefined, {
      notFoundMessage: "Không tìm thấy host",
      forbiddenMessage: "Bạn không có quyền chỉnh chiến dịch này",
    });

    const existingActive = await getPreferredActiveCampaignForOwner(ctx, ownerId);
    if (existingActive) {
      await ensureHostProfileForOwner(ctx, owner, { defaultCampaignId: existingActive._id });
      return { campaignId: existingActive._id };
    }

    const existingDraft = await ctx.db
      .query("campaigns")
      .withIndex("by_owner_status", (q) => q.eq("ownerId", ownerId).eq("status", "draft"))
      .collect();
    const preferredDraft = sortCampaignsByRecency(existingDraft)[0];
    if (preferredDraft) {
      await ctx.db.patch(preferredDraft._id, {
        status: "active",
        updatedAt: Date.now(),
      });
      await ensureHostProfileForOwner(ctx, owner, { defaultCampaignId: preferredDraft._id });
      return { campaignId: preferredDraft._id };
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

    return { campaignId };
  },
});

export const attachUploadedAsset = mutation({
  args: {
    campaignId: v.id("campaigns"),
    key: v.string(),
    fileName: v.optional(v.string()),
    contentType: v.optional(v.string()),
    size: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { ownerId } = await requireResolvedOwner(ctx, undefined, {
      notFoundMessage: "Không tìm thấy host",
      forbiddenMessage: "Bạn không có quyền chỉnh chiến dịch này",
    });

    const campaign = await ctx.db.get(args.campaignId);
    if (!campaign || campaign.ownerId !== ownerId) {
      throw new Error("Không tìm thấy chiến dịch");
    }

    const now = Date.now();
    const ownedAssets = await getOwnedAssetsByKey(ctx, ownerId, args.key);
    if (ownedAssets.length > 1) {
      await rejectAmbiguousOwnedAssets(ctx, ownedAssets, now, {});
      throw new Error("Key asset R2 không duy nhất cho owner");
    }
    const asset = await getUniqueOwnedCampaignAssetByKey(ctx, ownerId, args.key);

    if (!asset) {
      throw new Error("Không tìm thấy asset vừa upload");
    }
    if (asset.campaignId !== campaign._id) {
      throw new Error("Asset upload không thuộc chiến dịch này");
    }
    assertCampaignAssetBucketMatchesConfigured(asset);

    if (asset.status === "attached") {
      if (!isRenderableCampaignAsset(asset, ownerId)) {
        throw new Error("Asset đã gắn nhưng chưa đủ điều kiện hiển thị");
      }
      await ctx.db.patch(campaign._id, {
        heroAssetId: asset._id,
        updatedAt: now,
      });
      return {
        assetId: asset._id,
        campaignId: campaign._id,
        key: asset.key,
      };
    }
    if (asset.status === "rejected") {
      throw new Error("Asset upload đã bị từ chối");
    }
    if (!attachableCampaignAssetStatuses.has(asset.status ?? "")) {
      throw new Error("Asset upload chưa ở trạng thái có thể gắn");
    }

    const actualMetadata = await r2.getMetadata(ctx, args.key);
    if (!actualMetadata?.contentType || actualMetadata.size === undefined) {
      await ctx.db.patch(asset._id, {
        contentType: args.contentType ?? asset.contentType,
        fileName: args.fileName ?? asset.fileName,
        metadataSource: "client",
        rejectedReason: undefined,
        size: args.size ?? asset.size,
        status: "uploaded",
      });
      throw new Error("Chưa đọc được metadata R2 của ảnh upload, vui lòng thử lại");
    }

    let validated: ReturnType<typeof validateCampaignAssetPolicy>;
    try {
      validated = validateCampaignAssetPolicy({
        contentType: actualMetadata.contentType,
        fileName: args.fileName,
        size: actualMetadata.size,
      });
    } catch (error) {
      const rejectedReason =
        error instanceof Error ? error.message : "Asset chiến dịch không hợp lệ";
      await rejectCampaignAssetAndScheduleObjectDelete(ctx, asset, now, rejectedReason, {
        contentType: actualMetadata.contentType ?? undefined,
        fileName: args.fileName ?? undefined,
        metadataSource: "r2",
        metadataSyncedAt: now,
        size: actualMetadata.size ?? undefined,
        validatedAt: now,
      });
      throw error;
    }

    await ctx.db.patch(asset._id, {
      campaignId: campaign._id,
      contentType: validated.contentType,
      fileName: validated.fileName,
      metadataSource: "r2",
      metadataSyncedAt: now,
      rejectedReason: undefined,
      size: validated.size,
      status: "attached",
      usage: "hero",
      validatedAt: now,
    });
    await ctx.db.patch(campaign._id, {
      heroAssetId: asset._id,
      updatedAt: now,
    });

    return {
      assetId: asset._id,
      campaignId: campaign._id,
      key: asset.key,
    };
  },
});
