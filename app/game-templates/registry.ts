import FortuneStage from "@/app/draw/FortuneStage";
import { LiXiGameConfigEditor } from "./li-xi/LiXiGameConfigEditor";
import { LiXiGamePreview } from "./li-xi/LiXiGamePreview";
import drawCss from "@/app/styles/draw.css?url";
import {
	DEFAULT_GAME_TEMPLATE_ID,
	buildLiXiGameConfig,
	gameTemplates as gameTemplateCatalog,
	resolveGameTemplateId,
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

export const gameTemplates = {
	"li-xi": {
		...gameTemplateCatalog["li-xi"],
		ConfigEditor: LiXiGameConfigEditor,
		Preview: LiXiGamePreview,
		Stage: FortuneStage,
		cssHref: drawCss,
		fonts: lunarFortuneFontLinks,
		config: {
			defaults: gameTemplateCatalog["li-xi"].defaultConfig,
			initialCampaign: gameTemplateCatalog["li-xi"].initialCampaignConfig,
			schema: gameTemplateCatalog["li-xi"].configSchema,
		},
		normalizeConfig: buildLiXiGameConfig,
		toLegacyCampaignPresentation: (config) => ({
			claimCollectLabel: config.publicCopy.collectCtaLabel || undefined,
			claimCtaLabel: config.publicCopy.startCtaLabel || undefined,
			claimHeadline: config.publicCopy.headline || undefined,
			claimSubtitle: config.publicCopy.subtitle || undefined,
			claimWaitingMessage: config.publicCopy.waitingMessage || undefined,
			theme: config.styleVariant,
		}),
	},
} satisfies Record<GameTemplateId, GameTemplate>;

export function getGameTemplate(templateId: GameTemplateId = DEFAULT_GAME_TEMPLATE_ID) {
	return gameTemplates[templateId];
}

export function resolveCampaignGameTemplateId(templateId?: string | null) {
	return resolveGameTemplateId(templateId);
}
