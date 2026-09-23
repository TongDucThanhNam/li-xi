import { v } from "convex/values";
import {
	gameTemplateIds,
	MAX_MAX_TOTAL_SESSIONS,
	MAX_SESSIONS_PER_PARTICIPANT,
	MIN_MAX_TOTAL_SESSIONS,
	MIN_SESSIONS_PER_PARTICIPANT,
} from "../lib/gameTemplates";

const MIN_NO_REWARD_WEIGHT = 0;
const MAX_NO_REWARD_WEIGHT = 100;

export const gameTemplateIdValidator = v.union(
	...gameTemplateIds.map((id) => v.literal(id)),
);

export const campaignStyleVariantValidator = v.union(v.literal("lunar"), v.literal("brand"));

export const gamePublicCopyValidator = v.object({
	headline: v.string(),
	subtitle: v.string(),
	startCtaLabel: v.string(),
	collectCtaLabel: v.string(),
	waitingMessage: v.string(),
});

export const gameRewardSourceValidator = v.union(
	v.literal("campaign-budget"),
	v.literal("campaign-inventory"),
);

// Optional so tagged rows written before engagement mode existed still read.
export const gameRewardModeValidator = v.optional(
	v.union(v.literal("rewarded"), v.literal("engagement")),
);

/**
 * Config union with an explicit template discriminant (`templateId`) for new
 * writes plus read-compatibility variants for the legacy stored shapes. The
 * reward source travels in its own field so future templates can share a
 * strategy without sharing the template shape.
 */
export const campaignGameConfigValidator = v.union(
	// Legacy stored li xi config (existing rows before stage-1 correction).
	v.object({
		styleVariant: campaignStyleVariantValidator,
		envelopeCount: v.number(),
		rewardStrategy: v.literal("campaign-budget"),
		publicCopy: gamePublicCopyValidator,
	}),
	// Legacy stored lucky wheel config.
	v.object({
		segmentCount: v.number(),
		noRewardWeight: v.number(),
		noRewardLabel: v.string(),
		rewardStrategy: v.literal("campaign-inventory"),
		publicCopy: gamePublicCopyValidator,
	}),
	// Tagged li xi config (all new writes).
	v.object({
		templateId: v.literal("li-xi"),
		rewardSource: gameRewardSourceValidator,
		rewardMode: gameRewardModeValidator,
		noRewardWeight: v.number(),
		noRewardLabel: v.string(),
		rewardPoolTag: v.string(),
		styleVariant: campaignStyleVariantValidator,
		publicCopy: gamePublicCopyValidator,
	}),
	// Tagged lucky wheel config (all new writes).
	v.object({
		templateId: v.literal("lucky-wheel"),
		rewardSource: v.literal("campaign-inventory"),
		rewardMode: gameRewardModeValidator,
		noRewardWeight: v.number(),
		noRewardLabel: v.string(),
		rewardPoolTag: v.string(),
		publicCopy: gamePublicCopyValidator,
	}),
	// Tagged scratch-card config (all new writes).
	v.object({
		templateId: v.literal("scratch-card"),
		rewardSource: v.literal("campaign-inventory"),
		rewardMode: gameRewardModeValidator,
		noRewardWeight: v.number(),
		noRewardLabel: v.string(),
		rewardPoolTag: v.string(),
		coverStyle: v.union(
			v.literal("gold"),
			v.literal("teal"),
			v.literal("crimson"),
		),
		revealThresholdPercent: v.number(),
		publicCopy: gamePublicCopyValidator,
	}),
	// Tagged slot-reveal config (all new writes).
	v.object({
		templateId: v.literal("slot-reveal"),
		rewardSource: v.literal("campaign-inventory"),
		rewardMode: gameRewardModeValidator,
		noRewardWeight: v.number(),
		noRewardLabel: v.string(),
		rewardPoolTag: v.string(),
		reelTheme: v.union(
			v.literal("gold"),
			v.literal("neon"),
			v.literal("festive"),
		),
		publicCopy: gamePublicCopyValidator,
	}),
	// Tagged quiz config (all new writes). Structural bounds are enforced by
	// assertQuizGameConfigIntegrity at save time, not by the validator.
	v.object({
		templateId: v.literal("quiz"),
		rewardSource: v.literal("campaign-inventory"),
		rewardMode: gameRewardModeValidator,
		noRewardLabel: v.string(),
		rewardPoolTag: v.string(),
		passCount: v.number(),
		questions: v.array(
			v.object({
				prompt: v.string(),
				choices: v.array(v.string()),
				correctIndex: v.number(),
				explanation: v.optional(v.string()),
			}),
		),
		publicCopy: gamePublicCopyValidator,
	}),
);

export const campaignGamePlayLimitsValidator = v.object({
	maxSessionsPerParticipant: v.number(),
	maxTotalSessions: v.union(v.number(), v.null()),
});

export const playLimitsBounds = {
	minSessionsPerParticipant: MIN_SESSIONS_PER_PARTICIPANT,
	maxSessionsPerParticipant: MAX_SESSIONS_PER_PARTICIPANT,
	minMaxTotalSessions: MIN_MAX_TOTAL_SESSIONS,
	maxMaxTotalSessions: MAX_MAX_TOTAL_SESSIONS,
	minNoRewardWeight: MIN_NO_REWARD_WEIGHT,
	maxNoRewardWeight: MAX_NO_REWARD_WEIGHT,
} as const;
