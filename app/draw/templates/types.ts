import type { ComponentType } from "react";
import type { RewardPoolItem } from "@/app/draw/fortune/types";
import type { Rarity } from "@/lib/lixiPolicy";

export type DrawTemplateKey = "li-xi" | "brand";
export type CampaignThemeKey = "lunar" | "brand";

export type DrawTemplateFontLink = {
	crossOrigin?: string;
	href: string;
	rel: "preconnect" | "stylesheet";
};

export type DrawStageProps = {
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

export type DrawTemplate = {
	key: DrawTemplateKey;
	name: string;
	Stage: ComponentType<DrawStageProps>;
	cssHref: string;
	fonts: DrawTemplateFontLink[];
};
