export const DEFAULT_GAME_TEMPLATE_ID = "li-xi" as const;

export const gameTemplateIds = [DEFAULT_GAME_TEMPLATE_ID] as const;

export type GameTemplateId = (typeof gameTemplateIds)[number];
export type CampaignStyleVariant = "lunar" | "brand";

export type LiXiGameConfig = {
	styleVariant: CampaignStyleVariant;
	envelopeCount: number;
	rewardStrategy: "campaign-budget";
	publicCopy: {
		headline: string;
		subtitle: string;
		startCtaLabel: string;
		collectCtaLabel: string;
		waitingMessage: string;
	};
};

export type CampaignGameConfig = LiXiGameConfig;

export type GameTemplateAnalyticsLabels = {
	open: string;
	start: string;
	completion: string;
	rewardOutcome: string;
	claim: string;
	share: string;
};

export type GameTemplateCatalogEntry = {
	id: GameTemplateId;
	name: string;
	description: string;
	routePath: "/draw";
	configSchema: {
		version: 1;
		fields: readonly string[];
	};
	defaultConfig: CampaignGameConfig;
	initialCampaignConfig: CampaignGameConfig;
	configEditor: {
		component: "LiXiGameConfigEditor";
		sections: readonly string[];
	};
	preview: {
		component: "LiXiEnvelopePreview";
		summaryMetric: "envelopeCount";
	};
	rewardResultUi: {
		component: "LiXiRewardResult";
		rewardUnitLabel: string;
	};
	analyticsLabels: GameTemplateAnalyticsLabels;
};

export const liXiDefaultGameConfig = {
	styleVariant: "lunar",
	envelopeCount: 8,
	rewardStrategy: "campaign-budget",
	publicCopy: {
		headline: "",
		subtitle: "",
		startCtaLabel: "",
		collectCtaLabel: "",
		waitingMessage: "",
	},
} as const satisfies LiXiGameConfig;

export const liXiInitialCampaignGameConfig = {
	...liXiDefaultGameConfig,
	styleVariant: "brand",
} as const satisfies LiXiGameConfig;

export const gameTemplates = {
	"li-xi": {
		id: "li-xi",
		name: "Lunar Fortune",
		description: "Trò chơi mở phong bao dành cho các chiến dịch tri ân có nhận diện thương hiệu.",
		routePath: "/draw",
		configSchema: {
			version: 1,
			fields: [
				"styleVariant",
				"publicCopy.headline",
				"publicCopy.subtitle",
				"publicCopy.startCtaLabel",
				"publicCopy.collectCtaLabel",
				"publicCopy.waitingMessage",
				"rewardStrategy",
			],
		},
		defaultConfig: liXiDefaultGameConfig,
		initialCampaignConfig: liXiInitialCampaignGameConfig,
		configEditor: {
			component: "LiXiGameConfigEditor",
			sections: ["style", "publicCopy", "rewardInventory"],
		},
		preview: {
			component: "LiXiEnvelopePreview",
			summaryMetric: "envelopeCount",
		},
		rewardResultUi: {
			component: "LiXiRewardResult",
			rewardUnitLabel: "reward outcome",
		},
		analyticsLabels: {
			open: "game_open",
			start: "game_start",
			completion: "game_completion",
			rewardOutcome: "reward_outcome",
			claim: "reward_claim",
			share: "public_play_link_open",
		},
	},
} as const satisfies Record<GameTemplateId, GameTemplateCatalogEntry>;

export function isGameTemplateId(value: string | null | undefined): value is GameTemplateId {
	return gameTemplateIds.includes(value as GameTemplateId);
}

export function resolveGameTemplateId(value: string | null | undefined): GameTemplateId {
	return isGameTemplateId(value) ? value : DEFAULT_GAME_TEMPLATE_ID;
}

export function resolveLiXiStyleVariant(
	value: CampaignStyleVariant | null | undefined,
): CampaignStyleVariant {
	return value === "brand" ? "brand" : "lunar";
}

export function buildLiXiGameConfig(
	args: Partial<LiXiGameConfig> & { styleVariant?: CampaignStyleVariant | null } = {},
): LiXiGameConfig {
	return {
		...liXiDefaultGameConfig,
		...args,
		envelopeCount: liXiDefaultGameConfig.envelopeCount,
		rewardStrategy: liXiDefaultGameConfig.rewardStrategy,
		styleVariant: resolveLiXiStyleVariant(args.styleVariant),
		publicCopy: {
			...liXiDefaultGameConfig.publicCopy,
			...(args.publicCopy ?? {}),
		},
	};
}
