export const DEFAULT_GAME_TEMPLATE_ID = "li-xi" as const;
export const LUCKY_WHEEL_GAME_TEMPLATE_ID = "lucky-wheel" as const;
export const SCRATCH_CARD_GAME_TEMPLATE_ID = "scratch-card" as const;
export const SLOT_REVEAL_GAME_TEMPLATE_ID = "slot-reveal" as const;
export const QUIZ_GAME_TEMPLATE_ID = "quiz" as const;

export const gameTemplateIds = [
	DEFAULT_GAME_TEMPLATE_ID,
	LUCKY_WHEEL_GAME_TEMPLATE_ID,
	SCRATCH_CARD_GAME_TEMPLATE_ID,
	SLOT_REVEAL_GAME_TEMPLATE_ID,
	QUIZ_GAME_TEMPLATE_ID,
] as const;

export type GameTemplateId = (typeof gameTemplateIds)[number];
export type CampaignStyleVariant = "lunar" | "brand";

export type GamePublicCopy = {
	headline: string;
	subtitle: string;
	startCtaLabel: string;
	collectCtaLabel: string;
	waitingMessage: string;
};

/** Where a game's rewards come from — independent of the template mechanics. */
export type GameRewardSource = "campaign-budget" | "campaign-inventory";

/**
 * How a game completes: "rewarded" games allocate from their reward source,
 * "engagement" games never allocate inventory, consume reward quota or
 * record reward claims — completing the play is the whole outcome.
 */
export type GameRewardMode = "rewarded" | "engagement";

export const REWARD_MODE_LABELS: Record<GameRewardMode, string> = {
	rewarded: "Có thưởng (phân bổ từ nguồn thưởng)",
	engagement: "Tương tác không thưởng (cam kết hoàn thành)",
};

export const DEFAULT_REWARD_MODE: GameRewardMode = "rewarded";

export const DEFAULT_REWARD_POOL_TAG = "default";
export const NO_REWARD_SEGMENT_KEY = "__no-reward__";

export const REWARD_SOURCE_LABELS: Record<GameRewardSource, string> = {
	"campaign-budget": "Ngân sách lì xì cổ điển (trạm / liên kết legacy)",
	"campaign-inventory": "Kho phần thưởng tự phục vụ của chiến dịch",
};

/**
 * Legacy stored li xi config. Kept as a read-compatibility variant so
 * existing campaignGames rows validate without a data migration; new writes
 * always use the tagged form below.
 */
export type LiXiLegacyGameConfig = {
	styleVariant: CampaignStyleVariant;
	envelopeCount: number;
	rewardStrategy: "campaign-budget";
	publicCopy: GamePublicCopy;
};

/** Legacy stored lucky wheel config (read compatibility only). */
export type LuckyWheelLegacyGameConfig = {
	segmentCount: number;
	noRewardWeight: number;
	noRewardLabel: string;
	rewardStrategy: "campaign-inventory";
	publicCopy: GamePublicCopy;
};

/** Tagged li xi config: explicit template discriminant + own reward source. */
export type LiXiGameConfig = {
	templateId: "li-xi";
	rewardSource: GameRewardSource;
	rewardMode?: GameRewardMode;
	noRewardWeight: number;
	noRewardLabel: string;
	rewardPoolTag: string;
	styleVariant: CampaignStyleVariant;
	publicCopy: GamePublicCopy;
};

/** Tagged lucky wheel config. */
export type LuckyWheelGameConfig = {
	templateId: "lucky-wheel";
	rewardSource: "campaign-inventory";
	rewardMode?: GameRewardMode;
	noRewardWeight: number;
	noRewardLabel: string;
	rewardPoolTag: string;
	publicCopy: GamePublicCopy;
};

/** Bounded cover foil palette; decorative only — never a reward signal. */
export const scratchCoverStyles = ["gold", "teal", "crimson"] as const;
export type ScratchCoverStyle = (typeof scratchCoverStyles)[number];

/** Tagged scratch-card config. Reveal threshold is presentation-only. */
export type ScratchCardGameConfig = {
	templateId: "scratch-card";
	rewardSource: "campaign-inventory";
	rewardMode?: GameRewardMode;
	noRewardWeight: number;
	noRewardLabel: string;
	rewardPoolTag: string;
	coverStyle: ScratchCoverStyle;
	/** Presentation-only coating-clear hint (10-100). */
	revealThresholdPercent: number;
	publicCopy: GamePublicCopy;
};

/**
 * Slot-reveal symbols: fixed stable keys (documented in
 * docs/design-slot-reveal.md). Display glyphs may evolve; the keys never do.
 */
export const slotSymbolKeys = [
	"bell",
	"star",
	"gem",
	"heart",
	"clover",
	"gift",
	"sparkles",
	"moon",
] as const;
export type SlotSymbolKey = (typeof slotSymbolKeys)[number];

