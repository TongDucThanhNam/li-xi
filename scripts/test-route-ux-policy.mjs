#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const walk = (directory) => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const path = `${directory}/${entry.name}`;
  return entry.isDirectory() ? walk(path) : [path];
});

const routeTree = read("routeTree.gen.ts");
const contract = read("docs/route-ux-standardization.md");
const packageJson = JSON.parse(read("package.json"));
const requiredRoutes = [
  "/", "/auth", "/onboarding", "/campaigns", "/campaigns/new",
  "/campaigns/$campaignId", "/campaigns/$campaignId/games",
  "/campaigns/$campaignId/games/$campaignGameId",
  "/campaigns/$campaignId/rewards", "/campaigns/$campaignId/distribution",
  "/analytics", "/settings/billing", "/settings/integrations",
  "/settings/operations", "/operate/$campaignGameId",
  "/station/$campaignGameId", "/play/$publicCode", "/p/$shareCode", "/setup",
  "/leaderboard", "/draw", "/claim/$publicCode",
];
const removedDrawHostComponents = [
  "app/draw/components/BudgetBar.tsx",
  "app/draw/components/CreateSessionPanel.tsx",
  "app/draw/components/HostHeader.tsx",
  "app/draw/components/HostShell.tsx",
  "app/draw/components/InventoryList.tsx",
  "app/draw/components/RecentRedemptions.tsx",
  "app/draw/components/ResultSummary.tsx",
];

for (const path of removedDrawHostComponents) {
  assert(!existsSync(path), "Legacy draw host implementation must remain removed: " + path);
}

for (const path of walk("app").filter((candidate) => candidate.endsWith(".tsx"))) {
  const source = read(path);
  const itemCardGroups = source.match(/<ItemCardGroup\b[\s\S]*?>/g) ?? [];
  const iconOnlyButtons = source
    .match(/<Button\b[\s\S]*?>/g)
    ?.filter((openingTag) => openingTag.includes("isIconOnly")) ?? [];
  const tabLists = source.match(/<Tabs\.List\b[\s\S]*?>/g) ?? [];
  const dataGrids = source.match(/<DataGrid\b[\s\S]*?>/g) ?? [];
  assert(
    itemCardGroups.every((openingTag) => openingTag.includes("aria-label=") || openingTag.includes("aria-labelledby=")),
    `${path} contains an ItemCardGroup without an accessible name`,
  );
  assert(
    iconOnlyButtons.every(
      (openingTag) => openingTag.includes("aria-label=") || openingTag.includes("aria-labelledby="),
    ),
    `${path} contains an icon-only Button without an accessible name`,
  );
  assert(
    tabLists.every((openingTag) => openingTag.includes("aria-label=") || openingTag.includes("aria-labelledby=")),
    `${path} contains a Tabs.List without an accessible name`,
  );
  assert(
    dataGrids.every((openingTag) => openingTag.includes("aria-label=") || openingTag.includes("aria-labelledby=")),
    `${path} contains a DataGrid without an accessible name`,
  );
}

for (const route of requiredRoutes) {
  assert(
    routeTree.includes("'" + route + "'") || routeTree.includes('"' + route + '"'),
    "Generated route tree is missing " + route,
  );
  assert(contract.includes(route), "Route contract is missing " + route);
}

const requiredSources = [
  "app/_workspace.tsx",
  "app/_workspace/-components/WorkspaceLayout.tsx",
  "app/_workspace/campaigns/$campaignId/route.tsx",
  "app/_workspace/campaigns/$campaignId/games/$campaignGameId.tsx",
  "app/_workspace/analytics.tsx",
  "app/_workspace/operate/$campaignGameId.tsx",
  "app/station/$campaignGameId.tsx",
  "app/play/$publicCode.tsx",
  "app/p/$shareCode.tsx",
];
for (const source of requiredSources) {
  assert(existsSync(source), "Required route boundary is missing: " + source);
}
for (const source of [
  "app/index.tsx",
  "app/auth.tsx",
  "app/_workspace/onboarding.tsx",
  "app/_workspace/campaigns/index.tsx",
  "app/_workspace/campaigns/new.tsx",
  "app/_workspace/campaigns/$campaignId/index.tsx",
  "app/_workspace/campaigns/$campaignId/games/index.tsx",
  "app/_workspace/campaigns/$campaignId/games/$campaignGameId.tsx",
  "app/_workspace/campaigns/$campaignId/rewards.tsx",
  "app/_workspace/campaigns/$campaignId/distribution.tsx",
  "app/_workspace/analytics.tsx",
  "app/_workspace/settings/billing.tsx",
  "app/_workspace/settings/integrations.tsx",
  "app/_workspace/settings/operations.tsx",
  "app/_workspace/operate/$campaignGameId.tsx",
  "app/station/$campaignGameId.tsx",
  "app/play/$publicCode.tsx",
  "app/p/$shareCode.tsx",
]) {
  const routeSource = read(source);
  assert(
    routeSource.includes("{ title:") && routeSource.includes('name: "description"'),
    "Canonical leaf route must define route-specific title and description metadata: " + source,
  );
}

