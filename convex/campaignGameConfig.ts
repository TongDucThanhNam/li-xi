import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
	DEFAULT_GAME_TEMPLATE_ID,
	buildLuckyWheelGameConfig,
	buildLiXiGameConfig,
	gameTemplates,
	configRewardMode,
	isLiXiGameConfig,
	isLuckyWheelGameConfig,
	isScratchCardGameConfig,
	isSlotRevealGameConfig,
	isQuizGameConfig,
	resolveGameTemplateId,
	requireGameTemplateId,
	type CampaignGameConfig,
	type CampaignStyleVariant,
	type GameTemplateId,
	type LiXiGameConfig,
} from "../lib/gameTemplates";
import { normalizeCampaignGameConfigForTemplate } from "./campaignGames";

type ConvexCtx = QueryCtx | MutationCtx;
type CampaignStatus = "draft" | "active" | "archived";

type CampaignGameViewSource = {
	_id: Id<"campaigns">;
	ownerId: Id<"users">;
	theme: CampaignStyleVariant;
	claimHeadline?: string;
	claimSubtitle?: string;
	claimCtaLabel?: string;
	claimCollectLabel?: string;
	claimWaitingMessage?: string;
};

/** Tagged li xi config derived from the campaign-wide legacy copy columns. */
export function campaignGameConfigFromLegacyCampaign(
	campaign: CampaignGameViewSource,
): LiXiGameConfig {
	return buildLiXiGameConfig({
		styleVariant: campaign.theme,
		publicCopy: {
			headline: campaign.claimHeadline ?? "",
			subtitle: campaign.claimSubtitle ?? "",
			startCtaLabel: campaign.claimCtaLabel ?? "",
			collectCtaLabel: campaign.claimCollectLabel ?? "",
			waitingMessage: campaign.claimWaitingMessage ?? "",
		},
	});
}

/**
 * Display/storage normalization boundary. Legacy stored variants (and li xi
 * rows without their own copy) are mapped to the tagged form; wheel configs
 * round-trip through their own builder and never inherit li xi fields.
 */
export function presentCampaignGameConfig(
	templateId: string,
	config: CampaignGameConfig | undefined,
	legacyCampaign: CampaignGameViewSource,
): CampaignGameConfig {
	const resolvedTemplateId = requireGameTemplateId(templateId);
	if (!config) {
		return resolvedTemplateId === "lucky-wheel"
			? buildLuckyWheelGameConfig()
			: campaignGameConfigFromLegacyCampaign(legacyCampaign);
	}
	if (resolvedTemplateId === "lucky-wheel") {
		if (!isLuckyWheelGameConfig(config)) {
			throw new Error("Cấu hình không khớp mẫu vòng quay may mắn");
		}
		return normalizeCampaignGameConfigForTemplate(resolvedTemplateId, config);
	}
	if (resolvedTemplateId === "scratch-card") {
		if (!isScratchCardGameConfig(config)) {
			throw new Error("Cấu hình không khớp mẫu thẻ cào may mắn");
		}
		return normalizeCampaignGameConfigForTemplate(resolvedTemplateId, config);
	}
	if (resolvedTemplateId === "slot-reveal") {
		if (!isSlotRevealGameConfig(config)) {
			throw new Error("Cấu hình không khớp mẫu máy quay tri ân");
		}
		return normalizeCampaignGameConfigForTemplate(resolvedTemplateId, config);
	}
	if (resolvedTemplateId === "quiz") {
		if (!isQuizGameConfig(config)) {
			throw new Error("Cấu hình không khớp mẫu trắc nghiệm tri ân");
		}
		return normalizeCampaignGameConfigForTemplate(resolvedTemplateId, config);
	}
	if (!isLiXiGameConfig(config)) {
		throw new Error("Cấu hình không khớp mẫu li xi");
	}
	const legacyDefaults = campaignGameConfigFromLegacyCampaign(legacyCampaign);
	return buildLiXiGameConfig({
		rewardSource: "rewardSource" in config ? config.rewardSource : undefined,
		rewardMode: configRewardMode(config),
		noRewardWeight: "noRewardWeight" in config ? config.noRewardWeight : undefined,
		noRewardLabel: "noRewardLabel" in config ? config.noRewardLabel : undefined,
		rewardPoolTag: "rewardPoolTag" in config ? config.rewardPoolTag : undefined,
		styleVariant: config.styleVariant ?? legacyCampaign.theme,
		publicCopy: {
			...legacyDefaults.publicCopy,
			...config.publicCopy,
		},
	});
}

