import { createFileRoute } from "@tanstack/react-router";
import { GameRouteError } from "@/app/game-templates/GameRouteError";
import { getGameTemplate } from "@/app/game-templates/registry";
import { requireHostRouteAuth } from "@/lib/hostRouteGuard";
import { StationPlayFeature } from "./-features/StationPlayFeature";

export const Route = createFileRoute("/station/$campaignGameId")({
	beforeLoad: requireHostRouteAuth,
	head: () => ({
		links: [
			{ rel: "stylesheet", href: getGameTemplate().cssHref },
			...getGameTemplate().fonts,
		],
		meta: [
			{ title: "Trạm chơi | Campaign Game Studio" },
			{
				name: "description",
				content: "Trải nghiệm trò chơi toàn màn hình dành cho người tham gia tại trạm.",
			},
		],
	}),
	errorComponent: StationRouteError,
	component: StationRoute,
});

function StationRouteError(props: { error: Error; reset: () => void }) {
	return <GameRouteError {...props} showWorkspaceLink />;
}

function StationRoute() {
	const { campaignGameId } = Route.useParams();
	return <StationPlayFeature key={campaignGameId} campaignGameId={campaignGameId} />;
}
