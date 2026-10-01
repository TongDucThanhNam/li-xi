# Route and UX Standardization

This is the implementation contract for the campaign-centric TanStack Start route migration. Product language follows docs/product-direction.md; admin presentation follows docs/admin-design-system.md; public play and station presentation resolve through the game-template registry.

## Route ownership

| Runtime path | Auth/style owner | Responsibility |
| --- | --- | --- |
| / | Root resolver | Route unauthenticated hosts to /auth, configured hosts to /campaigns, incomplete hosts to /onboarding; unknown URLs render the standalone not-found card |
| /auth | Public admin style | Google-first host authentication on one focused card with one button and a polite status line |
| /onboarding | Authenticated workspace | First-run bootstrap as three numbered steps with one primary action and a "Tự tạo từ đầu" link |
| /campaigns | Authenticated workspace | Campaign list, status summary, creation entry |
| /campaigns/new | Authenticated workspace | Create campaign and first registered campaign game |
| /campaigns/$campaignId | Campaign context | Launch checklist, effectiveness stats, game rows, then brand/status settings |
| /campaigns/$campaignId/games | Campaign context | Configured game rows with per-game operate actions and the add-game dialog |
| /campaigns/$campaignId/games/$campaignGameId | Campaign context and template editor | Rules, copy, assets, preview, reward/result configuration |
| /campaigns/$campaignId/rewards | Campaign context | Shared reward inventory and cash-budget sections ordered and collapsed by usage; header status chip from `rewardReadiness`; saving stays on the page |
| /campaigns/$campaignId/distribution | Campaign context | Shared public links and QRs, per-game station/operate rows, and host-created session links; no launch/channel widgets |
| /analytics | Authenticated workspace | Workspace or campaign analytics from validated URL state: `view` selects `overview`, `games`, `rewards`, `channels`, or `claims`; `claims` additionally validates the per-campaign claims-queue filters `claimsStatus`, `claimsChannel`, `claimsRewardType`, and `claimsCode` (exact whole-code search) |
| /settings/billing | Authenticated workspace | Current plan with six usage rows against limits, then a three-plan comparison with exactly one primary upgrade action |
| /settings/integrations | Authenticated workspace | Status-first readiness: one header chip, compact group rows, check detail behind a disclosure, copyable public endpoints |
| /settings/operations | Authenticated workspace | Account host PIN shown as state first; PIN cells only while setting or changing it |
| /operate/$campaignGameId | Authenticated operator shell | One authorized campaign game: li-xi host-PIN console with link cancellation confirm, self-serve station launch section, or public/inactive one-section states; every state links "Cấu hình trò chơi" in the header |
| /station/$campaignGameId | Template-owned stage | Full-screen station guest experience. The li-xi template keeps the legacy host-PIN operator flow; lucky-wheel and scratch-card games whose rewards come from campaign inventory run self-serve station sessions (waiting hero, play, claim, reset) admitted under the signed-in host; exiting to the console always verifies the host PIN. Head ships the shell-owned station.css chrome layer plus every station-capable template stylesheet in the same documented order as /p, never admin CSS. A completed-but-unresolved station result resurfaces as a recovery banner with resume and PIN-verified host-dismiss actions |
| /play/$publicCode | Public template-owned stage | Resolve public code, template, play session, optional reward |
| /p/$shareCode | Public template-owned stage | Reusable campaign-game entry: branded hero, self-serve session start, server-validated play, optional claim. The link identifies a campaign game and channel, never a precreated participant session |

The authenticated workspace is one pathless layout. It owns the host guard, admin stylesheet, one HeroUI Pro AppLayout, responsive navigation, logout, and shared route states. Campaign context is nested and must not mount another AppLayout.

## Compatibility contract

| Legacy path | Deterministic behavior |
| --- | --- |
| /setup | Incomplete host to /onboarding. Configured host to /campaigns/$campaignId/rewards. Account-operation intent to /settings/operations. |
| /leaderboard | Redirect to /analytics, keeping the all-campaign default and translating safe filters. |
| /draw | Resolve the authenticated owner's active/default li xi campaign game, then route to /operate/$campaignGameId. The alias creates no session or analytics event. |
| /claim/$publicCode | Reuse or redirect to the same feature as /play/$publicCode. Valid, malformed, missing, expired, completed, and replayed states remain identical and idempotent. |

