import FortuneStage from "@/app/draw/FortuneStage";
import LunarPlayStage from "@/app/game-templates/li-xi/LunarPlayStage";
import LunarEntryHero from "@/app/game-templates/li-xi/LunarEntryHero";
import { LiXiGameConfigEditor } from "./li-xi/LiXiGameConfigEditor";
import { LiXiGamePreview } from "./li-xi/LiXiGamePreview";
import LuckyWheelStage from "@/app/game-templates/lucky-wheel/LuckyWheelStage";
import WheelEntryHero from "@/app/game-templates/lucky-wheel/WheelEntryHero";
import { LuckyWheelConfigEditor } from "@/app/game-templates/lucky-wheel/LuckyWheelConfigEditor";
import { LuckyWheelPreview } from "@/app/game-templates/lucky-wheel/LuckyWheelPreview";
import ScratchCardStage from "@/app/game-templates/scratch-card/ScratchCardStage";
import ScratchCardEntryHero from "@/app/game-templates/scratch-card/ScratchCardEntryHero";
import { ScratchCardConfigEditor } from "@/app/game-templates/scratch-card/ScratchCardConfigEditor";
import { ScratchCardPreview } from "@/app/game-templates/scratch-card/ScratchCardPreview";
import SlotRevealStage from "@/app/game-templates/slot-reveal/SlotRevealStage";
import SlotRevealEntryHero from "@/app/game-templates/slot-reveal/SlotRevealEntryHero";
import { SlotRevealConfigEditor } from "@/app/game-templates/slot-reveal/SlotRevealConfigEditor";
import { SlotRevealPreview } from "@/app/game-templates/slot-reveal/SlotRevealPreview";
import QuizStage from "@/app/game-templates/quiz/QuizStage";
import QuizEntryHero from "@/app/game-templates/quiz/QuizEntryHero";
import { QuizConfigEditor } from "@/app/game-templates/quiz/QuizConfigEditor";
import { QuizPreview } from "@/app/game-templates/quiz/QuizPreview";
import drawCss from "@/app/styles/draw.css?url";
import luckyWheelCss from "@/app/styles/lucky-wheel.css?url";
import scratchCardCss from "@/app/styles/scratch-card.css?url";
import slotRevealCss from "@/app/styles/slot-reveal.css?url";
import quizCss from "@/app/styles/quiz.css?url";
import {
	buildScratchCardGameConfig,
	buildSlotRevealGameConfig,
	buildQuizGameConfig,
	buildLuckyWheelGameConfig,
	buildLiXiGameConfig,
	DEFAULT_GAME_TEMPLATE_ID,
	gameTemplates as gameTemplateCatalog,
	isScratchCardGameConfig,
	isSlotRevealGameConfig,
	isQuizGameConfig,
	isLuckyWheelGameConfig,
	isLiXiGameConfig,
	type GameTemplateId,
} from "@/lib/gameTemplates";
import type { GameTemplate } from "./types";

const lunarFortuneFontLinks = [
	{ rel: "preconnect", href: "https://fonts.googleapis.com" },
	{
		rel: "preconnect",
		href: "https://fonts.gstatic.com",
		crossOrigin: "anonymous" as const,
	},
	{
		rel: "stylesheet",
		href: "https://fonts.googleapis.com/css2?family=Cinzel+Decorative:wght@700;900&family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=Noto+Serif:wght@400;600;700&display=swap",
	},
] as const satisfies GameTemplate["fonts"];

const luckyWheelFontLinks = [
	{ rel: "preconnect", href: "https://fonts.googleapis.com" },
	{
		rel: "preconnect",
		href: "https://fonts.gstatic.com",
		crossOrigin: "anonymous" as const,
	},
	{
		rel: "stylesheet",
		href: "https://fonts.googleapis.com/css2?family=Baloo+2:wght@600;800&family=Be+Vietnam+Pro:wght@400;500;700&display=swap",
	},
] as const satisfies GameTemplate["fonts"];

const slotRevealFontLinks = [
	{ rel: "preconnect", href: "https://fonts.googleapis.com" },
	{
		rel: "preconnect",
		href: "https://fonts.gstatic.com",
		crossOrigin: "anonymous" as const,
	},
	{
		rel: "stylesheet",
		href: "https://fonts.googleapis.com/css2?family=Bungee&family=Be+Vietnam+Pro:wght@400;500;700&display=swap",
	},
] as const satisfies GameTemplate["fonts"];

const quizFontLinks = [
	{ rel: "preconnect", href: "https://fonts.googleapis.com" },
	{
		rel: "preconnect",
		href: "https://fonts.gstatic.com",
		crossOrigin: "anonymous" as const,
	},
	{
		rel: "stylesheet",
		href: "https://fonts.googleapis.com/css2?family=Baloo+2:wght@600;800&family=Be+Vietnam+Pro:wght@400;500;700&display=swap",
	},
] as const satisfies GameTemplate["fonts"];