const workspace = read("app/_workspace/-components/WorkspaceLayout.tsx");
const workspaceRoute = read("app/_workspace.tsx");
const workspaceRouteStates = read("app/_workspace/-components/WorkspaceRouteStates.tsx");
const adminPageShell = read("app/components/AdminPageShell.tsx");
const adminCss = read("app/styles/admin.css");
const standaloneAdminRouteError = read("app/-auth/StandaloneAdminRouteError.tsx");
const authFeature = read("app/-auth/AuthFeature.tsx");
assert(workspace.includes("AppLayout"), "Workspace must own one HeroUI Pro AppLayout");
assert(
  workspace.includes("useConvexAuth") &&
    workspace.includes("!isLoading && !isAuthenticated") &&
    workspace.includes('navigate({ to: "/auth", replace: true })') &&
    workspace.includes("return <WorkspacePending />"),
  "Workspace hydration must wait for live Convex Auth and redirect unauthenticated direct loads before mounting child routes",
);
assert(
  workspace.includes("useHostLogout") &&
    !walk("app/_workspace/-features")
      .filter((candidate) => candidate.endsWith(".tsx"))
      .some((candidate) => read(candidate).includes("useHostLogout")),
  "Workspace layout must be the single owner of logout behavior",
);
assert(
  workspace.includes("<AppLayout.AsideTrigger") &&
    workspace.includes("AdminWorkspaceContext.Provider") &&
    workspace.includes("WorkspaceMobileAside") &&
    workspace.includes('aria-label="Ngữ cảnh trang"') &&
    workspace.includes('aria-label="Đóng ngữ cảnh trang"') &&
    workspace.includes("if (!isMobile) return null;"),
  "Contextual page tooling must use the desktop AppLayout aside and the localized mobile sheet",
);
assert(
  workspace.includes("WorkspaceMobileSidebar") &&
    workspace.includes('aria-label="Điều hướng không gian làm việc"') &&
    workspace.includes('aria-label="Đóng điều hướng"') &&
    workspace.includes('aria-label="Thu gọn hoặc mở rộng điều hướng"') &&
    workspace.includes("isDismissable={false}") &&
    !workspace.includes("<Sidebar.Mobile"),
  "Workspace mobile navigation must use one named, non-dismissable sheet and localized controls",
);
assert(
  workspace.includes('<Sidebar.Menu aria-label="Điều hướng không gian làm việc"'),
  "Workspace sidebar menu must have an accessible name",
);
assert(
  !authFeature.includes("Stepper") &&
    !authFeature.includes("ProgressCircle") &&
    !authFeature.includes("ItemCardGroup") &&
    authFeature.includes('aria-live="polite"') &&
    authFeature.includes("Tiếp tục với Google"),
  "Sign-in must stay one focused action with a polite status line and no display-only progress widgets",
);
assert(
  workspace.includes("WorkspacePlanCard") &&
    read("app/__root.tsx").includes("notFoundComponent: StandaloneNotFound"),
  "The sidebar must surface the plan card and unknown URLs must render the standalone not-found page",
);
assert(workspace.includes("Outlet"), "Workspace must render nested routes through Outlet");
assert(
  workspaceRoute.includes("errorComponent: WorkspaceRouteError") &&
    workspaceRoute.includes("notFoundComponent: WorkspaceNotFound") &&
    workspaceRoute.includes("pendingComponent: WorkspacePending") &&
    workspaceRouteStates.includes("Thử lại") &&
    workspaceRouteStates.includes("Quay lại chiến dịch"),
  "Workspace must own shared pending, error, not-found, and recovery states",
);
assert(
  adminPageShell.includes('aria-label="Đường dẫn trang"') &&
    adminPageShell.includes("document.title = `${title} | Campaign Game Studio`") &&
    adminPageShell.includes('aria-label="Ngữ cảnh trang"') &&
    adminPageShell.includes("createPortal"),
  "Shared workspace pages must expose breadcrumbs and route-derived document titles",
);
assert(
  !adminPageShell.includes("eyebrow") &&
    adminPageShell.includes("breadcrumbHost") &&
    adminPageShell.includes('data-sticky={stickyHeader ? "true" : undefined}'),
  "The shared page shell must not render an eyebrow row, must host the breadcrumb in the navbar, and must support the sticky save header",
);
const campaignContextNav = read("app/_workspace/-components/CampaignContextNav.tsx");
const settingsContextNav = read("app/_workspace/-components/SettingsContextNav.tsx");
assert(
  campaignContextNav.includes('className="admin-tabs"') &&
    campaignContextNav.includes("admin-tabs__link--away") &&
    settingsContextNav.includes('className="admin-tabs"') &&
    workspace.includes("breadcrumbHost"),
  "Context navigation must use the shared underline-tab classes and the navbar must expose the breadcrumb host",
);
for (const stickySaveFeature of [
  "app/_workspace/-features/CampaignSettingsFeature.tsx",
  "app/_workspace/-features/CampaignGameEditorFeature.tsx",
]) {
  const source = read(stickySaveFeature);
  assert(
    source.includes("AdminSaveStatus") &&
      source.includes("stickyHeader") &&
      !source.includes('className="mb-4 text-sm text-warning"'),
    "Header-save forms must keep one save status in the sticky header: " + stickySaveFeature,
  );
}
for (const source of [
  "app/index.tsx",
  "app/auth.tsx",
  "app/setup.tsx",
  "app/draw.tsx",
]) {
  assert(
    read(source).includes("errorComponent: StandaloneAdminRouteError"),
    "Standalone admin route must use the shared recoverable error state: " + source,
  );
}
assert(
  standaloneAdminRouteError.includes("Không thể mở trang") &&
    standaloneAdminRouteError.includes("Thử lại") &&
    standaloneAdminRouteError.includes("reset"),
  "Standalone admin error state must expose a useful retry action",
);
for (const source of ["app/setup.tsx", "app/draw.tsx"]) {
  const compatibilitySource = read(source);
  assert(
    compatibilitySource.includes("admin.css?url"),
    "Direct-loaded admin compatibility route must load the admin stylesheet: " + source,
  );
  assert(
    compatibilitySource.includes("useConvexAuth") &&
      compatibilitySource.includes("!isLoading && !isAuthenticated") &&
      compatibilitySource.includes('navigate({ to: "/auth", replace: true })') &&
      compatibilitySource.includes('"skip"'),
    "Direct-loaded admin compatibility route must wait for live Convex Auth before protected queries: " + source,
  );
}
assert(
  adminCss.includes(".admin-page__actions") &&
    !/\.admin-page__actions\s*\{[^}]*\bhidden\b/.test(adminCss),
  "Primary page actions must remain available on mobile from one semantic source",
);