export const SLOT_SYMBOL_LABELS: Record<SlotSymbolKey, string> = {
	bell: "Chuông",
	star: "Ngôi sao",
	gem: "Viên ngọc",
	heart: "Trái tim",
	clover: "Cỏ bốn lá",
	gift: "Hộp quà",
	sparkles: "Lấp lánh",
	moon: "Vầng trăng",
};

/** Bounded reel themes; decorative only — never a reward signal. */
export const slotReelThemes = ["gold", "neon", "festive"] as const;
export type SlotReelTheme = (typeof slotReelThemes)[number];

/** A settled reel combination: exactly three symbol keys. */
export type SlotCombination = [SlotSymbolKey, SlotSymbolKey, SlotSymbolKey];

/** Documented non-winning combination for no-reward plays. */
export const SLOT_MISS_COMBINATION: SlotCombination = ["moon", "star", "clover"];

/** Bounded candidate set: each supported reward owns one distinct combination. */
export const MAX_SLOT_CANDIDATES = 8;

export type SlotWinningCombination = {
	itemId: string;
	symbolKeys: SlotCombination;
};

/**
 * Deterministic documented mapping: candidate item i (pool display order,
 * frozen at admission) lands the `[k,k,k]` winning combination of
 * `slotSymbolKeys[i]`. Mapping is by item id, never by label/amount, so
 * duplicate display labels stay unambiguous.
 */
export function buildSlotWinningCombinations(
	itemIds: readonly string[],
): SlotWinningCombination[] {
	return itemIds.slice(0, MAX_SLOT_CANDIDATES).map((itemId, index) => {
		const key = slotSymbolKeys[index % slotSymbolKeys.length];
		return { itemId, symbolKeys: [key, key, key] };
	});
}

/** Tagged slot-reveal config. */
export type SlotRevealGameConfig = {
	templateId: "slot-reveal";
	rewardSource: "campaign-inventory";
	rewardMode?: GameRewardMode;
	noRewardWeight: number;
	noRewardLabel: string;
	rewardPoolTag: string;
	reelTheme: SlotReelTheme;
	publicCopy: GamePublicCopy;
};

/** Bounded quiz bounds (docs/design-quiz.md). */
export const QUIZ_MIN_QUESTIONS = 1;
export const QUIZ_MAX_QUESTIONS = 20;
export const QUIZ_MIN_CHOICES = 2;
export const QUIZ_MAX_CHOICES = 6;
export const QUIZ_MAX_PROMPT_LENGTH = 200;
export const QUIZ_MAX_CHOICE_LENGTH = 80;
export const QUIZ_MAX_EXPLANATION_LENGTH = 240;

/** One ordered quiz question. correctIndex/explanation are PRIVATE halves. */
export type QuizQuestionConfig = {
	prompt: string;
	choices: string[];
	correctIndex: number;
	explanation?: string;
};

/** Tagged quiz config: skill-based grading, no chance weight. */
export type QuizGameConfig = {
	templateId: "quiz";
	rewardSource: "campaign-inventory";
	rewardMode?: GameRewardMode;
	/** Fail label (a failed quiz completes with this truthful no-reward). */
	noRewardLabel: string;
	rewardPoolTag: string;
	/** Integer passing threshold within [1, questions.length]. */
	passCount: number;
	questions: QuizQuestionConfig[];
	publicCopy: GamePublicCopy;
};

export type CampaignGameConfig =
	| LiXiLegacyGameConfig
	| LuckyWheelLegacyGameConfig
	| LiXiGameConfig
	| LuckyWheelGameConfig
	| ScratchCardGameConfig
	| SlotRevealGameConfig
	| QuizGameConfig;

export type GameRewardStrategy = GameRewardSource;

export function isTaggedGameConfig(
	config: CampaignGameConfig,
): config is
	| LiXiGameConfig
	| LuckyWheelGameConfig
	| ScratchCardGameConfig
	| SlotRevealGameConfig
	| QuizGameConfig {
	return "templateId" in config;
}

/** Which template a config belongs to, across legacy and tagged variants. */
export function configTemplateId(config: CampaignGameConfig): GameTemplateId {
	if (isTaggedGameConfig(config)) {
		return config.templateId;
	}
	return config.rewardStrategy === "campaign-budget" ? "li-xi" : "lucky-wheel";
}

/** The reward source a config plays for, across legacy and tagged variants. */
export function configRewardSource(config: CampaignGameConfig): GameRewardSource {
	if (isTaggedGameConfig(config)) {
		return config.rewardSource;
	}
	return config.rewardStrategy;
}

