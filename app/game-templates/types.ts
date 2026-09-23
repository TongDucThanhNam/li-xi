import type { ComponentType } from "react";
import type { RewardPoolItem } from "@/app/draw/fortune/types";
import type {
	CampaignGameConfig,
	CampaignStyleVariant,
	GameTemplateAnalyticsLabels,
	GameTemplateCatalogEntry,
	GameTemplateId,
} from "@/lib/gameTemplates";
import type { Rarity } from "@/lib/lixiPolicy";

export type GameTemplateFontLink = {
	crossOrigin?: string;
	href: string;
	rel: "preconnect" | "stylesheet";
};

/**
 * Legacy stage contract: li xi station and legacy /play + /claim surfaces.
 * Kept untouched so the draw-era flows remain behaviorally compatible; it is
 * the only template allowed to depend on envelopeIndex/amount/rarity.
 */
export type GameStageProps = {
	canStart: boolean;
	campaignSubtitle?: string;
	campaignTitle?: string;
	collectLabel?: string;
	ctaLabel?: string;
	disabled: boolean;
	guestName?: string;
	heroAssetUrl?: string | null;
	onCollect: () => void;
	onExit?: () => void;
	onRedeem: (envelopeIndex: number) => Promise<{ amount: number; rarity: Rarity }>;
	onRevealStateChange: (revealing: boolean) => void;
	rewardPool: RewardPoolItem[];
	sessionKey: string | null;
	statusMessage?: string;
	waitingMessage?: string;
};

/** Server-validated result of one generic play, safe to render publicly. */
export type GenericPlayOutcome = {
	kind: "reward" | "no-reward";
	rewardType: "cash" | "voucher" | "physical" | "points" | "none";
	label: string;
	amount: number | null;
	canClaim: boolean;
	/**
	 * Stable key of the awarded reward (or the no-reward pseudo key). Stages
	 * must land their mechanic on this key, never on formatted labels.
	 */
	segmentKey: string | null;
};

export type GenericClaimDetail = {
	label: string;
	rewardType: "cash" | "voucher" | "physical" | "points" | "none";
	amount: number | null;
	secretCode: string | null;
	instructions: string | null;
};

/** Template-scoped server action that resolves one play. */
export type GenericPlayAction =
	| { type: "reveal-envelope"; envelopeIndex: number }
	| { type: "spin" }
	| { type: "scratch-reveal" }
	| { type: "spin-reels" }
	| {
			type: "quiz-answer";
			questionIndex: number;
			choiceIndex: number;
			/** Stable retry identity: accepted-answer count per the client. */
			revision: number;
	  };

/**
 * Typed multi-step action result (docs/design-quiz.md): quiz answers
 * progress the session before any completion, while immediate templates
 * (wheel/scratch/slot/li-xi) keep resolving in one step.
 */
export type GenericPlayStepState = {
	totalQuestions: number;
	answeredCount: number;
};

export type GenericPlayActionResult =
	| { status: "in-progress"; step: GenericPlayStepState }
	| {
			status: "completed";
			outcome: GenericPlayOutcome;
			/** Authoritative grading payload for quiz completions. */
			quizResult?: { score: number; passed: boolean };
	  };

/** Capability-authorized quiz progression state (never answer keys). */
export type GenericQuizProgressState = {
	totalQuestions: number;
	answeredCount: number;
	currentIndex: number;
	completed: boolean;
	currentQuestion?: { index: number; prompt: string; choices: string[] } | null;
	/** Present only AFTER completion (permitted answer review). */
	score?: number;
	passed?: boolean;
	review?: Array<{
		questionIndex: number;
		choiceIndex: number;
		correctIndex: number;
		correct: boolean;
		explanation: string | null;
	}>;
};

/**
 * Generic stage contract for the reusable public entry flow. Independent of
 * envelopeIndex/amount/rarity: every template renders its own mechanic and
 * result UI on top of these props.
 */
export type GamePlayStageProps = {
	sessionKey: string | null;
	canPlay: boolean;
	disabled: boolean;
	statusMessage?: string;
	copy: {
		title?: string;
		subtitle?: string;
		ctaLabel?: string;
		collectLabel?: string;
		waitingMessage?: string;
	};
	heroAssetUrl?: string | null;
	playContext?: Record<string, unknown>;
	/** Recovered state for a resumed session that already completed. */
	initialOutcome?: GenericPlayOutcome | null;
	initialClaim?: GenericClaimDetail | null;
	/** Recovered multi-step progression (quiz), capability-bound. */
	initialQuizState?: GenericQuizProgressState | null;
	/**
	 * A freshly admitted (or restored active) session with no outcome may
	 * proceed straight into its mechanic's intro/selection using the
	 * template's own premium transition. This must never allocate, reveal or
	 * play on mount — it only advances the presentation.
	 */
	autoBegin?: boolean;
	onPlay: (action: GenericPlayAction) => Promise<GenericPlayOutcome>;
	/**
	 * Multi-step driver (quiz): returns the typed in-progress/completed
	 * result. Absent for immediate templates, which use onPlay only.
	 */
	onPlayStep?: (action: GenericPlayAction) => Promise<GenericPlayActionResult>;
	onClaim: () => Promise<GenericClaimDetail | null>;
	onCollect: () => void;
	onRevealStateChange?: (revealing: boolean) => void;
};

/**
 * Template-owned pre-session hero. The reusable entry route renders this
 * instead of a generic card so every template enters through its own premium
 * presentation with exactly one Start action.
 */
export type GameEntryHeroProps = {
	/** False when new admissions are blocked (sold out, per-participant limit, non-self-serve). */
	canStart: boolean;
	blockedMessage?: string;
	pending: boolean;
	statusMessage?: string;
	copy: {
		title: string;
		subtitle?: string;
		/** The Start CTA label; waiting copy must never replace it. */
		ctaLabel: string;
		waitingMessage?: string;
	};
	brandName?: string | null;
	description?: string | null;
	gameName?: string | null;
	heroAssetUrl?: string | null;
	onStart: () => void;
};

export type LegacyCampaignPresentationPatch = {
	claimCollectLabel?: string;
	claimCtaLabel?: string;
	claimHeadline?: string;
	claimSubtitle?: string;
	claimWaitingMessage?: string;
	theme: CampaignStyleVariant;
};

export type GameTemplate = GameTemplateCatalogEntry & {
	ConfigEditor: ComponentType<{
		config: CampaignGameConfig;
		onChange: (config: CampaignGameConfig) => void;
	}>;
	Preview: ComponentType<{
		config: CampaignGameConfig;
		heroUrl?: string | null;
	}>;
	/** Legacy contract — only the li xi template registers this. */
	Stage?: ComponentType<GameStageProps>;
	/** Template-styled pre-session hero used by the reusable /p entry. */
	EntryHero: ComponentType<GameEntryHeroProps>;
	/** Generic contract used by the reusable public entry flow. */
	PlayStage: ComponentType<GamePlayStageProps>;
	analyticsLabels: GameTemplateAnalyticsLabels;
	config: {
		defaults: CampaignGameConfig;
		initialCampaign: CampaignGameConfig;
		schema: GameTemplateCatalogEntry["configSchema"];
	};
	cssHref: string;
	fonts: readonly GameTemplateFontLink[];
	id: GameTemplateId;
	normalizeConfig: (config: CampaignGameConfig) => CampaignGameConfig;
	toLegacyCampaignPresentation: (
		config: CampaignGameConfig,
	) => LegacyCampaignPresentationPatch;
};