export const gameTemplates = {
	"li-xi": {
		...gameTemplateCatalog["li-xi"],
		ConfigEditor: LiXiGameConfigEditor,
		Preview: LiXiGamePreview,
		Stage: FortuneStage,
		PlayStage: LunarPlayStage,
		EntryHero: LunarEntryHero,
		cssHref: drawCss,
		fonts: lunarFortuneFontLinks,
		config: {
			defaults: gameTemplateCatalog["li-xi"].defaultConfig,
			initialCampaign: gameTemplateCatalog["li-xi"].initialCampaignConfig,
			schema: gameTemplateCatalog["li-xi"].configSchema,
		},
		normalizeConfig: (config) =>
			isLuckyWheelGameConfig(config)
				? buildLiXiGameConfig({ publicCopy: config.publicCopy })
				: isScratchCardGameConfig(config)
					? buildLiXiGameConfig({ publicCopy: config.publicCopy })
					: buildLiXiGameConfig(config),
		toLegacyCampaignPresentation: (config) => ({
			claimCollectLabel: config.publicCopy.collectCtaLabel || undefined,
			claimCtaLabel: config.publicCopy.startCtaLabel || undefined,
			claimHeadline: config.publicCopy.headline || undefined,
			claimSubtitle: config.publicCopy.subtitle || undefined,
			claimWaitingMessage: config.publicCopy.waitingMessage || undefined,
			theme: isLuckyWheelGameConfig(config) ? "lunar" : isLiXiGameConfig(config) ? config.styleVariant : "lunar",
		}),
	},
	"scratch-card": {
		...gameTemplateCatalog["scratch-card"],
		ConfigEditor: ScratchCardConfigEditor,
		Preview: ScratchCardPreview,
		PlayStage: ScratchCardStage,
		EntryHero: ScratchCardEntryHero,
		cssHref: scratchCardCss,
		fonts: lunarFortuneFontLinks,
		config: {
			defaults: gameTemplateCatalog["scratch-card"].defaultConfig,
			initialCampaign: gameTemplateCatalog["scratch-card"].initialCampaignConfig,
			schema: gameTemplateCatalog["scratch-card"].configSchema,
		},
		normalizeConfig: (config) =>
			buildScratchCardGameConfig(
				isScratchCardGameConfig(config) ? config : { publicCopy: config.publicCopy },
			),
		toLegacyCampaignPresentation: () => ({
			theme: "lunar",
		}),
	},
	"slot-reveal": {
		...gameTemplateCatalog["slot-reveal"],
		ConfigEditor: SlotRevealConfigEditor,
		Preview: SlotRevealPreview,
		PlayStage: SlotRevealStage,
		EntryHero: SlotRevealEntryHero,
		cssHref: slotRevealCss,
		fonts: slotRevealFontLinks,
		config: {
			defaults: gameTemplateCatalog["slot-reveal"].defaultConfig,
			initialCampaign: gameTemplateCatalog["slot-reveal"].initialCampaignConfig,
			schema: gameTemplateCatalog["slot-reveal"].configSchema,
		},
		normalizeConfig: (config) =>
			buildSlotRevealGameConfig(
				isSlotRevealGameConfig(config) ? config : { publicCopy: config.publicCopy },
			),
		toLegacyCampaignPresentation: () => ({
			theme: "lunar" as const,
		}),
	},
	"quiz": {
		...gameTemplateCatalog["quiz"],
		ConfigEditor: QuizConfigEditor,
		Preview: QuizPreview,
		PlayStage: QuizStage,
		EntryHero: QuizEntryHero,
		cssHref: quizCss,
		fonts: quizFontLinks,
		config: {
			defaults: gameTemplateCatalog["quiz"].defaultConfig,
			initialCampaign: gameTemplateCatalog["quiz"].initialCampaignConfig,
			schema: gameTemplateCatalog["quiz"].configSchema,
		},
		normalizeConfig: (config) =>
			buildQuizGameConfig(
				isQuizGameConfig(config) ? config : { publicCopy: config.publicCopy },
			),
		toLegacyCampaignPresentation: () => ({
			theme: "lunar" as const,
		}),
	},
	"lucky-wheel": {
		...gameTemplateCatalog["lucky-wheel"],
		ConfigEditor: LuckyWheelConfigEditor,
		Preview: LuckyWheelPreview,
		PlayStage: LuckyWheelStage,
		EntryHero: WheelEntryHero,
		cssHref: luckyWheelCss,
		fonts: luckyWheelFontLinks,
		config: {
			defaults: gameTemplateCatalog["lucky-wheel"].defaultConfig,
			initialCampaign: gameTemplateCatalog["lucky-wheel"].initialCampaignConfig,
			schema: gameTemplateCatalog["lucky-wheel"].configSchema,
		},
		normalizeConfig: (config) =>
			buildLuckyWheelGameConfig(
				isLuckyWheelGameConfig(config) ? config : { publicCopy: config.publicCopy },
			),
		toLegacyCampaignPresentation: () => ({
			theme: "lunar" as const,
		}),
	},
} satisfies Record<GameTemplateId, GameTemplate>;

export function getGameTemplate(templateId: GameTemplateId = DEFAULT_GAME_TEMPLATE_ID) {
	return gameTemplates[templateId];
}

/** Generic surfaces must fail closed on unknown template ids. */
export function requireGameTemplate(templateId: string): GameTemplate {
	if (
		templateId === "li-xi" ||
		templateId === "lucky-wheel" ||
		templateId === "scratch-card" ||
		templateId === "slot-reveal" ||
		templateId === "quiz"
	) {
		return gameTemplates[templateId];
	}
	throw new Error(`Mẫu trò chơi không được hỗ trợ: ${templateId || "(trống)"}`);
}

export function resolveCampaignGameTemplateId(templateId?: string | null) {
	if (
		templateId === "li-xi" ||
		templateId === "lucky-wheel" ||
		templateId === "scratch-card" ||
		templateId === "slot-reveal" ||
		templateId === "quiz"
	) {
		return templateId;
	}
	return DEFAULT_GAME_TEMPLATE_ID;
}