/** Frozen scratch presentation for the stage (cover + threshold hint). */
export function configScratchPresentation(
	config: CampaignGameConfig,
): { coverStyle: ScratchCoverStyle; revealThresholdPercent: number } | undefined {
	if (!isScratchCardGameConfig(config)) {
		return undefined;
	}
	return {
		coverStyle: config.coverStyle,
		revealThresholdPercent: config.revealThresholdPercent,
	};
}

/** Frozen-at-admission reel presentation (theme; combinations derive from pool). */
export function configSlotPresentation(
	config: CampaignGameConfig,
): { reelTheme: SlotReelTheme } | undefined {
	if (!isSlotRevealGameConfig(config)) {
		return undefined;
	}
	return { reelTheme: config.reelTheme };
}

/**
 * PUBLIC quiz snapshot half: question prompts/choices and the pass rule.
 * The private half (correctIndex/explanation) stays server-only.
 */
export function configQuizPublicPresentation(config: CampaignGameConfig): {
	passCount: number;
	questions: Array<{ prompt: string; choices: string[] }>;
} | undefined {
	if (!isQuizGameConfig(config)) {
		return undefined;
	}
	return {
		passCount: config.passCount,
		questions: config.questions.map((question) => ({
			prompt: question.prompt,
			choices: [...question.choices],
		})),
	};
}

/** Guaranteed no-reward engagement mode; legacy stored configs are rewarded. */
export function configRewardMode(config: CampaignGameConfig): GameRewardMode {
	if (isTaggedGameConfig(config)) {
		return config.rewardMode ?? DEFAULT_REWARD_MODE;
	}
	return DEFAULT_REWARD_MODE;
}

/** Intentional no-win odds (0-100). Legacy li xi configs never lose. */
export function configNoRewardWeight(config: CampaignGameConfig): number {
	if (isTaggedGameConfig(config)) {
		// Skill-based templates (quiz) carry no chance weight at all.
		return "noRewardWeight" in config
			? clampInt(config.noRewardWeight, 0, 100, 0)
			: 0;
	}
	return config.rewardStrategy === "campaign-inventory" ? config.noRewardWeight : 0;
}

/** Message shown on a chance-based no-reward result. */
export function configNoRewardLabel(config: CampaignGameConfig): string {
	if (isTaggedGameConfig(config)) {
		return "noRewardLabel" in config
			? config.noRewardLabel.trim() || "Chúc bạn may mắn lần sau"
			: "Chúc bạn may mắn lần sau";
	}
	return "Chúc bạn may mắn lần sau";
}

/** Reward pool selector for inventory-backed games. */
export function configRewardPoolTag(config: CampaignGameConfig): string {
	if (isTaggedGameConfig(config) && "rewardPoolTag" in config) {
		return normalizeRewardPoolTagValue(config.rewardPoolTag);
	}
	return DEFAULT_REWARD_POOL_TAG;
}

function normalizeRewardPoolTagValue(value: string | undefined): string {
	return value?.trim().slice(0, 24) || DEFAULT_REWARD_POOL_TAG;
}

export type CampaignGamePlayLimits = {
	maxSessionsPerParticipant: number;
	maxTotalSessions: number | null;
};

export const DEFAULT_PLAY_LIMITS: CampaignGamePlayLimits = {
	maxSessionsPerParticipant: 1,
	maxTotalSessions: null,
};

export const MIN_SESSIONS_PER_PARTICIPANT = 1;
export const MAX_SESSIONS_PER_PARTICIPANT = 10;
/** Static volume guard when an operator does not configure a total cap. */
export const DEFAULT_MAX_TOTAL_SESSIONS = 20000;
export const MIN_MAX_TOTAL_SESSIONS = 1;
export const MAX_MAX_TOTAL_SESSIONS = 200000;

export function clampInt(
	value: number,
	min: number,
	max: number,
	fallback: number,
): number {
	if (!Number.isFinite(value)) {
		return fallback;
	}
	const rounded = Math.round(value);
	if (rounded < min) {
		return min;
	}
	if (rounded > max) {
		return max;
	}
	return rounded;
}

export function normalizePlayLimits(
	value: CampaignGamePlayLimits | undefined | null,
): CampaignGamePlayLimits {
	if (!value) {
		return { ...DEFAULT_PLAY_LIMITS };
	}
	const maxSessionsPerParticipant = clampInt(
		value.maxSessionsPerParticipant,
		MIN_SESSIONS_PER_PARTICIPANT,
		MAX_SESSIONS_PER_PARTICIPANT,
		DEFAULT_PLAY_LIMITS.maxSessionsPerParticipant,
	);
	const maxTotalSessions =
		typeof value.maxTotalSessions === "number"
			? clampInt(
					value.maxTotalSessions,
					MIN_MAX_TOTAL_SESSIONS,
					MAX_MAX_TOTAL_SESSIONS,
					DEFAULT_MAX_TOTAL_SESSIONS,
				)
			: null;
	return { maxSessionsPerParticipant, maxTotalSessions };
}

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
	/** Legacy station surface for li xi; public entry root for newer templates. */
	routePath: "/draw" | "/p";
	stationMode: "legacy-host-pin" | "public-self-serve";
	configSchema: {
		version: number;
		fields: readonly string[];
	};
	defaultConfig: CampaignGameConfig;
	initialCampaignConfig: CampaignGameConfig;
	configEditor: {
		component: string;
		sections: readonly string[];
	};
	preview: {
		component: string;
		summaryMetric: string;
	};
	rewardResultUi: {
		component: string;
		rewardUnitLabel: string;
	};
	analyticsLabels: GameTemplateAnalyticsLabels;
};

