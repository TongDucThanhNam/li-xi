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
	Stage: ComponentType<GameStageProps>;
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
