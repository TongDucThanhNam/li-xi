# Admin Design System

Admin surfaces use HeroUI Pro for management workflows: Campaign Studio,
game configuration, reward inventory, billing, analytics, ops readiness, and
future platform workspace screens.

## Scope

- Use `@heroui-pro/react` for app shell, sidebar, navbar, data display, and
  advanced workflow components.
- Use `@heroui/react` for base controls such as `Button`, `Card`, `Input`,
  `Table`, `Alert`, `Chip`, `Label`, and `ProgressBar`.
- Do not use the Lunar Fortune red/gold theme for admin screens except inside a
  game-preview surface that intentionally previews the guest experience.
- Keep canonical `/station/$campaignGameId` and `/play/$publicCode` on the
  custom game-template style system. `/draw` and `/claim/$publicCode` remain
  compatibility entries and must not own a second visual implementation.

## Styling

- Admin CSS lives in `app/styles/admin.css`.
- Shared reset/base CSS lives in `app/styles/base.css`.
- Import order must stay: `./base.css`, `@heroui/styles`,
  `@heroui-pro/react/css`.
- Prefer HeroUI semantic tokens: `bg-background`, `bg-surface`,
  `bg-surface-secondary`, `text-foreground`, `text-muted`, `border-border`,
  `text-success`, `text-warning`, and `text-danger`.
- Avoid introducing app-specific color palettes for management screens.

## Layout

- Use a persistent HeroUI Pro `AppLayout`/`Sidebar` shell for management pages.
- Put app branding in the sidebar, not repeated in every page header.
- Page content should use constrained width, generous top padding, and clear
  header/action grouping.
- Contextual tooling such as billing usage, readiness, recent assets, and
  route metadata should live in an `AppLayout` aside panel instead of
  competing with the main editor as another page column. The aside is never
  used for filters: a filter belongs to the header of the content it
  filters (the analytics campaign scope picker sits in the page header
  actions). The game editor's
  live preview is the exception: it is operator feedback for the form beside
  it, so it renders in the editor's own `.admin-split__side` column through
  `GamePreviewFrame`, never in the aside (chrome-less fixtures mount the
  editor without a layout).
- When an aside is present, expose the built-in aside trigger from the navbar and
  allow the panel to become a sheet on tablet/mobile viewports.
- Tables, cards, alerts, and progress indicators should come from HeroUI rather
  than custom Tailwind-only components.
- Asset retry state in Campaign Studio should remain compact inside the upload
  area, use HeroUI feedback/actions, and avoid creating a separate decorative
  panel or toast.

## Workspace page shell

The shared workspace page shell is `AdminPageShell` (`app/components/AdminPageShell.tsx`)
with `app/styles/admin.css`; the visual contract is specified in
`docs/workspace-ux-redesign.md` (§2, §6). Rules that apply to every workspace
screen:

- **Page header.** `title`, optional one-sentence `description`, optional
  `status` node next to the `h1`, optional `actions`, optional `tabs` slot
  above the header, and `stickyHeader` for pages whose header action saves a
  form (title row plus actions stick to the top of the scroll container so the
  save action never scrolls away). Title and status share the
  `.admin-page__heading` row inside `.admin-page__heading-group`, and the
  description renders inside that group, so the header order on small screens
  is title, description, actions. `stickyHeader` pages keep the description
  outside the header (it scrolls away so the stuck bar stays one row tall),
  and an `admin-page__sentinel` in front of the header flips `data-stuck`,
  drawing a 1px border-colored hairline under the stuck bar. There is no
  eyebrow row anywhere; do not reintroduce one.
- **Breadcrumb.** Rendered once by `AdminPageShell` and portaled into the
  navbar through `AdminWorkspaceContext.breadcrumbHost` (same pattern as
  `asideHost`). Outside the workspace layout it falls back inline at the top
  of the page body with `admin-breadcrumbs--inline`. Ancestors are muted
  links; the current crumb carries `aria-current="page"`.
- **Context tabs.** One underline-tab look for the whole workspace: campaign
  and settings context navs are `<nav>` elements of router links using
  `.admin-tabs` / `.admin-tabs__link` (current page gets
  `aria-current="page"`; a link leaving the area adds
  `admin-tabs__link--away` with a trailing `ArrowUpRight`). URL-state view
  switches (analytics) keep HeroUI `Tabs variant="secondary"` inside the same
  `tabs` slot with `className="admin-view-tabs"` so they align with the link
  tabs.
