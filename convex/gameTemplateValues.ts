import { v } from "convex/values";
import { DEFAULT_GAME_TEMPLATE_ID } from "../lib/gameTemplates";

export const gameTemplateIdValidator = v.literal(DEFAULT_GAME_TEMPLATE_ID);
export const campaignStyleVariantValidator = v.union(v.literal("lunar"), v.literal("brand"));

export const campaignGameConfigValidator = v.object({
	styleVariant: campaignStyleVariantValidator,
	envelopeCount: v.number(),
	rewardStrategy: v.literal("campaign-budget"),
	publicCopy: v.object({
		headline: v.string(),
		subtitle: v.string(),
		startCtaLabel: v.string(),
		collectCtaLabel: v.string(),
		waitingMessage: v.string(),
	}),
});