New share URLs always use /play/$publicCode. The 24-character lowercase-hex code, expiry, privacy, capacity, and idempotency policies do not change.

Reusable self-serve entry links always use /p/$shareCode with a 22-character lowercase code. One link admits many independent participants; a completed or in-progress participant session never closes the link for others. Revoked links, inactive campaigns/games, and malformed codes fail closed with friendly states. Session actions are authorized server-side by an unguessable session capability; anonymous participant tokens are device-local and best-effort, and participant display names are never used as identity.

The distribution page renders QR codes locally as SVG from the canonical public URL. Participant URLs are not sent to a third-party QR service.

## URL state

- Campaign selection is the $campaignId path segment.
- Campaign-game selection is the $campaignGameId path segment.
- Analytics search is campaign?: string and view?: overview | games | rewards | channels | claims. Invalid values normalize to all-campaign overview.
- Compatibility routes translate safe legacy state once; canonical routes do not keep a parallel local selection.
- Links represent destinations and buttons represent mutations. Browser history, modifier-click, reload, direct load, focus, and scroll semantics must be preserved.

## Navigation and copy

Primary labels are Chiến dịch, Phân tích, and Cài đặt. Campaign labels are Tổng quan, Trò chơi, Phần thưởng, and Phân phối. Settings labels are Thanh toán, Tích hợp, and Vận hành.

Vietnamese is the default visible locale. Approved product and technical proper nouns such as Campaign Studio, Google, HeroUI, Convex, R2, and Polar may remain English. Generic workspace copy must not model the platform as a draw, claim, or redemption product.

## Route-state contract

Every canonical workspace route provides a route-specific document title, description, heading, breadcrumb, and recovery action; stable pending geometry; useful empty, forbidden, missing, error, and not-found states; one semantic source for responsive actions; and explicit dirty-form navigation handling where edits can be lost.

The shared page header carries no eyebrow row. The breadcrumb renders in the navbar through `AdminWorkspaceContext.breadcrumbHost` and falls back inline only outside the workspace layout. Context navigation (campaign and settings) and URL-state view tabs (analytics) share one underline-tab presentation through the `AdminPageShell` `tabs` slot; forms follow the shared `admin-form`/`admin-field` rhythm, and forms that save from the page header combine `stickyHeader` with `AdminSaveStatus` so the save action and its state never scroll away. Visual details are specified in `docs/workspace-ux-redesign.md` and `docs/admin-design-system.md`.

Route entry files are limited to 350 lines. Feature logic belongs in ignored -features or -components modules. Any exception must be recorded here.

### Campaign journey surfaces (2026-09-30 slice B1/B2)

- `/campaigns` renders a grid of whole-card links (`.admin-card-link`):
  logo or template icon tile, name, brand line with colour dot, status chip,
  one-line-clamped description, and audience tag chips.
- `/campaigns/new` is a two-column body: campaign info fields, the first-game
  `GameTemplatePicker`, the optional "Nhận diện thương hiệu (tuỳ chọn)"
  `AdminDisclosure` (collapsed by default, content stays mounted), and a
  plain "Sau khi tạo" step rail shown from `xl`.
- `/campaigns/$campaignId` leads with `CampaignOverviewSummary` — the launch
  checklist rendered only while at least one step is open, the
  `admin-stats` effectiveness block, and up to five game rows
  (`CampaignGameRow`) with per-game operate links — above the
  "Thiết lập chiến dịch" settings form.
- `/campaigns/$campaignId/games` renders one section card of
  `CampaignGameRow` rows and a warning `Alert` linking back to the overview
  while the campaign is not active; the add-game form lives in a `Modal`
  opened by the header "Thêm trò chơi" action and uses `GameTemplatePicker`.
- `/campaigns/$campaignId/games/$campaignGameId` is a two-column workbench:
  the form sections (status/play limits, template config editor, assets) in
  the main column; a sticky-from-`xl` side column with the live
  `GamePreviewFrame` preview ("Xem trước", first in flow below `xl`), the
  "Cập nhật theo thay đổi chưa lưu." hint, and from `xl` the
  "Bước tiếp theo" links (Phần thưởng, Phân phối, Vận hành). Inside config
  editors the rarely changed miss-label and reward-pool-tag fields fold into
  a "Tuỳ chọn nâng cao" `AdminDisclosure`; every field a spec or operator
  touches directly (play limits, schedule, no-reward weight, quiz questions)
  stays visible on load. Quiz questions render as bordered cards whose
  correct answer is a native radio; assets render as compact `.admin-row`
  rows with 112px thumbnails.

