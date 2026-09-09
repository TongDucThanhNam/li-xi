import {
	gameTemplates,
	getGameTemplate,
	resolveCampaignGameTemplateId,
} from "@/app/game-templates/registry";
import { DEFAULT_GAME_TEMPLATE_ID, resolveLiXiStyleVariant } from "@/lib/gameTemplates";
import type { CampaignThemeKey, DrawTemplate, DrawTemplateKey } from "./types";

export const drawTemplates = {
	"li-xi": {
		...gameTemplates["li-xi"],
		key: "li-xi",
	},
} satisfies Record<DrawTemplateKey, DrawTemplate>;

export function getDrawTemplate(key: DrawTemplateKey = DEFAULT_GAME_TEMPLATE_ID) {
	const templateId = resolveCampaignGameTemplateId(key);
	return {
		...getGameTemplate(templateId),
		key: templateId,
	};
}

export function resolveDrawTemplateKey(theme?: CampaignThemeKey | null): DrawTemplateKey {
	resolveLiXiStyleVariant(theme);
	return DEFAULT_GAME_TEMPLATE_ID;
}