- **Sections.** A section is one flat white card: `bg-surface`,
  `shadow-surface`, `rounded-2xl`, via the scoped `.widget` restyle under
  `.admin-page` / `.admin-aside`. Title and description stack at the top-left
  of the card; no grey tray with a white inset card anywhere.
- **Forms.** Field containers use `.admin-form` (or `.admin-stack`),
  fields use `.admin-field` with `.admin-field__hint` hints,
  `.admin-field-pair` for two related short fields, and
  `.admin-control--xs` / `.admin-control--sm` width caps on the control box
  (number groups, selects, datetime/hex/short-code inputs). Free text fills
  the form column (≤48rem via `.admin-form > *`).
- **Editor section tabs.** A long editor splits into segmented section tabs
  in the main column (`.admin-section-tabs`, HeroUI `Tabs` default variant);
  the preview and save stay visible on every tab.
- **Save feedback.** Forms that save with an explicit header button show
  dirty/saved state once via `AdminSaveStatus` (`role="status"`) immediately
  left of the button; errors stay an inline danger `Alert` at the top of the
  page body. No toasts.
- **Disabled actions.** A disabled primary action always has a visible
  reason: an explanatory warning `Alert` above the form for environmental
  blockers (no reward pool, locked budget, inactive game) and field hints
  for per-field validation (missing name, incomplete PIN).
- **Destructive actions.** Immediate destructive actions that affect saved
  data (cancelling a pending guest link) confirm through an `AlertDialog`
  before running; removing an unsaved draft row (a budget tier or inventory
  row that was never saved) does not.