Visual details are specified in `docs/workspace-ux-redesign.md` §7.

### Run-and-measure surfaces (2026-09-30 slice C1)

- `/campaigns/$campaignId/rewards` replaces the KPI strip and status widgets
  with a header status chip derived from `rewardReadiness` and two sections
  ordered by usage: the shared reward inventory first, then the cash budget
  ("Ngân sách tiền mặt Lunar Fortune"). Each section opens with a
  "Dùng cho:" line naming its games, and a section no game uses starts
  collapsed ("Chưa có trò chơi nào dùng"). The budget section keeps its
  stats row, `.admin-tier-row` tier table, totals footer, and saves in
  place — success shows as an inline `Alert` at the top of the section, no
  redirect to `/campaigns`.
- `RewardInventoryPanel` renders each reward as an `.admin-item-card`
  (name/type/value line, quantity/weight/pool line, voucher line), carries
  one weight hint under the section description, and reveals the pool-tag
  fields behind the "Chia theo nhóm kho" switch (forced on and disabled while
  any row uses a custom pool tag). Rows stay expanded; there is no
  expand/collapse affordance.
- `/campaigns/$campaignId/distribution` iterates the campaign games route
  context (never the legacy `campaign.campaignGame`) and renders, in order:
  the missing-budget warning, mutation feedback, `ShareLinksPanel` (one
  create row with the schedule status line under it, then hairline-separated
  link rows), the "Mở trạm và vận hành" rows (mode text per game, no
  schedule chips), and "Liên kết theo lượt chơi" only while a budget li-xi
  game or pending session links exist.
- `/operate/$campaignGameId` states: the li-xi console is an
  `.admin-split--rail` body — "Tạo lượt chơi" form (RadioGroup "Hình thức",
  guest name, six-cell Host PIN via `OtpPinInput variant="admin"`, action
  row with "Còn {n} lượt khả dụng") and a "Liên kết đang chờ" side list whose
  "Huỷ" ghost buttons confirm through an `AlertDialog`; a warning `Alert`
  ("Chưa thể tạo lượt chơi") explains a disabled create. Self-serve station
  and public/inactive games render one section each. Every state's header
  carries the "Cấu hình trò chơi" link.

Visual details are specified in `docs/workspace-ux-redesign.md` §8.

## Acceptance ledger

Allowed statuses are not-started, mapped, audited, implemented, verified, and blocked. Completion requires every row to be verified.