const play = read("app/play/$publicCode.tsx");
const claim = read("app/claim/$publicCode.tsx");
const station = read("app/station/$campaignGameId.tsx");
for (const [name, source] of [["play", play], ["station", station]]) {
  assert(!source.includes("AdminPageShell"), name + " must not import the admin shell");
  assert(
    source.includes("game-templates") || source.includes("gameTemplates"),
    name + " must use the game-template boundary",
  );
}
assert(!play.includes("useOwnerSession"), "Public play must remain unauthenticated");
assert(
  play.includes("PublicPlayFeature") &&
    claim.includes("PublicPlayFeature") &&
    play.includes('key={publicCode}') &&
    claim.includes('key={publicCode}') &&
    play.includes('{ title: "Chơi | Campaign Game Studio" }') &&
    claim.includes('{ title: "Chơi | Campaign Game Studio" }'),
  "Canonical /play and legacy /claim must reuse the same remounted public-play implementation",
);
assert(
  play.includes("key={publicCode}") &&
    claim.includes("key={publicCode}") &&
    station.includes("key={campaignGameId}") &&
    read("app/_workspace/operate/$campaignGameId.tsx").includes("key={campaignGameId}") &&
    read("app/_workspace/campaigns/$campaignId/games/$campaignGameId.tsx").includes('key={`${campaignId}:${campaignGameId}`}'),
  "Stateful dynamic route features must remount when their URL identity changes",
);