- **Building blocks.** The workspace provides shared pieces in
  `app/styles/admin.css` plus `GameTemplateIcon`, `GameTemplatePicker`, and
  `AdminDisclosure`; prefer them over new one-off markup:
  - `.admin-split` (`--rail`, `--preview`) with `.admin-split__main` /
    `.admin-split__side` for two-column page bodies; the side column appears
    from `xl` and sticks below the sticky header.
  - `.admin-rows` / `.admin-row` (with `__main`, `__text`, `__title`,
    `__meta`, `__chips`) for scannable list rows inside one section card:
    name first, chips aligned, one quiet action at the right. Never one card
    per row. Rows with trailing buttons add `admin-row--actions` and wrap the
    buttons in `.admin-row__actions`: below `sm` the buttons drop under the
    row text, aligned with it.
  - `.admin-item-card` for the exception to that rule — one bordered card
    per entity when each row is itself a multi-field form (reward inventory
    rows), stacked with a two-line then three-line field layout. Its
    `.admin-item-card__head` row carries the icon tile, the title/meta and
    the stock meter (pushed right with `ml-auto`; below 40rem the full-width
    meter wraps under the title).
  - `.admin-tier-head` / `.admin-tier-row` for editable reward-tier tables:
    on `md+` a five-track grid with a shared header row (row labels are
    `md:sr-only` and the trailing action cell is `md:contents`); below `md`
    each tier collapses to a two-column grid.
  - `.admin-usedby` renders the "Dùng cho:" line that names the games
    consuming a shared resource (shared reward pool, budget), each game a
    link, separated by muted dots.
  - `.admin-link-row` is a share-link object row (distribution, §11.4.1):
    QR left (faded when the link is revoked), then title + status/channel
    chips, the game/created meta line, the URL and the copy/open/revoke
    actions; from 48rem the per-link results (`Lượt truy cập`, `Hoàn tất`,
    `Chuyển đổi`) sit in three equal-width right-aligned columns that line
    up across rows, and below 48rem they wrap under the text.
  - `.admin-stock` is the remaining-stock meter: "Còn lại X/Y" over a
    `ProgressBar` (danger at or below 10% remaining, warning at or below
    25%); below `sm` it is full width so it wraps under the row title.
  - `.admin-stock-list` lists a locked budget's tiers as read-only rows,
    each naming `amount · rarity` and ending in a `.admin-stock` meter.
  - `.admin-budget` is the budget meter: "Ngân sách còn lại" label, the
    remaining figure at `text-3xl` with the total beside it, one bar and
    the spent share as the note.
  - `.admin-campaign-card` for a whole campaign card that is one link
    (campaign index, §11.2.1): brand-colour cover bar on top, the logo
    overlapping its bottom edge, name, brand/game-count meta line and a
    three-metric strip (`Lượt chơi` / `Nhận thưởng` / `Chuyển đổi`).
  - `.admin-game-grid` / `.admin-game-card` for games listed as preview
    cards (games tab, §11.3.1): a full-bleed template preview on top inside
    an `aria-hidden` + `inert` cover (nothing in a preview is focusable or
    announced), body with name, one computed status chip, meta line and a
    three-metric strip, and the "Vận hành" action in a footer that sits
    above the stretched title link (`.admin-game-card__title::after` covers
    the card, so the footer keeps `relative z-10`). Keyboard order per card
    is the title link, then "Vận hành".
  - `.admin-section-tabs` is the game editor's segmented section control:
    the tab list hugs its tabs (`w-auto`) and the active panel is a plain
    `flex flex-col gap-6` stack so its sections match page sections.
  - `GameStatusChip` renders the one computed game status
    (`resolveEffectiveGameStatus` from `lib/gameStatus`) that already
    combines saved status and play window; the window's open/close time
    belongs in the row meta line, never in a second chip.
  - `GameTemplatePreview` is the decorative (`aria-hidden` + `inert`) live
    preview of a registered template inside `GamePreviewFrame`: the shared
    way for pages that may not import the template registry (create,
    operate) to show the product; an unknown template id degrades to an
    empty `aspect-video` box.
  - `GamePerformanceCard` is the per-game "Hiệu quả" side card (header link
    to the analytics games view, then the five-row funnel or the
    "Chưa có lượt chơi." empty line); it owns the campaign breakdown query,
    renders nothing while it loads, and is shown from `xl` in the editor and
    operate side columns.
  - `FunnelBars` / `.admin-funnel` draws funnel steps as bars relative to
    the first step with the absolute value right of the bar and the
    step-over-step rate in the trailing column; below 40rem the track drops
    under its label.
  - `.admin-perf` is the performance-card body: a conversion KPI
    (`text-4xl`) in a 12rem left cell, funnel bars right of it from 48rem.
  - `PerformanceSummary` is that `.admin-perf` body as one component (KPI +
    funnel bars), shared by the campaign overview and the analytics funnel
    card; callers keep their own empty-state check around it.
  - `ShareBars` / `.admin-share*` draws a ranked list where a soft bar
    behind each row shows its size relative to the largest row (analytics
    overview rank cards, the rarity mix); rows render in caller order and
    the head row lines the value and rate labels up with their columns.
  - `RateBar` / `.admin-rate` draws conversion inside a table cell: a
    short track, then the percent; a null rate renders an empty track and
    "—", so every row's rate column stays aligned.
  - `.admin-rank-grid` lays out the analytics overview's ranked cards as
    two columns from 64rem; `--3` gives the campaigns card both columns
    until 90rem unlocks a third column.
  - `.admin-metric-head` / `.admin-metric-row` list objects with numbers
    (overview game list; reused by later slices): the header row renders
    only from 48rem, every metric cell after the name is right aligned, and
    below 48rem the metrics wrap under the name as `label value` pairs
    aligned with the name text.
  - `.admin-kv` is a `dl` of key/value lines for narrow side cards; keys
    muted, values right-aligned medium tabular.
  - `.admin-meter` is the segmented checklist meter (one `span` per step,
    `data-done` on finished steps).
  - `.admin-settings` / `.admin-settings-section` lay out a settings page as
    three label sections: intro column (`h2` + one sentence) left, one form
    card right from 48rem.
  - `.admin-choice-grid` / `.admin-choice-card` radio cards for picking a
    game template; `GameTemplatePicker` owns the registered-template cards.
  - `AdminDisclosure` for optional detail inside a section; collapsed content
    stays mounted so field state survives. Use the `bare` variant when the
    disclosure is the whole section content.
  - `GamePreviewFrame` renders a game-template preview section at a fixed
    640px logical width scaled down to the available width (never above 1),
    so the whole 16:9 stage stays visible in narrow columns; the preview
    components themselves are not edited and are never put in the aside.
  - `.admin-stats` `dl` for label-over-number stats without boxes; the row is
    a left-packed `flex` wrap (40px column gap, items min 8.5rem) so numbers
    hug the left edge instead of spreading across the section. Stats rows
    replace the removed KPI strips and summary widgets across the
    workspace; on analytics only the rewards view still reports through one
    (the overview leads with the funnel card and ranked share bars, and the
    games/channels views are plain tables).
  - `.admin-grid-section` replaces plain `p-0` on a `Widget.Content` that
    holds an edge-to-edge `DataGrid` (analytics breakdowns): no horizontal or
    bottom padding, a 1rem top gap after the description, and the first/last
    header and body cells carry the section inset (20px, 24px from `sm`) so
    the first column text aligns with the section title while the header
    background stays full width.
  - `.admin-group-label` captions name a group of fields or a page region;
    `.admin-icon-tile` is the 40px icon tile used in rows, card links, and
    choice cards.