| Surface | Desktop 1440x900 | Mobile 390x844 | Keyboard/focus | Direct load/history | Route states | Status |
| --- | --- | --- | --- | --- | --- | --- |
| Auth and entry | verified — `entry-authenticated-1440x900.jpg`, `auth-authenticated-redirect-1440x900.jpg` | verified — signed-in `/` and `/auth` resolve to the state captured in `onboarding-390x844.jpg` without overflow | verified — one semantic Google action and a polite status line when signed out; no display-only progress widgets (slice D: `.tmp/ux-audit/slice-d/auth-1440.png`, `auth-390.png`) | verified — signed-in `/` and `/auth` both deterministically resolve to `/onboarding` | verified — live auth pending state and signed-out redirect were checked before the signed-in pass | verified |
| Onboarding | verified — `onboarding-1440x900.jpg` | verified — `onboarding-390x844.jpg` | verified — first form control receives logical initial focus and controls retain accessible names | verified — direct `/onboarding` load preserves the bootstrap state | verified — pending and recoverable mutation states are policy-checked; slice D restyles the page as three numbered steps (`.tmp/ux-audit/slice-d/onboarding-1440.png`, `onboarding-390.png`) | verified |
| Campaign index/create | verified — `campaigns-index-1440x900.jpg`, `campaigns-new-1440x900.jpg` | verified — `campaigns-index-390x844.jpg`, `campaigns-new-390x844.jpg` | verified — links remain links; create-form order starts at the campaign identity controls | verified — `/campaigns` and `/campaigns/new` load directly with distinct state | verified — list/create pending, empty, and mutation recovery contracts pass | verified |
| Campaign overview/navigation | verified — `campaign-overview-1440x900.jpg` | verified — `campaign-overview-390x844.jpg` | verified — one localized sidebar trigger/rail and one semantic source for campaign navigation | verified — dynamic campaign URL survives direct load; campaign links preserve route identity | verified — `campaign-not-found-1440x900.jpg` proves friendly malformed/missing recovery | verified |
| Games list/editor | verified — `games-list-1440x900.jpg`, `game-editor-1440x900.jpg` | verified — `games-list-390x844.jpg`, `game-editor-390x844.jpg` | verified — dirty navigation opens a named alert, focuses `Tiếp tục chỉnh sửa`, and restores focus to the originating `Trò chơi` link | verified — the editor deep link and editor state survive a real reload; parent `/games` now renders its child outlet | verified — `game-not-found-1440x900.jpg` plus owned/missing/foreign Convex tests | verified |
| Rewards | verified — `rewards-1440x900.jpg` | verified — `rewards-390x844.jpg` | verified — every value/quantity stepper exposes localized increase/decrease names; no English control names remain | verified — campaign-scoped reward URL loads directly and keeps campaign identity | verified — loading, missing campaign, lock, and mutation recovery contracts pass | verified |
| Distribution | verified — `distribution-1440x900.jpg` | verified — `distribution-390x844.jpg` | verified — link, copy, QR, and station actions are named and retain action-vs-navigation semantics | verified — campaign distribution URL loads directly with canonical `/play` links | verified — no-link/pending channel state and authorized route recovery pass | verified |
| Analytics | verified — `analytics-overview-1440x900.jpg`; desktop context aside renders in its visible host | verified — `analytics-overview-390x844.jpg`; named context sheet has no overflow | verified — sheet close restores focus to `Mở ngữ cảnh trang`; every toolbar control has one Vietnamese accessible name | verified — tabs update `view`; back/forward and reload retain `campaign` plus selected `channels` view | verified — invalid campaign scope and empty analytics states recover without raw errors | verified |
| Settings | verified — `settings-billing-1440x900.jpg`, `settings-integrations-1440x900.jpg`, `settings-operations-1440x900.jpg` | verified — corresponding `settings-*-390x844.jpg` captures | verified — shared settings links and account actions have named controls and logical order | verified — each settings URL loads independently | verified — billing pending, integration readiness, and operation-setting recovery contracts pass; slice D restyles billing usage/plans, status-first integrations, and state-first Host PIN (`.tmp/ux-audit/slice-d/settings-*.png`) | verified |
| Operator console | verified — `operator-console-1440x900.jpg` shows HeroUI admin treatment | verified — `operator-console-390x844.jpg` | verified — operator actions are named and remain separate from the guest stage | verified — `/operate/$campaignGameId` direct load retains game identity | verified — `operator-not-found-1440x900.jpg` proves fail-closed recovery | verified |
| Station guest | verified — `station-stage-1440x900.jpg` retains the Lunar Fortune stage | verified — `station-stage-390x844.jpg` | verified — Host PIN dialog auto-focuses its field, traps Tab, closes on Escape, and restores focus to the exit trigger | verified — `/station/$campaignGameId` loads directly without the workspace shell | verified — `station-not-found-1440x900.jpg` and inactive-game recovery are friendly and fail closed | verified |
| Public play and claim alias | verified — `play-expired-1440x900.jpg`, `claim-expired-1440x900.jpg` have identical closed semantics | verified — expired and malformed `play/claim-*-390x844.jpg` captures have no overflow | verified — loading/status/error announcements are semantic; closed-state content introduces no false interactive controls | verified — canonical and compatibility URLs directly reproduce the same expired/malformed state | verified — malformed, expired, completed, replay, capacity, privacy, and idempotency tests pass | verified |
| Setup/leaderboard/draw aliases | verified — `setup-alias-1440x900.jpg`, `leaderboard-alias-1440x900.jpg`, `draw-alias-1440x900.jpg` | verified — corresponding `*-390x844.jpg` captures | verified — redirects introduce no duplicate controls or focus-blocking intermediate UI | verified — destinations are deterministic: onboarding, reward analytics, and canonical operator console | verified — signed-in aliases resolve without loops; signed-out guards were checked separately | verified |

Each verified row records screenshot paths, URL/state, keyboard result, overflow result, and recovery outcome. “Not tested,” “partial,” and implicit inspection are not completion evidence.

### Analytics responsive audit note

