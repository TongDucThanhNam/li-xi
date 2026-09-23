// Repo-owned operator fixture entry: mounts the ACTUAL
// CampaignGameEditorFeature and DistributionFeature (incl. ShareLinksPanel)
// in a real TanStack Router tree with admin CSS and the synthetic
// convex/react replacement. Controls live on window.__operatorFixture; no
// debug overlays, no stubbed product handlers.
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
import { CampaignGameEditorFeature } from "../../../app/_workspace/-features/CampaignGameEditorFeature";
import { DistributionFeature } from "../../../app/_workspace/-features/DistributionFeature";
// Same processing as the inventory fixture: real stylesheets + app @source
// scan, so all Tailwind utilities used by the mounted features are generated.
import "./operator-styles.css";

function EditorFrame() {
	const { campaignGameId } = editorRoute.useParams();
	return (
		<main data-testid="operator-editor">
			<CampaignGameEditorFeature
				campaignId="campaign-op"
				campaignGameId={campaignGameId}
			/>
		</main>
	);
}

function DistributionFrame() {
	return (
		<main data-testid="distribution-root">
			<DistributionFeature campaignId="campaign-op" />
		</main>
	);
}

function PlaceholderFrame() {
	return <main data-testid="operator-placeholder">Trang nháp fixture</main>;
}

const rootRoute = createRootRoute({ component: Outlet });
const editorRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/campaigns/$campaignId/games/$campaignGameId",
	component: EditorFrame,
});
const distributionRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/campaigns/$campaignId/distribution",
	component: DistributionFrame,
});
// Navigation targets linked by the product chrome (context nav, launch cards).
// NOTE: "games/$campaignGameId" is the real editor route, not a stub.
const stubRoutes = ["", "games", "rewards"].map((path) =>
	createRoute({
		getParentRoute: () => rootRoute,
		path: `/campaigns/$campaignId/${path}`,
		component: PlaceholderFrame,
	}),
);
const analyticsRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/analytics",
	component: PlaceholderFrame,
});
const operateRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/operate/$campaignGameId",
	component: PlaceholderFrame,
});
const stationRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/station/$campaignGameId",
	component: PlaceholderFrame,
});

const routeParam =
	new URLSearchParams(window.location.search).get("route") ?? "editor";
const initialEntry =
	routeParam === "distribution"
		? "/campaigns/campaign-op/distribution"
		: routeParam === "scratch-editor"
			? "/campaigns/campaign-op/games/op-game-scratch"
			: routeParam === "slot-editor"
				? "/campaigns/campaign-op/games/op-game-slot"
				: "/campaigns/campaign-op/games/op-game-wheel";

const router = createRouter({
	routeTree: rootRoute.addChildren([
		editorRoute,
		distributionRoute,
		analyticsRoute,
		operateRoute,
		stationRoute,
		...stubRoutes,
	]),
	history: createMemoryHistory({ initialEntries: [initialEntry] }),
});

createRoot(document.getElementById("root")!).render(<RouterProvider router={router} />);
