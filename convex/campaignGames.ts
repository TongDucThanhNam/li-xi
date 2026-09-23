import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, MutationCtx, query, QueryCtx } from "./_generated/server";
import { requireResolvedOwner } from "./authorization";
import {
	assertCanCreateGame,
} from "./entitlements";
import {
	campaignGameConfigValidator,
	campaignGamePlayLimitsValidator,
	gameTemplateIdValidator,
} from "./gameTemplateValues";
import {
	buildScratchCardGameConfig,
	buildSlotRevealGameConfig,
	buildQuizGameConfig,
	buildLuckyWheelGameConfig,
	buildLiXiGameConfig,
	assertQuizGameConfigIntegrity,
	configRewardMode,
	configRewardSource,
	isScratchCardGameConfig,
	isSlotRevealGameConfig,
	isQuizGameConfig,
	isLiXiGameConfig,
	isLuckyWheelGameConfig,
	normalizePlayLimits,
	requireGameTemplateId,
	type CampaignGameConfig,
} from "../lib/gameTemplates";

type ConvexCtx = QueryCtx | MutationCtx;

const MAX_GAMES_PER_CAMPAIGN = 12;
const MAX_GAME_NAME_LENGTH = 60;

/**
 * Normalizes any stored config variant (legacy or tagged) into the tagged
 * form for the given template. Mismatched shapes fail clearly instead of
 * being silently converted.
 */
export function normalizeCampaignGameConfigForTemplate(
	templateId: string,
	config: CampaignGameConfig,
): CampaignGameConfig {
	const resolvedTemplateId = requireGameTemplateId(templateId);
	if (resolvedTemplateId === "lucky-wheel") {
		if (!isLuckyWheelGameConfig(config)) {
			throw new Error("Cấu hình không khớp mẫu vòng quay may mắn");
		}
		return buildLuckyWheelGameConfig({
			rewardMode: configRewardMode(config),
			noRewardWeight: config.noRewardWeight,
			noRewardLabel: config.noRewardLabel,
			rewardPoolTag: "rewardPoolTag" in config ? config.rewardPoolTag : undefined,
			publicCopy: config.publicCopy,
		});
	}
	if (resolvedTemplateId === "scratch-card") {
		if (!isScratchCardGameConfig(config)) {
			throw new Error("Cấu hình không khớp mẫu thẻ cào may mắn");
		}
		return buildScratchCardGameConfig({
			rewardMode: configRewardMode(config),
			noRewardWeight: config.noRewardWeight,
			noRewardLabel: config.noRewardLabel,
			rewardPoolTag: "rewardPoolTag" in config ? config.rewardPoolTag : undefined,
			coverStyle: config.coverStyle,
			revealThresholdPercent: config.revealThresholdPercent,
			publicCopy: config.publicCopy,
		});
	}
	if (resolvedTemplateId === "slot-reveal") {
		if (!isSlotRevealGameConfig(config)) {
			throw new Error("Cấu hình không khớp mẫu máy quay tri ân");
		}
		return buildSlotRevealGameConfig({
			rewardMode: configRewardMode(config),
			noRewardWeight: config.noRewardWeight,
			noRewardLabel: config.noRewardLabel,
			rewardPoolTag: "rewardPoolTag" in config ? config.rewardPoolTag : undefined,
			reelTheme: config.reelTheme,
			publicCopy: config.publicCopy,
		});
	}
	if (resolvedTemplateId === "quiz") {
		if (!isQuizGameConfig(config)) {
			throw new Error("Cấu hình không khớp mẫu trắc nghiệm tri ân");
		}
		const quizConfig = buildQuizGameConfig({
			rewardMode: configRewardMode(config),
			noRewardLabel: config.noRewardLabel,
			rewardPoolTag: "rewardPoolTag" in config ? config.rewardPoolTag : undefined,
			passCount: config.passCount,
			questions: config.questions,
			publicCopy: config.publicCopy,
		});
		// Strict structural bounds at save time; lenient builder stays
		// editor-friendly.
		assertQuizGameConfigIntegrity(quizConfig);
		return quizConfig;
	}
	if (!isLiXiGameConfig(config)) {
		throw new Error("Cấu hình không khớp mẫu li xi");
	}
	return buildLiXiGameConfig({
		rewardSource: configRewardSource(config),
		rewardMode: configRewardMode(config),
		noRewardWeight: "noRewardWeight" in config ? config.noRewardWeight : undefined,
		noRewardLabel: "noRewardLabel" in config ? config.noRewardLabel : undefined,
		rewardPoolTag: "rewardPoolTag" in config ? config.rewardPoolTag : undefined,
		styleVariant: config.styleVariant,
		publicCopy: config.publicCopy,
	});
}

async function requireOwnedCampaign(
	ctx: ConvexCtx,
	ownerId: Id<"users">,
	campaignId: Id<"campaigns">,
): Promise<Doc<"campaigns">> {
	const campaign = await ctx.db.get(campaignId);
	if (!campaign || campaign.ownerId !== ownerId) {
		throw new Error("Không tìm thấy chiến dịch");
	}
	return campaign;
}

export async function requireOwnedCampaignGame(
	ctx: ConvexCtx,
	ownerId: Id<"users">,
	campaignGameId: Id<"campaignGames">,
): Promise<{ campaignGame: Doc<"campaignGames">; campaign: Doc<"campaigns"> }> {
	const campaignGame = await ctx.db.get(campaignGameId);
	if (!campaignGame || campaignGame.ownerId !== ownerId) {
		throw new Error("Không tìm thấy trò chơi");
	}
	const campaign = await requireOwnedCampaign(ctx, ownerId, campaignGame.campaignId);
	return { campaignGame, campaign };
}