/**
 * Legacy merge helper retained for the li-xi primary game path: li xi configs
 * keep syncing with the campaign-wide legacy copy columns.
 */
export function normalizeCampaignGameConfig(
	config: CampaignGameConfig | undefined,
	legacyCampaign: CampaignGameViewSource,
): CampaignGameConfig {
	return presentCampaignGameConfig(DEFAULT_GAME_TEMPLATE_ID, config, legacyCampaign);
}

export async function resolvePrimaryCampaignGame(
	ctx: ConvexCtx,
	campaign: CampaignGameViewSource,
) {
	// Legacy concept: the primary campaign game is the li xi instance that the
	// draw-era operator/station/public surfaces act on. Wheel-only campaigns
	// resolve without a phantom li xi row.
	const campaignGame = await ctx.db
		.query("campaignGames")
		.withIndex("by_campaign_template", (q) =>
			q.eq("campaignId", campaign._id).eq("templateId", DEFAULT_GAME_TEMPLATE_ID),
		)
		.first();
	const templateId = resolveGameTemplateId(campaignGame?.templateId);
	const config = presentCampaignGameConfig(templateId, campaignGame?.config, campaign);
	return {
		id: campaignGame?._id ?? null,
		templateId,
		name: campaignGame?.name ?? gameTemplates[templateId].name,
		config,
	};
}

export async function upsertPrimaryCampaignGame(
	ctx: MutationCtx,
	args: {
		ownerId: Id<"users">;
		campaignId: Id<"campaigns">;
		templateId?: GameTemplateId;
		config: CampaignGameConfig;
		status: CampaignStatus;
	},
) {
	const templateId = args.templateId
		? requireGameTemplateId(args.templateId)
		: DEFAULT_GAME_TEMPLATE_ID;
	const now = Date.now();
	const existing = await ctx.db
		.query("campaignGames")
		.withIndex("by_campaign_template", (q) =>
			q.eq("campaignId", args.campaignId).eq("templateId", templateId),
		)
		.first();
	const config = normalizeCampaignGameConfigForTemplate(templateId, args.config);

	if (existing) {
		if (existing.ownerId !== args.ownerId) {
			throw new Error("Campaign game does not belong to this host");
		}
		if (existing.templateId !== templateId) {
			throw new Error("Campaign game template mismatch");
		}
		await ctx.db.patch(existing._id, {
			config,
			status: args.status,
			updatedAt: now,
		});
		return {
			campaignGameId: existing._id,
			templateId,
			config,
		};
	}

	const campaignGameId = await ctx.db.insert("campaignGames", {
		ownerId: args.ownerId,
		campaignId: args.campaignId,
		templateId,
		config,
		// New rows start empty: admission accounting is exact from creation.
		accountingVersion: 1,
		status: args.status,
		createdAt: now,
		updatedAt: now,
	});

	return {
		campaignGameId,
		templateId,
		config,
	};
}

export async function ensureDefaultCampaignGame(
	ctx: MutationCtx,
	campaign: Doc<"campaigns">,
) {
	return upsertPrimaryCampaignGame(ctx, {
		ownerId: campaign.ownerId,
		campaignId: campaign._id,
		config: campaignGameConfigFromLegacyCampaign(campaign),
		status: campaign.status,
	});
}
