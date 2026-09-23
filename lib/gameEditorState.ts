import type { CampaignGameConfig, CampaignGamePlayLimits } from "@/lib/gameTemplates";

/**
 * Pure edit-state contract for the campaign-game editor. The COMPLETE
 * editable draft is config + game status + play limits: serializing all
 * three means status-only and limit-only changes make the editor dirty and
 * enable Save, exactly like copy changes.
 */

export type GameEditorStatus = "draft" | "active" | "archived";

export type GameEditorDraft = {
	config: CampaignGameConfig;
	gameStatus: GameEditorStatus;
	playLimits: CampaignGamePlayLimits;
};

/** Canonical comparable form of the complete editable draft. */
export function serializeEditorDraft(draft: GameEditorDraft): string {
	return JSON.stringify([draft.config, draft.gameStatus, draft.playLimits]);
}

export function isEditorDirty(draft: GameEditorDraft, baseline: string): boolean {
	return serializeEditorDraft(draft) !== baseline;
}

/**
 * Required numeric field: a cleared or invalid NumberField commits
 * NaN/Infinity — keep the previous bounded value instead of ever storing a
 * non-finite number.
 */
export function finiteNumberOr(value: number, fallback: number): number {
	return Number.isFinite(value) ? value : fallback;
}

/**
 * Optional numeric field (e.g. maxTotalSessions): a cleared or invalid value
 * serializes as null — "no cap" — never NaN/Infinity.
 */
export function optionalFiniteNumberOrNull(value: number): number | null {
	return Number.isFinite(value) ? value : null;
}