const sharedAnalyticsLabels: GameTemplateAnalyticsLabels = {
	open: "game_open",
	start: "game_start",
	completion: "game_completion",
	rewardOutcome: "reward_outcome",
	claim: "reward_claim",
	share: "public_play_link_open",
};

export const liXiDefaultGameConfig = {
	templateId: "li-xi",
	rewardSource: "campaign-budget",
	noRewardWeight: 0,
	noRewardLabel: "Chúc bạn may mắn lần sau",
	rewardPoolTag: DEFAULT_REWARD_POOL_TAG,
	styleVariant: "lunar",
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
	rewardSource: "campaign-budget",
	styleVariant: "brand",
} as const satisfies LiXiGameConfig;

export const luckyWheelDefaultGameConfig = {
	templateId: "lucky-wheel",
	rewardSource: "campaign-inventory",
	noRewardWeight: 20,
	noRewardLabel: "Chúc bạn may mắn lần sau",
	rewardPoolTag: DEFAULT_REWARD_POOL_TAG,
	publicCopy: {
		headline: "",
		subtitle: "",
		startCtaLabel: "",
		collectCtaLabel: "",
		waitingMessage: "",
	},
} as const satisfies LuckyWheelGameConfig;

export const luckyWheelInitialCampaignGameConfig = {
	...luckyWheelDefaultGameConfig,
	publicCopy: {
		headline: "Vòng quay may mắn",
		subtitle: "Quay vòng quay để nhận quà tri ân từ thương hiệu.",
		startCtaLabel: "Quay ngay",
		collectCtaLabel: "Nhận quà",
		waitingMessage: "Đang chuẩn bị vòng quay",
	},
} as const satisfies LuckyWheelGameConfig;

export const scratchCardDefaultGameConfig = {
	templateId: "scratch-card",
	rewardSource: "campaign-inventory",
	noRewardWeight: 20,
	noRewardLabel: "Chúc bạn may mắn lần sau",
	rewardPoolTag: DEFAULT_REWARD_POOL_TAG,
	coverStyle: "gold",
	revealThresholdPercent: 55,
	publicCopy: {
		headline: "",
		subtitle: "",
		startCtaLabel: "",
		collectCtaLabel: "",
		waitingMessage: "",
	},
} as const satisfies ScratchCardGameConfig;

export const scratchCardInitialCampaignGameConfig = {
	...scratchCardDefaultGameConfig,
	publicCopy: {
		headline: "Gỡ lớp phủ tri ân",
		subtitle: "Chà sáng lớp bạc để nhận quà tri ân từ thương hiệu.",
		startCtaLabel: "Bắt đầu",
		collectCtaLabel: "Nhận quà",
		waitingMessage: "Đang chuẩn bị thẻ cào",
	},
} as const satisfies ScratchCardGameConfig;

export const slotRevealDefaultGameConfig = {
	templateId: "slot-reveal",
	rewardSource: "campaign-inventory",
	noRewardWeight: 20,
	noRewardLabel: "Chúc bạn may mắn lần sau",
	rewardPoolTag: DEFAULT_REWARD_POOL_TAG,
	reelTheme: "gold",
	publicCopy: {
		headline: "",
		subtitle: "",
		startCtaLabel: "",
		collectCtaLabel: "",
		waitingMessage: "",
	},
} as const satisfies SlotRevealGameConfig;

export const slotRevealInitialCampaignGameConfig = {
	...slotRevealDefaultGameConfig,
	publicCopy: {
		headline: "Máy quay tri ân",
		subtitle: "Quay ba cuộn để nhận quà tri ân từ thương hiệu.",
		startCtaLabel: "Quay ngay",
		collectCtaLabel: "Nhận quà",
		waitingMessage: "Đang chuẩn bị máy quay",
	},
} as const satisfies SlotRevealGameConfig;

