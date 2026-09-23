import type {
	GameStageProps,
	GameTemplate,
	GameTemplateFontLink,
} from "@/app/game-templates/types";
import type { CampaignStyleVariant, GameTemplateId } from "@/lib/gameTemplates";

/**
 * Draw-era compatibility boundary: only the li xi template ever resolves
 * through this legacy registry. Generic surfaces use app/game-templates.
 */
export type DrawTemplateKey = Extract<GameTemplateId, "li-xi">;
export type CampaignThemeKey = CampaignStyleVariant;
export type DrawTemplateFontLink = GameTemplateFontLink;
export type DrawStageProps = GameStageProps;

export type DrawTemplate = GameTemplate & {
	key: DrawTemplateKey;
};