- **Progressive disclosure.** `AdminDisclosure` ("Tuỳ chọn nâng cao") may
  fold only what is rarely changed and not addressed directly by UI specs or
  day-to-day operators — currently the miss-label ("Nhãn lượt không trúng" /
  "Nhãn lượt chưa đạt") and reward-pool-tag fields of the config editors.
  Anything a spec or an operator touches on every visit stays visible on
  load: play limits, schedule inputs, reward mode/source, the no-reward
  weight, quiz questions, and public copy.

## Round 2 rules

Structural rules for round-2 redesign slices (workspace UX redesign §11.0),
in addition to the one-primary-action and hierarchy rules above:

- **R1 Object first, form on demand.** A page about an object shows the
  object's state and results. Forms that are edited rarely move to a
  dedicated settings route or a dialog. Day-to-day controls stay where they
  are used.
- **R2 Every list item carries a number.** Campaign cards, game rows, link
  rows and reward rows each show their most useful metric(s), right aligned
  and tabular.
- **R3 One computed status.** A game shows one chip that already combines
  saved status and play window (`GameStatusChip`); the detail (open/close
  time) sits in the meta line, not in a second chip.
- **R4 Show the product.** Where a game is listed as a card, the card shows
  the template preview. Brand colour and logo identify a campaign card.
- **R5 Visualize ratios.** Funnel steps, remaining stock, remaining budget
  and channel share are bars. The number stays next to the bar.
- **R6 One loud action.** At most one filled primary button is visible at a
  time; a section-level save is primary only while that section is dirty; a
  checklist shows its first open step's action as primary and the later
  ones as secondary.
- **R7 Create rarely-used objects on demand.** Creating a secondary object
  (share link, reward) that is done rarely opens a dialog from the section
  header; the section body lists the objects with their results.
- **R8 Section saves stay quiet.** A section save is a filled primary only
  while the section has unsaved changes; a clean section's save stays
  enabled but secondary.
- **An overview owns the totals; detail views do not repeat them. Tables
  draw conversion with an inline rate bar.**

## Current Route State

- The pathless authenticated workspace loads `app/styles/admin.css` once and
  owns campaign routes, `/analytics`, `/settings/*`, and `/operate/$campaignGameId`.
- `/campaigns/$campaignId` is the campaign dashboard (launch checklist,
  funnel, game performance, side cards) and holds no form; campaign settings
  (name, slug, brand, status, brand identity) live on
  `/campaigns/$campaignId/settings`, the last tab of the campaign context nav.
- `/auth` and unknown root URLs render standalone, centred single-purpose
  pages in the admin visual language (`.admin-standalone` frame with a brand
  row and one card); each brings the admin stylesheet itself. The sidebar
  footer carries a plan/usage card (`.admin-sidebar-plan`) above the user row,
  hidden while the sidebar is collapsed.
- `/station/$campaignGameId` and `/play/$publicCode` resolve CSS, fonts, stage,
  editor, and preview through the generalized game-template registry.
- `/setup`, `/draw`, `/leaderboard`, and `/claim/$publicCode` are compatibility
  routes that redirect or reuse canonical features.
- Shared components used by both admin and draw surfaces must expose explicit
  variants rather than relying on the Lunar Fortune theme globally.