export const quizDefaultGameConfig = {
	templateId: "quiz",
	rewardSource: "campaign-inventory",
	noRewardLabel: "Chưa đạt — cảm ơn bạn đã tham gia",
	rewardPoolTag: DEFAULT_REWARD_POOL_TAG,
	passCount: 1,
	questions: [
		{
			prompt: "Bạn thích điều gì nhất ở thương hiệu của chúng tôi?",
			choices: ["Chất lượng sản phẩm", "Chăm sóc khách hàng"],
			correctIndex: 0,
			explanation: "Chất lượng là giá trị cốt lõi chúng tôi theo đuổi.",
		},
	],
	publicCopy: {
		headline: "",
		subtitle: "",
		startCtaLabel: "",
		collectCtaLabel: "",
		waitingMessage: "",
	},
} as const satisfies QuizGameConfig;

export const quizInitialCampaignGameConfig = {
	...quizDefaultGameConfig,
	publicCopy: {
		headline: "Trắc nghiệm tri ân",
		subtitle: "Trả lời các câu hỏi ngắn để nhận quà tri ân từ thương hiệu.",
		startCtaLabel: "Bắt đầu",
		collectCtaLabel: "Nhận quà",
		waitingMessage: "Đang chuẩn bị câu hỏi",
	},
} as const satisfies QuizGameConfig;

export const gameTemplates = {
	"li-xi": {
		id: "li-xi",
		name: "Lunar Fortune",
		description: "Trò chơi mở phong bao dành cho các chiến dịch tri ân có nhận diện thương hiệu.",
		routePath: "/draw",
		stationMode: "legacy-host-pin",
		configSchema: {
			version: 2,
			fields: [
				"templateId",
				"rewardSource",
				"noRewardWeight",
				"rewardPoolTag",
				"styleVariant",
				"publicCopy",
			],
		},
		defaultConfig: liXiDefaultGameConfig,
		initialCampaignConfig: liXiInitialCampaignGameConfig,
		configEditor: {
			component: "LiXiGameConfigEditor",
			sections: ["style", "rewardSource", "publicCopy", "rewardInventory"],
		},
		preview: {
			component: "LiXiEnvelopePreview",
			summaryMetric: "rewardSource",
		},
		rewardResultUi: {
			component: "LiXiRewardResult",
			rewardUnitLabel: "reward outcome",
		},
		analyticsLabels: sharedAnalyticsLabels,
	},
	"scratch-card": {
		id: "scratch-card",
		name: "Thẻ cào may mắn",
		description: "Thẻ cào gỡ lớp phủ với phần thưởng được máy chủ công bố một lần duy nhất.",
		routePath: "/p",
		stationMode: "public-self-serve",
		configSchema: {
			version: 2,
			fields: [
				"templateId",
				"rewardSource",
				"noRewardWeight",
				"noRewardLabel",
				"rewardPoolTag",
				"coverStyle",
				"revealThresholdPercent",
				"publicCopy",
			],
		},
		defaultConfig: scratchCardDefaultGameConfig,
		initialCampaignConfig: scratchCardInitialCampaignGameConfig,
		configEditor: {
			component: "ScratchCardConfigEditor",
			sections: ["scratch", "rewardSource", "publicCopy", "rewardInventory"],
		},
		preview: {
			component: "ScratchCardPreview",
			summaryMetric: "coverStyle",
		},
		rewardResultUi: {
			component: "ScratchCardRewardResult",
			rewardUnitLabel: "reward outcome",
		},
		analyticsLabels: sharedAnalyticsLabels,
	},
	"slot-reveal": {
		id: "slot-reveal",
		name: "Máy quay tri ân",
		description: "Ba cuộn quay với biểu tượng ổn định; phần thưởng được máy chủ ghép tổ hợp một lần duy nhất.",
		routePath: "/p",
		stationMode: "public-self-serve",
		configSchema: {
			version: 2,
			fields: [
				"templateId",
				"rewardSource",
				"noRewardWeight",
				"noRewardLabel",
				"rewardPoolTag",
				"reelTheme",
				"publicCopy",
			],
		},
		defaultConfig: slotRevealDefaultGameConfig,
		initialCampaignConfig: slotRevealInitialCampaignGameConfig,
		configEditor: {
			component: "SlotRevealConfigEditor",
			sections: ["slot", "rewardSource", "publicCopy", "rewardInventory"],
		},
		preview: {
			component: "SlotRevealPreview",
			summaryMetric: "reelTheme",
		},
		rewardResultUi: {
			component: "SlotRevealRewardResult",
			rewardUnitLabel: "reward outcome",
		},
		analyticsLabels: sharedAnalyticsLabels,
	},
	quiz: {
		id: "quiz",
		name: "Trắc nghiệm tri ân",
		description: "Trắc nghiệm nhiều câu hỏi với chấm điểm máy chủ; đạt điểm mới nhận phần thưởng.",
		routePath: "/p",
		stationMode: "public-self-serve",
		configSchema: {
			version: 2,
			fields: [
				"templateId",
				"rewardSource",
				"noRewardLabel",
				"rewardPoolTag",
				"passCount",
				"questions",
				"publicCopy",
			],
		},
		defaultConfig: quizDefaultGameConfig,
		initialCampaignConfig: quizInitialCampaignGameConfig,
		configEditor: {
			component: "QuizConfigEditor",
			sections: ["quiz", "rewardSource", "publicCopy", "rewardInventory"],
		},
		preview: {
			component: "QuizPreview",
			summaryMetric: "passCount",
		},
		rewardResultUi: {
			component: "QuizRewardResult",
			rewardUnitLabel: "reward outcome",
		},
		analyticsLabels: sharedAnalyticsLabels,
	},
	"lucky-wheel": {
		id: "lucky-wheel",
		name: "Vòng quay may mắn",
		description: "Vòng quay trúng thưởng nhiều ô với tỉ lệ và kho phần thưởng riêng của chiến dịch.",
		routePath: "/p",
		stationMode: "public-self-serve",
		configSchema: {
			version: 2,
			fields: [
				"templateId",
				"rewardSource",
				"noRewardWeight",
				"noRewardLabel",
				"rewardPoolTag",
				"publicCopy",
			],
		},
		defaultConfig: luckyWheelDefaultGameConfig,
		initialCampaignConfig: luckyWheelInitialCampaignGameConfig,
		configEditor: {
			component: "LuckyWheelConfigEditor",
			sections: ["wheel", "rewardSource", "publicCopy", "rewardInventory"],
		},
		preview: {
			component: "LuckyWheelPreview",
			summaryMetric: "noRewardWeight",
		},
		rewardResultUi: {
			component: "LuckyWheelRewardResult",
			rewardUnitLabel: "reward outcome",
		},
		analyticsLabels: sharedAnalyticsLabels,
	},
} as const satisfies Record<GameTemplateId, GameTemplateCatalogEntry>;