The user-provided in-app browser screenshot from 2026-07-16 exposed three source-confirmed issues on `/analytics?view=overview`: the shared KPI strip forced horizontal scrolling, the page repeated `Phân tích` as both breadcrumb context and eyebrow, and the legendary-reward trend exposed the English value `none`.

Analytics no longer renders the `admin-kpi-strip` or the "Tóm tắt phân tích"
summary block: every view opens with one `.admin-stats` row (step notes on
the overview), and the legacy li xi redemption block — tables plus the
"Cơ cấu phần thưởng" rarity chart — renders only on the rewards view. The
campaign scope picker (`aria-label="Phạm vi phân tích chiến dịch"`) sits in
the page header actions on every view; Analytics passes no aside.

Audit evidence:

- Baseline map: `docs/ux-ui-map/external-audit-baseline-AnalyticsFeature-20260716T155349Z.txt`
- Final map command: `bun scripts/generate-ui-map.ts --focus AnalyticsFeature --scope full --layoutOnly`
- Focused gates: `npm run typecheck`, `npm run lint`, and `npm run test:route-policy`
- Independent audit provider status: unavailable. AGY returned a quota error; two OpenCode fallback attempts failed to produce the required validated `plan.md` and `preview.html` because the isolated workflow selected an unavailable internal worker model. No unvalidated audit recommendation was implemented.

This note records the state before the authenticated acceptance pass below; it did not by itself verify the Analytics row.

### Live pre-authentication browser audit note

A clean isolated Chrome profile on 2026-07-23 exposed three hydration/accessibility defects that SSR smoke and static route policy did not catch:

- direct workspace loads could mount protected child queries before live Convex Auth resolved, producing a raw backend authentication error instead of redirecting to `/auth`;
- the standalone `/setup` alias produced the same protected-query error and `/draw` could remain indefinitely in its resolver state;
- the display-only auth Stepper was removed from sequential keyboard focus but still appeared in the accessibility tree as four enabled buttons with no action.

The workspace and both standalone aliases now wait for live Convex Auth, skip protected queries until authenticated, and redirect clean profiles to `/auth`. The visual Stepper is hidden from assistive technology and paired with a semantic ordered progress list whose current item uses `aria-current="step"`.

Browser verification at 1440×900 and 390×844 confirmed clean redirects for the workspace, `/setup`, and `/draw`, no console errors, and no horizontal page overflow. The auth accessibility tree now contains one actionable Google sign-in button and the named progress list. A real expired/redeemed Convex public code also produced identical closed-state copy, title, and overflow results on `/play` and `/claim`.

Independent audit baselines were recorded at:

- `docs/ux-ui-map/external-audit-baseline-WorkspaceLayout-20260723T143330Z.txt`
- `docs/ux-ui-map/external-audit-baseline-AuthFeature-20260723T144526Z.txt`

Both generated redesign plans were semantically rejected where they contradicted live route behavior or omitted the browser-proven defects. Only the evidence-backed guard and accessibility changes were implemented. This remains pre-authentication evidence; it does not verify authenticated workspace rows.

### Authenticated in-app Browser Control acceptance (SUPERSEDED)

> **Status: superseded on 2026-09-29.** The uncommitted campaign-based
> refactor replaced the authenticated workspace chrome and every workspace
> feature after these captures were taken, and the capture pass itself
> suffered a 2×2 tiled-rendering corruption that no longer matches current
> output. The captures are retained for provenance but must not be cited as
> current acceptance evidence for workspace surfaces. The station, public
> play, and claim rows they documented are covered by the newer automated
> fixtures; re-run the interactive pass before citing them as current.
> Current workspace acceptance evidence lives in
> `docs/route-ux-evidence/2026-09-29/` and `tests/ui/workspace.spec.ts`.

The final interactive pass on 2026-07-23 used Browser Control attached to the user's existing signed-in Codex in-app browser tab. It did not launch a separate or anonymous browser profile. The live account resolved to `Thành Nam`; the exercised fixture was campaign `Lunar Fortune`, game `Lì Xì Station`.

Viewport evidence:

- desktop was measured at exactly 1440×900 CSS pixels;
- the Windows display scale maps integer Browser Control widths around the requested 390-pixel breakpoint to 389 and 391 CSS pixels. The complete mobile matrix ran at 391×844, and the editor, rewards, analytics, operator, station, and public-play critical surfaces were repeated at 389×844. Both sides of the 390 breakpoint passed, so no result depends on a one-pixel rounding direction;
- every tested route reported `scrollWidth <= clientWidth`; timestamp-filtered browser logs reported zero new console errors during the final route and interaction batches.

