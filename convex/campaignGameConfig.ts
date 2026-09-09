import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
	DEFAULT_GAME_TEMPLATE_ID,
	buildLiXiGameConfig,
	gameTemplates,
	resolveGameTemplateId,
	type CampaignGameConfig,
	type CampaignStyleVariant,
	type GameTemplateId,
} from "../lib/gameTemplates";

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

export function campaignGameConfigFromLegacyCampaign(
	campaign: CampaignGameViewSource,
): CampaignGameConfig {
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

export function normalizeCampaignGameConfig(
	config: CampaignGameConfig | undefined,
	legacyCampaign: CampaignGameViewSource,
): CampaignGameConfig {
	return buildLiXiGameConfig({
		...(config ?? campaignGameConfigFromLegacyCampaign(legacyCampaign)),
		styleVariant: config?.styleVariant ?? legacyCampaign.theme,
		publicCopy: {
			...campaignGameConfigFromLegacyCampaign(legacyCampaign).publicCopy,
			...(config?.publicCopy ?? {}),
		},
	});
}

export async function resolvePrimaryCampaignGame(
	ctx: ConvexCtx,
	campaign: CampaignGameViewSource,
) {
	const campaignGame = await ctx.db
		.query("campaignGames")
		.withIndex("by_campaign_template", (q) =>
			q.eq("campaignId", campaign._id).eq("templateId", DEFAULT_GAME_TEMPLATE_ID),
		)
		.first();
	const templateId = resolveGameTemplateId(campaignGame?.templateId);
	const config = normalizeCampaignGameConfig(campaignGame?.config, campaign);

	return {
		id: campaignGame?._id ?? null,
		templateId,
		name: gameTemplates[templateId].name,
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
	const templateId = resolveGameTemplateId(args.templateId);
	const now = Date.now();
	const existing = await ctx.db
		.query("campaignGames")
		.withIndex("by_campaign_template", (q) =>
			q.eq("campaignId", args.campaignId).eq("templateId", templateId),
		)
		.first();
	const config = buildLiXiGameConfig(args.config);

	if (existing) {
		if (existing.ownerId !== args.ownerId) {
			throw new Error("Campaign game does not belong to this host");
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
