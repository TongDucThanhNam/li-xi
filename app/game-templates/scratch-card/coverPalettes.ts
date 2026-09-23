import type { ScratchCoverStyle } from "@/lib/gameTemplates";

/**
 * One palette per frozen coverStyle, shared by the participant canvas, the
 * beneath-backdrop classes in scratch-card.css, and the operator preview
 * (which cannot rely on scratch-card.css being loaded). The three palettes
 * are deliberately far apart in hue so the frozen choice is visible on the
 * real card, not just in the editor.
 */
export const SCRATCH_COVER_PALETTES: Record<
	ScratchCoverStyle,
	{ canvas: [string, string, string]; css: string }
> = {
	gold: {
		canvas: ["#e9c96a", "#d4af37", "#8a6d1f"],
		css: "linear-gradient(135deg, #e9c96a 0%, #d4af37 52%, #8a6d1f 100%)",
	},
	teal: {
		canvas: ["#7fe3d8", "#2ec4b6", "#0f5f56"],
		css: "linear-gradient(135deg, #7fe3d8 0%, #2ec4b6 52%, #0f5f56 100%)",
	},
	crimson: {
		canvas: ["#ff8fa9", "#ef476f", "#8f0f31"],
		css: "linear-gradient(135deg, #ff8fa9 0%, #ef476f 52%, #8f0f31 100%)",
	},
};

export function scratchCoverPalette(style: string | undefined) {
	const key =
		style === "teal" || style === "crimson" || style === "gold"
			? style
			: "gold";
	return SCRATCH_COVER_PALETTES[key];
}