The evidence directory is `docs/route-ux-evidence/2026-07-23/`. It contains paired desktop/mobile captures for onboarding, campaign list/create/overview, games list/editor, rewards, distribution, analytics, all settings pages, operator, station, public play/claim, and all three authenticated compatibility aliases. It also contains friendly malformed/missing captures for campaign, game editor, operator, and station routes.

Interaction and history evidence:

- analytics `Kênh chia sẻ` updates `view=channels`; browser back returns to `view=overview`, forward returns to `view=channels`, and a real reload retains both `campaign` and the selected view;
- a real reload of `/campaigns/$campaignId/games/$campaignGameId` keeps the editor mounted at the same URL rather than falling back to the games list;
- a local unsaved editor change followed by `Trò chơi` opens the alert dialog, auto-focuses `Tiếp tục chỉnh sửa`, leaves the URL unchanged when cancelled, restores focus to the originating link, and clears no persisted backend data;
- mobile navigation and analytics context are named sheets with Vietnamese close controls, no duplicate triggers, and trigger-focus restoration; the desktop analytics context panel renders in the visible AppLayout aside host;
- the station Host PIN dialog focuses its field, closes on Escape, and restores focus to `Thoát chế độ trạm`;
- all reward increment/decrement controls expose Vietnamese screen-reader names; the English `Increase`, `Decrease`, `Dismiss`, and `Toggle sidebar` names are absent from the final accessibility snapshots.

The browser pass discovered and closed three additional defects before verification: the games collection parent did not render its child outlet, malformed Convex route IDs reached `v.id` validation before friendly recovery, and responsive sheet/tooltip composition produced duplicate or English-only accessible controls. Route policy assertions now guard those fixes.

### Real-chrome workspace fixture acceptance (2026-09-29)

Slice 4d-1 moved workspace acceptance onto a repeatable harness:
`tests/ui/fixtures/workspace.html` mounts the REAL `_workspace` chrome
(HeroUI Pro AppLayout, sidebar, navbar, aside host, real
`AdminPageShell` features) behind a real TanStack Router tree with the
synthetic Convex workspace fixture (`tests/ui/fixtures/convex-mock.ts`),
including the authenticated `useConvexAuth` bridge. It covers /campaigns
(list and empty), /campaigns/new, campaign overview/games/rewards/
distribution, the game editor for all five templates, analytics (all five
URL-selected views plus claims filters), all three settings pages,
onboarding, and the operator console for li-xi and lucky-wheel.

The harness reproduced and the slice fixed, with before/after captures:

- analytics tab strips wrapped their labels at 1440 and 390 because the
  lists carried `w-fit`; lists now use the library `w-full` default with
  `min-w-max` tabs, and deep links scroll the active tab into the strip's
  horizontal overflow on phones;
- the claims queue needed ~1190px of columns, so the fulfil action was
  clipped whenever the aside was open; the grid merged to participant
  (with game · channel subline), claimedAt, reward, code, and a combined
  status + action column that fits ~773px of content width;
- the aside showed the legacy "Cơ cấu phần thưởng" rarity chart on every
  analytics view; the aside has since been removed entirely — the scope
  picker sits in the page header on every view and the redemption block
  with the rarity chart renders only on the rewards view;
- summary tiles truncated their titles (`item-card__title` is
  `whitespace-normal` now), the assets panel stacked its header as flex
  siblings and left half of the card empty, the voucher secret placeholder
  clipped at 390, and partial KPI-strip rows leaked the separator
  background; the last KPI now spans to the row end.

Enforcement: `tests/ui/workspace.spec.ts` captures all 23 route states at
1440×900 and 390×844, asserts zero page overflow on every state, gates on
zero console errors, and covers the keyboard contract (analytics tabs move
with arrow keys and update the validated search; the sidebar treegrid is
arrow-navigable and Enter-activates; the claims grid shows the status chip
and full fulfil action inside the visible area with the aside open).

Evidence: `docs/route-ux-evidence/2026-09-29/before/` (defect reproductions
plus measured claims-column metrics) and `docs/route-ux-evidence/2026-09-29/after/`
(full route-state matrix captured by the spec run via
`ROUTE_UX_EVIDENCE_DIR`). The fixture loads the same stylesheets the real
workspace routes load (admin chrome first-authoritative; template layers
only for editor previews), so workspace captures render the production
admin theme.

