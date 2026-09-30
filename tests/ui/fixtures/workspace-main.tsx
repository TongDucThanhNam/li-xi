// Repo-owned workspace fixture entry: mounts the REAL workspace chrome —
// HeroUI Pro AppLayout, Sidebar, navbar, aside behavior via
// WorkspaceLayout — and the REAL feature modules in a memory-history
// TanStack router tree, backed by the synthetic convex/react replacement.
// The ?route= (and remaining query) parameters of the fixture page URL pick
// the deep-linked workspace route. No debug overlays, no stubbed product
// handlers, no fake chrome.
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
import { AnalyticsFeature } from "../../../app/_workspace/-features/AnalyticsFeature";
import { BillingSettingsFeature } from "../../../app/_workspace/-features/BillingSettingsFeature";
import { CampaignCreateFeature } from "../../../app/_workspace/-features/CampaignCreateFeature";
import { CampaignGameEditorFeature } from "../../../app/_workspace/-features/CampaignGameEditorFeature";
import { CampaignIndexFeature } from "../../../app/_workspace/-features/CampaignIndexFeature";
import { CampaignOverviewFeature } from "../../../app/_workspace/-features/CampaignOverviewFeature";
import { CampaignSectionFeature } from "../../../app/_workspace/-features/CampaignSectionFeature";
import { DistributionFeature } from "../../../app/_workspace/-features/DistributionFeature";
import { IntegrationsSettingsFeature } from "../../../app/_workspace/-features/IntegrationsSettingsFeature";
import { OnboardingFeature } from "../../../app/_workspace/-features/OnboardingFeature";
import { OperationsSettingsFeature } from "../../../app/_workspace/-features/OperationsSettingsFeature";
import { OperatorConsoleFeature } from "../../../app/_workspace/-features/OperatorConsoleFeature";
import { RewardsSetupFeature } from "../../../app/_workspace/-features/RewardsSetupFeature";
import { WorkspaceLayout } from "../../../app/_workspace/-components/WorkspaceLayout";
// Real admin/template stylesheets + app @source scan, so every Tailwind
// utility used by the mounted chrome and features is generated.
import "./workspace-styles.css";

type AnalyticsSearch = {
	campaign?: string;
	view: "overview" | "games" | "rewards" | "channels" | "claims";
	claimsStatus?: "pending" | "fulfilled";
	claimsChannel?: "public-link" | "station";
	claimsRewardType?: "cash" | "voucher" | "physical" | "points" | "none";
	claimsCode?: string;
};

// Same validation contract as app/_workspace/analytics.tsx so the fixture
// exercises the real validated search behavior.
const CLAIMS_STATUSES = ["pending", "fulfilled"] as const;
const CLAIMS_CHANNELS = ["public-link", "station"] as const;
const CLAIMS_REWARD_TYPES = ["cash", "voucher", "physical", "points", "none"] as const;

function validateAnalyticsSearch(search: Record<string, unknown>): AnalyticsSearch {
	return {
		campaign: typeof search.campaign === "string" && search.campaign.trim()
			? search.campaign.trim()
			: undefined,
		view: ["games", "rewards", "channels", "claims"].includes(String(search.view))
			? search.view as AnalyticsSearch["view"]
			: "overview",
		claimsStatus: CLAIMS_STATUSES.includes(search.claimsStatus as never)
			? search.claimsStatus as AnalyticsSearch["claimsStatus"]
			: undefined,
		claimsChannel: CLAIMS_CHANNELS.includes(search.claimsChannel as never)
			? search.claimsChannel as AnalyticsSearch["claimsChannel"]
			: undefined,
		claimsRewardType: CLAIMS_REWARD_TYPES.includes(search.claimsRewardType as never)
			? search.claimsRewardType as AnalyticsSearch["claimsRewardType"]
			: undefined,
		claimsCode: typeof search.claimsCode === "string" && search.claimsCode.trim()
			? search.claimsCode.trim().slice(0, 64)
			: undefined,
	};
}

const rootRoute = createRootRoute({ component: Outlet });
const workspaceLayoutRoute = createRoute({
	getParentRoute: () => rootRoute,
	id: "/_workspace",
	component: WorkspaceLayout,
});

