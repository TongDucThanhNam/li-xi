import {
	Bell,
	Clover,
	Gem,
	Gift,
	Heart,
	Moon,
	Sparkles,
	Star,
	type LucideIcon,
} from "lucide-react";
import {
	SLOT_SYMBOL_LABELS,
	type SlotCombination,
	type SlotSymbolKey,
} from "@/lib/gameTemplates";

/**
 * Slot-reveal symbol presentation. The KEYS are the stable contract (frozen
 * snapshot combinations + data attributes); glyphs/labels are display only.
 */
export const SLOT_SYMBOL_ICONS: Record<SlotSymbolKey, LucideIcon> = {
	bell: Bell,
	star: Star,
	gem: Gem,
	heart: Heart,
	clover: Clover,
	gift: Gift,
	sparkles: Sparkles,
	moon: Moon,
};

/** Decorative idle reels before the first spin (never a reward signal). */
export const SLOT_IDLE_COMBINATION: SlotCombination = [
	"gift",
	"sparkles",
	"star",
];

export { SLOT_SYMBOL_LABELS };
export type { SlotSymbolKey, SlotCombination };
