import { CircleHelp, Dices, FerrisWheel, Gift, Ticket } from "lucide-react";
import type { GameTemplateId } from "@/lib/gameTemplates";

const templateIcons: Record<GameTemplateId, typeof Gift> = {
	"li-xi": Gift,
	"lucky-wheel": FerrisWheel,
	"scratch-card": Ticket,
	"slot-reveal": Dices,
	quiz: CircleHelp,
};

/** 40px-tile icon for a game template; decorative, always aria-hidden. */
export function GameTemplateIcon({
	size = 20,
	templateId,
}: {
	size?: number;
	templateId: GameTemplateId;
}) {
	const Icon = templateIcons[templateId];
	return <Icon aria-hidden="true" size={size} />;
}
