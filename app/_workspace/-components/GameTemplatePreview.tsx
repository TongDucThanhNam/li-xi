"use client";

import { getGameTemplate } from "@/app/game-templates/registry";
import type { GameTemplate } from "@/app/game-templates/types";
import type { CampaignGameConfig, GameTemplateId } from "@/lib/gameTemplates";
import { useMemo } from "react";
import { GamePreviewFrame } from "./GamePreviewFrame";

/**
 * Decorative live preview of a game template (§11.6.1): shared by the create
 * page and the operate pages so a feature that may not import the template
 * registry can still show the product. The preview is `aria-hidden` + `inert`
 * and never creates focus stops.
 */
export function GameTemplatePreview({ config, heroUrl, templateId }: {
	config: unknown;
	heroUrl?: string | null;
	templateId: string;
}) {
	const template = getGameTemplate(templateId as GameTemplateId) as GameTemplate | undefined;
	const normalized = useMemo(
		() => (template ? template.normalizeConfig(config as CampaignGameConfig) : undefined),
		[template, config],
	);
	const Preview = template?.Preview;
	return (
		<div aria-hidden="true" inert>
			{template && Preview && normalized ? (
				<GamePreviewFrame>
					<Preview config={normalized} heroUrl={heroUrl} />
				</GamePreviewFrame>
			) : (
				<div className="aspect-video rounded-2xl bg-surface-secondary" />
			)}
		</div>
	);
}
