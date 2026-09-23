import { createFileRoute } from "@tanstack/react-router";
import { getGameTemplate } from "@/app/game-templates/registry";
import { GameRouteError } from "@/app/game-templates/GameRouteError";
import { PublicShareEntryFeature } from "@/app/play/-features/PublicShareEntryFeature";

/**
 * Reusable public campaign-game entry. The share link identifies a campaign
 * game and channel, not a precreated participant session. The template is
 * resolved at runtime, so both templates' stylesheets are shipped in head;
 * each template keeps isolated `wheel-*` / draw-era class prefixes and token
 * names, and the wheel layer loads last to own the body shell.
 */
export const Route = createFileRoute("/p/$shareCode")({
	head: () => ({
		links: [
			{ rel: "stylesheet", href: getGameTemplate("li-xi").cssHref },
			...getGameTemplate("li-xi").fonts,
			{ rel: "stylesheet", href: getGameTemplate("lucky-wheel").cssHref },
			...getGameTemplate("lucky-wheel").fonts,
			{ rel: "stylesheet", href: getGameTemplate("scratch-card").cssHref },
			{ rel: "stylesheet", href: getGameTemplate("slot-reveal").cssHref },
			...getGameTemplate("slot-reveal").fonts,
			{ rel: "stylesheet", href: getGameTemplate("quiz").cssHref },
			...getGameTemplate("quiz").fonts,
		],
		meta: [
			{ title: "Chơi | Campaign Game Studio" },
			{ name: "description", content: "Vào chơi trò chơi của chiến dịch qua liên kết dùng chung." },
		],
	}),
	errorComponent: GameRouteError,
	component: ShareEntryRoute,
});

function ShareEntryRoute() {
	const { shareCode } = Route.useParams();
	return <PublicShareEntryFeature key={shareCode} shareCode={shareCode} />;
}
