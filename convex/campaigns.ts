import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { MutationCtx, query, QueryCtx, mutation } from "./_generated/server";
import { requireResolvedOwner } from "./authorization";
import {
  assertCampaignAssetBucketMatchesConfigured,
  getRenderableCampaignAssetUrl,
  getRenderableCampaignGameAssets,
  getOwnedAssetsByKey,
  getUniqueOwnedCampaignAssetByKey,
  isRenderableCampaignAsset,
  rejectAmbiguousOwnedAssets,
  rejectCampaignAssetAndScheduleObjectDelete,
  r2,
  clearCampaignAssetRole,
} from "./assets";
import {
  ensureDefaultCampaignGame,
  presentCampaignGameConfig,
  resolvePrimaryCampaignGame,
  upsertPrimaryCampaignGame,
} from "./campaignGameConfig";
import {
  isLiXiGameConfig,
  normalizePlayLimits,
} from "../lib/gameTemplates";
import { normalizeScheduleWindow } from "../lib/schedulePolicy";
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
import { hasOpenPendingSessionForCampaign } from "./drawSessionPolicy";
import {
  displayNameFromUser,
  ensureHostProfileForOwner,
  getHostProfileForOwner,
} from "./hostProfiles";
import { campaignGameConfigValidator, campaignStyleVariantValidator, gameTemplateIdValidator } from "./gameTemplateValues";
import {
  isCampaignAssetUsage,
  isCampaignGameAssetUsage,
  validateCampaignAssetPolicy,
} from "../lib/assetPolicy";
import {
  normalizeCampaignAudienceTags,
  normalizeCampaignBrandColor,
  CAMPAIGN_AUDIENCE_NOTE_MAX_LENGTH,
} from "../lib/brandIdentity";
import { gameTemplates } from "../lib/gameTemplates";

const campaignThemeValidator = campaignStyleVariantValidator;
const campaignStatusValidator = v.union(
  v.literal("draft"),
  v.literal("active"),
  v.literal("archived")
);

type CampaignStatus = "draft" | "active" | "archived";
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

/**
 * Multiple campaigns may run independently and concurrently: activation no
 * longer demotes the owner's other active campaigns. The preferred/default
 * campaign pointer only decides which campaign legacy draw-era surfaces
 * resolve to, and every explicit deactivation still guards open pending
 * sessions through saveCampaign's own hasOpenPendingSessionForCampaign check.
 */
async function markCampaignAsPreferred(
	ctx: MutationCtx,
	owner: Doc<"users">,
	ownerId: Id<"users">,
	campaignId: Id<"campaigns">
) {
	await ensureHostProfileForOwner(ctx, owner, { defaultCampaignId: campaignId });
}