export function isGameTemplateId(value: string | null | undefined): value is GameTemplateId {
	return gameTemplateIds.includes(value as GameTemplateId);
}

/** Legacy surfaces may fall back to li xi; generic routes must use requireGameTemplateId. */
export function resolveGameTemplateId(value: string | null | undefined): GameTemplateId {
	return isGameTemplateId(value) ? value : DEFAULT_GAME_TEMPLATE_ID;
}

export function requireGameTemplateId(value: string | null | undefined): GameTemplateId {
	if (!isGameTemplateId(value)) {
		throw new Error(`Mẫu trò chơi không được hỗ trợ: ${String(value || "(trống)")}`);
	}
	return value;
}

/** Builds the tagged li xi config. New writes always use this shape. */
export function buildLiXiGameConfig(
	args: {
		styleVariant?: CampaignStyleVariant | null;
		rewardSource?: GameRewardSource;
		rewardMode?: GameRewardMode;
		noRewardWeight?: number;
		noRewardLabel?: string;
		rewardPoolTag?: string;
		publicCopy?: Partial<GamePublicCopy>;
	} = {},
): LiXiGameConfig {
	const rewardSource = args.rewardSource ?? liXiDefaultGameConfig.rewardSource;
	const rewardMode = args.rewardMode ?? DEFAULT_REWARD_MODE;
	if (rewardMode === "engagement" && rewardSource === "campaign-budget") {
		throw new Error(
			"Chế độ không thưởng chỉ hỗ trợ nguồn kho phần thưởng tự phục vụ, không dùng với ngân sách lì xì cổ điển",
		);
	}
	return {
		templateId: "li-xi",
		rewardSource,
		rewardMode,
		noRewardWeight: clampInt(args.noRewardWeight ?? 0, 0, 100, 0),
		noRewardLabel: args.noRewardLabel?.trim().slice(0, 60) || liXiDefaultGameConfig.noRewardLabel,
		rewardPoolTag: args.rewardPoolTag?.trim().slice(0, 24) || DEFAULT_REWARD_POOL_TAG,
		styleVariant: resolveLiXiStyleVariant(args.styleVariant),
		publicCopy: normalizePublicCopy(args.publicCopy),
	};
}

/** Builds the tagged lucky wheel config. Wheel layout derives from the inventory pool. */
export function buildLuckyWheelGameConfig(
	args: {
		rewardSource?: "campaign-inventory";
		rewardMode?: GameRewardMode;
		noRewardWeight?: number;
		noRewardLabel?: string;
		rewardPoolTag?: string;
		publicCopy?: Partial<GamePublicCopy>;
	} = {},
): LuckyWheelGameConfig {
	return {
		templateId: "lucky-wheel",
		rewardSource: "campaign-inventory",
		rewardMode: args.rewardMode ?? DEFAULT_REWARD_MODE,
		noRewardWeight: clampInt(
			args.noRewardWeight ?? luckyWheelDefaultGameConfig.noRewardWeight,
			0,
			100,
			luckyWheelDefaultGameConfig.noRewardWeight,
		),
		noRewardLabel:
			args.noRewardLabel?.trim().slice(0, 60) || luckyWheelDefaultGameConfig.noRewardLabel,
		rewardPoolTag: args.rewardPoolTag?.trim().slice(0, 24) || DEFAULT_REWARD_POOL_TAG,
		publicCopy: normalizePublicCopy(args.publicCopy),
	};
}

