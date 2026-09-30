// Repo-owned station fixture entry: mounts the ACTUAL StationPlayFeature
// (which in turn mounts the actual template EntryHero/PlayStage) in a real
// TanStack Router tree with the shell + template CSS layers in the SAME
// order the real /station/$campaignGameId route ships them
// (registry.stationCssLayers: li-xi, lucky-wheel, scratch-card — the
// station-capable set; quiz/slot fail closed and never load) and the
// synthetic campaigns/stationPlay/publicPlay/auth convex/react replacement.
// Controls live on window.__stationFixture; no debug overlays, no stubbed
// product handlers. The route's real beforeLoad host-auth guard is not
// mounted (fixture routers have no Convex Auth session storage); the guard
// policy itself is covered by lib tests.
import React from "react";
import { createRoot } from "react-dom/client";
import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	Outlet,
	RouterProvider,
} from "@tanstack/react-router";
import { StationPlayFeature } from "../../../app/station/-features/StationPlayFeature";

// All shell + template layers (real route's documented order, with the app
// Tailwind @source the production build compiles) load through
// station-styles.css; see that file for the layer list.
import "./station-styles.css";

function StationFrame() {
	const { campaignGameId } = stationRoute.useParams();
	return (
		<main data-testid="station-root">
			<StationPlayFeature key={campaignGameId} campaignGameId={campaignGameId} />
		</main>
	);
}

function PlaceholderFrame() {
	return <main data-testid="station-placeholder">Trang nháp fixture</main>;
}

const rootRoute = createRootRoute({ component: Outlet });
const stationRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/station/$campaignGameId",
	component: StationFrame,
});
// Navigation targets linked by station states (unknown game, inactive
// campaign, exit flow).
const stubPaths = [
	"/campaigns",
	"/campaigns/$campaignId",
	"/campaigns/$campaignId/games/$campaignGameId",
	"/campaigns/$campaignId/distribution",
	"/operate/$campaignGameId",
];
const stubRoutes = stubPaths.map((path) =>
	createRoute({
		getParentRoute: () => rootRoute,
		path,
		component: PlaceholderFrame,
	}),
);

const gameParam = new URLSearchParams(window.location.search).get("game") ?? "wheel";
const gameIds: Record<string, string> = {
	wheel: "station-game-wheel",
	scratch: "station-game-scratch",
	quiz: "station-game-quiz",
	lixi: "station-game-lixi",
};
const campaignGameId = gameIds[gameParam] ?? gameIds.wheel!;

const router = createRouter({
	routeTree: rootRoute.addChildren([stationRoute, ...stubRoutes]),
	history: createMemoryHistory({ initialEntries: [`/station/${campaignGameId}`] }),
});

createRoot(document.getElementById("root")!).render(<RouterProvider router={router} />);