export function defaultCampaignGameName(templateId: string): string {
	const resolved = requireGameTemplateId(templateId);
	if (resolved === "lucky-wheel") {
		return "Vòng quay may mắn";
	}
	if (resolved === "scratch-card") {
		return "Thẻ cào may mắn";
	}
	if (resolved === "slot-reveal") {
		return "Máy quay tri ân";
	}
	if (resolved === "quiz") {
		return "Trắc nghiệm tri ân";
	}
	return "Lunar Fortune";
}

export const createCampaignGame = mutation({
	args: {
		campaignId: v.id("campaigns"),
		templateId: gameTemplateIdValidator,
		name: v.optional(v.string()),
		config: campaignGameConfigValidator,
		playLimits: v.optional(campaignGamePlayLimitsValidator),
		status: v.union(v.literal("draft"), v.literal("active")),
	},
	handler: async (ctx, args) => {
		const { ownerId } = await requireResolvedOwner(ctx, undefined, {
			notFoundMessage: "Không tìm thấy host",
			forbiddenMessage: "Bạn không có quyền thêm trò chơi vào chiến dịch này",
		});
		const campaign = await requireOwnedCampaign(ctx, ownerId, args.campaignId);
		// Adding a game consumes game quota, not new-campaign quota: an owner at
		// their campaign limit can still configure another game in an existing
		// campaign.
		await assertCanCreateGame(ctx, ownerId);

		const existingGames = await ctx.db
			.query("campaignGames")
			.withIndex("by_campaign", (q) => q.eq("campaignId", campaign._id))
			.collect();
		if (existingGames.length >= MAX_GAMES_PER_CAMPAIGN) {
			throw new Error(`Mỗi chiến dịch tối đa ${MAX_GAMES_PER_CAMPAIGN} trò chơi`);
		}

		const templateId = requireGameTemplateId(args.templateId);
		const config = normalizeCampaignGameConfigForTemplate(templateId, args.config);
		const playLimits = normalizePlayLimits(args.playLimits);
		const name = args.name?.trim().replace(/\s+/g, " ").slice(0, MAX_GAME_NAME_LENGTH) || defaultCampaignGameName(templateId);
		const now = Date.now();

		const campaignGameId = await ctx.db.insert("campaignGames", {
			ownerId,
			campaignId: campaign._id,
			templateId,
			config,
			name,
			playLimits,
			// New games start with an empty session set: admission accounting is
			// exact from creation.
			accountingVersion: 1,
			status: args.status,
			createdAt: now,
			updatedAt: now,
		});

		return { campaignGameId, templateId, name };
	},
});

/**
 * Update exactly one campaign game instance. Sibling games and the
 * campaign-wide legacy defaults are never touched here.
 */
export const updateCampaignGame = mutation({
	args: {
		campaignGameId: v.id("campaignGames"),
		name: v.optional(v.string()),
		config: campaignGameConfigValidator,
		playLimits: v.optional(campaignGamePlayLimitsValidator),
		status: v.optional(v.union(v.literal("draft"), v.literal("active"), v.literal("archived"))),
	},
	handler: async (ctx, args) => {
		const { ownerId } = await requireResolvedOwner(ctx, undefined, {
			notFoundMessage: "Không tìm thấy host",
			forbiddenMessage: "Bạn không có quyền chỉnh trò chơi này",
		});
		const { campaignGame } = await requireOwnedCampaignGame(ctx, ownerId, args.campaignGameId);

		const config = normalizeCampaignGameConfigForTemplate(campaignGame.templateId, args.config);
		const playLimits = normalizePlayLimits(args.playLimits ?? campaignGame.playLimits);
		const name =
			args.name === undefined
				? campaignGame.name ?? defaultCampaignGameName(campaignGame.templateId)
				: args.name.trim().replace(/\s+/g, " ").slice(0, MAX_GAME_NAME_LENGTH) ||
					defaultCampaignGameName(campaignGame.templateId);

		await ctx.db.patch(campaignGame._id, {
			config,
			playLimits,
			name,
			...(args.status !== undefined ? { status: args.status } : {}),
			updatedAt: Date.now(),
		});

		return { campaignGameId: campaignGame._id, templateId: campaignGame.templateId, name };
	},
});

export const getCampaignGameAdminContext = query({
	args: {
		campaignGameId: v.id("campaignGames"),
	},
	handler: async (ctx, args) => {
		const { ownerId } = await requireResolvedOwner(ctx, undefined, {
			notFoundMessage: "Không tìm thấy host",
			forbiddenMessage: "Bạn không có quyền xem trò chơi này",
		});
		const { campaignGame, campaign } = await requireOwnedCampaignGame(ctx, ownerId, args.campaignGameId);
		return {
			campaign: {
				id: campaign._id,
				name: campaign.name,
				status: campaign.status,
			},
			campaignGame: {
				id: campaignGame._id,
				campaignId: campaignGame.campaignId,
				templateId: campaignGame.templateId,
				name: campaignGame.name ?? defaultCampaignGameName(campaignGame.templateId),
				config: campaignGame.config,
				playLimits: normalizePlayLimits(campaignGame.playLimits),
				status: campaignGame.status,
			},
		};
	},
});

export const countCampaignGames = query({
	args: {
		campaignId: v.id("campaigns"),
	},
	handler: async (ctx, args) => {
		const { ownerId } = await requireResolvedOwner(ctx, undefined, {
			notFoundMessage: "Không tìm thấy host",
			forbiddenMessage: "Bạn không có quyền xem chiến dịch này",
		});
		await requireOwnedCampaign(ctx, ownerId, args.campaignId);
		const games = await ctx.db
			.query("campaignGames")
			.withIndex("by_campaign", (q) => q.eq("campaignId", args.campaignId))
			.collect();
		return { count: games.length };
	},
});