/** Builds the tagged scratch-card config. Threshold is presentation-only. */
export function buildScratchCardGameConfig(
	args: {
		rewardSource?: "campaign-inventory";
		rewardMode?: GameRewardMode;
		noRewardWeight?: number;
		noRewardLabel?: string;
		rewardPoolTag?: string;
		coverStyle?: ScratchCoverStyle;
		revealThresholdPercent?: number;
		publicCopy?: Partial<GamePublicCopy>;
	} = {},
): ScratchCardGameConfig {
	const coverStyle = scratchCoverStyles.includes(
		args.coverStyle as ScratchCoverStyle,
	)
		? (args.coverStyle as ScratchCoverStyle)
		: scratchCardDefaultGameConfig.coverStyle;
	return {
		templateId: "scratch-card",
		rewardSource: "campaign-inventory",
		rewardMode: args.rewardMode ?? DEFAULT_REWARD_MODE,
		noRewardWeight: clampInt(
			args.noRewardWeight ?? scratchCardDefaultGameConfig.noRewardWeight,
			0,
			100,
			scratchCardDefaultGameConfig.noRewardWeight,
		),
		noRewardLabel:
			args.noRewardLabel?.trim().slice(0, 60) ||
			scratchCardDefaultGameConfig.noRewardLabel,
		rewardPoolTag: args.rewardPoolTag?.trim().slice(0, 24) || DEFAULT_REWARD_POOL_TAG,
		coverStyle,
		revealThresholdPercent: clampInt(
			args.revealThresholdPercent ??
				scratchCardDefaultGameConfig.revealThresholdPercent,
			10,
			100,
			scratchCardDefaultGameConfig.revealThresholdPercent,
		),
		publicCopy: normalizePublicCopy(args.publicCopy),
	};
}

/** Builds the tagged slot-reveal config. Combinations freeze at admission. */
export function buildSlotRevealGameConfig(
	args: {
		rewardSource?: "campaign-inventory";
		rewardMode?: GameRewardMode;
		noRewardWeight?: number;
		noRewardLabel?: string;
		rewardPoolTag?: string;
		reelTheme?: SlotReelTheme;
		publicCopy?: Partial<GamePublicCopy>;
	} = {},
): SlotRevealGameConfig {
	const reelTheme = slotReelThemes.includes(args.reelTheme as SlotReelTheme)
		? (args.reelTheme as SlotReelTheme)
		: slotRevealDefaultGameConfig.reelTheme;
	return {
		templateId: "slot-reveal",
		rewardSource: "campaign-inventory",
		rewardMode: args.rewardMode ?? DEFAULT_REWARD_MODE,
		noRewardWeight: clampInt(
			args.noRewardWeight ?? slotRevealDefaultGameConfig.noRewardWeight,
			0,
			100,
			slotRevealDefaultGameConfig.noRewardWeight,
		),
		noRewardLabel:
			args.noRewardLabel?.trim().slice(0, 60) ||
			slotRevealDefaultGameConfig.noRewardLabel,
		rewardPoolTag: args.rewardPoolTag?.trim().slice(0, 24) || DEFAULT_REWARD_POOL_TAG,
		reelTheme,
		publicCopy: normalizePublicCopy(args.publicCopy),
	};
}

