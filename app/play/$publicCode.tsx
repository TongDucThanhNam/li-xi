import { createFileRoute } from "@tanstack/react-router";
import { GameRouteError } from "@/app/game-templates/GameRouteError";
import { getGameTemplate } from "@/app/game-templates/registry";
import { PublicPlayFeature } from "./-features/PublicPlayFeature";

export const Route = createFileRoute("/play/$publicCode")({
	head: () => ({
		links: [
			{ rel: "stylesheet", href: getGameTemplate().cssHref },
			...getGameTemplate().fonts,
		],
		meta: [
			{ title: "Chơi | Campaign Game Studio" },
			{ name: "description", content: "Trải nghiệm trò chơi của chiến dịch." },
		],
	}),
	errorComponent: GameRouteError,
	component: PlayRoute,
});

function PlayRoute() {
	const { publicCode } = Route.useParams();
	return <PublicPlayFeature key={publicCode} publicCode={publicCode} />;
}