async function campaignView(ctx: QueryCtx, campaignId: Id<"campaigns">) {
  const campaign = await ctx.db.get(campaignId);
  if (!campaign) {
    return null;
  }
  const campaignGame = await resolvePrimaryCampaignGame(ctx, campaign);

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

  const logoAssetCandidate = campaign.logoAssetId
    ? await ctx.db.get(campaign.logoAssetId)
    : null;
  const logoAsset =
    isRenderableCampaignAsset(logoAssetCandidate, campaign.ownerId) &&
    logoAssetCandidate.campaignId === campaign._id
      ? logoAssetCandidate
      : null;
  const logoAssetUrl = logoAsset
    ? await getRenderableCampaignAssetUrl(ctx, campaign.ownerId, logoAsset.key, campaign._id)
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
    // Brand identity metadata (workspace only; see docs/product-direction.md).
    brandColor: campaign.brandColor ?? null,
    logoAsset: logoAsset
      ? {
          id: logoAsset._id,
          key: logoAsset.key,
          fileName: logoAsset.fileName ?? "Campaign asset",
          contentType: logoAsset.contentType ?? null,
          url: logoAssetUrl,
        }
      : null,
    audienceTags: campaign.audienceTags ?? [],
    audienceNote: campaign.audienceNote ?? "",
    gameTemplateId: campaignGame.templateId,
    gameConfig: campaignGame.config,
    campaignGame: {
      id: campaignGame.id,
      templateId: campaignGame.templateId,
      name: campaignGame.name,
      config: campaignGame.config,
    },
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

export const getCampaignRouteContext = query({
  args: {
    campaignId: v.string(),
  },
  handler: async (ctx, args) => {
    const { ownerId } = await requireResolvedOwner(ctx, undefined, {
      notFoundMessage: "Không tìm thấy host",
      forbiddenMessage: "Bạn không có quyền xem chiến dịch này",
    });
    const campaignId = ctx.db.normalizeId("campaigns", args.campaignId);
    if (!campaignId) {
      return null;
    }
    const campaign = await ctx.db.get(campaignId);
    if (!campaign || campaign.ownerId !== ownerId) {
      return null;
    }
    return campaignView(ctx, campaign._id);
  },
});

export const getCampaignGameRouteContext = query({
  args: {
    campaignGameId: v.string(),
  },
  handler: async (ctx, args) => {
    const { ownerId } = await requireResolvedOwner(ctx, undefined, {
      notFoundMessage: "Không tìm thấy host",
      forbiddenMessage: "Bạn không có quyền vận hành trò chơi này",
    });
    const campaignGameId = ctx.db.normalizeId("campaignGames", args.campaignGameId);
    if (!campaignGameId) {
      return null;
    }
    const campaignGame = await ctx.db.get(campaignGameId);
    if (!campaignGame || campaignGame.ownerId !== ownerId) {
      return null;
    }
    const campaign = await ctx.db.get(campaignGame.campaignId);
    if (!campaign || campaign.ownerId !== ownerId) {
      return null;
    }
    return {
      campaign: await campaignView(ctx, campaign._id),
      campaignGame: {
        id: campaignGame._id,
        campaignId: campaignGame.campaignId,
        templateId: campaignGame.templateId,
        name:
          campaignGame.name ?? gameTemplates[campaignGame.templateId].name,
        config: presentCampaignGameConfig(
          campaignGame.templateId,
          campaignGame.config,
          campaign
        ),
        playLimits: normalizePlayLimits(campaignGame.playLimits),
        schedule: normalizeScheduleWindow(campaignGame),
        // Live per-game slot assets ({usage, assetId, url}); presentation
        // only. assetId powers the editor panel's remove control.
        assets: await getRenderableCampaignGameAssets(
          ctx,
          ownerId,
          campaign._id,
          campaignGame._id
        ),
        status: campaignGame.status,
        createdAt: campaignGame.createdAt,
        updatedAt: campaignGame.updatedAt,
      },
    };
  },
});

export const getCampaignGamesRouteContext = query({
  args: {
    campaignId: v.string(),
  },
  handler: async (ctx, args) => {
    const { ownerId } = await requireResolvedOwner(ctx, undefined, {
      notFoundMessage: "Không tìm thấy host",
      forbiddenMessage: "Bạn không có quyền xem trò chơi chiến dịch này",
    });
    const campaignId = ctx.db.normalizeId("campaigns", args.campaignId);
    if (!campaignId) {
      return null;
    }
    const campaign = await ctx.db.get(campaignId);
    if (!campaign || campaign.ownerId !== ownerId) {
      return null;
    }
    const campaignGames = await ctx.db
      .query("campaignGames")
      .withIndex("by_campaign", (q) => q.eq("campaignId", campaign._id))
      .collect();

    return {
      campaign: await campaignView(ctx, campaign._id),
      campaignGames: campaignGames
        .filter((campaignGame) => campaignGame.ownerId === ownerId)
        .sort((left, right) => left.createdAt - right.createdAt)
        .map((campaignGame) => ({
          id: campaignGame._id,
          campaignId: campaignGame.campaignId,
          templateId: campaignGame.templateId,
          name:
            campaignGame.name ?? gameTemplates[campaignGame.templateId].name,
          config: presentCampaignGameConfig(
            campaignGame.templateId,
            campaignGame.config,
            campaign
          ),
          schedule: normalizeScheduleWindow(campaignGame),
          status: campaignGame.status,
          createdAt: campaignGame.createdAt,
          updatedAt: campaignGame.updatedAt,
        })),
    };
  },
});

export const ensureCampaignGameForRoute = mutation({
  args: {
    campaignId: v.id("campaigns"),
  },
  handler: async (ctx, args) => {
    const { ownerId } = await requireResolvedOwner(ctx, undefined, {
      notFoundMessage: "Không tìm thấy host",
      forbiddenMessage: "Bạn không có quyền tạo trò chơi cho chiến dịch này",
    });
    const campaign = await ctx.db.get(args.campaignId);
    if (!campaign || campaign.ownerId !== ownerId) {
      throw new Error("Không tìm thấy chiến dịch");
    }
    const result = await ensureDefaultCampaignGame(ctx, campaign);
    return {
      campaignGameId: result.campaignGameId,
      templateId: result.templateId,
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
    // Brand identity (workspace metadata only). Omitted values clear: every
    // workspace form (create, overview, game editor) sends the full set from
    // the campaign view on save.
    brandColor: v.optional(v.string()),
    logoAssetId: v.optional(v.id("campaignAssets")),
    audienceTags: v.optional(v.array(v.string())),
    audienceNote: v.optional(v.string()),
    claimHeadline: v.optional(v.string()),
    claimSubtitle: v.optional(v.string()),
    claimCtaLabel: v.optional(v.string()),
    claimCollectLabel: v.optional(v.string()),
    claimWaitingMessage: v.optional(v.string()),
    theme: campaignThemeValidator,
    gameTemplateId: v.optional(gameTemplateIdValidator),
    gameConfig: v.optional(campaignGameConfigValidator),
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
    const brandColor = normalizeCampaignBrandColor(args.brandColor);
    const audienceTags = normalizeCampaignAudienceTags(args.audienceTags);
    const audienceNote = maybeText(
      args.audienceNote,
      "Ghi chú đối tượng",
      CAMPAIGN_AUDIENCE_NOTE_MAX_LENGTH
    );
    const claimHeadline = maybeText(args.claimHeadline, "Headline claim", 72);
    const claimSubtitle = maybeText(args.claimSubtitle, "Subtitle claim", 120);
    const claimCtaLabel = maybeText(args.claimCtaLabel, "Nhãn CTA claim", 28);
    const claimCollectLabel = maybeText(args.claimCollectLabel, "Nhãn nhận thưởng", 28);
    const claimWaitingMessage = maybeText(args.claimWaitingMessage, "Thông điệp chờ", 120);
    const theme =
      args.gameConfig && isLiXiGameConfig(args.gameConfig)
        ? args.gameConfig.styleVariant
        : args.theme;
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
      if (args.logoAssetId) {
        const logoAsset = await ctx.db.get(args.logoAssetId);
        if (
          !isRenderableCampaignAsset(logoAsset, ownerId) ||
          logoAsset.campaignId !== campaign._id ||
          logoAsset.usage !== "brand-logo"
        ) {
          throw new Error("Logo phải thuộc chiến dịch này");
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
        brandColor,
        logoAssetId: args.logoAssetId,
        audienceTags,
        audienceNote,
        claimHeadline,
        claimSubtitle,
        claimCtaLabel,
        claimCollectLabel,
        claimWaitingMessage,
        theme,
        status: args.status as CampaignStatus,
        heroAssetId: args.heroAssetId,
        updatedAt: now,
      });
    } else {
      if (args.heroAssetId) {
        throw new Error("Hãy lưu chiến dịch trước khi gắn ảnh hero");
      }
      if (args.logoAssetId) {
        throw new Error("Hãy lưu chiến dịch trước khi gắn logo");
      }
      await assertCanCreateCampaign(ctx, ownerId);
      campaignId = await ctx.db.insert("campaigns", {
        ownerId,
        name,
        slug,
        brandName,
        description,
        brandColor,
        audienceTags,
        audienceNote,
        claimHeadline,
        claimSubtitle,
        claimCtaLabel,
        claimCollectLabel,
        claimWaitingMessage,
        theme,
        status: args.status as CampaignStatus,
        heroAssetId: args.heroAssetId,
        createdAt: now,
        updatedAt: now,
      });
    }
    if (!campaignId) {
      throw new Error("Không thể lưu chiến dịch");
    }

    const gameConfig = presentCampaignGameConfig(
      args.gameTemplateId ?? "li-xi",
      args.gameConfig,
      {
        _id: campaignId,
        ownerId,
        theme,
        claimHeadline,
        claimSubtitle,
        claimCtaLabel,
        claimCollectLabel,
        claimWaitingMessage,
      }
    );
    const campaignGame = await upsertPrimaryCampaignGame(ctx, {
      ownerId,
      campaignId,
      templateId: args.gameTemplateId,
      config: gameConfig,
      status: args.status as CampaignStatus,
    });

    if (args.status === "active") {
      await markCampaignAsPreferred(ctx, owner, ownerId, campaignId);
    }

    return {
      campaignId,
      campaignGameId: campaignGame.campaignGameId,
      gameTemplateId: campaignGame.templateId,
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
      // Only bootstrap a default li xi game when the campaign has no games at
      // all; campaigns that already own configured instances are untouched.
      const anyGame = await ctx.db
        .query("campaignGames")
        .withIndex("by_campaign", (q) => q.eq("campaignId", existingActive._id))
        .first();
      if (!anyGame) {
        await ensureDefaultCampaignGame(ctx, existingActive);
      }
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
      const activatedCampaign = await ctx.db.get(preferredDraft._id);
      if (!activatedCampaign) {
        throw new Error("Không tìm thấy chiến dịch");
      }
      await ensureDefaultCampaignGame(ctx, activatedCampaign);
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
      theme: "brand",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    const campaign = await ctx.db.get(campaignId);
    if (!campaign) {
      throw new Error("Không thể tạo chiến dịch mặc định");
    }
    await ensureDefaultCampaignGame(ctx, campaign);
    await ensureHostProfileForOwner(ctx, owner, { defaultCampaignId: campaignId });

    return { campaignId };
  },
});

/**
 * Detach the previous per-game slot assets of one usage before a new asset
 * takes the slot: their (usage, campaignGameId) binding drops so the slot
 * pointer stays unique per (game, usage). Rows stay attached/unrejected like
 * a replaced hero does.
 */
async function detachOtherGameAssetsOfUsage(
  ctx: MutationCtx,
  ownerId: Id<"users">,
  campaignGameId: Id<"campaignGames">,
  usage: string,
  keepAssetId: Id<"campaignAssets">
) {
  const rows = await ctx.db
    .query("campaignAssets")
    .withIndex("by_game_usage", (q) => q.eq("campaignGameId", campaignGameId))
    .collect();
  for (const row of rows) {
    if (row._id === keepAssetId || row.ownerId !== ownerId || row.usage !== usage) {
      continue;
    }
    await ctx.db.patch(row._id, {
      usage: undefined,
      campaignGameId: undefined,
    });
  }
}

/**
 * Where an attached asset becomes visible, by kind: a per-game slot re-points
 * the (usage, campaignGameId) binding (dropping any previous holder), the
 * brand logo sets the campaign pointer, and the hero keeps the exact legacy
 * heroAssetId write.
 */
async function pointCampaignAtAsset(
  ctx: MutationCtx,
  campaignId: Id<"campaigns">,
  usage: string,
  campaignGame: Doc<"campaignGames"> | null,
  assetId: Id<"campaignAssets">,
  now: number
) {
  if (isCampaignGameAssetUsage(usage) && campaignGame) {
    await detachOtherGameAssetsOfUsage(ctx, campaignGame.ownerId, campaignGame._id, usage, assetId);
    return;
  }
  if (usage === "brand-logo") {
    await ctx.db.patch(campaignId, {
      logoAssetId: assetId,
      updatedAt: now,
    });
    return;
  }
  await ctx.db.patch(campaignId, {
    heroAssetId: assetId,
    updatedAt: now,
  });
}

export const attachUploadedAsset = mutation({
  args: {
    campaignId: v.id("campaigns"),
    key: v.string(),
    fileName: v.optional(v.string()),
    contentType: v.optional(v.string()),
    size: v.optional(v.number()),
    // Asset kind; omitted = the campaign hero (legacy call path untouched).
    usage: v.optional(v.string()),
    // Required for per-game kinds; must match the row reserved at upload.
    campaignGameId: v.optional(v.id("campaignGames")),
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

    const usage = args.usage === undefined || args.usage === "" ? "hero" : args.usage;
    if (!isCampaignAssetUsage(usage)) {
      throw new Error("Loại tài sản không hợp lệ");
    }
    const isGameSlot = isCampaignGameAssetUsage(usage);
    let campaignGame: Doc<"campaignGames"> | null = null;
    if (isGameSlot) {
      if (!args.campaignGameId) {
        throw new Error("Thiếu trò chơi cho tài sản của trò chơi");
      }
      campaignGame = await ctx.db.get(args.campaignGameId);
      if (
        !campaignGame ||
        campaignGame.ownerId !== ownerId ||
        campaignGame.campaignId !== campaign._id
      ) {
        throw new Error("Trò chơi không thuộc chiến dịch này");
      }
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
    // The reserved row's kind is authoritative: an upload started as one
    // kind can never be attached as another.
    if ((asset.usage ?? "hero") !== usage || asset.campaignGameId !== (isGameSlot ? campaignGame!._id : undefined)) {
      throw new Error("Loại tài sản không khớp lượt upload");
    }

    if (asset.status === "attached") {
      if (!isRenderableCampaignAsset(asset, ownerId)) {
        throw new Error("Asset đã gắn nhưng chưa đủ điều kiện hiển thị");
      }
      await pointCampaignAtAsset(ctx, campaign._id, usage, isGameSlot ? campaignGame : null, asset._id, now);
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
        usage,
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
      usage,
      validatedAt: now,
    });
    await pointCampaignAtAsset(ctx, campaign._id, usage, isGameSlot ? campaignGame : null, asset._id, now);

    return {
      assetId: asset._id,
      campaignId: campaign._id,
      key: asset.key,
    };
  },
});

/**
 * Owner-authorized removal of one campaign asset's role: the campaign hero /
 * brand-logo pointer clears and a per-game slot row drops its binding, so
 * every consumer falls back to the default visuals. The row itself and the
 * R2 object stay (same semantics as a replaced hero).
 */
export const detachCampaignAsset = mutation({
  args: {
    assetId: v.id("campaignAssets"),
  },
  handler: async (ctx, args) => {
    const { ownerId } = await requireResolvedOwner(ctx, undefined, {
      notFoundMessage: "Không tìm thấy host",
      forbiddenMessage: "Bạn không có quyền chỉnh tài sản này",
    });
    const asset = await ctx.db.get(args.assetId);
    if (!asset || asset.ownerId !== ownerId) {
      throw new Error("Không tìm thấy asset chiến dịch");
    }
    const now = Date.now();
    await clearCampaignAssetRole(ctx, asset, now);
    return { assetId: asset._id, detached: true };
  },
});