### Static route-state and accessibility evidence

The source-verifiable portion of the acceptance contract now also covers:

- owned, missing, and foreign campaign, campaign-game, campaign-game collection, and reward-setup route behavior in Convex tests;
- a campaign-game collection route that renders multiple rows structurally and materializes the default li xi game for a legacy campaign with no stored game row;
- valid, malformed, expired, completed, replayed, and idempotent public-play behavior across 9 Convex runtime tests;
- template-owned initial configuration, normalization, legacy campaign projection, config editor, and public/station stage resolution;
- one workspace logout owner, route-specific title/description metadata, and route-specific recoverable error surfaces;
- localized integration/readiness labels and campaign/game statuses without exposing raw internal keys;
- route entry modules capped at 350 lines, with the largest current route entry at 71 lines (`app/draw.tsx`);
- no retained red/gold host-dashboard implementation behind `/draw`; the compatibility path only resolves into the canonical HeroUI operator console;
- Polar checkout and customer-portal returns resolve to canonical `/settings/billing`;
- a useful missing/forbidden station state instead of an indefinite loading screen;
- station exit-dialog modal semantics, Escape handling, Tab trapping, error announcement, and trigger-focus restoration;
- a stable operator pending state until authorized station setup data resolves;
- accessible names for every HeroUI `ItemCardGroup`, icon-only `Button`, `Tabs.List`, and `DataGrid` found under `app`;
- responsive shared KPI groups that reflow instead of forcing a horizontal strip.

These checks are enforced by `npm run test:once`, `npm run test:route-policy`, and `npm run test:contracts`. They reduce the interactive audit surface but do not replace keyboard, screen-reader, responsive overflow, history, and recovery checks in a real authenticated browser.

## Success-criterion audit

This table distinguishes evidence already proved by current automated artifacts
from evidence that still requires the authenticated in-app browser. “Pending”
does not mean the implementation is known to be wrong; it means the GOAL
explicitly forbids treating static inspection as sufficient proof.

| # | Current evidence | Audit result |
| --- | --- | --- |
| 1 | Generated `routeTree.gen.ts` plus `npm run test:route-policy` covers all canonical and compatibility paths. | verified |
| 2 | Route policy proves one pathless workspace guard/AppLayout/admin CSS boundary and separate template-owned play/station boundaries. | verified |
| 3 | Convex tests cover owned, missing, and foreign campaign, game, game-list, and rewards access. | verified |
| 4 | Route policy proves path/search ownership; authenticated editor reload plus analytics reload/back/forward preserve route identity and search state. | verified |
| 5 | Convex public-play tests plus contracts and smoke cover canonical/claim parity, expiry/completion/replay, and idempotent opens. | verified |
| 6 | Smoke covers `/setup`, `/leaderboard`, and `/draw`; policy requires the obsolete draw host implementation to remain deleted. | verified |
| 7 | Source boundaries/build chunks are separate, and paired desktop/mobile captures prove the HeroUI operator shell and Lunar Fortune guest stage remain visually distinct. | verified |
| 8 | Shared route states, metadata, navigation, dirty-form dialog focus restoration, history, and friendly recovery pass across the authenticated matrix. | verified |
| 9 | Copy policy and source scans cover prohibited generic labels and known mixed-language leaks. | verified |
| 10 | Every route entry is below 350 lines and feature modules remain outside the generated route namespace. | verified |
| 11 | Accessible-name/dialog policies pass; live accessibility snapshots, dialog/sheet focus restoration, and the 389/391 breakpoint bracket show no horizontal overflow. | verified |
| 12 | Typecheck, lint, runtime tests, contract suites, and route smoke pass. | verified |
| 13 | Production build and `git diff --check` pass; `.output` is ignored and remains untracked. | verified |

## Automated verification

The implementation passed the following gates again on 2026-07-23:

- `npm run typecheck`
- `npm run lint`
- `npm run test:route-policy`
- `npm run test:once`
- `npm run test:contracts`
- `npm run test:smoke`, including the production build and the complete canonical/compatibility SSR route matrix
- `git diff --check`

These commands complement the completed authenticated Browser Control ledger above; neither static inspection nor screenshots alone are treated as sufficient evidence.
