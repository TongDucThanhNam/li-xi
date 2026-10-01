// Repo-owned analytics fixture entry: mounts the ACTUAL AnalyticsFeature
// (incl. RewardClaimsPanel) in a real TanStack Router tree whose pathless
// /_workspace layout provides the AdminPageShell aside host, with admin CSS
// and the synthetic convex/react replacement. The analytics search params
// come straight from the fixture page URL; no debug overlays, no stubbed
// product handlers.
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
import { useMemo, useState } from "react";
import { AnalyticsFeature } from "../../../app/_workspace/-features/AnalyticsFeature";
import { AdminWorkspaceContext } from "../../../app/components/AdminPageShell";
// Same processing as the operator fixture: real stylesheets + app @source
// scan, so all Tailwind utilities used by the mounted feature are generated.
import "./analytics-styles.css";

/**
 * Minimal stand-in for the real workspace layout: the only contract
 * AnalyticsFeature relies on is the AdminPageShell aside host context.
 */
function WorkspaceFrame() {
	const [asideHost, setAsideHost] = useState<HTMLDivElement | null>(null);
	const workspaceContext = useMemo(
		() => ({ asideHost, breadcrumbHost: null, setHasAside: () => {} }),
		[asideHost],
	);

	return (
		<AdminWorkspaceContext.Provider value={workspaceContext}>
			<div className="analytics-fixture-shell">
				<main data-testid="analytics-root">
					<Outlet />
				</main>
				<div className="admin-aside-host" data-testid="analytics-aside" ref={setAsideHost} />
			</div>
		</AdminWorkspaceContext.Provider>
	);
}

function AnalyticsFrame() {
	return <AnalyticsFeature />;
}

function PlaceholderFrame() {
	return <main data-testid="analytics-placeholder">Trang nháp fixture</main>;
}

const rootRoute = createRootRoute({ component: Outlet });
const workspaceLayoutRoute = createRoute({
	getParentRoute: () => rootRoute,
	id: "/_workspace",
	component: WorkspaceFrame,
});
const analyticsRoute = createRoute({
	getParentRoute: () => workspaceLayoutRoute,
	path: "/analytics",
	component: AnalyticsFrame,
});
// Navigation targets linked by the product chrome (breadcrumbs, scope aside,
// summary actions). NOTE: none of these are the route under test.
const stubRoutes = [
	"/campaigns",
	"/auth",
	"/settings/billing",
	"/operate/$campaignGameId",
].map((path) =>
	createRoute({
		getParentRoute: () => rootRoute,
		path,
		component: PlaceholderFrame,
	}),
);

// The fixture page URL's query string IS the analytics search state, so each
// test deep-links the exact view/campaign/filters under coverage.
const fixtureQuery = window.location.search;
const router = createRouter({
	routeTree: rootRoute.addChildren([workspaceLayoutRoute, analyticsRoute, ...stubRoutes]),
	history: createMemoryHistory({ initialEntries: [`/analytics${fixtureQuery}`] }),
});

createRoot(document.getElementById("root")!).render(<RouterProvider router={router} />);

if (typeof window !== "undefined") {
	// Memory history keeps the address bar pinned to the fixture page URL, so
	// tests assert the validated router search state instead.
	(window as unknown as Record<string, unknown>).__analyticsRouterState = () => ({
		pathname: router.state.location.pathname,
		search: router.state.location.search,
	});
}
