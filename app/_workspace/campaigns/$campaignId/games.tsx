import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_workspace/campaigns/$campaignId/games")({
	component: GamesRoute,
});

function GamesRoute() {
	return <Outlet />;
}