const campaignIndex = read("app/_workspace/campaigns/index.tsx");
const campaignCreate = read("app/_workspace/campaigns/new.tsx");
const campaignGamesParent = read("app/_workspace/campaigns/$campaignId/games.tsx");
const campaignGamesIndex = read("app/_workspace/campaigns/$campaignId/games/index.tsx");
const gameEditorRoute = read("app/_workspace/campaigns/$campaignId/games/$campaignGameId.tsx");
const gameEditorFeature = read("app/_workspace/-features/CampaignGameEditorFeature.tsx");
const campaignOverviewFeature = read("app/_workspace/-features/CampaignOverviewFeature.tsx");
const campaignSettingsFeature = read("app/_workspace/-features/CampaignSettingsFeature.tsx");
const campaignCreateFeature = read("app/_workspace/-features/CampaignCreateFeature.tsx");
const campaignSectionFeature = read("app/_workspace/-features/CampaignSectionFeature.tsx");
const distributionFeature = read("app/_workspace/-features/DistributionFeature.tsx");
const stationFeature = read("app/station/-features/StationPlayFeature.tsx");
const stationPinDialog = read("app/station/-features/StationPinDialog.tsx");
const stationSelfServePlay = read("app/station/-features/StationSelfServePlay.tsx");
const stationShellCss = read("app/styles/station.css");
const publicPlayFeature = read("app/play/-features/PublicPlayFeature.tsx");
const gameRouteError = read("app/game-templates/GameRouteError.tsx");
const templateRegistry = read("app/game-templates/registry.ts");
const templateTypes = read("app/game-templates/types.ts");
const unsavedChangesGuard = read("app/_workspace/-components/UnsavedChangesGuard.tsx");
const playSessions = read("convex/playSessions.ts");
const publicAppUrl = read("lib/publicAppUrl.ts");
const operatorFeature = read("app/_workspace/-features/OperatorConsoleFeature.tsx");
assert(
  campaignIndex.includes("CampaignIndexFeature") && !campaignIndex.includes("CampaignsFeature"),
  "Campaign index must remain list-only instead of selecting campaign context in local state",
);
assert(
  campaignCreate.includes("CampaignCreateFeature") && !campaignCreate.includes("CampaignsFeature"),
  "Campaign creation must own a dedicated URL-addressed form",
);
assert(
  campaignGamesParent.includes("<Outlet />") &&
    !campaignGamesParent.includes("CampaignSectionFeature") &&
    campaignGamesIndex.includes("CampaignSectionFeature"),
  "Campaign games must keep the collection on the index route so game-editor deep links render their child outlet",
);
assert(
  gameEditorRoute.includes("CampaignGameEditorFeature") &&
  gameEditorFeature.includes("template.ConfigEditor") &&
    templateRegistry.includes("ConfigEditor: LiXiGameConfigEditor") &&
    templateRegistry.includes("normalizeConfig: (config)") &&
    templateRegistry.includes("isLuckyWheelGameConfig") &&
    templateRegistry.includes('"lucky-wheel"') &&
    templateRegistry.includes("PlayStage") &&
    templateRegistry.includes("toLegacyCampaignPresentation") &&
    templateTypes.includes("initialCampaign: CampaignGameConfig") &&
    templateTypes.includes("GamePlayStageProps") &&
    !gameEditorFeature.includes("buildLiXiGameConfig") &&
    !campaignCreateFeature.includes("buildLiXiGameConfig") &&
    !campaignCreateFeature.includes("@/app/game-templates/registry") &&
    campaignCreateFeature.includes("initialCampaignConfig") &&
    campaignCreateFeature.includes('useState<GameTemplateId>("li-xi")') &&
    !gameEditorFeature.includes("JSON.stringify(context.campaignGame.config, null, 2)"),
  "Campaign-game routes must delegate editing, normalization, initial config, and legacy projection to a real two-template registry with a generic play-stage contract",
);
const configEditors = [
  "app/game-templates/li-xi/LiXiGameConfigEditor.tsx",
  "app/game-templates/lucky-wheel/LuckyWheelConfigEditor.tsx",
  "app/game-templates/scratch-card/ScratchCardConfigEditor.tsx",
  "app/game-templates/slot-reveal/SlotRevealConfigEditor.tsx",
  "app/game-templates/quiz/QuizConfigEditor.tsx",
].map(read);
assert(
  gameEditorFeature.includes("GamePreviewFrame") &&
    gameEditorFeature.includes("admin-split admin-split--preview") &&
    gameEditorFeature.includes("admin-split__side") &&
    configEditors.every((editor) => editor.includes("AdminDisclosure")),
  "The game editor must keep the live preview in its own split side column via GamePreviewFrame (never the AppLayout aside), and every config editor must fold its rarely changed fields behind AdminDisclosure",
);
assert(
  configEditors.every((editor) => editor.includes('section === "content"')),
  "Every config editor must split its rule widgets from its guest-copy widget behind the section contract",
);
assert(
  campaignSectionFeature.includes("admin-game-card") &&
    campaignSectionFeature.includes("GamePreviewFrame") &&
    campaignSectionFeature.includes("resolveEffectiveGameStatus") &&
    campaignSectionFeature.includes("getCampaignGameBreakdown") &&
    !campaignSectionFeature.includes("CampaignGameRow"),
  "Games tab must show each game as a preview card with computed status and metrics",
);
assert(
  gameEditorFeature.includes('section="rules"') &&
    gameEditorFeature.includes('section="content"') &&
    gameEditorFeature.includes("Tabs.Panel") &&
    gameEditorFeature.includes("GameStatusChip"),
  "Game editor must split setup, content and media into tabs and show the computed status",
);
assert(
  campaignSectionFeature.includes("api.campaignGames.createCampaignGame") &&
    campaignSectionFeature.includes("gameTemplateCatalog") &&
    !campaignSectionFeature.includes("Sắp có"),
  "Campaign games list must offer a working add-game flow through the template catalog instead of a placeholder",
);
assert(
  gameEditorFeature.includes("UnsavedChangesGuard") &&
    campaignSettingsFeature.includes("UnsavedChangesGuard") &&
    unsavedChangesGuard.includes("useBlocker") &&
    unsavedChangesGuard.includes("enableBeforeUnload") &&
    unsavedChangesGuard.includes("<AlertDialog.Backdrop isOpen") &&
    unsavedChangesGuard.includes("returnFocusRef") &&
    unsavedChangesGuard.includes("blocker.reset?.()") &&
    unsavedChangesGuard.includes("autoFocus") &&
    unsavedChangesGuard.includes("Lưu và rời trang") &&
    unsavedChangesGuard.includes("Bỏ thay đổi") &&
    campaignCreateFeature.includes("UnsavedChangesGuard") &&
    campaignCreateFeature.includes('status !== "draft"'),
  "Editable canonical routes must expose unsaved-change protection",
);
const campaignRoutes = read("convex/campaigns.ts");
assert(
  campaignRoutes.includes('ctx.db.normalizeId("campaigns", args.campaignId)') &&
    campaignRoutes.includes('ctx.db.normalizeId("campaignGames", args.campaignGameId)') &&
    (campaignRoutes.match(/if \(!campaignId\)\s*\{\s*return null;/g) ?? []).length >= 2 &&
    /if \(!campaignGameId\)\s*\{\s*return null;/.test(campaignRoutes),
  "Route identity queries must normalize malformed strings and fail closed before owner authorization",
);
assert(
  campaignSettingsFeature.includes("loadedCampaignId") &&
    gameEditorFeature.includes("loadedCampaignGameId"),
  "Route-addressed editors must reset their draft state when browser history changes route identity",
);
assert(
  campaignSectionFeature.includes("getCampaignGamesRouteContext") &&
    campaignSectionFeature.includes("ensureCampaignGameForRoute") &&
    campaignSectionFeature.includes("campaignGames.map") &&
    campaignSectionFeature.includes('campaign.status === "active"') &&
    campaignSectionFeature.includes("Đã lưu trữ") &&
    campaignSectionFeature.includes("Thêm trò chơi") &&
    !campaignSectionFeature.includes("campaign.campaignGame") &&
    read("convex/campaigns.ts").includes("getCampaignGamesRouteContext") &&
    read("convex/campaigns.ts").includes("ensureCampaignGameForRoute"),
  "Campaign games must render an authorized collection, materialize legacy defaults, and expose future template expansion",
);
assert(
  campaignOverviewFeature.includes("<CampaignOverviewSummary") &&
    read("app/_workspace/-features/CampaignOverviewSummary.tsx").includes("LaunchChecklist") &&
    read("app/_workspace/-features/CampaignOverviewSummary.tsx").includes("PerformanceSummary") &&
    !campaignOverviewFeature.includes("saveCampaign"),
  "Campaign overview must be a dashboard (launch checklist, funnel, game performance) with settings on their own route",
);
assert(
  campaignSectionFeature.includes("<GameTemplatePicker") &&
    campaignSectionFeature.includes("Modal.Backdrop") &&
    !campaignSectionFeature.includes("add-game-template"),
  "Campaign games list must add games through the template-picker dialog instead of an always-open form",
);
assert(
  campaignCreateFeature.includes("<AdminDisclosure") &&
    campaignCreateFeature.includes("<GameTemplatePicker") &&
    read("app/components/AdminDisclosure.tsx").includes("Disclosure.Heading"),
  "Campaign create must pick the first template through the shared picker and keep optional brand identity behind the shared disclosure",
);
assert(
  read("app/_workspace/campaigns/$campaignId/distribution.tsx").includes("DistributionFeature") &&
    distributionFeature.includes("api.draw.getStationState") &&
    distributionFeature.includes("pendingLinkSessions") &&
    distributionFeature.includes("QRCodeSVG") &&
    distributionFeature.includes("buildPublicPlayUrl") &&
    distributionFeature.includes("navigator.clipboard.writeText"),
  "Distribution must expose authorized channel state, canonical public links, QR codes, and share actions",
);
const shareLinksPanel = read("app/_workspace/-features/ShareLinksPanel.tsx");
assert(
  shareLinksPanel.includes("api.shareLinks.listShareLinks") &&
    shareLinksPanel.includes("api.shareLinks.createShareLink") &&
    shareLinksPanel.includes("api.shareLinks.revokeShareLink") &&
    shareLinksPanel.includes("api.shareLinks.restoreShareLink") &&
    shareLinksPanel.includes("buildShareEntryUrlForCode") &&
    distributionFeature.includes("ShareLinksPanel"),
  "Distribution must manage reusable public entry links with create, copy, QR, revoke, and restore actions",
);
assert(
  shareLinksPanel.includes("<Modal") &&
    shareLinksPanel.includes("api.analytics.getCampaignShareLinkBreakdown") &&
    shareLinksPanel.includes("admin-link-row"),
  "Distribution must list share links as objects with per-link results and create links from a dialog",
);
const publicShareEntry = read("app/play/-features/PublicShareEntryFeature.tsx");
const shareEntryRoute = read("app/p/$shareCode.tsx");
assert(
  !shareEntryRoute.includes("AdminPageShell") &&
    shareEntryRoute.includes("game-templates") &&
    shareEntryRoute.includes("PublicShareEntryFeature") &&
    shareEntryRoute.includes('key={shareCode}') &&
    !publicShareEntry.includes("useOwnerSession") &&
    !publicShareEntry.includes("AdminPageShell") &&
    publicShareEntry.includes("requireGameTemplate") &&
    publicShareEntry.includes(".EntryHero") &&
    publicShareEntry.includes("startPublicPlaySession") &&
    publicShareEntry.includes("getPublicSessionOutcome") &&
    publicShareEntry.includes("getPublicClaimDetail") &&
    publicShareEntry.includes("playSessionAction") &&
    publicShareEntry.includes("claimPublicReward") &&
    publicShareEntry.includes("recordShareEntryOpen") &&
    publicShareEntry.includes("normalizePublicShareCode") &&
    publicShareEntry.includes("takeStartKey"),
  "The reusable /p entry must be a public, unauthenticated, template-resolved self-serve flow: template-owned hero and stage, persisted start key and session capability, recovered outcome/claim, and open metrics on one stable key",
);
assert(
  operatorFeature.includes('templateId !== "li-xi"') &&
    operatorFeature.includes("supportsSelfServeStationGame") &&
    stationFeature.includes('templateId === "li-xi"') &&
    stationFeature.includes("legacyLiXiStation") &&
    stationFeature.includes("supportsSelfServeStationGame") &&
    stationFeature.includes("StationSelfServePlay"),
  "Operator console fails over to the station launch card for self-serve-station games and keeps the notice for other templates; the station shell routes the legacy li-xi draw flow and capability-gated self-serve-station templates while everything else fails closed",
);
const analyticsRoute = read("app/_workspace/analytics.tsx");
for (const view of ["overview", "games", "rewards", "channels", "claims"]) {
  assert(analyticsRoute.includes('"' + view + '"'), "Analytics search must validate canonical view: " + view);
}
// Claims-view filter params are validated search state like the rest of the
// route-ux contract, not ad-hoc component state.
for (const claimParam of ["claimsStatus", "claimsChannel", "claimsRewardType", "claimsCode"]) {
  assert(analyticsRoute.includes(claimParam), "Analytics search must validate claims filter: " + claimParam);
}
const analyticsFeature = read("app/_workspace/-features/AnalyticsFeature.tsx");
assert(
  analyticsFeature.includes("api.analytics.getOwnerAnalytics") &&
    analyticsFeature.includes("api.analytics.getCampaignAnalytics") &&
    analyticsFeature.includes('search.view === "games"') &&
    analyticsFeature.includes('search.view === "rewards"') &&
    analyticsFeature.includes('search.view === "channels"') &&
    analyticsFeature.includes("channelSharePerformance.publicPlayLinkOpens"),
  "Each canonical analytics view must render URL-selected, scope-aware content instead of changing only the selected tab",
);
assert(
  analyticsFeature.includes('search.view === "claims"') &&
    analyticsFeature.includes("RewardClaimsPanel"),
  "The claims view must render the URL-selected reward claims queue component",
);
assert(
  read("app/_workspace/-features/RewardClaimsPanel.tsx").includes("api.rewardClaims.listRewardClaims") &&
    read("app/_workspace/-features/RewardClaimsPanel.tsx").includes("maskedCode"),
  "The claims queue must read the campaign-scoped claims query and show masked codes by default",
);
assert(
  analyticsFeature.includes('to="/operate/$campaignGameId"') &&
    !analyticsFeature.includes('to: "/draw"') &&
    !analyticsFeature.includes('onPress={() => void navigate({ to: "/campaigns" })'),
  "Analytics navigation must use contextual links instead of action buttons or the implicit draw alias",
);
assert(
  analyticsFeature.includes("requestedCampaignId") &&
    analyticsFeature.includes("selectedCampaign?.id ?? null") &&
    analyticsFeature.includes("invalidCampaignScope") &&
    !analyticsFeature.includes('search.campaign as Id<"campaigns">'),
  "Analytics must resolve a URL campaign against the authorized workspace before querying campaign data",
);
assert(
  !analyticsFeature.includes('eyebrow="Phân tích"') &&
    !analyticsFeature.includes('"hit"') &&
    !analyticsFeature.includes('"none"') &&
    !analyticsFeature.includes("Rank #"),
  "Analytics must avoid duplicated page context and English KPI trend labels",
);
// "<BarChart " (trailing space) matches the removed recharts axis chart's JSX
// opening tag while keeping the BarChart3 lucide icon of the rarity empty
// state, which the redesign explicitly keeps.
assert(
  analyticsFeature.includes("<PerformanceSummary") &&
    analyticsFeature.includes("<ShareBars") &&
    analyticsFeature.includes("<RateBar") &&
    !analyticsFeature.includes("<BarChart ") &&
    read("app/_workspace/-features/CampaignOverviewSummary.tsx").includes("<PerformanceSummary"),
  "Analytics must lead with the conversion funnel and draw ratios as bars (share bars, rate bars), not axis charts or repeated stat rows",
);
assert(
  !read("app/styles/admin.css").includes("admin-kpi-strip") &&
    !read("app/styles/admin.css").includes("admin-command-summary"),
  "Workspace analytics must report through stats rows instead of the removed KPI strip and summary widgets",
);
assert(
  stationFeature.includes("Không thể mở trạm chơi") &&
    stationPinDialog.includes('role="dialog"') &&
    stationPinDialog.includes('aria-modal="true"') &&
    stationFeature.includes("exitTriggerRef.current?.focus()") &&
    stationPinDialog.includes('event.key === "Escape"') &&
    stationPinDialog.includes('event.key !== "Tab"'),
  "Station mode must fail closed for invalid route identity and provide modal keyboard/focus semantics",
);
assert(
  station.includes("stationShellCssHref") &&
    station.includes("stationCssLayers") &&
    !station.includes("admin.css"),
  "Station route must ship the shell-owned station.css plus the registry's station-capable template layers and never the admin stylesheet",
);
assert(
  templateRegistry.includes('import stationCss from "@/app/styles/station.css?url"') &&
    templateRegistry.includes("export const stationShellCssHref = stationCss") &&
    templateRegistry.includes("export function stationCssLayers()") &&
    templateRegistry.includes('template.stationMode !== "public-self-serve"'),
  "Game-template registry must own the station shell stylesheet and the ordered station-capable CSS layer list",
);
assert(
  stationShellCss.includes(".station-shell") &&
    stationShellCss.includes(".station-exit-trigger") &&
    stationShellCss.includes(".station-overlay") &&
    stationShellCss.includes(".station-dialog") &&
    stationShellCss.includes(".station-status") &&
    stationShellCss.includes(".station-recovery") &&
    stationShellCss.includes('.station-shell[data-template="lucky-wheel"]') &&
    stationShellCss.includes('.station-shell[data-template="scratch-card"]'),
  "Station shell chrome must be styled by the shell-owned station.css with per-template token variables",
);
assert(
  stationSelfServePlay.includes("api.stationPlay.acknowledgeStationPlayResult") &&
    stationSelfServePlay.includes("api.stationPlay.dismissStationPlayResult") &&
    stationSelfServePlay.includes("StationPinDialog") &&
    stationSelfServePlay.includes("canStart: !blocked && !recovery") &&
    stationSelfServePlay.includes("Có phần thưởng chưa nhận") &&
    !stationSelfServePlay.includes("localStorage") &&
    !stationSelfServePlay.includes("sessionStorage"),
  "Station self-serve flow must resolve recoverable results through the owner-authorized query with a shared PIN dialog, keep Start blocked while a result pends, and never persist the capability to web storage",
);
assert(
  publicPlayFeature.includes('role="status"') &&
    publicPlayFeature.includes('aria-live="polite"') &&
    publicPlayFeature.includes('role="alert"') &&
    publicPlayFeature.includes('aria-live="assertive"'),
  "Public play must announce loading and redemption errors to assistive technology",
);
assert(
  publicPlayFeature.includes("@/app/game-templates/registry") &&
    publicPlayFeature.includes("visibleSession.gameTemplateId") &&
    !publicPlayFeature.includes("@/app/draw/templates/registry"),
  "Public play must resolve its stage directly from the canonical game-template registry",
);
assert(
  play.includes("errorComponent: GameRouteError") &&
    claim.includes("errorComponent: GameRouteError") &&
    station.includes("errorComponent: StationRouteError") &&
    gameRouteError.includes("Không thể tải trò chơi") &&
    gameRouteError.includes("Thử lại") &&
    gameRouteError.includes("reset"),
  "Public, compatibility, and station game routes must share a template-themed recoverable error state",
);
assert(
  stationFeature.includes('<Link') &&
    stationFeature.includes('to="/campaigns"') &&
    !stationFeature.includes('onClick={() => void navigate({ to: "/campaigns"'),
  "Station recovery must use a navigable link instead of an action button",
);
assert(
  operatorFeature.includes("station === undefined") &&
    operatorFeature.includes("Đang tải trạng thái vận hành") &&
    operatorFeature.includes("station.hasSetup") &&
    operatorFeature.includes("Trò chơi chưa hoạt động") &&
    operatorFeature.includes('game.campaign.status !== "active"') &&
    operatorFeature.includes('game.campaignGame.status !== "active"'),
  "Operator console must keep station-dependent actions pending until authorized station state resolves",
);
assert(
  operatorFeature.includes("<AlertDialog"),
  "Operator console must confirm link cancellation through the shared alert dialog instead of an instant destructive action",
);
assert(
  stationFeature.includes("Trạm chơi chưa hoạt động") &&
    stationFeature.includes('context.campaign.status !== "active"') &&
    stationFeature.includes('context.campaignGame.status !== "active"'),
  "Station mode must fail closed before loading operational state for inactive games",
);
assert(
  read("app/leaderboard.tsx").includes('view: "rewards"'),
  "Leaderboard compatibility must translate into the canonical rewards analytics view",
);
assert(
  playSessions.includes("return `/play/${publicCode}`") &&
    publicAppUrl.includes("export function buildPublicPlayUrl") &&
    operatorFeature.includes("buildPublicPlayUrl(result.publicPlayPath)") &&
    !playSessions.includes("return `/claim/${publicCode}`"),
  "New host-generated share links must use the canonical /play path",
);
assert(
  !read("app/_workspace/-features/RewardsSetupFeature.tsx").includes("api.auth.setHostPin") &&
    read("app/_workspace/-features/OperationsSettingsFeature.tsx").includes("api.auth.setHostPin"),
  "Account Host PIN must remain in operations settings instead of campaign reward inventory",
);
const rewardsFeature = read("app/_workspace/-features/RewardsSetupFeature.tsx");
const onboardingFeature = read("app/_workspace/-features/OnboardingFeature.tsx");
const billingFeature = read("app/_workspace/-features/BillingSettingsFeature.tsx");
const billingPolicy = read("lib/billingPolicy.ts");
const publicAppUrlSource = read("lib/publicAppUrl.ts");
const settingsNavigation = read("app/_workspace/-components/SettingsContextNav.tsx");
for (const settingsFeature of [
  billingFeature,
  read("app/_workspace/-features/IntegrationsSettingsFeature.tsx"),
  read("app/_workspace/-features/OperationsSettingsFeature.tsx"),
]) {
  assert(
    settingsFeature.includes("SettingsContextNav"),
    "Every settings route must expose the shared settings navigation",
  );
}
for (const settingsRoute of ["/settings/billing", "/settings/integrations", "/settings/operations"]) {
  assert(settingsNavigation.includes(settingsRoute), "Settings navigation is missing " + settingsRoute);
}
assert(
  billingFeature.includes("api.billing.generateCheckoutLink") &&
    billingFeature.includes("api.billing.changeCurrentSubscription") &&
    billingFeature.includes("api.billing.generateCustomerPortalUrl") &&
    billingPolicy.includes('const billingReturnPath = "/settings/billing"') &&
    publicAppUrlSource.includes('return buildPublicAppUrl("/settings/billing")'),
  "Billing settings must preserve plan actions and return Polar flows to the canonical billing route",
);
const rewardInventoryPanel = read("app/_workspace/-features/RewardInventoryPanel.tsx");
const workspaceCopySources = [
  adminPageShell,
  read("app/index.tsx"),
  read("app/auth.tsx"),
  authFeature,
  analyticsFeature,
  rewardsFeature,
  billingFeature,
  read("app/_workspace/-features/IntegrationsSettingsFeature.tsx"),
  read("app/_workspace/-features/CampaignOverviewFeature.tsx"),
  read("app/_workspace/-features/CampaignSettingsFeature.tsx"),
  read("app/_workspace/-features/CampaignOverviewSummary.tsx"),
  read("app/_workspace/-features/CampaignGameAssetsPanel.tsx"),
  distributionFeature,
  shareLinksPanel,
  rewardInventoryPanel,
];
assert(
  !rewardsFeature.includes("selectedCampaignId") &&
    rewardsFeature.includes("owner && campaign ? { campaignId } : \"skip\""),
  "Reward inventory must derive campaign scope from the canonical route parameter",
);
assert(
  !rewardsFeature.includes('onPress={() => void navigate({ to: "/campaigns" })') &&
    rewardsFeature.includes('to="/campaigns"'),
  "Reward navigation must use links rather than action buttons",
);
assert(
  rewardsFeature.includes("api.campaigns.getCampaignRouteContext") &&
    rewardsFeature.includes("Không thể mở kho phần thưởng") &&
    rewardsFeature.includes("owner && campaign ? { campaignId } : \"skip\""),
  "Reward inventory must authorize route identity before loading mutable campaign setup state",
);
assert(
  billingFeature.includes("plan === undefined || products === undefined") &&
    !billingFeature.includes("products === undefined || !option.product?.id"),
  "Billing must keep product actions pending until plan and configured products both resolve",
);
assert(
  onboardingFeature.includes("isPending={pending}") &&
    onboardingFeature.includes("Không thể chuẩn bị chiến dịch đầu tiên"),
  "Onboarding mutations must expose pending and recoverable error states",
);
assert(
  !analyticsFeature.includes("aside=") &&
    analyticsFeature.includes('aria-label="Phạm vi phân tích chiến dịch"') &&
    analyticsFeature.includes('search.view === "rewards"'),
  "Analytics must keep the campaign scope picker in the page header and render the li xi redemption block only on the rewards view",
);
assert(
  rewardsFeature.includes('aria-label={`Giảm giá trị mức thưởng ${index + 1}`}') &&
    rewardsFeature.includes('aria-label={`Tăng giá trị mức thưởng ${index + 1}`}') &&
    rewardsFeature.includes('aria-label={`Giảm số lượng mức thưởng ${index + 1}`}') &&
    rewardsFeature.includes('aria-label={`Tăng số lượng mức thưởng ${index + 1}`}'),
  "Reward steppers must expose localized accessible names for every increment and decrement control",
);
assert(
  rewardsFeature.includes("rewardReadiness") &&
    !rewardsFeature.includes("admin-kpi-strip"),
  "Rewards page must derive its header status chip from rewardReadiness and keep the page free of the KPI strip",
);
assert(
  rewardInventoryPanel.includes("quantityRemaining") &&
    rewardInventoryPanel.includes("saveLoud") &&
    // Slice J moved the budget meter into the shared BudgetMeter component
    // (§11.6.1); the rewards page must use it and the component must own the
    // admin-budget markup.
    rewardsFeature.includes("BudgetMeter") &&
    read("app/_workspace/-components/StockMeter.tsx").includes("admin-budget") &&
    rewardsFeature.includes("remainingQuantity") &&
    rewardsFeature.includes("budgetDirty"),
  "Rewards must show remaining stock and budget as bars and keep saves quiet until there are changes",
);
assert(
  operatorFeature.includes("GameStatusChip") &&
    operatorFeature.includes("GamePerformanceCard") &&
    operatorFeature.includes("GameTemplatePreview") &&
    operatorFeature.includes("admin-stock-list") &&
    campaignCreateFeature.includes("GameTemplatePreview") &&
    adminPageShell.includes("admin-page__heading-group") &&
    adminPageShell.includes("data-stuck"),
  "Create and operate must show the product, the computed status and remaining stock; page headers keep the description with the title and mark a stuck header",
);
for (const prohibitedLabel of [
  "Campaign Leaderboard", "Redemption records", "Reward Inventory",
  "Budget Setup", "Campaign budget scope", "All campaigns",
  "Saving inventory", "Configure value", "reward units", "Reward tier",
  "Subtotal updates", "Inventory is locked", "Rarity breakdown",
  "Outcome ", "Host profile", "Luồng workspace", "Đang mở workspace",
  "dữ liệu workspace", "sẵn sàng của workspace",
  "Session Google", "Ảnh hero", "ảnh hero",
]) {
  assert(
    workspaceCopySources.every((source) => !source.includes(prohibitedLabel)),
    "Canonical Vietnamese workspace copy must not retain mixed-language label: " + prohibitedLabel,
  );
}
const integrationsFeature = read("app/_workspace/-features/IntegrationsSettingsFeature.tsx");
assert(
  integrationsFeature.includes("runtimeCheckLabels") &&
    integrationsFeature.includes("endpointLabels") &&
    !integrationsFeature.includes("<ItemCard.Title>{key}</ItemCard.Title>") &&
    !integrationsFeature.includes("map((check) => check.label)"),
  "Integration readiness must localize operator-facing check and endpoint labels",
);

for (const legacy of [
  "app/setup.tsx", "app/leaderboard.tsx", "app/draw.tsx",
  "app/claim/$publicCode.tsx",
]) {
  const source = read(legacy);
  assert(
    source.includes("redirect") || source.includes("Navigate") || source.includes("-features"),
    "Compatibility route must redirect or reuse a shared feature: " + legacy,
  );
}

for (const path of walk("app").filter(
  (candidate) => candidate.endsWith(".tsx") && read(candidate).includes("createFileRoute"),
)) {
  const lines = read(path).split(/\r?\n/).length;
  assert(lines <= 350, "Route entry exceeds 350 lines: " + path + " (" + lines + ")");
}

assert(
  packageJson.scripts["test:route-policy"] === "node scripts/test-route-ux-policy.mjs",
  "package.json must expose test:route-policy",
);
assert(
  contract.includes("Vietnamese is the default visible locale"),
  "Contract must define the Vietnamese copy policy",
);
assert(
  contract.includes("New share URLs always use /play/$publicCode"),
  "Contract must require play-first share URLs",
);

console.log("Route and UX policy checks passed");