const campaignsRoute = createRoute({
	getParentRoute: () => workspaceLayoutRoute,
	path: "/campaigns",
	component: CampaignIndexFeature,
});
const campaignNewRoute = createRoute({
	getParentRoute: () => workspaceLayoutRoute,
	path: "/campaigns/new",
	component: CampaignCreateFeature,
});
const campaignOverviewRoute = createRoute({
	getParentRoute: () => workspaceLayoutRoute,
	path: "/campaigns/$campaignId",
	component: function OverviewFrame() {
		const { campaignId } = campaignOverviewRoute.useParams();
		return <CampaignOverviewFeature key={campaignId} campaignId={campaignId} />;
	},
});
const campaignGamesRoute = createRoute({
	getParentRoute: () => workspaceLayoutRoute,
	path: "/campaigns/$campaignId/games",
	component: function GamesFrame() {
		const { campaignId } = campaignGamesRoute.useParams();
		return <CampaignSectionFeature key={campaignId} campaignId={campaignId} />;
	},
});
const campaignGameEditorRoute = createRoute({
	getParentRoute: () => workspaceLayoutRoute,
	path: "/campaigns/$campaignId/games/$campaignGameId",
	component: function EditorFrame() {
		const { campaignId, campaignGameId } = campaignGameEditorRoute.useParams();
		return (
			<CampaignGameEditorFeature
				key={`${campaignId}:${campaignGameId}`}
				campaignId={campaignId}
				campaignGameId={campaignGameId}
			/>
		);
	},
});
const campaignRewardsRoute = createRoute({
	getParentRoute: () => workspaceLayoutRoute,
	path: "/campaigns/$campaignId/rewards",
	component: function RewardsFrame() {
		const { campaignId } = campaignRewardsRoute.useParams();
		return <RewardsSetupFeature key={campaignId} campaignId={campaignId as never} />;
	},
});
const campaignDistributionRoute = createRoute({
	getParentRoute: () => workspaceLayoutRoute,
	path: "/campaigns/$campaignId/distribution",
	component: function DistributionFrame() {
		const { campaignId } = campaignDistributionRoute.useParams();
		return <DistributionFeature key={campaignId} campaignId={campaignId} />;
	},
});
const analyticsRoute = createRoute({
	validateSearch: validateAnalyticsSearch,
	getParentRoute: () => workspaceLayoutRoute,
	path: "/analytics",
	component: AnalyticsFeature,
});
const settingsBillingRoute = createRoute({
	getParentRoute: () => workspaceLayoutRoute,
	path: "/settings/billing",
	component: BillingSettingsFeature,
});
const settingsIntegrationsRoute = createRoute({
	getParentRoute: () => workspaceLayoutRoute,
	path: "/settings/integrations",
	component: IntegrationsSettingsFeature,
});
const settingsOperationsRoute = createRoute({
	getParentRoute: () => workspaceLayoutRoute,
	path: "/settings/operations",
	component: OperationsSettingsFeature,
});
const onboardingRoute = createRoute({
	getParentRoute: () => workspaceLayoutRoute,
	path: "/onboarding",
	component: OnboardingFeature,
});
const operateRoute = createRoute({
	getParentRoute: () => workspaceLayoutRoute,
	path: "/operate/$campaignGameId",
	component: function OperateFrame() {
		const { campaignGameId } = operateRoute.useParams();
		return <OperatorConsoleFeature key={campaignGameId} campaignGameId={campaignGameId} />;
	},
});
// Navigation targets linked by the product chrome but outside the fixture's
// coverage (auth redirect, station screen). NOTE: none of these is a route
// under test.
const authRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/auth",
	component: () => <main data-testid="workspace-placeholder">Trang nháp fixture</main>,
});
const stationRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/station/$campaignGameId",
	component: () => <main data-testid="workspace-placeholder">Trang nháp fixture</main>,
});

const router = createRouter({
	routeTree: rootRoute.addChildren([
		workspaceLayoutRoute.addChildren([
			campaignsRoute,
			campaignNewRoute,
			campaignOverviewRoute,
			campaignGamesRoute,
			campaignGameEditorRoute,
			campaignRewardsRoute,
			campaignDistributionRoute,
			analyticsRoute,
			settingsBillingRoute,
			settingsIntegrationsRoute,
			settingsOperationsRoute,
			onboardingRoute,
			operateRoute,
		]),
		authRoute,
		stationRoute,
	]),
	history: createMemoryHistory({ initialEntries: [initialEntry()] }),
});

function initialEntry(): string {
	const params = new URLSearchParams(window.location.search);
	const routeKey = params.get("route") ?? "campaigns";
	const gameParam = params.get("game");
	params.delete("route");
	params.delete("game");
	const rest = params.toString();
	const suffix = rest ? `?${rest}` : "";
	const paths: Record<string, string> = {
		campaigns: "/campaigns",
		"campaigns-new": "/campaigns/new",
		overview: "/campaigns/campaign-a",
		games: "/campaigns/campaign-a/games",
		rewards: "/campaigns/campaign-a/rewards",
		distribution: "/campaigns/campaign-a/distribution",
		analytics: "/analytics",
		"settings-billing": "/settings/billing",
		"settings-integrations": "/settings/integrations",
		"settings-operations": "/settings/operations",
		onboarding: "/onboarding",
	};
	if (routeKey === "editor") {
		return `/campaigns/campaign-a/games/${gameParam ?? "wf-game-wheel"}${suffix}`;
	}
	if (routeKey === "operate") {
		return `/operate/${gameParam ?? "wf-game-lunar"}${suffix}`;
	}
	return (paths[routeKey] ?? "/campaigns") + suffix;
}

createRoot(document.getElementById("root")!).render(<RouterProvider router={router} />);

if (typeof window !== "undefined") {
	// Memory history keeps the address bar pinned to the fixture page URL, so
	// tests assert the validated router state instead.
	(window as unknown as Record<string, unknown>).__workspaceRouterState = () => ({
		pathname: router.state.location.pathname,
		search: router.state.location.search,
	});
}
