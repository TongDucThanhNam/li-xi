import type {
	GameStageProps,
	GameTemplate,
	GameTemplateFontLink,
} from "@/app/game-templates/types";
import type { CampaignStyleVariant, GameTemplateId } from "@/lib/gameTemplates";

export type DrawTemplateKey = GameTemplateId;
export type CampaignThemeKey = CampaignStyleVariant;
export type DrawTemplateFontLink = GameTemplateFontLink;
export type DrawStageProps = GameStageProps;

export type DrawTemplate = GameTemplate & {
	key: DrawTemplateKey;
};
