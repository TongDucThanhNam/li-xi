import FortuneStage from "@/app/draw/FortuneStage";
import drawCss from "@/app/styles/draw.css?url";
import type { CampaignThemeKey, DrawTemplate, DrawTemplateKey } from "./types";

const lunarFontLinks = [
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
] as const satisfies DrawTemplate["fonts"];

export const drawTemplates = {
	"li-xi": {
		key: "li-xi",
		name: "Lì xì",
		Stage: FortuneStage,
		cssHref: drawCss,
		fonts: lunarFontLinks,
	},
	brand: {
		key: "brand",
		name: "Brand campaign",
		Stage: FortuneStage,
		cssHref: drawCss,
		fonts: lunarFontLinks,
	},
} satisfies Record<DrawTemplateKey, DrawTemplate>;

export function getDrawTemplate(key: DrawTemplateKey = "li-xi") {
	return drawTemplates[key];
}

export function resolveDrawTemplateKey(theme?: CampaignThemeKey | null): DrawTemplateKey {
	return theme === "brand" ? "brand" : "li-xi";
}