/** Builds the tagged quiz config. Lenient (clamps only) for editor drafts. */
export function buildQuizGameConfig(
	args: {
		rewardSource?: "campaign-inventory";
		rewardMode?: GameRewardMode;
		noRewardLabel?: string;
		rewardPoolTag?: string;
		passCount?: number;
		questions?: Array<Partial<QuizQuestionConfig>>;
		publicCopy?: Partial<GamePublicCopy>;
	} = {},
): QuizGameConfig {
	const questions: QuizQuestionConfig[] = (args.questions ?? [])
		.slice(0, QUIZ_MAX_QUESTIONS)
		.map((question) => {
			const choices = (question.choices ?? [])
				.slice(0, QUIZ_MAX_CHOICES)
				.map((choice) => (choice ?? "").trim().slice(0, QUIZ_MAX_CHOICE_LENGTH));
			while (choices.length < QUIZ_MIN_CHOICES) {
				choices.push("");
			}
			const correctIndex = clampInt(
				question.correctIndex ?? 0,
				0,
				Math.max(0, choices.length - 1),
				0,
			);
			return {
				prompt: (question.prompt ?? "").trim().slice(0, QUIZ_MAX_PROMPT_LENGTH),
				choices,
				correctIndex,
				explanation: question.explanation?.trim().slice(0, QUIZ_MAX_EXPLANATION_LENGTH) || undefined,
			};
		});
	while (questions.length < QUIZ_MIN_QUESTIONS) {
		questions.push({
			prompt: "",
			choices: ["", ""],
			correctIndex: 0,
		});
	}
	return {
		templateId: "quiz",
		rewardSource: "campaign-inventory",
		rewardMode: args.rewardMode ?? DEFAULT_REWARD_MODE,
		noRewardLabel:
			args.noRewardLabel?.trim().slice(0, 60) || quizDefaultGameConfig.noRewardLabel,
		rewardPoolTag: args.rewardPoolTag?.trim().slice(0, 24) || DEFAULT_REWARD_POOL_TAG,
		passCount: clampInt(
			args.passCount ?? quizDefaultGameConfig.passCount,
			1,
			questions.length,
			1,
		),
		questions,
		publicCopy: normalizePublicCopy(args.publicCopy),
	};
}

/**
 * STRICT saved-config integrity for quiz (Vietnamese errors): run at save
 * time so lenient editor drafts cannot persist invalid questionnaires.
 */
export function assertQuizGameConfigIntegrity(config: QuizGameConfig): void {
	if (
		config.questions.length < QUIZ_MIN_QUESTIONS ||
		config.questions.length > QUIZ_MAX_QUESTIONS
	) {
		throw new Error(
			`Trắc nghiệm cần ${QUIZ_MIN_QUESTIONS}-${QUIZ_MAX_QUESTIONS} câu hỏi`,
		);
	}
	for (const [index, question] of config.questions.entries()) {
		if (question.prompt.trim().length === 0) {
			throw new Error(`Câu hỏi ${index + 1} chưa có nội dung`);
		}
		if (
			question.choices.length < QUIZ_MIN_CHOICES ||
			question.choices.length > QUIZ_MAX_CHOICES
		) {
			throw new Error(
				`Câu hỏi ${index + 1} cần ${QUIZ_MIN_CHOICES}-${QUIZ_MAX_CHOICES} lựa chọn`,
			);
		}
		if (question.choices.some((choice) => choice.trim().length === 0)) {
			throw new Error(`Câu hỏi ${index + 1} có lựa chọn chưa có nội dung`);
		}
		if (
			!Number.isInteger(question.correctIndex) ||
			question.correctIndex < 0 ||
			question.correctIndex >= question.choices.length
		) {
			throw new Error(`Câu hỏi ${index + 1} chưa chọn đúng lựa chọn đúng`);
		}
	}
	if (
		!Number.isInteger(config.passCount) ||
		config.passCount < 1 ||
		config.passCount > config.questions.length
	) {
		throw new Error(
			`Số câu đạt tối thiểu phải từ 1 đến ${config.questions.length}`,
		);
	}
}

export function isLiXiGameConfig(
	config: CampaignGameConfig,
): config is LiXiGameConfig | LiXiLegacyGameConfig {
	return configTemplateId(config) === "li-xi";
}

export function isLuckyWheelGameConfig(
	config: CampaignGameConfig,
): config is LuckyWheelGameConfig | LuckyWheelLegacyGameConfig {
	return configTemplateId(config) === "lucky-wheel";
}

export function isScratchCardGameConfig(
	config: CampaignGameConfig,
): config is ScratchCardGameConfig {
	return configTemplateId(config) === "scratch-card";
}

export function isSlotRevealGameConfig(
	config: CampaignGameConfig,
): config is SlotRevealGameConfig {
	return configTemplateId(config) === "slot-reveal";
}

export function isQuizGameConfig(
	config: CampaignGameConfig,
): config is QuizGameConfig {
	return configTemplateId(config) === "quiz";
}

function normalizePublicCopy(copy?: Partial<GamePublicCopy>): GamePublicCopy {
	return {
		headline: copy?.headline?.trim().slice(0, 80) || "",
		subtitle: copy?.subtitle?.trim().slice(0, 140) || "",
		startCtaLabel: copy?.startCtaLabel?.trim().slice(0, 28) || "",
		collectCtaLabel: copy?.collectCtaLabel?.trim().slice(0, 28) || "",
		waitingMessage: copy?.waitingMessage?.trim().slice(0, 80) || "",
	};
}

/** Validates/normalizes the li xi skin; unknown values keep the lunar skin. */
export function resolveLiXiStyleVariant(
	variant: CampaignStyleVariant | null | undefined,
): CampaignStyleVariant {
	return variant === "brand" ? "brand" : "lunar";
}
