# Workspace UX Redesign (2026-09-30)

Design source of truth for the operator workspace (everything under
`app/_workspace`, `AdminPageShell`, `admin.css`, `/auth`, onboarding). Guest
game stages (`/play`, `/p`, `/station`, `/claim`, `/draw`) are out of scope and
must stay pixel-identical. This document extends `docs/admin-design-system.md`
and `docs/route-ux-standardization.md`; where it contradicts them, the slice
that implements the change also updates those documents.

UI copy is Vietnamese. Strings quoted in this document are exact.

## 0. Why: what is wrong today

Evidence: `.tmp/ux-audit/tall/*.png` (true full-height captures, 1440 and 390).

1. **No visual hierarchy.** Every block is a HeroUI Pro `Widget` (grey tray +
   white inset card) on a grey page with grey-filled inputs: three greys, all
   the same weight. Section descriptions are pushed to the far right of the
   section header, 800px away from the title they describe.
2. **Header noise.** Five stacked lines before content (breadcrumb, eyebrow,
   3xl H1, description, pill tabs) and the navbar repeats the section name.
3. **Broken form rhythm.** A label sits closer to the previous field's helper
   text than to its own input. Inputs for a two-digit number are 1000px wide.
4. **No progressive disclosure.** The game editor is one 3,000px column with
   rules, copy, advanced fields and two giant empty image frames at the same
   level; the live preview is at the bottom, the Save button at the top.
5. **Redundancy.** Readiness is restated two or three times per page
   (KPI strip + "Trạng thái cấu hình" + ring summary); stretched empty cards
   fill space without information.
6. **IA mismatches.** "Tổng quan" is an edit form, not an overview; the
   campaign area uses pill links while analytics uses underline tabs; the two
   reward inventories and the two kinds of public links are not explained.

## 1. Principles (apply to every decision)

- **One primary action per view.** Exactly one `variant="primary"` button is
  visible per page region. Everything else is `secondary`/`outline`/`ghost` or
  a link. No full-width buttons on desktop.
- **Hierarchy by weight and colour, not by boxes.** Primary content
  `text-foreground`; supporting text `text-muted`; metadata `text-xs
  text-muted`. Do not wrap something in a card to make it important. Never
  nest a card inside a card unless it is a list row.
- **Proximity.** Space inside a group is smaller than space between groups:
  label→control 6px, control→hint 6px, field→field 20px, section→section 24px.
- **Progressive disclosure.** Show what 80% of operators need first. Optional
  and advanced settings go behind a labelled `Disclosure`, a secondary
  section lower on the page, or a dialog. Defaults must be safe so that
  collapsed settings never block a first run.
- **Show state once.** A fact (status, readiness, count) appears in one place
  per page, as close as possible to where the operator acts on it.
- **Inputs are as wide as their content.** Numbers ~160px, selects and dates
  ≤320px, free text fills the form column (≤720px). Forms never stretch to
  the page width.
- **Empty is not a layout.** No fixed-height or stretched cards. A block with
  nothing to say is not rendered; a list with no rows shows one compact empty
  state with one action.
- **Links are destinations, buttons are mutations** (existing contract).
- **Next step is always offered.** After every successful step the page shows
  where to go next (configure game → rewards → distribution → operate).

## 2. Foundations

### 2.1 Type, colour, spacing

Only semantic tokens (`bg-background`, `bg-surface`, `bg-surface-secondary`,
`text-foreground`, `text-muted`, `border-border`, `text-success|warning|danger`,
`bg-accent`, `text-accent`). No new colours or fonts.

| Role | Classes |
|---|---|
| Page title (h1) | `text-2xl font-semibold tracking-tight` |
| Section title | `text-base font-semibold leading-6` |
| Label / row title | `text-sm font-medium` |
| Body | `text-sm leading-5` |
| Supporting | `text-sm text-muted` |
| Hint / meta | `text-xs leading-4 text-muted` |
| Metric | `text-2xl font-semibold tabular-nums` |

Spacing scale in use: 4, 6, 8, 12, 16, 20, 24, 32, 48px. Page padding
`px-4 sm:px-6 lg:px-8 py-6`; page max width stays 1240px.

### 2.2 Navbar

`[sidebar toggle] [breadcrumb] ………… [aside trigger]`

- The static section label in the navbar is removed. The breadcrumb moves
  from the page body into the navbar through a portal host exposed on
  `AdminWorkspaceContext` (`breadcrumbHost`, same pattern as `asideHost`).
- Ancestors are muted links; the current page is `text-foreground
  font-medium` with `aria-current="page"`; separators are 14px chevrons.
  Each crumb truncates at `max-w-[16rem]`.
- Below `md` only the last two crumbs render; earlier crumbs are
  `hidden md:flex`.
- When a page renders outside the workspace layout (no context, e.g. test
  fixtures and standalone error pages) the breadcrumb renders inline at the
  top of the page body, as today.
- While the workspace context exists but the host is not mounted yet, render
  nothing (no inline flash).

### 2.3 Page header v2 (`AdminPageShell`)

```
Tổng quan   Trò chơi   Phần thưởng   Phân phối                 Phân tích ↗   ← tabs slot (optional)
──────────────────────────────────────────────────────────────────────────
Vòng quay may mắn  [Đang chạy]              ● Có thay đổi chưa lưu.  [Lưu thay đổi]
Vòng quay trúng thưởng nhiều ô với tỉ lệ và kho phần thưởng riêng.
```

- Props: `title`, `description?`, `actions?`, `aside?`, `breadcrumbContext?`,
  `children`, plus new `tabs?: ReactNode`, `status?: ReactNode`,
  `stickyHeader?: boolean`. The `eyebrow` prop and the eyebrow row are
  deleted everywhere.
- Order inside `.admin-page__inner`: inline breadcrumb fallback (only
  without workspace context) → `tabs` → `header.admin-page__header` (title
  row with `h1.admin-page__title` + `status`, then `.admin-page__actions`) →
  `p.admin-page__description` → `div.admin-page__body` (children).
- `h1.admin-page__title` keeps the exact per-route text used today.
- `description` is at most one sentence. It explains the page, not the
  product.
- `stickyHeader` makes the header row (title + actions only) stick to the top
  of the scroll container so the save action never scrolls away. Used on
  pages whose header action saves a form.

### 2.4 Context tabs

One tab look for the whole workspace: underline tabs.

- `CampaignContextNav` and `SettingsContextNav` stay `<nav>` elements made of
  router links (they are destinations) with the same `aria-label`s, but are
  styled as underline tabs (`.admin-tabs` / `.admin-tabs__link`): 40px tall,
  24px gap, `text-sm font-medium text-muted`, 2px `border-accent` underline
  and `text-foreground` on `aria-current="page"`, a 1px `border-border`
  baseline across the full row, horizontal scroll without a scrollbar on
  narrow screens.
- The campaign nav's "Phân tích" link leaves the campaign area, so it is
  pushed to the right end (`ml-auto`) and carries a trailing
  `ArrowUpRight` icon (`aria-hidden`). Its text stays "Phân tích".
- Both navs are passed through the `tabs` prop of `AdminPageShell`; they no
  longer render inside the page body and carry no bottom margin of their own.
- Analytics keeps HeroUI `Tabs variant="secondary"` (it is URL state, not
  separate routes) but is passed through the same `tabs` slot and
  left-aligned with natural-width tabs (class `admin-view-tabs`), so it is
  visually identical to the link tabs.

### 2.5 Sections (one container language)

A section is a single white surface card: `bg-surface`, `shadow-surface`,
`rounded-2xl`, 20px padding (24px from `sm`). Title and description are
stacked at the top-left; optional chips/actions sit at the top-right of the
title row.

HeroUI Pro `Widget` stays the section component, restyled once in
`admin.css` under `.admin-page` and `.admin-aside` so no JSX has to change to
lose the grey tray:

- `.widget`: `bg-surface shadow-surface rounded-2xl` (no tray colour).
- `.widget__header`: no fixed height, `flex flex-wrap items-start
  justify-between gap-x-3 gap-y-1`, padding `20px 20px 0` (`24px` from `sm`).
- `.widget__title`: section-title type. `.widget__description`:
  `order-last basis-full text-sm text-muted` so it always wraps under the
  title instead of floating right.
- `.widget__content`: transparent, no inset shadow, no margin, no radius,
  padding 20px (24px from `sm`).

Rules for using sections:

- A section title never repeats the page h1.
- A page with a single form section does not need a section title that
  restates the page.
- `ItemCardGroup variant="secondary"` trays inside a section are allowed
  only for real lists (≥1 row of data). They are not used for one or two
  status facts; those become a line of text or a chip.

### 2.6 Forms

```
Label                                 0/80
[ control                               ]
Hint text, one line.

Label
[ control ]
```

- Field stack: a `Widget.Content` (or any wrapper) that directly contains
  fields gets `className="admin-form"` (`flex flex-col gap-5`). The old
  `className="gap-4"` on `Widget.Content` did nothing (the content is not a
  flex container) and is the cause of labels touching the previous hint.
- `.admin-field`: `flex min-w-0 flex-col gap-1.5`. Hints use
  `<p className="admin-field__hint">` (`text-xs leading-4 text-muted`), never
  `mt-1`.
- `.admin-field-pair`: `grid gap-5 sm:grid-cols-2` for two related short
  fields (start/end, two CTA labels).
- Width helpers on the control box (never on the wrapper that holds label
  and hint): `admin-control--xs` (max 10rem: number fields),
  `admin-control--sm` (max 20rem: selects, dates, hex colour, short codes).
  Free-text inputs and textareas take the full form column.
- The form column itself is capped: direct children of `.admin-form` are
  `max-w-3xl`.
- Character counters move to the right end of the label row
  (`text-xs text-muted tabular-nums`); the hint keeps only the explanation.
- Validation errors: `text-sm text-danger` with `role="alert"` directly under
  the control they belong to.
- Inputs keep `variant="secondary"` (grey field on white surface).

### 2.7 Save model and feedback

- Forms that save with an explicit button keep a single "Lưu thay đổi"
  button in the (sticky) page header. It is disabled while the form is clean
  or invalid and shows `isPending` while saving.
- Save state is shown once, immediately left of that button, by
  `AdminSaveStatus`: dirty → warning dot + "Có thay đổi chưa lưu.";
  just saved → success check + the success message (for example
  "Đã lưu cấu hình trò chơi"); clean and never saved in this visit → nothing.
  It is a `role="status"` element; it replaces both the loose warning
  paragraph and the success `Alert` that currently push the page down.
- Errors stay an inline `Alert status="danger"` at the top of the page body.
- Non-save feedback (link created, copied, asset removed) stays inline next
  to the control that caused it. No toasts (screenshots and chrome-less
  fixtures stay deterministic).
- `UnsavedChangesGuard` is unchanged.
- Irreversible actions that take effect immediately (cancelling a pending
  play link, deleting a saved reward) require an `AlertDialog` confirmation.
  Reversible ones (revoke share link ↔ reopen) do not, and neither does
  removing a row from an unsaved draft (nothing is lost until the form is
  saved).

### 2.8 Status vocabulary

| State | Chip |
|---|---|
| Đang chạy | `color="success" variant="soft"` |
| Bản nháp | `color="default" variant="soft"` |
| Đã lưu trữ | `color="default" variant="soft"` (muted text) |
| Cửa sổ đang mở / Chưa mở cửa sổ / Đã đóng cửa sổ | existing `ScheduleStatusChip` |
| Sẵn sàng | `success` · Cần thiết lập | `warning` |

Chips are `size="sm"` in lists and next to the h1.

## 3. Surfaces

Detailed layouts are added to this section slice by slice (see §5). Summary
of the direction per surface:

| Surface | Direction |
|---|---|
| Campaign index | Card grid with logo, name, status, brand, primary game, updated date; search and status filter once the list is long; guided empty state |
| Create campaign | Two short sections (campaign, first game as visual template cards); brand identity collapsed; "next steps" rail |
| Campaign overview | Real overview: readiness checklist with next step, funnel KPIs, games summary; campaign settings form as the lower half |
| Games list | One row per game with status, window and direct "Vận hành" action; add-game as template cards |
| Game editor | Two columns: form sections left, sticky live preview + launch links right; compact asset rows; sticky save |
| Rewards | One readiness statement; clear split between self-serve inventory and li xi budget; compact table-like tier rows; rows collapsed until edited |
| Distribution | Shared links first (create + list), per-session links second, launch actions for every game |
| Operate | Focused launch panel with inventory facts inline; OTP-style Host PIN; confirmation for cancelling links |
| Analytics | Scope selector in the page header; funnel KPIs first; legacy li xi tables demoted; claims queue reachable directly |
| Settings | Billing as a full-width plan comparison with usage on top; integrations in operator language; operations unchanged in scope |
| Auth / onboarding | A single focused sign-in card; onboarding as a three-step guided start |

## 4. Locked contracts (do not break)

- Everything enforced by `scripts/test-route-ux-policy.mjs`,
  `scripts/verify-saas-contracts.mjs` and the other `test:contracts`
  scripts. When a rule pins a string this design deliberately changes, update
  the rule and `docs/route-ux-standardization.md` in the same slice and say
  so in the report.
- `h1.admin-page__title` text per route, `.admin-page__inner`,
  `.admin-page__actions`, the `.admin-kpi-strip` grid line, all ids,
  `aria-label`s, `data-testid`s and visible strings that
  `tests/ui/*.spec.ts` select on. Read the spec for a surface before
  changing it.
- Sidebar navigation stays three rows in the order Chiến dịch / Phân tích /
  Cài đặt (keyboard test depends on it).
- Guest snapshot baselines (`participant`, `quiz`, `scratch`, `slot`,
  `station` spec folders and the guest-stage shots in `asset-slots`) must not
  change. Admin baselines are refreshed deliberately per slice.
- Terminology: campaign / game / play session / reward. No new
  draw/redemption naming. No mixed-language labels.

## 5. Delivery slices

| Slice | Scope |
|---|---|
| A. Foundations | `admin.css` v2 (page, header, tabs, section restyle, form rhythm, save status), `AdminPageShell` v2, navbar breadcrumb, underline context tabs, analytics tabs alignment, form rhythm and input widths applied to every workspace form, sticky header + save status on the two header-save forms, design-system doc update |
| B. Campaign journey | Campaign index, create, overview, games list, game editor + assets |
| C. Run and measure | Rewards, distribution, operate, analytics, claims |
| D. Account | Settings (billing, integrations, operations), sidebar plan/usage, auth, onboarding, not-found |

## 6. Slice A implementation notes (foundations)

### 6.1 `app/styles/admin.css`

Keep the three `@import` lines, `@theme`, `@layer base`, the
`.admin-kpi-strip` block (its `grid-template-columns` line is pinned by
policy), `.admin-command-summary*`, `.admin-card-grid--*`, sidebar and
`.admin-draw-preview*` rules. Replace or add the following inside
`@layer components`. Values are the contract; equivalent Tailwind spellings
are fine.

```css
/* Page */
.admin-page { @apply min-h-full bg-background text-foreground; }
.admin-page__inner { @apply mx-auto w-full max-w-[1240px] px-4 py-6 sm:px-6 lg:px-8; } /* block: no flex, no gap */
.admin-page__tabs { @apply mb-6; }
.admin-page__header { @apply flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between; }
.admin-page__header[data-sticky="true"] {
	@apply sticky top-0 z-20 -mx-4 -mt-3 bg-background px-4 py-3 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8;
}
.admin-page__header[data-sticky="true"] .admin-page__title { @apply truncate; }
.admin-page__header[data-sticky="true"] + .admin-page__description { @apply -mt-2; }
.admin-page__heading { @apply flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1; }
.admin-page__title { @apply min-w-0 text-2xl font-semibold leading-8 tracking-tight text-foreground; }
.admin-page__description { @apply mt-1 max-w-2xl text-sm leading-5 text-muted; }
.admin-page__actions { @apply flex flex-wrap items-center gap-3 sm:shrink-0 sm:justify-end; }
.admin-page__body { @apply mt-6 flex min-w-0 flex-col gap-6; }
.admin-page__body > * { @apply min-w-0; }

/* Breadcrumb (navbar host or inline fallback) */
.admin-breadcrumbs { @apply min-w-0 text-sm text-muted; }
.admin-breadcrumbs ol { @apply flex min-w-0 items-center gap-1; }
.admin-breadcrumbs li { @apply flex min-w-0 items-center gap-1; }
.admin-breadcrumbs li > a,
.admin-breadcrumbs li > span { @apply max-w-[16rem] truncate; }
.admin-breadcrumbs a { @apply rounded-sm outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-focus; }
.admin-breadcrumbs [aria-current="page"] { @apply font-medium text-foreground; }
.admin-breadcrumbs li:nth-last-child(n + 3) { @apply hidden md:flex; } /* < md: last two crumbs only */
.admin-breadcrumbs--inline { @apply mb-3; }

/* Context tabs (router links) */
.admin-tabs { @apply flex gap-6 overflow-x-auto; box-shadow: inset 0 -1px 0 var(--border); scrollbar-width: none; }
.admin-tabs::-webkit-scrollbar { display: none; }
.admin-tabs__link { @apply inline-flex h-10 shrink-0 items-center gap-1.5 border-b-2 border-transparent text-sm font-medium text-muted outline-none transition-colors hover:text-foreground; }
.admin-tabs__link[aria-current="page"] { @apply border-accent text-foreground; }
.admin-tabs__link--away { @apply ml-auto; }
/* plus a focus-visible indicator that is not clipped by the scroll container */

/* HeroUI Tabs used as view tabs: must look identical to .admin-tabs */
/* .admin-view-tabs: left-aligned, natural-width tabs (no equal columns),
   24px gap, 40px tall, full-width 1px baseline, 2px accent indicator. */

/* Sections: flatten the HeroUI Pro Widget tray into one white card */
.admin-page .widget,
.admin-aside .widget { @apply rounded-2xl bg-surface shadow-surface; }
.admin-page .widget__header,
.admin-aside .widget__header { @apply mt-0 h-auto min-h-0 flex-wrap items-start justify-between gap-x-3 gap-y-1 px-5 pb-0 pt-5 sm:px-6 sm:pt-6; }
.admin-page .widget__title,
.admin-aside .widget__title { @apply text-base font-semibold leading-6; }
.admin-page .widget__description,
.admin-aside .widget__description { @apply order-last mt-0 basis-full text-sm leading-5 text-muted; }
.admin-page .widget__content,
.admin-aside .widget__content { @apply m-0 rounded-none bg-transparent p-5 shadow-none sm:p-6; }
.admin-page .widget__footer,
.admin-aside .widget__footer { @apply px-5 pb-5 pt-0 sm:px-6 sm:pb-6; }

/* Forms */
.admin-stack { @apply flex flex-col gap-5; }               /* any vertical stack inside a section */
.admin-form { @apply flex flex-col gap-5; }                /* a stack of fields */
.admin-form > * { @apply max-w-3xl; }                      /* fields never stretch past 48rem */
.admin-field { @apply flex min-w-0 flex-col gap-1.5; }
.admin-field__label-row { @apply flex items-baseline justify-between gap-3; }
.admin-field__counter { @apply shrink-0 text-xs tabular-nums text-muted; }
.admin-field__hint { @apply text-xs leading-4 text-muted; }
.admin-field-pair { @apply grid gap-5 sm:grid-cols-2; }
.admin-control--xs { @apply max-w-40; }                    /* numbers */
.admin-control--sm { @apply max-w-xs; }                    /* selects, datetime, hex, short codes */

/* Save status */
.admin-save-status { @apply inline-flex min-w-0 items-center text-sm; }
.admin-save-status__item { @apply inline-flex min-w-0 items-center gap-1.5; }
.admin-save-status__dot { @apply size-2 shrink-0 rounded-full bg-warning; }
```

The existing unscoped `.widget__*` / `.item-card__*` overrides stay (other
admin surfaces outside `.admin-page` rely on them); the scoped rules above
win by specificity. `.admin-page__eyebrow` is deleted.

Width caps go on the control box (the `Input`, the `NativeSelect` root, the
`NumberField.Group`), never on the wrapper that also holds the label or hint,
so long labels do not wrap.

### 6.2 `AdminPageShell`

```tsx
<div className="admin-page">
  <div className="admin-page__inner">
    {/* inline only when there is no workspace context */}
    {tabs ? <div className="admin-page__tabs">{tabs}</div> : null}
    <header className="admin-page__header" data-sticky={stickyHeader ? "true" : undefined}>
      <div className="admin-page__heading">
        <h1 className="admin-page__title">{title}</h1>
        {status}
      </div>
      {actions ? <div className="admin-page__actions">{actions}</div> : null}
    </header>
    {description ? <p className="admin-page__description">{description}</p> : null}
    <div className="admin-page__body">{children}</div>
    {/* aside portal (unchanged) and breadcrumb portal */}
  </div>
</div>
```

`AdminWorkspaceContext` value becomes
`{ asideHost, breadcrumbHost, setHasAside }`. One breadcrumb `<nav
aria-label="Đường dẫn trang" className="admin-breadcrumbs">` element is built
once and either portaled into `breadcrumbHost` (workspace context present and
host mounted), rendered inline with `admin-breadcrumbs--inline` (no workspace
context), or not rendered (context present, host not mounted yet).

### 6.3 `AdminSaveStatus` (`app/components/AdminSaveStatus.tsx`)

`<AdminSaveStatus dirty={boolean} savedMessage={string | undefined} />`
renders one `role="status"` element: dirty → dot + `<span>Có thay đổi chưa
lưu.</span>` in `text-warning`; not dirty and `savedMessage` set → check icon
+ `<span>{savedMessage}</span>` in `text-success`; otherwise empty. It is the
first child of the header `actions`, before the save button.

### 6.4 Slice A file scope for the form rhythm pass

Full pass (`admin-form` / `admin-stack` on the field container, hints to
`admin-field__hint` inside their `.admin-field`, two-field rows to
`admin-field-pair`, width caps on number / select / datetime / hex controls):
`app/game-templates/GamePublicCopyFields.tsx`, the five
`app/game-templates/*/*ConfigEditor.tsx`, and in `app/_workspace`:
`CampaignBrandIdentityFields`, `CampaignLogoField`, `CampaignCreateFeature`,
`CampaignOverviewFeature`, `CampaignGameEditorFeature`,
`CampaignSectionFeature`, `OperationsSettingsFeature`,
`OperatorConsoleFeature`, `ShareLinksPanel`.

Light pass (only swap hint classes and ineffective `gap-*` on
`Widget.Content`; leave grids alone, later slices restructure them):
`RewardsSetupFeature`, `RewardInventoryPanel`, `RewardClaimsPanel`,
`DistributionFeature`.

`eyebrow=` call sites to delete: `CampaignGameEditorFeature` (2),
`CampaignOverviewFeature`, `CampaignSectionFeature`, `DistributionFeature`,
`OperatorConsoleFeature` (3), `RewardsSetupFeature`.

Context nav moves into the `tabs` prop in: `CampaignOverviewFeature`,
`CampaignSectionFeature`, `CampaignGameEditorFeature`, `RewardsSetupFeature`,
`DistributionFeature`, `BillingSettingsFeature`,
`IntegrationsSettingsFeature`, `OperationsSettingsFeature`, and the top-level
`<Tabs>` of `AnalyticsFeature`.

### 6.5 Slice A visual checklist

Captured with `UX_OUT=.tmp/ux-audit/slice-a node
.tmp/ux-audit/capture-tall.mjs` (fixture server on 127.0.0.1:3210). Check at
least `campaign-overview`, `editor-wheel`, `campaign-rewards`,
`analytics-overview`, `settings-billing`, `campaigns-new` at 1440 and
`editor-wheel`, `analytics-claims` at 390.

a. The navbar shows the breadcrumb, not a static section label; there is no
   breadcrumb and no eyebrow in the page body.
b. Underline tabs sit above the h1 on campaign, settings and analytics pages
   and look the same in all three; exactly one tab is current (on the game
   editor: "Trò chơi").
c. No grey tray around a white inset anywhere; each section description sits
   directly under its title.
d. In forms every hint sits under its own control and the next label is
   clearly separated; number / select / date controls are narrow; no text
   input is wider than 48rem.
e. On `editor-wheel` scrolled to the bottom the header with "Lưu thay đổi"
   is still visible; after editing a field "Có thay đổi chưa lưu." appears
   left of the button.
f. `settings-operations` at 1440×900 has no vertical scrollbar.
g. No horizontal overflow at 390.

### 6.6 Slice A follow-up (fix in slice B)

Found in review of `.tmp/ux-audit/slice-a/campaign-overview-1440.png` and
`editor-wheel-1440.png` (also baked into the refreshed baselines): on pages
with `stickyHeader` the page description is clipped. The sticky header has
`py-3` and an opaque `bg-background` at `z-20`, and the rule
`.admin-page__header[data-sticky="true"] + .admin-page__description { -mt-2 }`
pulls the description up underneath it, so the top half of the sentence is
covered.

Fix: the description must start below the sticky header's box. Replace the
`-mt-2` rule with `mt-0` and give the sticky header `pb-2` instead of the
bottom half of `py-3` (`pt-3 pb-2`). The description must be fully legible at
1440 and 390, both at scroll top and never drawn over the header when
scrolled.


## 7. Slice B: campaign journey

Surfaces: campaign index, create, campaign overview, games list, game editor
(+ assets, config editors). Builds on §2 and §6; the classes below are added
to `app/styles/admin.css` inside `@layer components`.

Before changing or removing any visible string, id, `aria-label` or
`data-testid`, grep `tests/ui` and `scripts/`. Anything pinned there stays
unless this section names it as changing.

### 7.1 Shared building blocks

```css
/* Small muted caption that names a group of fields or a page region */
.admin-group-label { @apply text-xs font-semibold uppercase tracking-wide text-muted; }

/* 40px icon tile used in list rows, cards and choice cards */
.admin-icon-tile { @apply grid size-10 shrink-0 place-items-center rounded-xl bg-surface-secondary text-foreground; }

/* A whole card that is one link (campaign index) */
.admin-card-link { @apply flex h-full min-w-0 flex-col gap-3 rounded-2xl bg-surface p-5 shadow-surface outline-none transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:ring-focus; }

/* Rows inside a section card (games, checklist) */
.admin-rows { @apply flex flex-col; }
.admin-row { @apply flex min-w-0 items-center gap-3 py-1; }
.admin-row + .admin-row { @apply border-t border-border; }
.admin-row__main { @apply -mx-2 flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2 rounded-xl px-2 py-2.5 outline-none transition-colors hover:bg-surface-secondary focus-visible:ring-2 focus-visible:ring-focus; }
.admin-row__text { @apply flex min-w-0 flex-[1_1_12rem] flex-col; }
.admin-row__title { @apply truncate text-sm font-medium text-foreground; }
.admin-row__meta { @apply truncate text-xs text-muted; }
.admin-row__chips { @apply flex flex-wrap items-center gap-1.5; }

/* Radio cards (template picker) */
.admin-choice-grid { @apply grid gap-3 sm:grid-cols-2; }
/* .admin-choice-card: bordered 16px-padded card, 1px border-border,
   rounded-xl; selected = border-accent + bg-accent-soft (what the create
   form does today). Icon tile left, name (text-sm font-medium) and one-line
   blurb (text-xs text-muted) right. */

/* Two-column page body: main column + side column from xl */
.admin-split { @apply grid items-start gap-6 xl:gap-8; }
.admin-split--rail { @apply xl:grid-cols-[minmax(0,1fr)_18rem]; }
.admin-split--preview { @apply xl:grid-cols-[minmax(0,1fr)_minmax(22rem,26rem)]; }
.admin-split__main { @apply flex min-w-0 flex-col gap-6; }
.admin-split__side { @apply flex min-w-0 flex-col gap-4 xl:sticky xl:top-20; }

/* Collapsible block inside a section */
.admin-disclosure { @apply border-t border-border pt-4; }
.admin-disclosure__trigger { @apply flex w-full items-center gap-2 rounded-lg text-left text-sm font-medium text-foreground; }
.admin-disclosure__summary { @apply min-w-0 truncate text-xs font-normal text-muted; }
.admin-disclosure__body { @apply flex flex-col gap-5 p-0 pt-4; }

/* Stat row (label above number, no boxes) */
.admin-stats { @apply grid gap-x-6 gap-y-4; grid-template-columns: repeat(auto-fit, minmax(8.5rem, 1fr)); }
.admin-stats dt { @apply text-xs text-muted; }
.admin-stats dd { @apply text-2xl font-semibold tabular-nums text-foreground; }
.admin-stats dd.admin-stats__note { @apply text-xs font-normal text-muted; }

/* Scaled game preview */
.admin-preview-frame { @apply w-full overflow-hidden rounded-2xl; }
.admin-preview-frame__stage { transform-origin: top left; }
```

New components (all under `app/_workspace/-components/`):

- `GameTemplateIcon.tsx`: `<GameTemplateIcon templateId size? />`, one
  lucide icon per template id (`li-xi` Gift, `lucky-wheel` a wheel-like icon,
  `scratch-card` Ticket, `slot-reveal` Dices, `quiz` CircleHelp; pick names
  that exist in the installed lucide-react). Always `aria-hidden`.
- `GameTemplatePicker.tsx`: the radio-card grid. Props `value`,
  `onChange(templateId)`. Owns the five one-line blurbs that live in
  `CampaignCreateFeature` today (`templateChoices`). Imports the catalog from
  `@/lib/gameTemplates` only (never the registry). Each radio keeps
  ``aria-label={`Chọn mẫu ${template.name}`}``.
- `AdminDisclosure.tsx` (in `app/components/`): HeroUI `Disclosure` wrapper.

  ```tsx
  <Disclosure className="admin-disclosure" defaultExpanded={defaultExpanded}>
    <Disclosure.Heading>
      <Disclosure.Trigger className="admin-disclosure__trigger">
        <span>{title}</span>
        {summary ? <span className="admin-disclosure__summary">{summary}</span> : null}
        <Disclosure.Indicator />
      </Disclosure.Trigger>
    </Disclosure.Heading>
    <Disclosure.Content>
      <Disclosure.Body className="admin-disclosure__body">{children}</Disclosure.Body>
    </Disclosure.Content>
  </Disclosure>
  ```

  Collapsed content stays mounted (field state survives). A `bare` prop drops
  the top border/padding for use as a whole section (create form).
- `GamePreviewFrame.tsx`: renders its child at a fixed 640px logical width
  and scales it down to the available width (the preview components are
  16:9 sections designed for ~640px and clip their content when narrower,
  see `.tmp/ux-audit/crops/slot-390-bottom.png`).

  ```tsx
  const BASE = 640;
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const update = () => setScale(Math.min(1, node.clientWidth / BASE));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return (
    <div className="admin-preview-frame" ref={ref} style={{ height: (BASE * 9 / 16) * scale }}>
      <div className="admin-preview-frame__stage" style={{ width: BASE, transform: `scale(${scale})` }}>{children}</div>
    </div>
  );
  ```

  The preview components themselves are not edited.

- `lib/rewardReadiness.ts` (not under `app/`): one pure helper shared by the
  overview checklist (§7.4) and the rewards page (§8.2), so both always
  agree.

  ```ts
  export function rewardReadiness(
    games: Array<{ config: CampaignGameConfig }>,
    state: { hasBudget: boolean; inventoryCount: number },
  ) {
    const rewarded = games.filter((game) => configRewardMode(game.config) === "rewarded");
    const needsBudget = rewarded.some((game) => configRewardSource(game.config) === "campaign-budget");
    const needsInventory = rewarded.some((game) => configRewardSource(game.config) === "campaign-inventory");
    const missingBudget = needsBudget && !state.hasBudget;
    const missingInventory = needsInventory && state.inventoryCount === 0;
    return { needsBudget, needsInventory, missingBudget, missingInventory, ready: !missingBudget && !missingInventory };
  }
  ```

  Add `lib/rewardReadiness.test.ts` (Vitest) covering: no rewarded game → ready;
  budget game without setup → not ready; inventory game with 0 items → not
  ready; both satisfied → ready.

Audience tag toggles (`CampaignBrandIdentityFields`): a selected tag is
`variant="secondary"` with a leading 14px `Check` icon (`aria-hidden`), an
unselected tag `variant="outline"`; both `size="sm"`. They are not primary
buttons. `aria-pressed` and the accessible names stay.

### 7.2 Campaign index (`CampaignIndexFeature`)

```
Chiến dịch                                              [+ Tạo chiến dịch]
Theo dõi trạng thái và mở đúng ngữ cảnh vận hành của từng chiến dịch.

┌──────────────────────────────┐ ┌──────────────────────────────┐
│ [logo] Chiến dịch tri ân A  [Đang chạy] │ │ [icon] Chiến dịch tri ân B  [Đang chạy] │
│        ● Thương hiệu A        │ │        Thương hiệu B          │
│ Chiến dịch tri ân khách hàng… │ │ Chiến dịch chạy thử mẫu…      │
│ [Khách hàng mới] [Khách mời…] │ │                              │
└──────────────────────────────┘ └──────────────────────────────┘
```

- `<ul aria-label="Danh sách chiến dịch" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">`
  of `<li>` → `<Link className="admin-card-link" to="/campaigns/$campaignId">`.
  No `ItemCardGroup` tray. Keep the literal `workspace.campaigns.map`.
- Row 1 (`flex items-start gap-3`): logo `img` 40px `rounded-xl object-cover`
  with ``alt={`Logo ${campaign.name}`}``, or `.admin-icon-tile` with a lucide
  icon when there is no logo (never an `img`); then name
  (`text-sm font-semibold`, truncate) over the brand line (`text-xs
  text-muted`: brand-colour dot + `brandName`, falling back to `/${slug}`);
  status chip (`size="sm"`, §2.8) pinned right.
- The brand-colour dot stays the first `span[style]` inside the link
  (`size-2.5 rounded-full`, `aria-hidden`), rendered only when the campaign
  has a colour.
- Row 2: `description`, `text-sm text-muted line-clamp-2`; omitted when empty.
- Row 3: audience tag chips (`size="sm"`), omitted when there are none.
- Empty state and header action unchanged.

### 7.3 Create campaign (`CampaignCreateFeature`)

```
Tạo chiến dịch
Tạo chiến dịch và chọn trò chơi đầu tiên; có thể thêm trò chơi khác sau khi lưu.

┌ Thông tin chiến dịch ────────────────┐   SAU KHI TẠO
│ Tên chiến dịch  [                 ]  │   1  Cấu hình trò chơi
│ Từ 3 đến 80 ký tự.                   │      Nội dung, giới hạn lượt chơi, hình ảnh.
│ Thương hiệu     [                 ]  │   2  Thêm phần thưởng
│ Mô tả           [                 ]  │      Kho phần thưởng dùng chung của chiến dịch.
│ Trạng thái ban đầu [Bản nháp ▾]      │   3  Phát hành
└──────────────────────────────────────┘      Tạo liên kết chơi hoặc mở trạm tại quầy.
┌ Chọn mẫu trò chơi đầu tiên ──────────┐
│ [▣ Lunar Fortune ] [◻ Vòng quay    ] │
│ [◻ Thẻ cào       ] [◻ Máy quay     ] │
│ [◻ Trắc nghiệm   ]                   │
└──────────────────────────────────────┘
┌ Nhận diện thương hiệu (tuỳ chọn)  Màu, đối tượng, ghi chú            ⌄ ┐
└──────────────────────────────────────┘
[Tạo và cấu hình trò chơi]  Huỷ
```

- Body is `.admin-split.admin-split--rail`. Main column: three sections and
  the action row. Side column (from `xl` only, `hidden xl:flex`): an
  `.admin-group-label` "Sau khi tạo" and an `<ol>` of the three steps above
  (number in `text-muted tabular-nums`, step title `text-sm font-medium`,
  detail `text-xs text-muted`). Plain text: no card, no links.
- Section 1 keeps its fields, ids, labels and the status select
  (`admin-control--sm`). The nested bordered "brand identity" box moves out
  of it.
- Section 2 uses `GameTemplatePicker`. The footer hint "Kho phần thưởng và
  liên kết chơi công khai được cấu hình ở các bước sau." is deleted (the
  side list says it).
- Section 3 is one section card whose whole content is an `AdminDisclosure
  bare` titled "Nhận diện thương hiệu (tuỳ chọn)", summary "Màu, đối tượng,
  ghi chú", collapsed by default; body = `CampaignBrandIdentityFields
  idPrefix="new-campaign"` + the existing logo note as an
  `admin-field__hint`. `tests/ui/asset-slots.spec.ts` ("create form:
  optional brand section…") must click that trigger before it asserts the
  hex hint and fills `#new-campaign-brand-color`; that is the only spec edit.
- Action row (`flex flex-wrap items-center gap-3`): the existing primary
  button "Tạo và cấu hình trò chơi" (same disabled rule) and a ghost link
  "Huỷ" to `/campaigns`.
- Policy literals that must survive in this file: `initialCampaignConfig`,
  `useState<GameTemplateId>("li-xi")`, `UnsavedChangesGuard`,
  `status !== "draft"`, `to: "/campaigns/$campaignId/games/$campaignGameId"`,
  and no import of `@/app/game-templates/registry`.

### 7.4 Campaign overview (`CampaignOverviewFeature`)

The route becomes a real overview; the settings form stays on the same
route as the lower half.

```
Chiến dịch tri ân A  [Đang chạy]                 ● Có thay đổi chưa lưu. [Lưu thay đổi]

┌ Hoàn tất thiết lập                                            3/4 bước ┐
│ ✓ Trò chơi            5/5 trò chơi đang chạy.                          │
│ ✓ Phần thưởng         Kho phần thưởng đã có dữ liệu.                   │
│ ○ Phát hành           Chưa có liên kết chơi. Tạo liên kết…  [Tạo liên kết chơi] │
│ ✓ Kích hoạt           Chiến dịch đang chạy.                            │
└────────────────────────────────────────────────────────────────────────┘
┌ Hiệu quả                                              Xem phân tích → ┐
│ Lượt mở      Lượt bắt đầu     Lượt hoàn tất     Lượt nhận thưởng       │
│ 120          96               84                78                     │
└────────────────────────────────────────────────────────────────────────┘
┌ Trò chơi                                           Quản lý trò chơi → ┐
│ [i] Bánh bao lì xì (chính)   Lunar Fortune        [Đang chạy] [▶ Vận hành] │
│ [i] Vòng quay may mắn …      [Cửa sổ đang mở] [Đang chạy]     [▶ Vận hành] │
└────────────────────────────────────────────────────────────────────────┘
THIẾT LẬP CHIẾN DỊCH
┌ Thông tin chiến dịch … ┐
┌ Nhận diện thương hiệu … ┐
```

New component `app/_workspace/-features/CampaignOverviewSummary.tsx`
(`campaign`, `onEditStatus`) renders the first three blocks; the feature
renders it above the form. Header `status` = campaign status chip (saved
value).

Data (existing queries, all keyed by `campaignId`; render a block only once
its data has loaded, never a placeholder card):
`api.campaigns.getCampaignGamesRouteContext` → `campaignGames`;
`api.setup.getSetupState` → `hasSetup`;
`api.rewardInventory.getRewardInventory` → `items`;
`api.shareLinks.listShareLinks` → `links`;
`api.analytics.getCampaignAnalytics` → `gameMetrics`.

**Checklist** (section title "Hoàn tất thiết lập", right side `n/4 bước` in
`text-sm text-muted tabular-nums`). Rendered only while at least one step is
open; when all four are done the whole section is not rendered. Rows are
`.admin-row` (not links): a 20px icon (`CircleCheck` `text-success` when
done, `Circle` `text-muted` when open), title (`admin-row__title`, fixed
`w-32` from `sm`), detail (`text-sm text-muted`, `flex-1`), and for open
steps only one small action at the right (`buttonVariants({ size: "sm",
variant: "secondary" })` link, or a `Button` for the last step).

| Step | Done when | Detail (done / open) | Action when open |
|---|---|---|---|
| Trò chơi | ≥1 game with `status === "active"` | `{active}/{total} trò chơi đang chạy.` / `Chưa có trò chơi nào đang chạy.` | link "Cấu hình trò chơi" → games |
| Phần thưởng | `rewardReadiness(campaignGames, { hasBudget: hasSetup, inventoryCount: items.length }).ready` | `Kho phần thưởng đã có dữ liệu.` (or, when neither source is needed, `Các trò chơi đang chạy ở chế độ không thưởng.`) / `Chưa có phần thưởng cho trò chơi có thưởng.` | link "Thêm phần thưởng" → rewards |
| Phát hành | ≥1 share link with `status === "active"`, or `gameMetrics.opens > 0` | `{n} liên kết chơi đang hoạt động.` (or `Đã có người chơi tham gia.`) / `Chưa có liên kết chơi. Tạo liên kết hoặc mở trạm tại quầy.` | link "Tạo liên kết chơi" → distribution |
| Kích hoạt | `campaign.status === "active"` | `Chiến dịch đang chạy.` / `Chiến dịch đang ở trạng thái {Bản nháp\|Đã lưu trữ}; người chơi chưa thể tham gia.` | button "Đổi trạng thái" → scrolls to and focuses `#campaign-overview-status` |

**Hiệu quả**: `<dl className="admin-stats">` with Lượt mở (`opens`), Lượt
bắt đầu (`starts`), Lượt hoàn tất (`completions`), Lượt nhận thưởng
(`claims`), formatted with `Intl.NumberFormat("vi-VN")`. Section header
action: link "Xem phân tích" → `/analytics` with `search={{ campaign:
campaignId }}` (same search shape the campaign nav's "Phân tích" link uses).
When `opens` and `starts` are both 0 the `<dl>` is replaced by one line:
"Chưa có lượt chơi. Dữ liệu xuất hiện sau khi người chơi mở liên kết hoặc
trạm." (`text-sm text-muted`).

**Trò chơi**: `.admin-rows`, at most five games. Each `.admin-row` =
`Link.admin-row__main` to the editor (icon tile with `GameTemplateIcon`,
name, template name as meta, chips: `ScheduleStatusChip size="sm"` + status
chip) followed by a sibling link ``aria-label={`Vận hành ${name}`}``
(`buttonVariants({ size: "sm", variant: "secondary" })`, `Play` 14px +
"Vận hành") to `/operate/$campaignGameId`. Header action: link "Quản lý trò
chơi" → games tab. More than five games: a last line link
`Xem tất cả {n} trò chơi`. No games: one line "Chưa có trò chơi." + the same
header link.

**Form half**: an `.admin-group-label` "Thiết lập chiến dịch", then the
section "Thông tin chiến dịch" first and "Nhận diện thương hiệu" second.
Fields, ids, `data-testid="campaign-brand-metadata"`, logo field, save
logic, `UnsavedChangesGuard` and `loadedCampaignId` are unchanged. Nothing
in the summary may render the exact text "Chưa có" or a button named
"Lưu thay đổi" / "Gỡ logo" (strict locators in `asset-slots.spec.ts`).

Fixture coverage: add `overviewMode=setup` to the workspace fixture (same
mechanism as `campaignsMode`): campaign status `draft`, every game `draft`,
`hasSetup: false` with no budget items, empty inventory, no share links,
zero metrics. Add the state `campaign-overview-setup`
(`route=overview&overviewMode=setup`, heading "Chiến dịch tri ân A") to the
state list in `workspace.spec.ts` so it gets 1440 and 390 baselines.

### 7.5 Games list (`CampaignSectionFeature`)

```
Trò chơi chiến dịch                                        [+ Thêm trò chơi]
Mỗi trò chơi là một trải nghiệm độc lập thuộc chiến dịch, với cấu hình và trạng thái riêng.

┌────────────────────────────────────────────────────────────────────────┐
│ [i] Bánh bao lì xì (chính)                      [Đang chạy]  [▶ Vận hành] │
│     Lunar Fortune                                                        │
│ ─────────────────────────────────────────────────────────────────────── │
│ [i] Vòng quay may mắn       [Cửa sổ đang mở] [Đang chạy]  [▶ Vận hành]   │
│     Vòng quay may mắn                                                    │
└────────────────────────────────────────────────────────────────────────┘
```

- One section card (no title) containing `<ul aria-label="Danh sách trò chơi
  chiến dịch" className="admin-rows">`; rows exactly as in §7.4 "Trò chơi"
  (all games, not five). Keep the literal `campaignGames.map`. The chips
  stay inside the `<a>` that contains the game name (spec locators).
- Meta line is the template name only; "Trải nghiệm #id" is deleted.
- The chip row under the tabs (campaign status + "n trải nghiệm đã cấu
  hình") is deleted. Instead, when `campaign.status === "active"` is false,
  render one `Alert status="warning"` above the list: title `Chiến dịch đang
  ở trạng thái {label}`, description "Người chơi chưa thể tham gia cho đến
  khi chiến dịch được kích hoạt.", with a link "Mở tổng quan" to the
  overview. Nothing when the campaign is active.
- Add-game is a dialog, not an always-open form. Header action: primary
  `Button` "Thêm trò chơi" (`Plus` icon). It opens a HeroUI `Modal`
  (`Modal.Backdrop isOpen onOpenChange` → `Modal.Container
  placement="center" size="lg"` → `Modal.Dialog` with `Modal.CloseTrigger`,
  `Modal.Header` > `Modal.Heading` "Thêm trò chơi", `Modal.Body`,
  `Modal.Footer`). Body: `GameTemplatePicker` (default `lucky-wheel`), then
  the existing optional name field (`#add-game-name`, placeholder = selected
  template name) and the error `Alert` when the mutation fails. Footer:
  ghost "Huỷ", primary "Thêm trò chơi" (`isPending` while creating). On
  success the dialog closes and the existing success message shows as an
  `Alert status="success"` above the list. The `#add-game-template` select
  is replaced by the picker.
- Policy literals that must survive in this file:
  `api.campaignGames.createCampaignGame`, `gameTemplateCatalog`,
  `getCampaignGamesRouteContext`, `ensureCampaignGameForRoute`,
  `campaignGames.map`, `campaign.status === "active"`, "Đã lưu trữ",
  "Thêm trò chơi"; never `campaign.campaignGame` or "Sắp có".

### 7.6 Game editor (`CampaignGameEditorFeature`)

```
Tổng quan  Trò chơi  Phần thưởng  Phân phối                      Phân tích ↗
Vòng quay may mắn [Đang chạy]                ● Có thay đổi chưa lưu. [Lưu thay đổi]

┌ Trạng thái và giới hạn chơi ─────────┐   XEM TRƯỚC
│ …                                    │   ┌───────────────────────────┐
└──────────────────────────────────────┘   │   (scaled 16:9 preview)   │
┌ Vòng quay ───────────────────────────┐   └───────────────────────────┘
│ …                                    │   Cập nhật theo thay đổi chưa lưu.
│ ▸ Tuỳ chọn nâng cao                  │
└──────────────────────────────────────┘   BƯỚC TIẾP THEO
┌ Nội dung trải nghiệm ────────────────┐   Phần thưởng →
│ MÀN MỞ ĐẦU … TRONG LÚC CHỜ … KẾT QUẢ │   Phân phối →
└──────────────────────────────────────┘   Vận hành →
┌ Hình ảnh ────────────────────────────┐
│ [thumb] Ảnh chủ đạo        [Chọn ảnh]│
└──────────────────────────────────────┘
```

- Body is `.admin-split.admin-split--preview`. Main column
  (`.admin-split__main`): error `Alert`, "Trạng thái và giới hạn chơi",
  `<ConfigEditor>`, `CampaignGameAssetsPanel`. Side column
  (`.admin-split__side`, `order-first xl:order-none`):
  - `.admin-group-label` "Xem trước", then `<GamePreviewFrame><Preview …
    /></GamePreviewFrame>` (wrapper `max-w-md xl:max-w-none`), then an
    `admin-field__hint` "Cập nhật theo thay đổi chưa lưu.".
  - From `xl` only (`hidden xl:flex flex-col gap-2`): `.admin-group-label`
    "Bước tiếp theo" and three plain links (`text-sm font-medium
    text-accent`, trailing `ArrowRight` 14px): "Phần thưởng" → rewards,
    "Phân phối" → distribution, "Vận hành" → `/operate/$campaignGameId`.
- The side column is sticky below the sticky header (`xl:top-20`; adjust the
  offset so there is a 16px gap under the header and nothing overlaps).
- The preview is not moved into the AppLayout aside (chrome-less fixtures
  mount the editor without a layout and assert on preview test ids). Update
  the matching rule in `docs/admin-design-system.md`.
- Header, save logic, `UnsavedChangesGuard`, `loadedCampaignGameId`,
  `template.ConfigEditor` literal: unchanged.

**Config editors** (all five): in the mechanics section the two rarely
changed fields, "Nhãn lượt không trúng" (quiz: "Nhãn lượt chưa đạt") and
"Nhóm kho phần thưởng", move into an `AdminDisclosure` titled "Tuỳ chọn nâng
cao" at the end of that section; summary = `Nhóm kho: {rewardPoolTag}`;
`defaultExpanded` only when the pool tag differs from
`DEFAULT_REWARD_POOL_TAG`. Every other field stays visible on load (specs
address "Trọng số lượt không trúng (0-100)", the play-limit fields and the
schedule inputs directly). The li xi editor's duplicated hint under the
weight field ("0 = luôn trúng khi còn quà; …" appears twice) is reduced to
the first paragraph.

**`GamePublicCopyFields`**: same seven fields, ids and labels, grouped under
three `.admin-group-label` captions in this order:
"Màn mở đầu" (Tiêu đề, Mô tả ngắn, Nút bắt đầu), "Trong lúc chờ" (Thông điệp
chờ), "Kết quả" (Nút nhận kết quả, Thông điệp cảm ơn, Hướng dẫn nhận
thưởng). The two button-label inputs are `admin-control--sm`. Groups are
separated by 24px (`gap-6` between groups, `gap-5` inside).

**Quiz questions**: each question is a bordered list card (`rounded-xl
border border-border p-4`, `admin-stack`):

```
Câu hỏi 1                                                  [🗑 Xóa câu]
[ prompt textarea                                                     ]
LỰA CHỌN · chọn đáp án đúng
(•) [ Chất lượng sản phẩm                                       ] [🗑]
( ) [ Chăm sóc khách hàng                                       ] [🗑]
+ Thêm lựa chọn
Giải thích (tuỳ chọn)
[                                                                     ]
Hiện sau khi người chơi hoàn thành.
```

The per-choice "Đúng / —" `NativeSelect` is replaced by a native radio
(``name={`quiz-correct-${questionIndex}`}``, ``aria-label={`Đáp án đúng của
câu ${questionIndex + 1}: lựa chọn ${choiceIndex + 1}`}``, `size-4`,
`accent-color: var(--accent)`), vertically centred with its input. The
explanation input gets a visible label and hint instead of a placeholder.
"Thêm câu hỏi" stays a secondary button under the last card; the validity
message becomes `text-sm text-danger` with `role="alert"`. Config logic and
the integrity check are unchanged.

**Assets panel** (`CampaignGameAssetsPanel`): one section titled "Hình ảnh"
with description "JPEG, PNG hoặc WebP." and compact rows instead of
full-width 16:9 frames:

```
[thumb 112×63]  Ảnh chủ đạo                                   [Chọn ảnh]
                Chưa có ảnh chủ đạo
──────────────────────────────────────────────────────────────────────
[thumb 112×63]  Ảnh tâm vòng quay                   [Chọn ảnh] [Gỡ ảnh]
                {slot.description} Tỉ lệ {slot.aspectRatioLabel}.
```

- Rows are `.admin-row` with `items-start` and `py-3`. Thumbnail: `w-28
  aspect-video shrink-0 rounded-lg object-cover` image (same `alt` texts as
  today), or a same-size `bg-surface-secondary` tile with a muted `Image`
  icon when empty. Title `admin-row__title`; meta `text-xs text-muted`
  (wraps, not truncated). Buttons `size="sm"` (`secondary` for choose,
  `ghost` for remove) at the right; below `sm` they wrap under the text.
- The empty texts "Chưa có ảnh chủ đạo" and "Chưa có ảnh (dùng hình mặc
  định)" move into the meta line of their row. "Ảnh chủ đạo" is now the
  hero row's title (it must stay the only element with that exact text).
- Upload progress bars render under the row being uploaded; the feedback
  `Alert` stays at the top of the section. Upload/attach/detach logic,
  input ids, button names and feedback strings are unchanged.

### 7.7 Slice B visual checklist

Capture with `UX_OUT=.tmp/ux-audit/slice-b node
.tmp/ux-audit/capture-tall.mjs` (add `campaign-overview-setup` to its state
list) at 1440 and 390, and open the PNGs.

a. Index: white cards, status chip top-right, no grey tray; card B has no
   chips row and no image.
b. Create: the template picker is a two-column card grid; the brand section
   is collapsed on load and expands on click; the side list shows from
   1280px; the primary button directly follows the last section.
c. Overview (default fixture): no checklist or a checklist with only open
   steps flagged; stats show 120 / 96 / 84 / 78; five game rows with a
   "Vận hành" link each. Overview (`overviewMode=setup`): checklist shows
   0/4 with four actions; the stats block shows the single empty line.
d. Games: one card of rows; clicking "Thêm trò chơi" opens the dialog with
   the picker; creating a game closes it and shows the success alert.
e. Editor at 1440: two columns; the preview is fully visible (headline and
   button not clipped) and stays in view while the form scrolls; at 390 the
   preview is first, fully visible and not clipped.
f. Editor: "Tuỳ chọn nâng cao" is collapsed on load and contains the pool
   tag and miss-label fields; copy fields are grouped under three captions.
g. Assets: compact rows, no 16:9 frame wider than 112px.
h. No horizontal overflow at 390 on any of these pages; at 390 a game row
   shows name, chips and "Vận hành" without overlap.

### 7.8 Slice B1 follow-up (fix at the start of slice B2)

Found when reviewing the B1 captures in `.tmp/ux-audit/slice-b1/`. Six small
fixes; nothing else on these pages changes, and everything §7.2–§7.5 locked
stays locked.

1. **Unselected radio is invisible in the template picker.** On a white
   choice card the HeroUI radio control has no visible edge
   (`campaigns-new-1440.png`, `probe-add-game-dialog.png`), so four of the
   five cards do not read as selectable. Requirement: every unselected radio
   control inside `.admin-choice-card` shows a 1px `border-border` circle on
   `bg-surface`; the selected state keeps HeroUI's accent fill. The selector
   is the worker's (the control is `.radio__control`); check both states in
   a capture.
2. **The add-game dialog is too narrow for two columns**
   (`probe-add-game-dialog.png`: names wrap, blurbs run to five lines).
   `GameTemplatePicker` gets an optional prop `columns?: 1 | 2` (default 2);
   with `columns={1}` the grid is a single column at every width (modifier
   class `admin-choice-grid--single`). The add-game dialog passes
   `columns={1}` and its `Modal.Dialog` gets `className="sm:max-w-xl"`.
   Requirement: in the dialog at 1440 every template name is on one line and
   every blurb on at most two; at 390 the dialog body scrolls inside the
   viewport and the footer buttons stay reachable. The create page keeps two
   columns.
3. **A game row at 390 puts the icon tile alone on its own line**
   (`campaign-games-390.png`). Change the `.admin-row__text` basis from
   `12rem` to `8rem`; below `sm` the title may wrap to two lines
   (`line-clamp-2`) instead of truncating. Requirement at 390: icon tile and
   name on one line, "Vận hành" at the right of that line, chips on the next
   line, nothing overlapping. At 1440 the row is unchanged.
4. **The meta line repeats the name** when a game keeps its template's
   default name ("Vòng quay may mắn" above "Vòng quay may mắn"). In
   `CampaignGameRow`, render `.admin-row__meta` only when the template name
   differs from `campaignGame.name`.
5. **The disclosure summary is cut off beside a wrapped title at 390**
   (`campaigns-new-390.png`: "Màu, đối tượng, g…"). In `AdminDisclosure`,
   wrap title and summary in one `span` (`flex min-w-0 flex-1 flex-col
   gap-0.5 sm:flex-row sm:items-baseline sm:gap-2`): below `sm` the summary
   sits under the title, from `sm` beside it as today. The indicator stays
   at the right, vertically centred.
6. **The disclosure body is inset about 8px from its trigger**
   (`probe-disclosure-open.png`: the "Màu thương hiệu" label starts to the
   right of the section title). Requirement: the body's left edge equals the
   trigger text's left edge in both the `bare` and the default variant. Find
   the HeroUI part that adds the inline padding and zero it.

## 8. Slice C: run and measure

Surfaces: campaign rewards (+ shared inventory panel), distribution (+ share
links panel), operate, analytics (+ claims queue). Builds on §2, §6 and the
building blocks of §7.1 (`.admin-rows`, `.admin-row*`, `.admin-icon-tile`,
`.admin-stats`, `.admin-split*`, `.admin-group-label`, `AdminDisclosure`,
`GameTemplateIcon`, `rewardReadiness`).

Before changing or removing any visible string, id, `aria-label` or
`data-testid`, grep `tests/ui` and `scripts/`. Anything pinned there stays
unless this section names it as changing.

What these pages get wrong today (captures in `.tmp/ux-audit/tall/`):
the same fact is shown two or three times in different boxes (readiness
cards + progress ring + KPI strip), every control is as wide as the page,
the one thing the operator came to do is below the fold, and disabled
buttons never say why.

### 8.1 Shared additions

```css
/* Editable table rows: li xi budget tiers */
.admin-tier-head,
.admin-tier-row { @apply grid gap-x-4 gap-y-3 md:grid-cols-[minmax(10rem,14rem)_9rem_10rem_minmax(6rem,1fr)_2rem]; }
.admin-tier-head { @apply hidden pb-2 text-xs font-medium text-muted md:grid; }
.admin-tier-row { @apply grid-cols-2 items-start py-3; }
.admin-tier-row + .admin-tier-row { @apply border-t border-border; }

/* One reward in the shared inventory: a bordered card inside the section */
.admin-item-card { @apply flex flex-col gap-4 rounded-xl border border-border p-4; }

/* "Dùng cho: …" line under a section header */
.admin-usedby { @apply flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted; }
.admin-usedby a { @apply font-medium text-foreground underline-offset-2 hover:underline; }
```

`app/components/OtpPinInput.tsx` gains two optional props, `inputId?: string`
(used as the hidden input's id instead of the generated one) and
`ariaLabel?: string` (set as `aria-label` on the hidden input). Defaults
reproduce today's markup exactly; the `draw` variant is not touched.

Row removal inside a draft form (a budget tier, an inventory reward) needs no
confirmation dialog: nothing is deleted until the form is saved, and the
unsaved marker is visible. Immediate destructive mutations (cancelling a
pending link) do need one (§2.7).

### 8.2 Rewards (`RewardsSetupFeature`)

```
Tổng quan  Trò chơi  Phần thưởng  Phân phối                      Phân tích ↗
Kho phần thưởng [Sẵn sàng]
Phần thưởng mà các trò chơi trong chiến dịch này có thể trao.

┌ Kho phần thưởng dùng chung                                2 phần thưởng ┐
│ Dùng cho: Vòng quay may mắn · Thẻ cào may mắn · Máy quay tri ân · …      │
│ (reward cards, §8.3)                                                     │
│ [+ Thêm phần thưởng]              ● Có thay đổi chưa lưu. [Lưu kho phần thưởng] │
└──────────────────────────────────────────────────────────────────────────┘
┌ Ngân sách tiền mặt Lunar Fortune                          [Đã cấu hình] ┐
│ Dùng cho: Bánh bao lì xì (chính)                                         │
│ Đã cấu hình        Còn lại                                               │
│ 1.950.000 ₫        1.650.000 ₫                                           │
│ Giá trị        Số lượng    Độ hiếm      Tạm tính                          │
│ [ 50.000 ₫ ]   [- 20 +]    [Phổ biến ▾]      1.000.000 ₫   ×             │
│ [ 100.000 ₫ ]  [- 5 +]     [Hiếm ▾]            500.000 ₫   ×             │
│ [+ Thêm mệnh giá]   25 lượt · Trung bình 78.000 ₫ · Tổng 1.950.000 ₫  [Lưu cấu hình ngân sách] │
└──────────────────────────────────────────────────────────────────────────┘
```

Header: title "Kho phần thưởng" (unchanged), description as above, `status`
chip "Sẵn sàng" (success) when `rewardReadiness(...).ready`, else "Cần thiết
lập" (warning). The header link "Campaign Studio" is removed (the not-found
state keeps its `to="/campaigns"` link).

Removed outright: the KPI strip, the whole "Trạng thái cấu hình" widget
(both cards, the progress ring, `admin-command-summary`, the metric list) and
the three summary cards ("Tổng phần thưởng", "Giá trị trung bình", "Mức cao
nhất"). Their numbers live in the budget section (stats row, totals line).

Data added: `api.campaigns.getCampaignGamesRouteContext` (games grouped by
`configRewardSource(config)`), `api.rewardInventory.getRewardInventory`
(item count, for readiness and ordering). Keep every literal in the policy
scripts: `owner && campaign ? { campaignId } : "skip"`,
`api.campaigns.getCampaignRouteContext`, `api.setup.getSetupState`,
`campaignId,`, "Không thể mở kho phần thưởng", `AdminPageShell`, the four
stepper `aria-label` templates.

**Two sections, one per reward source.**

- Each section starts with an `.admin-usedby` line: "Dùng cho:" followed by
  the names of the games that use that source, each a link to its editor,
  separated by "·". No game uses it: "Chưa có trò chơi nào dùng nguồn thưởng
  này."
- Order: a source used by at least one game, or holding saved data, renders
  as an open section (inventory first when both qualify). A source that is
  unused and empty renders last, collapsed: an `AdminDisclosure bare` placed
  directly in the page body (title = the section title, summary "Chưa có trò
  chơi nào dùng") whose body contains the section.
- Shared inventory: `<RewardInventoryPanel campaignId usedBy={…} />`; the
  panel takes the used-by line as an optional `usedBy?: ReactNode` prop and
  renders it under its header (the `/inventory.html` fixture passes none).
- Budget section title: `Ngân sách tiền mặt {gameTemplates["li-xi"].name}`;
  description "Các mức tiền mặt trao qua trò chơi dùng ngân sách, có Host PIN
  xác nhận." Header chip: "Đã cấu hình" (success) / "Chưa cấu hình" / "Đã
  khoá".

**Budget section body.**

- When `hasSetup`: `<dl className="admin-stats">` with "Đã cấu hình"
  (`budget.totalBudget`) and "Còn lại" (`budget.remainingBudget`), VND.
- Tier table: an `.admin-tier-head` caption row (`aria-hidden`: Giá trị, Số
  lượng, Độ hiếm, Tạm tính right-aligned, empty last cell) and an
  `<ul aria-label="Các bậc phần thưởng">` of `<li className="admin-tier-row">`:

  ```tsx
  <li className="admin-tier-row">
    <div className="admin-field col-span-2 md:col-span-1">{/* Giá trị phần thưởng: NumberField, label md:sr-only */}</div>
    <div className="admin-field">{/* Số lượng: NumberStepper, label md:sr-only */}</div>
    <div className="admin-field">{/* Độ hiếm: NativeSelect, label md:sr-only */}</div>
    <div className="col-span-2 flex items-center justify-between md:contents">
      <p className="text-sm tabular-nums text-muted md:self-center md:text-right">
        <span className="md:sr-only">Tạm tính </span>{subtotal}
      </p>
      <CloseButton aria-label={`Xóa mức thưởng ${index + 1}`} className="md:self-center" />
    </div>
  </li>
  ```

  No "Mức thưởng N" title, no per-row hint. The rarity hint "Ảnh hưởng nhãn
  hiển thị trong kết quả." appears once, as an `admin-field__hint` under the
  table. Controls fill their grid cell (no page-wide inputs).
- Footer (`flex flex-wrap items-center gap-3`): outline button "Thêm mệnh
  giá"; then, pushed right (`ml-auto`), the totals line (`text-sm text-muted
  tabular-nums`: `{units} lượt · Trung bình {avg} · Tổng {total}`) and the
  primary button "Lưu cấu hình ngân sách" at its natural width.
- Saving stays on the page: delete `void navigate({ to: "/campaigns",
  replace: true })`; the success message "Đã cấu hình ngân sách thành công."
  shows as a success `Alert` at the top of the budget section, errors as a
  danger `Alert` in the same place.
- Locked (`!canConfigure`): the "Ngân sách đã khóa" alert and the stats row;
  no table, no footer.

### 8.3 Shared inventory (`RewardInventoryPanel`)

Section title, count chip, unsaved marker, `AlertInline`, footer buttons,
every label, id, `aria-label`, hint string and the save logic
(`rewardInventoryForm`, epoch/seq refs) are unchanged. Only the row layout
and the pool-tag disclosure change. Rows stay expanded (specs address the
fields directly).

```
┌──────────────────────────────────────────────────────────────────────┐
│ Tên hiển thị                         Loại            Giá trị          │
│ [ Voucher quà tặng A             ]   [Voucher ▾]                      │
│ Số lượng    Trọng số (1-100)                       Kích hoạt (●)  🗑  │
│ [  20  ]    [  50  ]                                                  │
│ Mã voucher (bí mật)…                                                  │
│ [                               ]                                     │
│ Đã cấu hình mã cho voucher này. Để trống là giữ nguyên; …            │
│ ☐ Xóa mã hiện tại khi lưu (thay vì giữ nguyên)                        │
└──────────────────────────────────────────────────────────────────────┘
```

- Each reward is an `.admin-item-card` (no `ItemCard`, no grey tray).
- Line 1: `grid gap-4 sm:grid-cols-[minmax(0,1fr)_11rem_10rem]`: "Tên hiển
  thị", "Loại", and "Giá trị" (cash/points only; the third track is dropped
  for other types).
- Line 2: `flex flex-wrap items-end gap-4`: "Số lượng" (`w-28`), "Trọng số
  (1-100)" (`w-28`), "Nhóm kho phần thưởng" (`w-44`, only when pools are
  shown, below), then `ml-auto flex items-center gap-3`: the "Kích hoạt"
  switch and the delete icon button (`variant="ghost"`, same `aria-label`).
- Line 3 (voucher only): the code field (`max-w-md`), its hint, the checkbox.
- The per-row pool hint is removed from the rows. One `admin-field__hint`
  paragraph sits under the section description: "Trọng số càng cao, phần
  thưởng càng dễ trúng so với các phần thưởng khác và với trọng số lượt
  không trúng của trò chơi."
- Pool tags are an advanced feature. A `Switch size="sm"` "Chia theo nhóm
  kho" sits at the right of the footer's left group. Off (default): the
  "Nhóm kho phần thưởng" fields are not rendered. On: they render and the
  existing pool hint text renders once under the weight hint. The switch is
  forced on and disabled while any row's pool tag differs from
  `DEFAULT_REWARD_POOL_TAG`; its initial value is derived from the loaded
  rows.

### 8.4 Distribution (`DistributionFeature`, `ShareLinksPanel`)

```
Phân phối
Tạo liên kết chơi và mã QR cho từng kênh, hoặc mở trò chơi tại quầy.

┌ Liên kết chơi công khai dùng chung ─────────────────────────────────────┐
│ Trò chơi                  Kênh        Ghi chú (tuỳ chọn)                  │
│ [Bánh bao lì xì (chính)▾] [qr      ]  [                    ] [Tạo liên kết] │
│ Không giới hạn thời gian.                                                 │
│ ────────────────────────────────────────────────────────────────────── │
│ [QR]  [Đang hoạt động] [Kênh: qr] [Quầy 1]                     [Thu hồi]  │
│       https://…/p/ABC123                                                  │
│       Trò chơi: Vòng quay may mắn · Tạo 00:29:30 12/9/2026                │
│       [Sao chép]  Mở liên kết ↗                                           │
└──────────────────────────────────────────────────────────────────────────┘
┌ Mở trạm và vận hành ────────────────────────────────────────────────────┐
│ [i] Bánh bao lì xì (chính)   Host tạo lượt chơi bằng Host PIN   [Vận hành] [Mở trạm] │
│ [i] Vòng quay may mắn        Trạm tự phục vụ                    [Vận hành] [Mở trạm] │
│ [i] Máy quay tri ân          Chỉ chơi qua liên kết công khai                         │
└──────────────────────────────────────────────────────────────────────────┘
┌ Liên kết theo lượt chơi ────────────────────────────────────────────────┐
│ [QR]  Khách mời trạm  [Đang chờ]                                          │
│       https://…/play/XYZ   Hết hạn 01:29:30 12/9/2026                     │
│       [Sao chép]  Mở liên kết ↗                                           │
└──────────────────────────────────────────────────────────────────────────┘
```

Page: description as above. Body order: warning alert (below), feedback
alert, `ShareLinksPanel`, "Mở trạm và vận hành", "Liên kết theo lượt chơi".
The widgets "Trạng thái kênh" and "Khởi chạy" and the two-column grid are
removed. `campaign.campaignGame` is no longer read here; everything iterates
`gamesContext.campaignGames`. All policy literals stay
(`api.draw.getStationState`, `pendingLinkSessions`, `QRCodeSVG`,
`buildPublicPlayUrl(session.publicPlayPath ?? session.sharePath)`,
`navigator.clipboard.writeText`, `ShareLinksPanel`, `target="_blank"`, "Mở
liên kết").

**`ShareLinksPanel`.**

- Create row: `grid gap-4 md:grid-cols-[minmax(0,16rem)_10rem_minmax(0,1fr)_auto]
  md:items-start`; the button cell is aligned with the inputs (top padding
  equal to the label row, or `md:items-end` with hints moved out of the
  grid: pick whichever keeps all four controls on one baseline).
- Under the row, one status line for the selected game (`admin-field__hint`,
  `flex items-center gap-2`): `ScheduleStatusChip` + `scheduleRangeText(...)`
  when the game has a play window, otherwise the text "Không giới hạn thời
  gian.". This line is what `workspace.spec.ts` asserts after the "Trạng
  thái kênh" widget is gone.
- No active game: the existing "Cần một trò chơi đang chạy" state, unchanged.
- Link list keeps `role="group"` named "Danh sách liên kết chơi công khai".
  Rows are `.admin-row`-style blocks separated by hairlines (no grey tray):
  `grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)]`, QR (96px, white tile) left.
  Right column, top to bottom: a `flex items-start justify-between gap-3`
  line with the chips (status, `Kênh: x`, label) and the "Thu hồi" / "Mở
  lại" button (`size="sm"`, `variant="ghost"`); the URL in its own `<p
  className="break-all text-sm text-foreground">`; the meta line (`text-xs
  text-muted`); then "Sao chép" (`size="sm"`, `variant="secondary"`) and the
  "Mở liên kết" anchor. The revoke button must never share a line box with
  the URL paragraph (the geometry test measures this at 1440 and 390).
- Empty list: one `text-sm text-muted` line, "Chưa có liên kết nào. Tạo liên
  kết đầu tiên ở trên để nhận URL và mã QR.", not a tall empty state.

**"Mở trạm và vận hành"** (new section in `DistributionFeature`): an
`.admin-rows` list of every game. Row: `.admin-icon-tile` with
`GameTemplateIcon`, name (`admin-row__title`), one-line mode text
(`admin-row__meta`), a status chip only when the game is not active, then
the actions (`buttonVariants({ size: "sm", variant: "secondary" })`):

| Game | Mode text | Actions |
|---|---|---|
| li xi on `campaign-budget` | Host tạo lượt chơi bằng Host PIN | "Vận hành" → `/operate/$campaignGameId`, "Mở trạm" → `/station/$campaignGameId` |
| `supportsSelfServeStationGame(templateId, config)` | Trạm tự phục vụ | "Vận hành", "Mở trạm" |
| anything else | Chỉ chơi qua liên kết công khai | none |

No schedule chips in this list: on load the page must contain no "Cửa sổ
đang mở" text outside the share-link status line.

**"Liên kết theo lượt chơi"** (the per-session li xi links): rendered only
when the campaign has a li xi `campaign-budget` game or there are pending
sessions. Description "Mỗi liên kết thuộc một lượt chơi do host tạo ở bảng
vận hành và tự hết hạn." Rows as in the share-link list: QR (title unchanged),
guest name as a heading element, "Đang chờ" chip, URL `<p className=
"break-all">`, "Hết hạn …", "Sao chép", "Mở liên kết". Empty: one line "Chưa
có liên kết đang chờ." plus a text link "Mở bảng vận hành" to that game.

**Warning alert**: only when a li xi `campaign-budget` game exists and
`!station.hasSetup`: `Alert status="warning"`, title "Chưa cấu hình ngân
sách phần thưởng", description "Trò chơi dùng ngân sách chưa thể tạo lượt
chơi.", link "Mở kho phần thưởng" → rewards.

### 8.5 Operate (`OperatorConsoleFeature`)

Policy literals that stay: "Host PIN", `api.draw.createSession`,
`buildPublicPlayUrl(session.publicPlayPath ?? session.sharePath)`,
`useState<DeliveryMode>("station")`, `deliveryMode,`, `pendingLinkSessions`,
"Liên kết đang chờ", `cancelSession`, `to: "/station/$campaignGameId"`.
Every state's header gets one secondary action link, "Cấu hình trò chơi" →
the game editor.

**Li xi console** (h1 "Bảng vận hành trò chơi"):

```
┌ Tạo lượt chơi ───────────────────────────┐  LIÊN KẾT ĐANG CHỜ
│ Hình thức                                │  Khách mời trạm          [Huỷ]
│ (•) Trạm chơi                            │  Hết hạn 01:29 12/9/2026
│     Khách chơi ngay trên màn hình trạm.  │  ─────────────────────────
│ ( ) Liên kết công khai                   │  Xem tất cả ở Phân phối →
│     Gửi liên kết và mã QR cho khách.     │
│ Tên khách                                │
│ [                          ]             │
│ Host PIN                                 │
│ [•][•][•][ ][ ][ ]                       │
│ [Tạo lượt chơi]   Còn 20 lượt khả dụng   │
└──────────────────────────────────────────┘
```

- Body: `.admin-split.admin-split--rail`. Main = one section "Tạo lượt
  chơi" whose form is capped at `max-w-xl`.
- Delivery mode: a two-option `RadioGroup` (label "Hình thức", options with
  one-line descriptions as drawn) replacing the `#operator-delivery` select.
- Guest name: `#operator-guest`, unchanged label.
- Host PIN: visible label "Host PIN" + `<OtpPinInput variant="admin"
  length={PIN_LENGTH} inputId="operator-pin" ariaLabel="Host PIN" … />`,
  hint "Mã 6 số của host, đặt ở Cài đặt → Vận hành." (link to
  `/settings/operations`).
- Action row: primary "Tạo lượt chơi" and, beside it, `Còn {availableUnits}
  lượt khả dụng` (`text-sm text-muted tabular-nums`).
- The button never sits disabled without a visible reason. Above the form,
  when `!station.hasSetup` or `availableUnits === 0`: `Alert
  status="warning"`, title "Chưa thể tạo lượt chơi", description "Kho phần
  thưởng của trò chơi này chưa được cấu hình hoặc đã hết.", link "Mở kho
  phần thưởng". Missing name / incomplete PIN are explained by the field
  hints.
- After a link-mode session is created: a success `Alert` in the section
  with the URL (`break-all`), a "Sao chép" button and a link "Xem mã QR ở
  Phân phối". After a station-mode session: existing behaviour.
- Side column: `.admin-group-label` "Liên kết đang chờ", then the pending
  sessions as plain rows (guest name, expiry) each with a ghost button "Huỷ"
  (``aria-label={`Hủy liên kết của ${name}`}``) that opens an `AlertDialog`
  (pattern from `UnsavedChangesGuard.tsx`): title "Huỷ liên kết của
  {name}?", body "Liên kết sẽ ngừng hoạt động ngay và không thể khôi phục.",
  actions "Giữ lại" / "Huỷ liên kết" (danger). `cancelSession` runs only on
  confirm. No pending sessions: one `text-sm text-muted` line. The separate
  "Kho phần thưởng" side widget is removed (its one fact sits by the
  button).

**Self-serve station** (h1 "Trạm tự phục vụ"): one section.

```
┌ Vòng quay tri ân sẵn sàng đón khách tại trạm ────────────────────────────┐
│ Mở màn hình trạm trên thiết bị tại quầy; mỗi khách tự bắt đầu lượt chơi. │
│ [Mở màn hình trạm]  Liên kết công khai và mã QR                          │
│ Thiết bị trạm cần xác minh Host PIN một lần trước khi đón khách.         │
│ ──────────────────────────────────────────────────────────────────────  │
│ Phần thưởng còn lại trong kho     Loại phần thưởng đang bật               │
│ 20                                2                       Mở kho phần thưởng → │
└───────────────────────────────────────────────────────────────────────────┘
```

The accent alert becomes the section title + description; the two links keep
their names and hrefs; the Host PIN sentence keeps the words "xác minh Host
PIN"; the two inventory cards become a two-item `<dl className=
"admin-stats">` with the same labels, plus a text link to the rewards page.
Remaining = 0: a warning `Alert` "Kho phần thưởng đã hết" above the section.
The schedule warning alert is unchanged.

**Public self-serve and inactive states**: same strings ("… chạy qua liên
kết công khai", "Mở trang Phân phối", "Mở cấu hình trò chơi", "Trò chơi chưa
hoạt động"); one section, title + one sentence + the two links as a primary
and a secondary button. No alert-inside-card-inside-page nesting.

### 8.6 Analytics (`AnalyticsFeature`)

```
Tổng quan  Trò chơi  Phần thưởng  Kênh chia sẻ  Trao thưởng
Tổng quan hiệu quả                                   [Tất cả chiến dịch ▾]
Tổng hợp lượt chơi, phần thưởng và hiệu quả trong phạm vi đã chọn.

┌──────────────────────────────────────────────────────────────────────────┐
│ Lượt mở     Lượt bắt đầu    Lượt hoàn tất   Lượt nhận thưởng  Chuyển đổi  │
│ 120         96              84              78                65%         │
│             80% lượt mở     88% lượt bắt đầu 93% lượt hoàn tất nhận thưởng / lượt mở │
└──────────────────────────────────────────────────────────────────────────┘
┌ Trò chơi                 Xem chi tiết → ┐ ┌ Kênh                Xem chi tiết → ┐
│ Vòng quay tri ân        120 mở · 65%    │ │ Liên kết công khai   88 mở · 61%     │
│ …                                       │ │ …                                    │
└─────────────────────────────────────────┘ └──────────────────────────────────────┘
```

- **Scope picker moves into the header.** `actions` = the existing
  `NativeSelect` (`aria-label="Phạm vi phân tích chiến dịch"`, same options
  and handler), `admin-control--sm`. `description` = `viewCopy.description`.
  The page no longer passes `aside`: the "Phạm vi chiến dịch" widget and its
  redundant scope card are deleted.
- **Removed on every view**: the widget that repeats `viewCopy.title`, the
  legacy KPI strip, "Tóm tắt phân tích" (cards, progress ring, metric list,
  latest-redemption note).
- Per-view stats become one untitled section containing `<dl
  className="admin-stats">`:
  - overview: Lượt mở trò chơi, Lượt bắt đầu, Lượt hoàn tất, Lượt nhận
    thưởng, Tỷ lệ chuyển đổi. Under the 2nd–4th value a step note
    (`admin-stats__note`): `{pct}% lượt mở`, `{pct}% lượt bắt đầu`, `{pct}%
    lượt hoàn tất` (omitted when the previous step is 0); under the last,
    "Nhận thưởng / lượt mở".
  - games: Lượt mở trò chơi, Lượt bắt đầu, Lượt hoàn tất.
  - channels: Lượt mở liên kết công khai, Lượt nhận thưởng, Tỷ lệ chuyển đổi.
  - rewards: Kết quả phần thưởng, Lượt nhận thưởng, Tỷ lệ nhận thưởng.
- **Overview** adds, under the stats, `grid gap-6 lg:grid-cols-2` with two
  sections, "Trò chơi" and "Kênh". Each is an `.admin-rows` list of up to
  five rows sorted by opens (name as `admin-row__title`, template name or
  nothing as meta, right side `text-sm tabular-nums text-muted`: `{opens} mở
  · {conversion}`), with a header link "Xem chi tiết" that switches to the
  games / channels view (same navigation the tabs use). Empty: one muted
  line "Chưa có dữ liệu.". No DataGrid on the overview.
- **Games / channels**: the DataGrid sections ("Phân tích theo trò chơi",
  "Phân tích theo kênh", "Liên kết chia sẻ"), their grid names and
  `TableScrollHint` are unchanged.
- **Rewards**: below the stats, one section for the li xi template's
  redemption data, titled `Trao thưởng {gameTemplates["li-xi"].name}`,
  description "Chỉ gồm lượt trao từ trò chơi dùng ngân sách tiền mặt.":
  `<dl className="admin-stats">` (Lượt trao thưởng, Giá trị đã trao, Giá trị
  trung bình, Phần thưởng huyền thoại), then `grid gap-6
  lg:grid-cols-[minmax(0,1fr)_20rem]`: the existing inner tabs ("Giá trị
  thưởng cao nhất" / "Lịch sử gần đây") with their DataGrids on the left,
  the "Cơ cấu phần thưởng" bar chart (moved from the aside) on the right.
  The existing links "Chiến dịch" and "Vận hành trò chơi"
  (`to="/operate/$campaignGameId"`) move to this section's header as small
  secondary links. Nothing from this block renders on the other views.
- **Claims** without a campaign: the empty state keeps the title "Chọn một
  chiến dịch để xem hàng đợi"; description "Hàng đợi trao thưởng được xem
  theo từng chiến dịch."; content = one secondary button per campaign (first
  six of `workspace.campaigns`, label = campaign name) that sets `campaign`
  in the search and keeps `view: "claims"`.
- Policy and spec updates this requires:
  - `scripts/test-route-ux-policy.mjs`: replace the three `rarityAsideViews`
    assertions with: `AnalyticsFeature` does not contain `aside=`, contains
    `aria-label="Phạm vi phân tích chiến dịch"` and `search.view ===
    "rewards"`. All other analytics assertions there and in
    `scripts/verify-saas-contracts.mjs` (lines 945–975) still hold.
  - `tests/ui/workspace.spec.ts`, test "aside scope picker is view-aware…":
    rewrite as "scope picker is in the header on every view; li xi
    redemption block only on rewards": for each of the five views, without
    opening the aside, `getByLabel("Phạm vi phân tích chiến dịch")` is
    visible; "Cơ cấu phần thưởng" is visible on `rewards` and has count 0 on
    the other four; on `claims` without a campaign "Chọn một chiến dịch để
    xem hàng đợi" is visible and clicking the "Chiến dịch tri ân A" button
    shows the grid "Bảng yêu cầu nhận thưởng".
  - `docs/route-ux-standardization.md` lines ~180: describe the new rule.

### 8.7 Claims queue (`RewardClaimsPanel`)

- Widget header: title "Yêu cầu nhận thưởng" (the h1 already says "Hàng đợi
  trao thưởng"), the existing description, no count chip (the footer line
  "Đã hiện n yêu cầu" stays).
- Filter bar: `flex flex-wrap items-end gap-3`. The three selects are
  `w-44` each. The search form is `min-w-[16rem] flex-1`: label, then `flex
  gap-2` with the input (`min-w-0 flex-1`) and the "Tìm" / "Xóa" buttons on
  the same line. The hint under the search field is removed; the
  placeholder becomes "Nhập đầy đủ mã thưởng". Labels, ids and `aria-label`s
  unchanged. Below `sm` each control takes the full width.
- The grid, its columns, cells, pagination and empty states are unchanged.

### 8.8 Slice C visual checklist

Capture with `UX_OUT=.tmp/ux-audit/slice-c node
.tmp/ux-audit/capture-tall.mjs` at 1440 and 390 and open the PNGs.

a. Rewards: no KPI strip, no progress ring, no stretched summary cards; two
   sections each with a "Dùng cho" line; the tier table has one caption row
   and one line per tier at 1440; "Lưu cấu hình ngân sách" is a normal-width
   button at the right of the footer.
b. Rewards: saving the budget keeps the operator on the page and shows the
   success alert (probe).
c. Inventory: each reward is a compact card of two lines (three for
   vouchers); no input is wider than ~32rem; pool-tag fields are hidden
   until "Chia theo nhóm kho" is switched on.
d. Distribution: share links first; the status line under the game select
   reads "Không giới hạn thời gian." on load; every game is listed under "Mở
   trạm và vận hành"; no "Trạng thái kênh" / "Khởi chạy" widgets; at 390 the
   revoke button sits above the URL, never beside it.
e. Operate (li xi): radio cards for the delivery mode, six PIN cells, the
   remaining-units fact beside the button; with an unconfigured budget the
   warning alert explains the disabled button; cancelling a pending link
   asks for confirmation (probe).
f. Operate (wheel): one section, primary "Mở màn hình trạm", two stats.
g. Analytics overview: scope select in the header, five stats with step
   notes, two ranked lists; no aside toggle; no legacy KPI strip.
h. Analytics rewards: the li xi section with stats, tables and the rarity
   chart; analytics claims: filter bar on one line at 1440, "Tìm" beside the
   input.
i. No horizontal overflow at 390 on any of these pages.

## 9. Slice D: account, sign-in and first run

Surfaces: settings (billing, integrations, operations), the sidebar plan
card, `/auth`, onboarding, the root not-found page. Builds on §2, §6 and the
building blocks of §7.1 (`.admin-rows`, `.admin-row*`, `.admin-icon-tile`,
`.admin-group-label`, `AdminDisclosure`). New classes go into
`app/styles/admin.css` inside `@layer components`.

Before changing or removing any visible string, id, `aria-label` or
`data-testid`, grep `tests/ui` and `scripts/`. Anything pinned there stays
unless this section names it as changing (§9.9 lists every rule that changes).

What is wrong today (captures in `.tmp/ux-audit/current/`):

- **Billing**: five equally loud usage bars in a grey tray, an unlimited
  resource drawn as an empty bar, plan options squeezed into a 360px side
  column with no information about what a plan contains, a full-width
  disabled "Chưa có gói đăng ký" button that can never be pressed, the real
  `games` limit has no label at all.
- **Integrations**: four cards that each repeat "Sẵn sàng" + "Đã vượt qua các
  kiểm tra bắt buộc."; endpoints cannot be copied.
- **Operations**: six empty PIN cells are shown even when a PIN already
  exists; nothing says what the PIN is used for.
- **Sidebar**: no plan or usage signal anywhere outside the billing page.
- **Auth**: a sign-in page that looks like a dashboard (0% ring, "0/3 sẵn
  sàng", a three-row checklist, a four-step stepper, three module cards)
  around one button.
- **Onboarding**: one centred empty state; no idea of what comes next.
- **Unknown URL**: unstyled "Not Found" text on a white page.

### 9.1 Shared additions

**Plan limits on the client.** New `lib/planLimits.ts` (pure data, no env
access):

```ts
import type { PlanTier } from "./entitlementPolicy";

export type PlanLimitKey = "campaigns" | "assets" | "openSessions" | "budgetItems" | "redemptions" | "games";
export type PlanLimitValue = number | null;
export type PlanLimits = Record<PlanLimitKey, PlanLimitValue>;

export const PLAN_LIMITS: Record<PlanTier, PlanLimits> = { /* moved verbatim from convex/entitlements.ts */ };
```

`convex/entitlements.ts` imports `PLAN_LIMITS` (and the key/value types, in
place of its local `LimitKey` / `LimitValue` / `EntitlementLimits`) from
`../lib/planLimits`. This is a move: **no value changes, no other edit under
`convex/`**.

**Usage helpers.** New `lib/planUsage.ts` + `lib/planUsage.test.ts` (Vitest):

```ts
import type { PlanLimitKey } from "./planLimits";

export type PlanResourceState = { used: number; limit: number | null; isFull: boolean; isExceeded: boolean };
export type PlanResources = Partial<Record<PlanLimitKey, PlanResourceState>>;

export const PLAN_RESOURCE_ORDER: PlanLimitKey[] = ["campaigns", "games", "assets", "redemptions", "openSessions", "budgetItems"];

export function usagePercent(resource: PlanResourceState) {
  if (!resource.limit) return 0;
  return Math.min(100, Math.round((resource.used / resource.limit) * 100));
}

export function usageLevel(resource: PlanResourceState): "ok" | "near" | "full" {
  if (resource.limit === null) return "ok";
  if (resource.isFull || resource.isExceeded) return "full";
  return usagePercent(resource) >= 80 ? "near" : "ok";
}

/** The limited resource closest to its limit; ties follow PLAN_RESOURCE_ORDER. */
export function tightestResource(resources: PlanResources) {
  let best: { key: PlanLimitKey; resource: PlanResourceState } | null = null;
  for (const key of PLAN_RESOURCE_ORDER) {
    const resource = resources[key];
    if (!resource || !resource.limit) continue;
    if (!best || resource.used / resource.limit > best.resource.used / (best.resource.limit as number)) {
      best = { key, resource };
    }
  }
  return best;
}
```

Tests: unlimited → percent 0 and level "ok"; 4/5 → "near"; 5/5 and 6/5 →
"full" and percent 100; `tightestResource` ignores unlimited and missing
keys, returns `null` when nothing is limited, prefers the earlier key on a
tie.

**Labels.** New `app/_workspace/-components/planCopy.ts`:

```ts
export const PLAN_TIER_NAMES = { free: "Miễn phí", pro: "Pro", business: "Business" } as const;
export const PLAN_RESOURCE_LABELS: Record<PlanLimitKey, string> = {
  campaigns: "Chiến dịch",
  games: "Trò chơi",
  assets: "Tài sản tải lên",
  redemptions: "Lượt trao thưởng",
  openSessions: "Lượt chơi đang mở",
  budgetItems: "Mệnh giá ngân sách",
};
```

**CSS.**

```css
/* Usage rows (billing) */
.admin-usage { @apply grid gap-x-8 gap-y-5 sm:grid-cols-2; }
.admin-usage__row { @apply flex min-w-0 flex-col gap-1.5; }
.admin-usage__head { @apply flex items-baseline justify-between gap-3 text-sm; }
.admin-usage__label { @apply font-medium text-foreground; }
.admin-usage__value { @apply tabular-nums text-muted; }
.admin-usage__value strong { @apply font-semibold text-foreground; }

/* Plan comparison */
.admin-plan-grid { @apply grid gap-4 md:grid-cols-3; }
.admin-plan-card { @apply flex min-w-0 flex-col gap-4 rounded-2xl border border-transparent bg-surface p-5 shadow-surface; }
.admin-plan-card[data-current="true"] { @apply border-accent; }
.admin-plan-card__price { @apply text-2xl font-semibold tabular-nums text-foreground; }
.admin-plan-card__limits { @apply flex flex-col gap-1.5 text-sm text-foreground; }
.admin-plan-card__action { @apply mt-auto flex flex-col gap-1.5; }

/* Sidebar plan card */
.admin-sidebar-plan { @apply mx-3 mb-1 flex flex-col gap-1.5 rounded-xl px-3 py-2.5 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-focus; }
.sidebar[data-state="collapsed"] .admin-sidebar-plan { @apply hidden; }

/* Numbered steps (onboarding) */
.admin-steps { @apply flex flex-col gap-5; }
.admin-step { @apply flex min-w-0 items-start gap-3; }
.admin-step__index { @apply grid size-7 shrink-0 place-items-center rounded-full bg-surface-secondary text-sm font-semibold tabular-nums text-foreground; }
.admin-step__index[data-done="true"] { @apply bg-success/15 text-success; }
.admin-step__title { @apply text-sm font-medium text-foreground; }
.admin-step__text { @apply text-sm text-muted; }

/* Pages outside the workspace layout (sign-in, not found) */
.admin-standalone { @apply grid min-h-dvh place-items-center bg-background px-4 py-10 text-foreground; }
.admin-standalone__inner { @apply flex w-full max-w-sm flex-col gap-6; }
.admin-standalone__brand { @apply flex items-center gap-3; }
.admin-standalone__card { @apply flex flex-col gap-5 rounded-2xl bg-surface p-6 shadow-surface sm:p-8; }
.admin-standalone__points { @apply flex flex-col gap-2.5 px-1 text-sm text-muted; }
.admin-standalone__points li { @apply flex items-center gap-2.5; }
```

`.admin-sidebar-plan` background: one step away from the sidebar's own
background so the card reads as a card (if the sidebar is
`bg-surface-secondary`-like, use `bg-surface shadow-surface`; otherwise
`bg-surface-secondary`). Check it in the capture. If `bg-success/15` does not
compile with the theme tokens, use the soft success background the theme
already exposes. Only existing tokens; no new colours.

Delete CSS that loses its last user: `.admin-auth-checklist`,
`.admin-card-grid--feature` (grep first).

**Fixture** (`tests/ui/fixtures/convex-mock.ts`, `workspacePlanState`): add
`games: { used: 5, limit: 10, isFull: false, isExceeded: false }` (the real
query returns it) and change `redemptions.limit` from `null` to `1000` so
the fixture plan reads as a coherent free plan next to the real Pro and
Business limits. Nothing else in the fixture changes. Grep `tests/ui` for any
assertion on the old values first.

### 9.2 Billing (`BillingSettingsFeature`)

Header: title "Thanh toán" (pinned), `tabs={<SettingsContextNav />}`,
description "Gói đăng ký và mức sử dụng của không gian làm việc.". No header
actions.

Body order (`admin-stack`, single column, no 360px side column):

1. `Alert status="danger"` / `"success"` for `error` / `feedback` (as today).
2. `Alert status="warning"` with `plan.billingError` as its title when set
   (replaces the red paragraph at the bottom of the plan card).
3. Section **"Gói hiện tại"** (`Widget`).
4. Region **"So sánh gói"**: plan cards directly on the page background
   (not inside a `Widget`; a card inside a card is what §1 forbids).

**Section "Gói hiện tại".**

```
Gói hiện tại                                          [Quản lý gói đăng ký ↗]
Miễn phí   [Đang hoạt động]
Chưa có gói đăng ký trả phí.
────────────────────────────────────────────────────────────────────────────
MỨC SỬ DỤNG
Chiến dịch                 2 / 5     Trò chơi                    5 / 10
▓▓▓▓░░░░░░                           ▓▓▓▓▓░░░░░
Tài sản tải lên            1 / 10    Lượt trao thưởng        170 / 1.000
▓░░░░░░░░░                           ▓▓░░░░░░░░
Lượt chơi đang mở          1 / 20    Mệnh giá ngân sách          2 / 50
▓░░░░░░░░░                           ▓░░░░░░░░░
Nguồn trạng thái: Gói mặc định
```

- `Widget.Header`: `Widget.Title` "Gói hiện tại". Top-right: the portal
  button `variant="outline" size="sm"` "Quản lý gói đăng ký" with a trailing
  `ExternalLink` icon, rendered **only when `plan.subscription` exists**
  (`isPending={billingAction === "portal"}`, `isDisabled={Boolean(billingAction)}`).
  The disabled "Chưa có gói đăng ký" button is deleted.
- First block: plan name `text-2xl font-semibold` =
  `plan.subscription?.productName ?? PLAN_TIER_NAMES[plan.tier]`; next to it a
  `Chip size="sm" variant="soft"` with `statusLabels[status]` **only when a
  subscription exists** (`success` for active/trialing, `warning` for
  past_due/unpaid, `default` otherwise). Below, `text-sm text-muted`:
  subscription → "Gói đăng ký được đồng bộ từ Polar."; none → "Chưa có gói
  đăng ký trả phí.".
- Divider (`border-t border-border`, `pt-5 mt-5`), then
  `<p className="admin-group-label">Mức sử dụng</p>` and
  `<ul aria-label="Mức sử dụng tài nguyên" className="admin-usage">`.
  Rows follow `PLAN_RESOURCE_ORDER`, skipping keys missing from
  `plan.resources`. Row:

  ```tsx
  <li className="admin-usage__row" key={key}>
    <div className="admin-usage__head">
      <span className="admin-usage__label">{PLAN_RESOURCE_LABELS[key]}</span>
      <span className="admin-usage__value">
        <strong>{resource.used.toLocaleString("vi-VN")}</strong>
        {resource.limit === null ? " · Không giới hạn" : ` / ${resource.limit.toLocaleString("vi-VN")}`}
      </span>
    </div>
    {resource.limit === null ? null : (
      <ProgressBar aria-label={`Mức sử dụng ${PLAN_RESOURCE_LABELS[key]}`} color={level === "full" ? "danger" : level === "near" ? "warning" : "accent"} size="sm" value={usagePercent(resource)}>
        <ProgressBar.Track><ProgressBar.Fill /></ProgressBar.Track>
      </ProgressBar>
    )}
    {level === "near" ? <p className="text-xs text-warning">Sắp đạt giới hạn.</p> : null}
    {level === "full" ? <p className="text-xs text-danger">Đã đạt giới hạn. Nâng cấp gói để tiếp tục.</p> : null}
  </li>
  ```

  An unlimited resource has no bar. No `ItemCardGroup`, no grey tray.
- Last line, `text-xs text-muted`: "Nguồn trạng thái: Polar" / "Nguồn trạng
  thái: Gói mặc định" (pinned prefix "Nguồn trạng thái").

**Region "So sánh gói".** `<section aria-labelledby="billing-plans-title">`
with `<h2 id="billing-plans-title" className="text-base font-semibold">So
sánh gói</h2>` and `<div className="admin-plan-grid">` holding three
`<article className="admin-plan-card" data-current={isCurrent}>`: Miễn phí,
Pro, Business (in that order).

```
┌───────────────────┐ ┌───────────────────┐ ┌───────────────────────┐
│ Miễn phí  [Gói    │ │ Pro               │ │ Business              │
│        hiện tại]  │ │ 290.000 ₫ / tháng │ │ 890.000 ₫ / tháng     │
│ 0 ₫               │ │ Dành cho chiến    │ │ Dành cho đội ngũ vận  │
│ Để bắt đầu và thử │ │ dịch đang tăng    │ │ hành nhiều chiến dịch.│
│ nghiệm.           │ │ trưởng.           │ │                       │
│ ✓ 5 chiến dịch    │ │ ✓ 10 chiến dịch   │ │ ✓ Không giới hạn      │
│ ✓ 10 trò chơi     │ │ ✓ 25 trò chơi     │ │   chiến dịch          │
│ ✓ 10 tài sản …    │ │ ✓ 100 tài sản …   │ │ ✓ …                   │
│ ✓ 1.000 lượt …    │ │ ✓ 5.000 lượt …    │ │                       │
│                   │ │ [Nâng cấp lên Pro]│ │ [Nâng cấp lên Business]│
└───────────────────┘ └───────────────────┘ └───────────────────────┘
```

- Card head: name `text-base font-semibold`; on the current plan a
  `Chip color="accent" size="sm" variant="soft"` "Gói hiện tại" at the right
  of the name row.
- Price: `.admin-plan-card__price`. Free → "0 ₫". Paid →
  `formatBillingPrice(product)` (unchanged function; when it returns a
  non-price string such as "Chưa đồng bộ từ Polar" render it as
  `text-sm text-muted` instead of the price style).
- Summary `text-sm text-muted`: free "Để bắt đầu và thử nghiệm."; pro and
  business keep today's summaries.
- Limits `<ul className="admin-plan-card__limits">`, four lines in this
  order: campaigns, games, assets, redemptions. Each line: 14px `Check` icon
  (`text-success`, `aria-hidden`) + text. Value source: the **current** plan
  uses `plan.resources[key]?.limit` (server truth); the other plans use
  `PLAN_LIMITS[tier][key]`. Text: `null` → `Không giới hạn ${label.toLowerCase()}`,
  number → `${limit.toLocaleString("vi-VN")} ${label.toLowerCase()}`.
- `isCurrent` = `plan.tier === key` or (paid) `option.product?.id &&
  plan.subscription?.productId === option.product.id`.
- Action (`.admin-plan-card__action`, pinned to the card bottom):
  - current plan: no button (the chip already says it).
  - free card while another plan is current: `text-xs text-muted` "Huỷ gói
    trong mục Quản lý gói đăng ký để về gói miễn phí."
  - paid, not current, product configured: a normal-width `Button`
    (`isPending={billingAction === key}`, `isDisabled={Boolean(billingAction)}`,
    `onPress={() => void selectPlan(key, product)}`). Tier order is free <
    pro < business. Higher than current → "Nâng cấp lên {name}"; lower →
    "Chuyển sang {name}". Exactly one button is `variant="primary"`: the
    first tier above the current one. Every other button is
    `variant="outline"`.
  - paid, product missing (`!option.product?.id`): disabled outline button
    "Chưa sẵn sàng" plus `text-xs text-muted` "Sản phẩm chưa được đồng bộ từ
    Polar." (a disabled control always carries its reason).

Logic that must not change: the two `useQuery` calls, the three `useAction`
calls, `selectPlan`, `openPortal`, `changeableSubscriptionStatuses`, the
loading guard `plan === undefined || products === undefined`.

### 9.3 Integrations (`IntegrationsSettingsFeature`)

Header: title "Tích hợp" (pinned), description "Trạng thái cấu hình hệ thống
dành cho host.".

**Section "Trạng thái hệ thống"** (`Widget`; replaces "Mức độ sẵn sàng vận
hành"):

```
Trạng thái hệ thống                                      [Tất cả sẵn sàng]
Các tích hợp bắt buộc đã sẵn sàng.
✓  Google OAuth và Convex Auth                     3/3 kiểm tra bắt buộc
──────────────────────────────────────────────────────────────────────
!  Polar                                                  [Cần kiểm tra]
   Token tổ chức Polar hợp lệ, Đã dựng webhook Polar
──────────────────────────────────────────────────────────────────────
▸ Chi tiết kiểm tra                                          9 kiểm tra
```

- Header right: one `Chip size="sm" variant="soft"`: all groups ready →
  `success` "Tất cả sẵn sàng"; otherwise `warning` "{n} nhóm cần kiểm tra".
  Description as today (the two `allRequiredReady` sentences).
- `<ul aria-label="Trạng thái tích hợp vận hành" className="admin-rows">`, one
  `<li className="admin-row">` (vertical padding `py-3`) per group:
  - 18px status icon: `BadgeCheck` `text-success` / `CircleAlert`
    `text-warning` (`aria-hidden`).
  - `.admin-row__text`: title `groupLabels[group] ?? group`. Ready groups
    have no second line. A group that is not ready shows the missing check
    labels as a second line `text-sm text-muted` that wraps (never
    truncated): `runtimeCheckLabels[check.key] ?? check.label` joined by ", ".
  - Right: ready → `text-xs text-muted tabular-nums`
    "{passed}/{required} kiểm tra bắt buộc"; not ready →
    `Chip color="warning" size="sm" variant="soft"` "Cần kiểm tra".
  The four "Sẵn sàng" chips and the repeated "Đã vượt qua các kiểm tra bắt
  buộc." sentences are gone: the header chip states it once.
- Below the list an `AdminDisclosure` titled "Chi tiết kiểm tra", summary
  "{total} kiểm tra", collapsed by default, **expanded by default when any
  group is not ready**. Body: per group an `admin-group-label` with the group
  label and a `<ul>` of its checks: 14px `Check` (`text-success`) or
  `CircleAlert` (`text-warning`) + `runtimeCheckLabels[check.key] ??
  check.label` (`text-sm`), and " · không bắt buộc" in `text-muted` for
  checks with `required === false`.

**Section "Điểm cuối công khai"** (`Widget`), description "Dùng khi cấu hình
Google OAuth, webhook Polar và tên miền ứng dụng.".
`<ul aria-label="Các điểm cuối công khai" className="admin-rows">`; row:

- `.admin-row__text` (no truncation): title `endpointLabels[key] ?? key`
  (`text-sm font-medium`); second line the value in
  `break-all font-mono text-xs text-muted`, or "Chưa cấu hình" in
  `text-xs text-warning` when the value is empty.
- Right, only when a value exists: `Button isIconOnly size="sm"
  variant="ghost"` with ``aria-label={`Sao chép ${label}`}`` and a `Copy`
  icon. On success the icon becomes `Check` for 2 seconds and a visually
  hidden `role="status"` node says "Đã sao chép". On failure show
  `Alert status="danger"` at the top of the page body ("Trình duyệt không hỗ
  trợ sao chép tự động", same wording as `DistributionFeature`).

No `ItemCardGroup`, no `PlugZap` icons, no grey trays. Keep the
`groupLabels`, `endpointLabels` and `runtimeCheckLabels` maps exactly (the
route policy checks the last two by name).

### 9.4 Operations (`OperationsSettingsFeature`)

Header: title "Cài đặt vận hành" (pinned), description "Mã vận hành cho trạm
chơi, tách biệt với đăng nhập Google." (unchanged).

One `Widget className="max-w-xl"`:

- `Widget.Title` "Host PIN"; header right `Chip size="sm" variant="soft"`:
  `success` "Đã thiết lập" / `warning` "Chưa thiết lập" (from
  `state.hasHostPin`).
- `Widget.Description`: ``Mã ${PIN_LENGTH} số xác nhận thao tác tại chỗ: tạo
  lượt chơi ${gameTemplates["li-xi"].name}, thoát chế độ trạm và bỏ qua kết
  quả đang chờ.`` (the catalog name comes from `@/lib/gameTemplates`).
- Content (`admin-form`): feedback/error `Alert` first (as today), then one
  of two states. Local state `const [editing, setEditing] = useState(false)`.

  **PIN exists and not editing** (progressive disclosure: no empty cells):

  ```
  [shield]  Host PIN đang hoạt động                         [Đổi Host PIN]
            Đổi mã khi nhân sự vận hành thay đổi.
  ```

  `.admin-icon-tile` with `ShieldCheck`, title `text-sm font-medium`, meta
  `text-xs text-muted`, `Button variant="secondary"` "Đổi Host PIN" →
  `setEditing(true)` and clears feedback.

  **No PIN yet, or editing**:

  ```
  Host PIN mới
  [ ][ ][ ][ ][ ][ ]
  Gồm 6 chữ số. Chỉ chia sẻ với nhân sự vận hành tại chỗ.
  [Lưu Host PIN]  [Hủy]
  ```

  - `.admin-field`: `<label className="text-sm font-medium text-foreground"
    htmlFor="host-pin-new">Host PIN mới</label>`, `OtpPinInput
    variant="admin" length={PIN_LENGTH} inputId="host-pin-new"
    ariaLabel="Host PIN mới"` (the optional `inputId` / `ariaLabel` props of
    §8.1; add them as described there if they are not in the component yet;
    defaults unchanged), `autoFocus` only when `editing` is true, then
    `<p className="admin-field__hint">` with the hint above (`PIN_LENGTH`
    interpolated).
  - Button row `flex flex-wrap gap-3`: primary "Lưu Host PIN" (disabled
    until `pin.length === PIN_LENGTH`, `isPending`); `Button variant="ghost"`
    "Hủy" only when `editing` (clears `pin`, `setEditing(false)`).
  - On success: `setPin("")`, `setEditing(false)`, feedback "Đã cập nhật
    Host PIN." (unchanged string).

`api.auth.setHostPin` stays in this file (route policy).

### 9.5 Sidebar plan card (`WorkspaceLayout`)

New `app/_workspace/-components/WorkspacePlanCard.tsx`, rendered as the
first child of `Sidebar.Footer` (above the user row) in both the desktop
sidebar and the mobile sheet:

```
┌──────────────────────────────┐
│ Gói Miễn phí        Nâng cấp │
│ Trò chơi               5/10  │
│ ▓▓▓▓▓░░░░░                   │
└──────────────────────────────┘
(avatar) operator            [⇥]
```

```tsx
export function WorkspacePlanCard() {
  const plan = useQuery(api.entitlements.getPlanState, {});
  if (!plan) return null;
  const tightest = tightestResource(plan.resources);
  const level = tightest ? usageLevel(tightest.resource) : "ok";
  const planName = `Gói ${PLAN_TIER_NAMES[plan.tier]}`;
  return (
    <Link aria-label={`${planName}. Mở trang thanh toán`} className="admin-sidebar-plan" to="/settings/billing">
      <span className="flex items-center justify-between gap-2">
        <span className="truncate text-xs font-semibold text-foreground">{planName}</span>
        {plan.tier === "business" ? null : <span className="text-xs font-medium text-accent">Nâng cấp</span>}
      </span>
      {tightest ? (
        <>
          <span className="flex items-center justify-between gap-2 text-xs text-muted">
            <span className="truncate">{PLAN_RESOURCE_LABELS[tightest.key]}</span>
            <span className="tabular-nums">{tightest.resource.used}/{tightest.resource.limit}</span>
          </span>
          <ProgressBar aria-label={`Mức sử dụng ${PLAN_RESOURCE_LABELS[tightest.key]}`} color={level === "full" ? "danger" : level === "near" ? "warning" : "accent"} size="sm" value={usagePercent(tightest.resource)}>
            <ProgressBar.Track><ProgressBar.Fill /></ProgressBar.Track>
          </ProgressBar>
        </>
      ) : null}
    </Link>
  );
}
```

- Nothing renders while the query is loading or returns nothing (fixtures
  without the query stay unchanged).
- Hidden when the sidebar is collapsed to icons (CSS in §9.1); visible in the
  mobile sheet.
- The sidebar menu itself is untouched: same three rows, same order, same
  `aria-label`s (keyboard test). `useOwnerSession()`, `AppLayout`, `Outlet`
  stay in `WorkspaceLayout` (contracts).

### 9.6 Sign-in (`app/-auth/AuthFeature.tsx`)

One focused card. The page has a single job and a single button.

```
✦ Campaign Game Studio

┌────────────────────────────────────────┐
│ Đăng nhập dành cho host                │
│ Tạo chiến dịch trò chơi có thương      │
│ hiệu, phát phần thưởng và theo dõi     │
│ kết quả trong một không gian làm việc. │
│                                        │
│ [ G  Tiếp tục với Google             ] │
│ Lần đăng nhập đầu tiên sẽ tạo không    │
│ gian làm việc cho tài khoản Google     │
│ của bạn.                               │
└────────────────────────────────────────┘
 ◇ Trò chơi có thương hiệu cho từng chiến dịch
 ◇ Liên kết công khai, mã QR và trạm chơi
 ◇ Phân tích lượt chơi và phần thưởng
```

```tsx
<main className="admin-standalone">
  <div className="admin-standalone__inner">
    <div className="admin-standalone__brand">
      <span className="admin-sidebar-brand__mark"><Sparkles aria-hidden="true" size={18} /></span>
      <span className="text-base font-semibold text-foreground">Campaign Game Studio</span>
    </div>
    <section className="admin-standalone__card">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Đăng nhập dành cho host</h1>
        <p className="text-sm leading-6 text-muted">Tạo chiến dịch trò chơi có thương hiệu, phát phần thưởng và theo dõi kết quả trong một không gian làm việc.</p>
      </div>
      {error ? <Alert status="danger">…{error}…</Alert> : null}
      <div className="flex flex-col gap-3">
        <Button fullWidth isDisabled={isCompletingOAuth} isPending={isCompletingOAuth} size="lg" type="button" onPress={handleGoogleSignIn}>
          {/* spinner or the "G" mark, then: isPending ? "Đang đăng nhập…" : "Tiếp tục với Google" */}
        </Button>
        <p aria-live="polite" className="text-xs leading-5 text-muted" role="status">
          {isCompletingOAuth
            ? "Đang tạo hồ sơ host và mở không gian làm việc…"
            : "Lần đăng nhập đầu tiên sẽ tạo không gian làm việc cho tài khoản Google của bạn."}
        </p>
      </div>
    </section>
    <ul className="admin-standalone__points">{/* three lines, 16px lucide icon (aria-hidden) + text */}</ul>
  </div>
</main>
```

- Everything is left-aligned; the column is `max-w-sm` and vertically
  centred. The full-width button is the one allowed exception to §1 "no
  full-width buttons": it fills a 24rem card, not a page.
- The three points use `Gift`, `Link2`, `BarChart3`.
- Deleted: the "Nền tảng trò chơi marketing" chip, the "Bảo mật" chip, the
  progress ring, "0%", "n/3 sẵn sàng", the three-row checklist, the "Đang
  hoàn tất đăng nhập" alert (its message moves to the status line), the
  "Luồng làm việc" stepper widget, the "Khu vực vận hành" widget, and with
  them `authFeatureItems`, `authFlowSteps`, `authCommandRows`, `authStep`,
  `authReadyCount`, `authProgress`, `AuthFlowStepper` and the `Chip`,
  `ProgressCircle`, `ItemCard*`, `Stepper`, `Widget` imports.
- **Not touched**: `useAuthActions`, `useConvexAuth`, the `getCurrentUser`
  query, `oauthSubmitting` / `error` state, `isCompletingOAuth`, the whole
  `useEffect` with `finishOAuthLogin` (including `clearOwnerSession();`,
  `ensureCurrentHostProfile({})`, `api.setup.getSetupState`,
  `setupState.hasSetup ? "/campaigns" : "/onboarding"`), and
  `handleGoogleSignIn` with `signIn("google", { redirectTo: "/auth" })`.
  The file never imports `OtpPinInput` or `writeOwnerSession`.
- Strings that must remain in the rendered page: "Đăng nhập dành cho host",
  "Tiếp tục với Google" (`scripts/smoke-routes.mjs`).

### 9.7 Onboarding (`OnboardingFeature`)

Header: title "Bắt đầu với Campaign Studio" (pinned), description "Ba bước
để đưa trò chơi đầu tiên đến khách hàng.". Error `Alert` as today.

One `Widget className="max-w-2xl"` (no header), content:

```
(1) Tạo chiến dịch
    Hệ thống tạo sẵn một chiến dịch kèm trò chơi đầu tiên để bạn bắt đầu nhanh.
(2) Chỉnh thương hiệu và trò chơi
    Đặt tên, logo, nội dung hiển thị; thêm hoặc đổi mẫu trò chơi.
(3) Thêm phần thưởng và phát hành
    Thiết lập phần thưởng, rồi chia sẻ liên kết, mã QR hoặc mở trạm chơi.
──────────────────────────────────────────────────────────────────────
[Tạo chiến dịch đầu tiên]   Tự tạo từ đầu
```

- `<ol className="admin-steps">`; each `<li className="admin-step">` = the
  `.admin-step__index` bubble (`aria-hidden`, the `<ol>` already numbers
  it) + a text block (`.admin-step__title`, `.admin-step__text`).
- When `setup.campaigns.length > 0`, step 1 is done: the bubble gets
  `data-done="true"` and shows a 14px `Check` instead of "1", and its text
  becomes "Chiến dịch đầu tiên đã sẵn sàng.".
- Footer (`border-t border-border pt-5 mt-5`, `flex flex-wrap items-center
  gap-4`): primary `Button isPending={pending}` "Tạo chiến dịch đầu tiên"
  (or "Mở chiến dịch" when one exists; same `ensureCampaign` handler and
  navigation as today) and a plain text link (`text-sm font-medium
  text-accent`) "Tự tạo từ đầu" → `/campaigns/new`.
- The `EmptyState` is removed. Keep `AdminPageShell`, `ensureDefaultCampaign`,
  `isPending={pending}` and the "Không thể chuẩn bị chiến dịch đầu tiên"
  fallback (contracts).

### 9.8 Root not-found (`app/__root.tsx`)

New `app/-auth/StandaloneNotFound.tsx`, wired as `notFoundComponent` on the
root route. Same standalone frame as sign-in:

```
✦ Campaign Game Studio

┌────────────────────────────────────────┐
│ 404                                    │
│ Không tìm thấy trang                   │
│ Địa chỉ này không tồn tại hoặc đã      │
│ được chuyển đi.                        │
│ [Về trang chủ]                         │
└────────────────────────────────────────┘
```

- "404" is `text-sm font-medium text-muted`; the `h1` "Không tìm thấy trang"
  is `text-2xl font-semibold tracking-tight`; one sentence `text-sm
  text-muted`; one primary link styled with `buttonVariants({ variant:
  "primary" })`, natural width, `to="/"`.
- The component must bring the admin stylesheet itself, because the root
  route links no CSS: render `<link href={adminCss} precedence="default"
  rel="stylesheet" />` (React 19 hoists it) with `adminCss` imported as
  `@/app/styles/admin.css?url`, the same import `app/auth.tsx` uses. If that
  does not style the page in the capture, use the route-level mechanism that
  does; the capture is the proof.
- Guest routes and the workspace keep their own not-found handling
  (`WorkspaceNotFound` is unchanged). No guest stylesheet or guest bundle
  may change.

### 9.9 Policy, test and doc updates this slice requires

- `scripts/test-route-ux-policy.mjs`, the "Display-only auth progress…"
  assertion (pins `<ol aria-label="Tiến độ đăng nhập" className="sr-only">`,
  `aria-current={index === currentStep …}` and `<Stepper aria-hidden="true"`):
  replace with an assertion that the auth feature contains no `Stepper`, no
  `ProgressCircle`, no `ItemCardGroup`, and does contain `aria-live="polite"`
  and "Tiếp tục với Google". Message: "Sign-in must stay one focused action
  with a polite status line and no display-only progress widgets".
- Same script: add `WorkspacePlanCard` presence in `WorkspaceLayout` and
  `notFoundComponent` presence in `app/__root.tsx` as new assertions.
- `docs/route-ux-standardization.md` and `docs/admin-design-system.md`
  ("Current Route State"): update the rows for auth, onboarding, settings and
  not-found to this design.
- No other rule changes. If a contract script fails on a string this section
  did not name, keep the string.
- `tests/ui/workspace.spec.ts`: the settings and onboarding states only
  assert the h1 and take snapshots; refresh admin baselines deliberately.

### 9.10 Slice D visual checklist

Verify each on captures at 1440 and 390 (fixture routes `settings-billing`,
`settings-integrations`, `settings-operations`, `onboarding`, any workspace
route for the sidebar; `/auth` and an unknown URL from a running app):

- a. Billing: one "Gói hiện tại" section with the plan name as the largest
  text, six usage rows in two columns (one column at 390), no grey tray, no
  disabled portal button; three plan cards in a row (stacked at 390), the
  current one outlined with the "Gói hiện tại" chip, exactly one primary
  button on the page.
- b. Integrations: one header chip, four compact rows, the disclosure
  collapsed, endpoints with copy buttons; no horizontal overflow at 390 (URLs
  wrap).
- c. Operations: with a PIN set, no PIN cells are visible until "Đổi Host
  PIN" is pressed; the editing state shows label, cells, hint, then "Lưu
  Host PIN" and "Hủy" on one line.
- d. Sidebar: the plan card sits directly above the user row, is visually
  distinct from the sidebar background, and disappears when the sidebar is
  collapsed; the three menu rows are unchanged.
- e. Sign-in: one card, one button, no ring, no checklist, no stepper; the
  column is centred in the viewport and fits 390 without horizontal scroll.
- f. Onboarding: three numbered steps, one primary button, one text link.
- g. Unknown URL: styled standalone card (not raw "Not Found" text) with a
  working link to `/`.

## 10. Slice E: final polish

Small defects found while reviewing slices B2–D. Each item names the file,
the change and the evidence. No new components, no new copy beyond what is
written here, no backend change. Captures referenced below are in
`.tmp/ux-audit/slice-b2|c1|c2|d/`.

### 10.1 Template picker spacing (P1)

HeroUI gives every radio in a vertical `RadioGroup` `margin-top: 1rem`
(`.radio-group[data-orientation="vertical"] [data-slot="radio"]`), so the
picker rows sit 28px apart while the columns are 12px apart, and the first
card starts 16px too low. In `app/styles/admin.css`, next to
`.admin-choice-grid`:

```css
/* HeroUI adds mt-4 to each radio of a vertical group; the grid owns the
   spacing here (§10.1). Same layer, later source, equal specificity. */
.admin-choice-grid[data-orientation] [data-slot="radio"] {
	@apply mt-0;
}
```

Result: 12px between cards on both axes, in the create form and in the add
game dialog; the first card starts at the normal section content gap.

### 10.2 Game editor controls (P2, P3, P4, P5)

- P2 `app/game-templates/quiz/QuizConfigEditor.tsx` "Số câu đạt tối thiểu":
  add `className="admin-control--xs"` to its `NumberField.Group`, like every
  other stepper in the editor. Also fix the indentation of the hint `<p>`
  and the closing `</div>` below it (cosmetic only).
- P3 `CampaignGameEditorFeature.tsx`, "Trạng thái và giới hạn chơi": replace
  the `grid gap-5 md:grid-cols-3` row by two rows: the "Trạng thái trò chơi"
  field alone (it keeps `admin-control--sm`), then an `admin-field-pair`
  holding "Lượt tối đa mỗi người" and "Tổng lượt tối đa". Labels, ids,
  aria-labels and hints are unchanged (tests fill the fields by label).
  Result: the two steppers start at the same y at 1024 and 1440.
- P4 `CampaignGameAssetsPanel.tsx` asset row meta: render
  `slot.description` alone; it already states ratio and size. The
  "Chưa có ảnh (dùng hình mặc định)" branch is unchanged.
- P5a Same editor: the full-width `<Chip variant="soft">Trò chơi chính: …</Chip>`
  reads like a disabled input. Replace it with
  `<p className="admin-field__hint">Đây là trò chơi chính của chiến dịch; nội dung hiển thị dùng chung cho trạm và liên kết li xì.</p>`
  (drop the `Chip` import if nothing else uses it).
- P5b `lib/gameTemplates.ts` `REWARD_SOURCE_LABELS` (only used by the li xi
  config editor): `"campaign-budget": "Ngân sách tiền mặt"`,
  `"campaign-inventory": "Kho phần thưởng dùng chung"`, the names the
  Rewards tab already uses for these two sources. In
  `LiXiGameConfigEditor.tsx` the "Nguồn phần thưởng" description becomes
  "Ngân sách tiền mặt: host tạo từng lượt bằng Host PIN. Kho phần thưởng
  dùng chung: khách tự chơi qua liên kết hoặc trạm." Result: the selected
  label is not clipped at 1440.

### 10.3 Form controls on white sections (P6, P9)

- P6 Unselected HeroUI radios and checkboxes have a white control on a white
  section. Use the HeroUI secondary variant, the same grey as the form
  inputs: `variant="secondary"` on the `RadioGroup` "Hình thức"
  (`OperatorConsoleFeature.tsx`) and on the `Checkbox` "Xóa mã hiện tại khi
  lưu" (`RewardInventoryPanel.tsx`). The template picker cards keep their
  §7.8.1 styling.
- P9 `RewardsSetupFeature.tsx` budget tier row: the quantity control becomes
  a `NumberField` built exactly like the value field in the same row
  (`fullWidth`, `minValue={1}`, `variant="secondary"`, `Label` with
  `md:sr-only` "Số lượng", `NumberField.Group`, `NumberField.Input` with
  `tabular-nums`). Keep `aria-label={`Số lượng mức thưởng ${index + 1}`}` on
  the field and the two button aria-labels
  `Giảm/Tăng số lượng mức thưởng ${index + 1}` verbatim (policy pins).
  `onChange` stores `value ? String(value) : ""` like the value field; the
  existing save validation ("Số lượng phải là số nguyên dương") covers an
  empty field. Remove the `NumberStepper` import if nothing else uses it.

### 10.4 Rows, stats and grids (P7, P8, P11)

- P7 Rows with trailing actions (Distribution "Mở trạm và vận hành"): wrap
  the two links in `<div className="admin-row__actions">` and add
  `admin-row--actions` to that `<li>`. CSS:

  ```css
  /* Row with trailing buttons: below sm the buttons drop under the text,
     aligned with it (§10.4). 3.25rem = icon tile + gap. */
  .admin-row--actions {
  	@apply flex-wrap;
  }

  .admin-row__actions {
  	@apply flex shrink-0 items-center gap-2;
  }

  .admin-row--actions .admin-row__main {
  	@apply max-sm:basis-full;
  }

  .admin-row--actions .admin-row__actions {
  	@apply max-sm:pb-2 max-sm:pl-[3.25rem];
  }
  ```

  Result at 390: icon tile, name and meta on one line (name not wrapped, meta
  not truncated for the fixture games), buttons below aligned with the name;
  at 1440 unchanged.
- P8 `.admin-stats` spreads two or three numbers across the whole section.
  Replace the grid with left-packed items:

  ```css
  .admin-stats {
  	@apply flex flex-wrap gap-x-10 gap-y-4;
  }

  .admin-stats > div {
  	@apply min-w-[8.5rem];
  }
  ```

  Keep the `dt`/`dd`/`.admin-stats__note` rules. Result: numbers sit 40px
  apart from the left edge on every page that uses `admin-stats`
  (overview, rewards, operate, analytics).
- P11 Analytics DataGrids inside sections (`Widget.Content className="p-0"`
  in `AnalyticsFeature.tsx`): the grid header row touches the section
  description and the first column text sits 8px left of the section title.
  Replace `p-0` on those contents by one class `admin-grid-section`: no
  horizontal or bottom padding, `padding-top: 1rem`; and pad the first and
  last cells of header and body rows so the first column text lines up with
  the section title and the last column text with the section's right
  content edge. Read the section inset from the Widget header in the browser
  (24px in the captures) and inspect the DataGrid DOM for the cell
  selectors; the header background stays full width.

### 10.5 Naming and wording (P10, P12)

- P10 `OperatorConsoleFeature.tsx`: the page never names the game. Titles
  stay (tests pin them). Descriptions become
  `` `${game.campaignGame.name}: tạo lượt chơi, quản lý liên kết công khai và khởi chạy trạm.` ``
  (li xi console) and
  `` `${gameName}: mở màn hình trạm; khách tự bắt đầu lượt chơi, phiên được nhận diện kênh “Trạm chơi”.` ``
  (`StationLaunchCard`).
- P12 Analytics shows the backend label "li xi (legacy)". Relabel in the UI
  only, by key: add in `AnalyticsFeature.tsx`
  `const channelLabel = (row: { key: string; label: string }) => row.key === "legacy" ? "Li xì chưa gắn kênh" : row.label;`
  and use it wherever a channel row label is rendered (overview list and
  channel grid). The two section descriptions become "So sánh liên kết công
  khai và trạm chơi; lượt li xì chưa gắn kênh được hiển thị riêng." and
  "Phễu theo từng liên kết; lượt li xì chưa gắn kênh không nằm trong bảng
  này." `convex/analytics.ts` and the fixture keep "li xi (legacy)";
  `tests/ui/analytics.spec.ts` asserts the new visible label.

### 10.6 Sidebar brand (P13)

At 1440 the sidebar truncates both brand lines ("Campaign Game…",
"Nền tảng trò chơi mark…"). The tagline says nothing an operator needs:
delete the "Nền tảng trò chơi marketing" line in `WorkspaceLayout.tsx`; the
name becomes `text-sm font-semibold`; `.admin-sidebar-brand` uses `gap-2.5`
and a horizontal padding that puts the mark's left edge on the menu group
label's left edge. Result: "Campaign Game Studio" is not truncated at 1440
(`scrollWidth <= clientWidth`); collapsed and mobile states unchanged.

### 10.7 Slice E visual checklist

At 1440 and 390 unless noted:

- a. Template picker (create form and add game dialog): 12px between cards
  on both axes.
- b. Quiz editor: the pass-count stepper is compact. Game editor limits: the
  two steppers top-aligned (1024 and 1440). Asset meta states the ratio
  once. Li xi editor: no pill note; "Nguồn thưởng" label not clipped.
- c. Operate li xi: both delivery radios visible when unselected;
  description starts with the game name. Rewards: unchecked "Xóa mã hiện
  tại khi lưu" visible; value and quantity controls look the same.
- d. Distribution 390: rows as §10.4 P7.
- e. Stats left-packed on overview, rewards, operate wheel, analytics.
- f. Analytics games/channels: 16px between description and grid header;
  first column text aligned with the section title; no "legacy" anywhere.
- g. Sidebar brand name fully visible at 1440.

## 11. Round 2: structural redesign

Slices A–E made every screen consistent, but the user's verdict on the
result was "not good enough", and they are right. The workspace still
reads like a settings app:

- Every page is a vertical stack of white cards of equal weight. Nothing
  is the focal point and nothing tells the operator how the campaign is
  doing.
- The campaign overview is mostly a form (name, slug, status, brand)
  under four bare numbers. The page that should answer "is my campaign
  working?" spends 70% of its height on fields edited once.
- Lists carry names and chips but no numbers, so every row looks the
  same. The games list never shows the game itself (the product is
  visual, but the admin is text only).
- Ratios (funnel, stock left, budget left, link share) are printed as
  plain numbers, and the reader has to do the division.
- Status is split into two chips ("Đang chạy" + "Cửa sổ đang mở"), so
  the operator has to combine them in their head.

Round 2 changes structure, not polish. Slices F–I, in order:

- **F:** campaign index, overview dashboard, settings route.
- **G:** games tab and game editor.
- **H:** rewards and distribution.
- **I:** analytics.

### 11.0 Principles (in addition to §1)

- **R1 Object first, form on demand.** A page about an object shows the
  object's state and results. Forms that are edited rarely move to a
  dedicated settings route or a dialog. Day-to-day controls stay where
  they are used.
- **R2 Every list item carries a number.** Campaign cards, game rows, link
  rows and reward rows each show their most useful metric(s), right
  aligned and tabular.
- **R3 One computed status.** A game shows one chip that already combines
  saved status and play window (`GameStatusChip`, §11.1). The detail
  (open/close time) sits in the meta line, not in a second chip.
- **R4 Show the product.** Where a game is listed as a card, the card shows
  the template preview (slice G). Brand colour and logo identify a
  campaign card.
- **R5 Visualize ratios.** Funnel steps, remaining stock, remaining budget
  and channel share are bars. The number stays next to the bar.
- **R6 One loud action.**
  - At most one filled primary button is visible at a time.
  - A section-level save is primary only while that section is dirty.
  - A checklist shows its first open step's action as primary and the
    later ones as secondary.

### 11.1 Shared blocks (slice F builds them, later slices reuse them)

**`lib/gameStatus.ts`** (new, with `lib/gameStatus.test.ts`):

```ts
import { formatScheduleTime, resolveGameScheduleState } from "./schedulePolicy";

export type EffectiveGameStatus = {
	state: "archived" | "draft" | "scheduled" | "ended" | "live";
	label: string;
	color: "default" | "success" | "warning";
	/** Meta-line text such as "Đến 13 thg 9, 2026 00:29"; null when nothing to add. */
	detail: string | null;
};

export function resolveEffectiveGameStatus(
	game: { status: string; schedule: { startsAt: number | null; endsAt: number | null } },
	now: number,
): EffectiveGameStatus;
```

Rules, in order:

| Condition | `state` | `label` | `color` | `detail` |
|---|---|---|---|---|
| `status === "archived"` | `archived` | `Đã lưu trữ` | default | `null` |
| `status !== "active"` | `draft` | `Bản nháp` | default | `null` |
| window `not-started` | `scheduled` | `Sắp mở` | warning | `` `Mở lúc ${formatScheduleTime(startsAt)}` `` |
| window `ended` | `ended` | `Đã kết thúc` | default | `` `Đã đóng lúc ${formatScheduleTime(endsAt)}` `` |
| otherwise | `live` | `Đang chạy` | success | `` `Đến ${formatScheduleTime(endsAt)}` `` when `endsAt !== null`, else `null` |

The unit test covers each row with a fixed `now`.

**`app/_workspace/-components/GameStatusChip.tsx`** (new):

```tsx
export function GameStatusChip({ status }: { status: EffectiveGameStatus }) {
	return <Chip color={status.color} size="sm" variant="soft">{status.label}</Chip>;
}
```

Callers compute the status once per row with
`resolveEffectiveGameStatus(game, Date.now())`, and render both the chip
and `status.detail`. `ScheduleStatusChip` stays for the distribution
share panel until slice H.

**`lib/campaignMetrics.ts`** (new, with `lib/campaignMetrics.test.ts`):

```ts
export type FunnelCounts = { opens: number; starts: number; completions: number; rewardOutcomes: number; claims: number };
export function sumFunnelRows(rows: FunnelCounts[]): FunnelCounts;
/** claims / opens, null when opens is 0 (same rule as convex funnelConversion). */
export function conversionRate(counts: { opens: number; claims: number }): number | null;
/** vi-VN percent, 0 decimals ("65%"); "—" for null. */
export function formatPercent(rate: number | null): string;
export function groupRowsByCampaign<T extends { campaignId: string }>(rows: T[]): Map<string, T[]>;
```

**`FunnelBars`**, a new component in
`app/_workspace/-components/FunnelBars.tsx`. Props:
`{ label: string; steps: Array<{ label: string; value: number }> }`.

```tsx
<ol aria-label={label} className="admin-funnel">
	<li className="admin-funnel__step">
		<span className="admin-funnel__label">{step.label}</span>
		<span aria-hidden="true" className="admin-funnel__track">
			<span className="admin-funnel__fill" style={{ width: `${width}%` }} />
		</span>
		<span className="admin-funnel__value">{vi-VN number}</span>
		<span className="admin-funnel__rate">{index === 0 ? null : <>{formatPercent(rate)}<span className="sr-only"> so với bước trước</span></>}</span>
	</li>
</ol>
```

- `width` is `value / steps[0].value * 100`. It is 0 when the first value
  is 0; a non-zero value gets at least 2%.
- `rate` is `value / previous.value`, or null when the previous value is 0.
- CSS:
  - `.admin-funnel` is a flex column with `gap-3`.
  - `.admin-funnel__step` is a grid with `gap-x-3 gap-y-1.5`, items
    centred. Below 40rem the columns are `minmax(0,1fr) auto 3rem` with
    areas `"label value rate" "track track track"`. From
    `@media (min-width: 40rem)` the columns are
    `7.5rem minmax(0,1fr) 4.5rem 3rem` with area
    `"label track value rate"`.
  - The track is `h-2.5 rounded-full bg-surface-secondary overflow-hidden`.
  - The fill is `block h-full rounded-full bg-accent`.
  - The value is `text-right text-sm font-semibold tabular-nums`.
  - The rate is `text-right text-xs tabular-nums text-muted`.

**`.admin-perf`** is the performance card body:

- Layout:
  - grid with `gap-6`;
  - from `@media (min-width: 48rem)`: columns `12rem minmax(0,1fr)`,
    `gap-8`, items centred.
- Left cell (`.admin-perf__kpi`): flex column.
  - Number: `text-4xl font-semibold tracking-tight tabular-nums` (for
    example "65%").
  - Label below: `text-sm font-medium` "Tỉ lệ chuyển đổi".
  - Note under the label: `text-xs text-muted`, for example
    "78 nhận thưởng / 120 lượt mở".
- Right cell: `FunnelBars`.

**Metric rows** (`.admin-metric-*`) are a list of objects with numbers,
used by the overview game list (F) and reused in H and I:

- **Header** (`.admin-metric-head`, `aria-hidden="true"`). It is
  `display: none` below 48rem.
  - From 48rem it is a grid with the row's columns, `gap-x-4`, `pb-2`,
    `text-xs font-medium text-muted`.
  - Cells after the first are right aligned.
  - It has no horizontal padding.
- **Row** (`li.admin-metric-row`, plus `border-t border-border` between
  rows). The row holds one link, `.admin-metric-row__link`:
  - `-mx-2 px-2 py-3 rounded-xl`, `grid gap-x-4 gap-y-1`, a single
    column below 48rem;
  - from 48rem: columns `minmax(0,1fr) repeat(3, 6rem)`, items centred;
  - `hover:bg-surface-secondary`, `focus-visible:ring-2 ring-focus`.
- **Name cell** (`.admin-metric-row__name`): flex row, `gap-3`, `min-w-0`.
  - `.admin-icon-tile`.
  - A text block:
    - title line: the name (`text-sm font-medium truncate`) then the chip;
    - meta line: `text-xs text-muted truncate`.
- **Metrics wrapper** (`.admin-metric-row__metrics`).
  - Below 48rem: `flex flex-wrap gap-x-4 gap-y-1 pl-[3.25rem] text-xs`.
    Each metric shows a visible muted label and then a
    `font-medium tabular-nums` value.
  - From 48rem: `display: contents`. Each metric becomes a grid cell:
    right aligned, `text-sm font-medium tabular-nums`, and the label is
    `md:sr-only`.

**`.admin-kv`** is a `dl` of key/value lines for the narrow side cards:

- each line `flex items-baseline justify-between gap-3 py-1.5 text-sm`;
- `dt` muted;
- `dd` `font-medium tabular-nums text-foreground`;
- lines separated by `border-t border-border` (none on the first).

**`.admin-meter`** is a segmented progress meter for checklists:

- the meter is `grid grid-cols-4 gap-1.5`;
- each `span` is `h-1.5 rounded-full bg-surface-secondary`;
- `span[data-done]` is `bg-success`.

**`.admin-settings` / `.admin-settings-section`** are the settings-page
sections (F, reused for game settings in G if needed):

- `.admin-settings` is a flex column with `gap-10`.
- `.admin-settings-section` is a grid with `gap-4`. From 48rem its columns
  are `15rem minmax(0,1fr)`, with `gap-8` and items at the start.
- The intro block (`.admin-settings-section__intro`) holds:
  - `h2.text-base font-semibold text-foreground`;
  - `p.mt-1 text-sm leading-5 text-muted`.
- The second column is one `Widget` whose content has `className="admin-form"`.
- No borders between sections; the 40px gap separates them.

**`.admin-campaign-card`** is the campaign index card (§11.2.1). It
replaces `.admin-card-link`; delete `.admin-card-link` because nothing
else uses it.

### 11.2 Slice F: campaign index, overview dashboard, settings route

#### 11.2.1 Campaign index (`CampaignIndexFeature.tsx`)

**Data.**
- `getWorkspace` as today, plus
  `useQuery(api.analytics.getCampaignGameBreakdown, {})`. With no
  `campaignId`, that query returns every game of the owner, each row
  carrying its `campaignId`.
- Group the rows by campaign with `groupRowsByCampaign`. A campaign's
  game count is its row count, and its funnel is
  `sumFunnelRows(rows)`.
- Show the page spinner until both queries resolve.

**Body, top to bottom, when there is at least one campaign:**

1. A `Widget` with no header. Its content is `dl.admin-stats` with four
   items:
   - "Chiến dịch đang chạy": the number of campaigns with
     `status === "active"`;
   - "Lượt chơi": the sum of `starts`;
   - "Lượt nhận thưởng": the sum of `claims`;
   - "Tỉ lệ chuyển đổi": `formatPercent(conversionRate(total))`, with
     `dd.admin-stats__note` "Nhận thưởng trên lượt mở".
2. `ul.grid gap-4 md:grid-cols-2 xl:grid-cols-3` (unchanged), one
   `li > Link.admin-campaign-card` per campaign. The whole card stays one
   link to `/campaigns/$campaignId`, and `workspace.campaigns.map` stays.

**Card markup, in DOM order** (the cover must be the card's first
`span[style]`):

```tsx
<Link className="admin-campaign-card" params={{ campaignId: campaign.id }} to="/campaigns/$campaignId">
	<span aria-hidden="true" className="admin-campaign-card__cover"
		style={campaign.brandColor ? { backgroundColor: campaign.brandColor } : undefined} />
	<span className="admin-campaign-card__body">
		<span className="admin-campaign-card__head">
			{logo url
				? <img alt={`Logo ${campaign.name}`} className="admin-campaign-card__logo" src={url} />
				: <span className="admin-campaign-card__logo admin-campaign-card__logo--icon"><Gamepad2 aria-hidden="true" size={22} /></span>}
			<Chip …status (success "Đang chạy" / default "Bản nháp" / "Đã lưu trữ")…/>
		</span>
		<span className="admin-campaign-card__title">{campaign.name}</span>
		<span className="admin-campaign-card__meta">{brandName || `/${slug}`} · {gameCount} trò chơi</span>
		<span className="admin-campaign-card__metrics">
			<span><span>Lượt chơi</span><span>{starts}</span></span>
			<span><span>Nhận thưởng</span><span>{claims}</span></span>
			<span><span>Chuyển đổi</span><span>{formatPercent(rate)}</span></span>
		</span>
		{audience chips as today}
	</span>
</Link>
```

- **Card**: `flex h-full min-w-0 flex-col overflow-hidden rounded-2xl
  bg-surface shadow-surface outline-none transition-shadow
  hover:shadow-md focus-visible:ring-2 focus-visible:ring-focus`.
- **Cover**: `block h-16 bg-surface-secondary`, plus
  `background-image: linear-gradient(120deg, rgb(255 255 255 / 0.28) 0%, rgb(255 255 255 / 0) 60%)`.
  The inline style sets `backgroundColor`, never the `background`
  shorthand, so the gradient survives.
- **Body**: `flex flex-1 flex-col gap-3 px-5 pb-5`.
- **Head**: `-mt-7 flex items-end justify-between gap-3`.
- **Logo**: `size-14 shrink-0 rounded-2xl bg-surface object-cover ring-4
  ring-surface`. The icon variant is `grid place-items-center
  bg-surface-secondary text-muted`.
- **Title**: `truncate text-base font-semibold text-foreground`.
- **Meta**: `-mt-2 truncate text-sm text-muted`.
- **Metrics**: `grid grid-cols-3 gap-3 rounded-xl bg-surface-secondary
  px-3 py-2.5`.
  - Each first child is `block text-xs text-muted`.
  - Each second child is `block text-base font-semibold tabular-nums
    text-foreground`.
- **Description**: no longer rendered on the card.

The empty state (`campaignsMode=empty`) stays exactly as it is today, with
no stats widget.

#### 11.2.2 Campaign overview (`CampaignOverviewFeature.tsx` + `CampaignOverviewSummary.tsx`)

The overview no longer holds a form. `CampaignOverviewFeature` keeps:

- the loading spinner and the not-found state;
- an `AdminPageShell` with:
  - `title={campaign.name}` and the campaign status chip (as today);
  - `description={campaign.description || undefined}`;
  - `breadcrumbContext={campaign.name}` and `tabs`;
  - no `actions` and no `stickyHeader`;
- `<CampaignOverviewSummary campaign={campaign} />` as the body.

It has no `onEditStatus`. `saveCampaign`, the draft state,
`UnsavedChangesGuard`, `AdminSaveStatus` and the brand fields move to
the settings route (§11.2.3).

`CampaignOverviewSummary` keeps exporting `CampaignGameRow` unchanged
(the games tab uses it until slice G). It adds
`useQuery(api.analytics.getCampaignGameBreakdown, { campaignId })` to its
queries.

**Overview body, top to bottom:**

**1. `LaunchChecklist`**, only while a step is open:

- Same steps, details and done rules as today.
- The "Kích hoạt" action becomes a link "Kích hoạt chiến dịch" to
  `/campaigns/$campaignId/settings`.
- The first open step's action uses
  `buttonVariants({ size: "sm", variant: "primary" })`. Every later open
  step uses `variant: "secondary"`.
- `Widget.Content` starts with
  `<div aria-hidden="true" className="admin-meter">`, one span per step,
  with `data-done` set on done steps.
- The header keeps "Hoàn tất thiết lập" and "{n}/4 bước".

**2. Performance card**: `Widget`, title "Hiệu quả", with the existing
"Xem phân tích →" link.

- When `opens === 0 && starts === 0`: the existing empty sentence only.
- Otherwise `div.admin-perf`:
  - The KPI is `formatPercent(conversionRate(metrics))`, with the label
    "Tỉ lệ chuyển đổi" and the note
    `` `${claims} nhận thưởng / ${opens} lượt mở` `` (vi-VN numbers).
  - Then `<FunnelBars label="Phễu chiến dịch" steps={[…]} />` with
    "Lượt mở" = opens, "Bắt đầu chơi" = starts, "Hoàn tất" = completions,
    "Nhận thưởng" = claims.
- The old four-number `admin-stats` row is removed from the overview.

**3. `div.admin-split.admin-split--rail`**

The main column (`.admin-split__main`) holds the game performance
`Widget`:

- Title "Trò chơi". Description
  `` `${games.length} trò chơi · ${liveCount} đang chạy` ``, where
  `liveCount` counts `state === "live"`. Header link
  "Quản lý trò chơi →" (as today).
- Content: `.admin-metric-head`, with the cells "Trò chơi", "Lượt mở",
  "Hoàn tất", "Chuyển đổi". Then
  `ul.admin-rows`, `aria-label="Trò chơi của chiến dịch"`, holding the
  first 5 games as metric rows.
- **Each row** links to `/campaigns/$campaignId/games/$campaignGameId`.
  - Name cell: icon tile, the game name and `GameStatusChip`.
  - Meta line: `[template name if renamed, status.detail]` joined with
    " · ". The meta line is omitted when both are empty.
  - Metrics: "Lượt mở" = opens, "Hoàn tất" = completions,
    "Chuyển đổi" = `formatPercent(conversionRate(row))`. The values
    come from the breakdown row with the same `campaignGameId`.
  - A game with no breakdown row shows 0, 0 and "—".
- Rows have no "Vận hành" button on the overview (operating lives on
  distribution and the games tab).
- Keep the "Xem tất cả N trò chơi" link when there are more than 5 games.
- With no games, keep the sentence "Chưa có trò chơi.".

The side column (`.admin-split__side`, plus a new modifier
`.admin-split__side--cards`, which is `sm:grid sm:grid-cols-2 xl:flex`
while keeping the column's gap) holds three `Widget`s, each with a
header link styled like `sectionActionLinkClass`:

**a. "Phần thưởng"**, link "Quản lý →" to `/campaigns/$campaignId/rewards`.

Content uses the existing `.admin-usage__row` / `__head` / `__label` /
`__value` markup.

- **Stock:** shown when inventory has active items.
  - Label "Kho quà".
  - Value
    `` <strong>{remaining}</strong> / {total} còn lại `` (sums of
    `quantityRemaining` / `quantityTotal` over active items).
  - Then `ProgressBar size="sm" color="accent"` with
    `aria-label="Kho quà còn lại"`.
  - Then `p.text-xs text-muted` `` `${n} loại phần thưởng` ``.
- **Budget:** shown when `setupState.hasSetup` and a budget exists.
  - Label "Ngân sách lì xì".
  - Value `<strong>{remaining ₫}</strong> / {total ₫}` (vi-VN currency
    VND, as `RewardsSetupFeature` formats).
  - Then a `ProgressBar` with `aria-label="Ngân sách còn lại"`.
- **Neither:** `p.text-sm text-muted` "Chưa có phần thưởng.".

**b. "Phân phối"**, link "Quản lý →" to
`/campaigns/$campaignId/distribution`. Content is a `dl.admin-kv`:

- "Liên kết đang hoạt động": active share links;
- "Trò chơi tại quầy": games that are budget li xì (`templateId === "li-xi"` and
  `configRewardSource(config) === "campaign-budget"`) or
  `supportsSelfServeStationGame(templateId, config)`;
- "Lượt mở qua liên kết": `metrics.channelSharePerformance.publicPlayLinkOpens`.

**c. "Thương hiệu"**, link "Chỉnh sửa →" to
`/campaigns/$campaignId/settings`. Content is
`div[data-testid="campaign-brand-metadata"]` (flex column, `gap-3`):

- Row 1:
  - the logo `img alt="Logo chiến dịch"` (`size-12 rounded-xl
    object-cover`) when there is one;
  - then a text block with the brand name (`text-sm font-medium`) and
    the colour chip as today: swatch span plus
    `` `Màu ${brandColor.toUpperCase()}` ``.
- Row 2: the audience chips (`size="sm"`).
- Row 3: `audienceNote` as `p.text-xs text-muted line-clamp-2`.
- With no logo, no colour and no tags: the existing sentence
  "Chưa có nhận diện thương hiệu nào được đặt.".

Below `xl` the split stacks. The three side cards then sit in a two-column
grid from `sm` and in a single column below.

#### 11.2.3 Settings route

- **Route.** Add `app/_workspace/campaigns/$campaignId/settings.tsx`:
  - copy of `distribution.tsx`;
  - title "Cài đặt chiến dịch | Campaign Game Studio";
  - description "Thông tin, trạng thái và nhận diện thương hiệu của chiến dịch.";
  - renders `<CampaignSettingsFeature key={campaignId} campaignId={campaignId} />`;
  - regenerate `routeTree.gen.ts` (the vite plugin does it on `dev` or `build`).
- **Nav tab.** In `CampaignContextNav`, add
  `<Link activeProps={{ "aria-current": "page" }} className="admin-tabs__link" params={{ campaignId }} to="/campaigns/$campaignId/settings">Cài đặt</Link>`
  after "Phân phối" and before the "Phân tích" away link.

**`CampaignSettingsFeature.tsx`** (new) is the old overview form logic
moved over unchanged. It keeps:

- the `loadedCampaignId`/baseline/dirty logic;
- `save()` with every round-tripped field;
- the feedback "Đã lưu thông tin chiến dịch";
- `UnsavedChangesGuard`;
- the error `Alert`.

Shell:

- title "Cài đặt chiến dịch";
- description "Thông tin, trạng thái và nhận diện thương hiệu của chiến dịch.";
- `breadcrumbContext={campaign.name}`;
- `stickyHeader`;
- actions `AdminSaveStatus` + `Button` "Lưu thay đổi" (primary, disabled
  until dirty, as today);
- tabs `CampaignContextNav`.

Body: `div.admin-settings` with three `section.admin-settings-section`
elements, each made of the intro plus one `Widget` (no Widget header)
whose `Widget.Content` has `className="admin-form"`:

1. **"Thông tin chung"**, intro "Tên, thương hiệu và mô tả hiển thị trong
   không gian làm việc.".
   - Fields as today with ids `campaign-settings-name`,
     `campaign-settings-slug`, `campaign-settings-brand` and
     `campaign-settings-description`.
   - Same labels and controls; slug + brand stay in a
     `.admin-field-pair`.
2. **"Trạng thái"**, intro "Người chơi chỉ tham gia được khi chiến dịch
   đang chạy.".
   - `RadioGroup aria-label="Trạng thái chiến dịch"
     className="admin-choice-grid"` holding two `Radio` cards built like
     `GameTemplatePicker`'s (`admin-choice-card`, selected
     `border-accent bg-accent-soft`, control + text, no icon tile):
     - `draft`: "Bản nháp", "Chỉ nhóm của bạn thấy; liên kết chơi chưa mở.";
     - `active`: "Đang chạy", "Người chơi tham gia được qua liên kết và trạm.".
   - The `NativeSelect` is removed.
3. **"Nhận diện thương hiệu"**, intro "Logo, màu và đối tượng chỉ dùng
   trong không gian làm việc; màn chơi của khách không đổi.".
   - `CampaignLogoField` then
     `CampaignBrandIdentityFields idPrefix="campaign-settings"`.
   - No metadata chips here; they live on the overview card.

#### 11.2.4 Fixture data (`tests/ui/fixtures/convex-mock.ts`)

The workspace fixture must tell one coherent story, because the overview
now joins numbers by game id.

**`campaignGameBreakdownRows`.** Replace the two `op-game-*` rows with the
rows below; they sum to `ownerAnalytics.gameMetrics`. Each row has
`gameTemplateId` and
`rewardOutcomes = completions`, and `conversion = claims / opens` or
`null` when `opens` is 0, rounded to three decimals:

| campaignId | campaignGameId | gameName | template | opens | starts | completions | claims |
|---|---|---|---|---|---|---|---|
| A | wf-game-lunar | Bánh bao lì xì (chính) | li-xi | 26 | 26 | 22 | 20 |
| A | wf-game-wheel | Vòng quay may mắn | lucky-wheel | 52 | 40 | 36 | 34 |
| A | wf-game-scratch | Thẻ cào may mắn | scratch-card | 30 | 22 | 20 | 18 |
| A | wf-game-slot | Máy quay tri ân | slot-reveal | 12 | 8 | 6 | 6 |
| A | wf-game-quiz | Trắc nghiệm tri ân | quiz | 0 | 0 | 0 | 0 |
| B | op-game-b | Vòng quay chiến dịch B | lucky-wheel | 8 | 6 | 5 | 4 |

**Breakdown filters.** The three `analyticsQueryValue` breakdown branches
filter with `!args?.campaignId || row.campaignId === args.campaignId`.
The channel rows have no `campaignId`; keep their current
campaign-A-only rule.

**Share-link breakdown rows.** In `campaignShareLinkBreakdownRows`,
`campaignGameId` becomes `"wf-game-wheel"`.

**Workspace share links.** Add a mutable array `workspaceShareLinks`
(real `listShareLinks` shape: `id`, `shareCode` (22 chars),
`campaignGameId`, `campaignGameName`, `templateId`, `channel`, `label`,
`status`, `createdAt`, `revokedAt`) with three links, using fixed
`Date.parse(...+07:00)` timestamps:

- `sharelink-a-qr`: wheel, channel `qr`, label "Link QR", active;
- `sharelink-a-fb`: wheel, channel `facebook`, label "Facebook", active;
- `sharelink-a-zalo`: scratch, channel `zalo`, label "Zalo", revoked.

In `workspaceQueryValue`, after the setup-mode `listShareLinks` branch,
return `{ links: structuredClone(workspaceShareLinks) }` for
`args.campaignId === CAMPAIGN_A`.

**Setup mode.** `analytics:getCampaignGameBreakdown` with
`overviewMode === "setup"` returns `{ rows: [] }`.

**Unchanged.** Nothing else in the fixtures changes (operator fixture,
claims, inventories).

#### 11.2.5 Tests, policy and docs

**`tests/ui/fixtures/workspace-main.tsx`:**
- Add a `campaignSettingsRoute` (`/campaigns/$campaignId/settings` →
  `CampaignSettingsFeature`) to the tree.
- Add `"campaign-settings": "/campaigns/campaign-a/settings"` to the paths
  map.

**`tests/ui/workspace.spec.ts`:** add
`{ heading: "Cài đặt chiến dịch", key: "campaign-settings", query: "route=campaign-settings" }`
after `campaign-distribution` in `ROUTE_STATES`.

**`tests/ui/asset-slots.spec.ts`**, brand test (rename it to "overview
card and settings: metadata, prefilled fields, save round-trip and logo
remove"):

1. On `route=overview`, the four metadata assertions stay as they are.
2. Go to `route=campaign-settings`. The prefill assertions now use
   `#campaign-settings-brand-color` and
   `#campaign-settings-audience-note`.
3. Fill, then "Có thay đổi chưa lưu.", "Lưu thay đổi", "Đã lưu thông
   tin chiến dịch"; the `saveCampaign` call assertion is unchanged.
4. Click the "Tổng quan" tab link and assert the metadata card shows
   "Màu #00CCFF".
5. Click the "Cài đặt" tab link. "Gỡ logo", "Đã gỡ logo thương hiệu.",
   "Chưa có" and the detach call assertions stay unchanged.

The campaigns-list test stays unchanged and must pass: the cover is the
card's first `span[style]`.

**`tests/ui/analytics.spec.ts`**, games-view test. The fixture names
changed, and the wheel/scratch names now equal their template labels.
Assert:
- `grid.getByText("Bánh bao lì xì (chính)")`;
- the li xì template label cell (catalog name "Lunar Fortune");
- `grid.getByRole("row", { name: /Vòng quay may mắn/ })`;
- `grid.getByRole("row", { name: /Thẻ cào may mắn/ })`.

**`scripts/test-route-ux-policy.mjs`:**
- **Sticky-save loop:** `CampaignOverviewFeature.tsx` →
  `CampaignSettingsFeature.tsx`.
- **`UnsavedChangesGuard` and `loadedCampaignId` assertions:** read the
  settings feature instead of the overview.
- **Summary assertion:** `<CampaignOverviewSummary` in the overview,
  `LaunchChecklist` and `FunnelBars` in the summary (instead of
  `admin-stats`), and `!campaignOverviewFeature.includes("saveCampaign")`.
  Message: "Campaign overview must be a dashboard (launch checklist,
  funnel, game performance) with settings on their own route".
- **`workspaceCopySources`:** add `CampaignSettingsFeature.tsx` and
  `CampaignOverviewSummary.tsx`.

**`docs/admin-design-system.md`:**
- Document `GameStatusChip`, `FunnelBars`/`.admin-funnel`, `.admin-perf`,
  `.admin-metric-*`, `.admin-kv`, `.admin-meter`, `.admin-settings*` and
  `.admin-campaign-card`, then remove `.admin-card-link`.
- Add R1–R6 under a "Round 2 rules" heading.
- Note that campaign settings live on `/campaigns/$campaignId/settings`
  and the overview has no form.

#### 11.2.6 Slice F visual checklist (1440 and 390)

- a. **Campaigns:**
  - stats row first;
  - campaign A card has a purple cover, a logo overlapping the cover
    edge, "Thương hiệu A · 5 trò chơi", metrics 96 / 78 / 65%, and two
    chips;
  - campaign B card has a grey cover, an icon tile, "1 trò chơi" and
    metrics 6 / 4 / 50%.
- b. **Overview 1440:**
  - no form and no save button;
  - the performance card shows "65%" left and four funnel bars with
    decreasing fill and rates;
  - the game list sits left of three side cards;
  - wheel row: "Đang chạy" + "Đến …", metrics 52 / 36 / 65%;
  - quiz row: "Sắp mở" + "Mở lúc …", 0 / 0 / —;
  - lunar meta "Lunar Fortune".
- c. **Overview 390:**
  - funnel tracks drop under their labels;
  - row metrics sit on one line under the name, aligned with the name
    text;
  - side cards stack;
  - no horizontal overflow.
- d. **Overview setup mode:**
  - checklist with meter (0 green segments for an untouched campaign or
    as the data dictates);
  - exactly one primary button (first open step);
  - "Kích hoạt chiến dịch" link points to settings;
  - performance shows the empty sentence;
  - rows show "Bản nháp".
- e. **Settings:**
  - three sections, intro left at 1440 (stacked at 390);
  - status radio cards with the active one selected;
  - sticky save header;
  - "Cài đặt" tab current.

### 11.3 Slice G: games tab and game editor

#### 11.3.1 Games tab (`CampaignSectionFeature.tsx`)

The games tab becomes a grid of preview cards (R2, R3, R4). The games
are the product, so each card shows the template preview, the computed
status and three numbers.

**Data.**
- `getCampaignGamesRouteContext` as today, plus
  `useQuery(api.analytics.getCampaignGameBreakdown, { campaignId })`.
- Show the page spinner until both resolve.
- A game's numbers come from the breakdown row with the same
  `campaignGameId`. A game with no row shows 0, 0 and "—".

**Body, top to bottom:**
1. The not-active `Alert` as today. Its action becomes a link to
   `/campaigns/$campaignId/settings` with the text "Mở cài đặt" (same
   `buttonVariants({ size: "sm", variant: "secondary" })`).
2. The materialize error `Alert` as today.
3. The add-success `Alert`, now outside any Widget.
4. While `campaignGames.length === 0`: the existing spinner block
   (`grid min-h-48 place-items-center`, same label), with no Widget
   around it.
5. Otherwise `ul.admin-game-grid aria-label="Danh sách trò chơi chiến dịch"`
   with one card per game. There is no wrapping `Widget`.

The header (title, description, the single primary "Thêm trò chơi") and
the add-game `Modal` stay exactly as they are.

**Card markup, in DOM order:**

```tsx
<li className="admin-game-card">
	<div aria-hidden="true" className="admin-game-card__cover" inert>
		<GamePreviewFrame>
			<Preview config={template.normalizeConfig(game.config)} heroUrl={campaign.heroAsset?.url} />
		</GamePreviewFrame>
	</div>
	<div className="admin-game-card__body">
		<div className="admin-game-card__head">
			<Link className="admin-game-card__title" params={{ campaignGameId: game.id, campaignId }} to="/campaigns/$campaignId/games/$campaignGameId">
				{game.name}
			</Link>
			<GameStatusChip status={status} />
		</div>
		{meta ? <p className="admin-game-card__meta">{meta}</p> : null}
		<dl className="admin-game-card__metrics">
			<div><dt>Lượt mở</dt><dd>{opens}</dd></div>
			<div><dt>Hoàn tất</dt><dd>{completions}</dd></div>
			<div><dt>Chuyển đổi</dt><dd>{formatPercent(conversionRate(row))}</dd></div>
		</dl>
	</div>
	<div className="admin-game-card__footer">
		<Link aria-label={`Vận hành ${game.name}`} className={buttonVariants({ size: "sm", variant: "secondary" })} params={{ campaignGameId: game.id }} to="/operate/$campaignGameId">
			<Play aria-hidden="true" size={14} />
			Vận hành
		</Link>
	</div>
</li>
```

- `template` is `getGameTemplate(game.templateId)` from
  `@/app/game-templates/registry`, and `Preview` is `template.Preview`.
  When the lookup returns nothing (an unknown id at runtime), the cover
  stays an empty `aspect-video bg-surface-secondary` box and the card
  renders normally.
- `status` is `resolveEffectiveGameStatus(game, Date.now())`.
- `meta` is `[template name if the game was renamed, status.detail]`
  joined with " · ", the same rule as the overview rows (§11.2.2). The
  template name comes from `gameTemplates[templateId].name` in
  `@/lib/gameTemplates` (`CampaignOverviewSummary` imports it as
  `gameTemplateCatalog`).
- Numbers use the vi-VN format.
- The cover is `aria-hidden` and `inert`, so nothing inside the preview
  is focusable or announced. Keyboard order per card is the title link,
  then "Vận hành".

**CSS** (`app/styles/admin.css`, `@layer components`):

- `.admin-game-grid`: `grid gap-4 sm:grid-cols-2 xl:grid-cols-3`.
- `.admin-game-card`:
  - `relative flex min-w-0 flex-col overflow-hidden rounded-2xl bg-surface
    shadow-surface transition-shadow hover:shadow-md`;
  - `.admin-game-card:has(.admin-game-card__title:focus-visible)` gets
    `ring-2 ring-focus`.
- `.admin-game-card__cover`: `block border-b border-border bg-surface-secondary`.
  Inside the cover only:
  - `.admin-preview-frame` is `rounded-none`;
  - `.admin-preview-frame__stage > *` gets `border-radius: 0`,
    `box-shadow: none` and `max-width: none`, so the preview fills the
    cover edge to edge.
- `.admin-game-card__body`: `flex flex-1 flex-col gap-3 p-4`.
- `.admin-game-card__head`: `flex items-start justify-between gap-3`.
- `.admin-game-card__title`:
  - `min-w-0 truncate rounded-sm text-base font-semibold text-foreground
    outline-none`;
  - a stretched link: `::after` with `content: ""`, `position: absolute`,
    `inset: 0`. The title itself is not positioned, so the pseudo-element
    covers the whole card.
- `.admin-game-card__meta`: `-mt-2 truncate text-sm text-muted`.
- `.admin-game-card__metrics`: the same rules as
  `.admin-campaign-card__metrics` (you may share one selector list):
  - `grid grid-cols-3 gap-3 rounded-xl bg-surface-secondary px-3 py-2.5`;
  - `dt` is `block text-xs text-muted`;
  - `dd` is `block text-base font-semibold tabular-nums text-foreground`.
- `.admin-game-card__footer`: `relative z-10 flex items-center justify-end
  gap-2 border-t border-border px-4 py-3`. It sits above the stretched
  link, so "Vận hành" stays clickable.

**Clean-up.** Delete `CampaignGameRow` and `CampaignGameRowGame` from
`CampaignOverviewSummary.tsx`, together with the imports only they used.
`ScheduleStatusChip` stays for the share panel until slice H. Keep the
`.admin-row*` CSS (other screens use it).

#### 11.3.2 Game editor (`CampaignGameEditorFeature.tsx`)

The editor keeps the preview beside the form and splits the long form
into three tabs (progressive disclosure):

- **"Thiết lập"**: the status and limits widget, then the template's rule
  widgets.
- **"Nội dung"**: the guest copy widget.
- **"Hình ảnh"**: the assets panel.

**Template contract** (`app/game-templates/types.ts`):

```ts
export type GameConfigEditorSection = "rules" | "content";
export type GameConfigEditorProps = {
	config: CampaignGameConfig;
	onChange: (config: CampaignGameConfig) => void;
	section: GameConfigEditorSection;
};
// GameTemplate.ConfigEditor: ComponentType<GameConfigEditorProps>
```

Each of the five config editors keeps its derivation code and returns:

- for `section === "content"`: only its existing "Nội dung trải nghiệm"
  `Widget`, unchanged inside (same `GamePublicCopyFields` and `idPrefix`);
- otherwise: `<div className="grid gap-6">` holding its existing rule
  widgets, unchanged inside (li xì: "Giao diện trò chơi" + "Nguồn phần
  thưởng"; wheel: "Vòng quay"; scratch: "Thẻ cào"; slot: "Máy quay tri
  ân"; quiz: "Trắc nghiệm tri ân" + the questions widget).

Every editor keeps its `AdminDisclosure`. No label, id, hint or default
changes. No other file under `app/game-templates/` changes.

**Header** (`AdminPageShell`):
- `status={<GameStatusChip status={resolveEffectiveGameStatus(context.campaignGame, Date.now())} />}`.
  It shows the saved state, not the draft.
- `actions`:
  1. `AdminSaveStatus` as today;
  2. a link to `/operate/$campaignGameId` styled
     `buttonVariants({ variant: "secondary" })`, holding
     `<Play aria-hidden="true" size={16} />` and
     `<span className="max-sm:sr-only">Vận hành</span>`;
  3. the "Lưu thay đổi" button as today.
- Title, description, `stickyHeader`, tabs and `UnsavedChangesGuard`
  are unchanged.

**Main column** (`.admin-split__main`):
1. The save error `Alert` as today. It sits above the tabs, so it stays
   visible on every tab.
2. HeroUI `Tabs` (default variant, which is a segmented control),
   `className="admin-section-tabs"`, controlled by local state
   `section: "setup" | "content" | "media"`, default `"setup"`.
   - `Tabs.ListContainer > Tabs.List aria-label="Phần cấu hình trò chơi"`.
   - Three `Tabs.Tab`s, ids `setup`, `content` and `media`, labels
     "Thiết lập", "Nội dung" and "Hình ảnh", each ending with
     `<Tabs.Indicator />`.
   - Three `Tabs.Panel`s with the same ids:
     - `setup`: the "Trạng thái và giới hạn chơi" `Widget` exactly as
       today (status select, limits, schedule, range error, primary li xì
       hint), then `<ConfigEditor config={config} onChange={setConfig} section="rules" />`;
     - `content`: `<ConfigEditor config={config} onChange={setConfig} section="content" />`;
     - `media`: `CampaignGameAssetsPanel` with the same props as today.
   - All draft state stays in the feature, so switching tabs never
     loses edits and does not trigger the unsaved-changes guard.
3. CSS:
   - `.admin-section-tabs > .tabs__list-container > .tabs__list` is
     `w-auto` (the segmented control hugs its tabs instead of spanning
     the column);
   - `.admin-section-tabs > .tabs__panel` is `mt-6 p-0` and
     `flex flex-col gap-6`.

**Side column** (`.admin-split__side order-first xl:order-none`):
1. The preview block as today ("Xem trước" label, `GamePreviewFrame` +
   `Preview`, the hint "Cập nhật theo thay đổi chưa lưu.").
2. A "Hiệu quả" `Widget`, with the class `hidden xl:flex` so it only shows
   when the side column is a rail.
   - Header: title "Hiệu quả", plus a link "Xem phân tích →" styled like
     `sectionActionLinkClass`, with `search={{ campaign: campaignId, view: "games" }}`
     and `to="/analytics"`.
   - Content: `dl.admin-kv` with "Lượt mở", "Bắt đầu chơi", "Hoàn tất",
     "Nhận thưởng" and "Chuyển đổi"
     (`formatPercent(conversionRate(row))`). The row comes from
     `getCampaignGameBreakdown({ campaignId })` matched on
     `campaignGameId`.
   - With no row, or with `opens === 0 && starts === 0`: only
     `p.text-sm text-muted` "Chưa có lượt chơi.".
   - While the query is loading the widget is not rendered (no spinner).
3. The "Bước tiếp theo" block is removed. Rewards and distribution are
   one click away in the campaign tabs, and operating is now in the
   header.

**Split width.** `.admin-split--preview` becomes
`xl:grid-cols-[minmax(0,1fr)_minmax(24rem,30rem)]`, so the preview gets
more room.

#### 11.3.3 Tests, policy and docs

**`tests/ui/workspace.spec.ts`:**
- **Editor test.**
  - Move the window block (the starts/ends inputs and the
    "Giờ Việt Nam…" hint) before the copy block; it is on the default
    tab.
  - Then click `page.getByRole("tab", { name: "Nội dung" })`.
  - Then run the seven-label loop and the thank-you fill/dirty
    assertions, unchanged.
- **Games test.** Rename it to "games grid and distribution show the
  computed game status". Replace the three card blocks with:

```ts
const grid = page.getByRole("list", { name: "Danh sách trò chơi chiến dịch" });
const card = (name: string) =>
	grid.getByRole("listitem").filter({ has: page.getByRole("link", { name, exact: true }) });
await expect(card("Vòng quay may mắn").getByText("Đang chạy", { exact: true })).toBeVisible();
await expect(card("Vòng quay may mắn").getByText(/Đến /)).toBeVisible();
await expect(card("Trắc nghiệm tri ân").getByText("Sắp mở", { exact: true })).toBeVisible();
await expect(card("Trắc nghiệm tri ân").getByText(/Mở lúc /)).toBeVisible();
await expect(card("Bánh bao lì xì (chính)").getByText("Đang chạy", { exact: true })).toBeVisible();
await expect(card("Bánh bao lì xì (chính)").getByText(/Đến |Mở lúc |Đã đóng lúc /)).toHaveCount(0);
await expect(grid.getByRole("link", { name: "Vận hành Vòng quay may mắn" })).toBeVisible();
```

  The distribution half of the test stays unchanged.

**`tests/ui/asset-slots.spec.ts`**, both editor tests:
- After each editor's `h1` assertion, click
  `page.getByRole("tab", { name: "Hình ảnh" })`.
- That applies to wheel, quiz and each loop pass in the first test, and
  to quiz in the second.
- Nothing else changes and no asset-slots snapshot may change.

**`tests/ui/operator.spec.ts`:** no change expected; its editor tests use
the default "Thiết lập" tab. If an editor test fails only because a
control moved to another tab, report it instead of editing it.

**Fixtures:** none expected.
- The workspace mock already serves `analytics:getCampaignGameBreakdown`
  per campaign (§11.2.4).
- The operator fixture's queries for `campaign-op` fall through to the
  same branch and get `{ rows: [] }`.
- Verify this; if a fixture throws "Unsupported synthetic query", add
  only that branch.

**`scripts/test-route-ux-policy.mjs`:**
- **Games tab assertion (new).** `campaignSectionFeature` includes
  `admin-game-card`, `GamePreviewFrame`, `resolveEffectiveGameStatus` and
  `getCampaignGameBreakdown`, and does not include `CampaignGameRow`.
  Message: "Games tab must show each game as a preview card with computed
  status and metrics".
- **Editor assertion (new).** `gameEditorFeature` includes
  `section="rules"`, `section="content"`, `Tabs.Panel` and
  `GameStatusChip`. Message: "Game editor must split setup, content and
  media into tabs and show the computed status".
- **Config editor loop.** Each config editor must also include
  `section === "content"`.

**`docs/admin-design-system.md`:**
- Document `.admin-game-grid` / `.admin-game-card` (the stretched-link
  rule, the inert cover and the footer above the link) and
  `.admin-section-tabs`.
- Add the rule: "A long editor splits into segmented section tabs in the
  main column; the preview and save stay visible on every tab."

#### 11.3.4 Slice G visual checklist (1440 and 390)

- a. **Games 1440:**
  - three-column grid of cards, each with a full-bleed template preview
    on top;
  - wheel: "Đang chạy", meta "Đến …", metrics 52 / 36 / 65%;
  - quiz: "Sắp mở", "Mở lúc …", 0 / 0 / —;
  - lunar: meta "Lunar Fortune", 26 / 22 / 77%;
  - the only filled primary is "Thêm trò chơi";
  - pressing Tab from the header reaches each card's title then its
    "Vận hành", never an element inside a preview.
- b. **Games 390:**
  - one column, previews scaled to the card width;
  - `scrollWidth === clientWidth`.
- c. **Editor wheel 1440:**
  - header: name, "Đang chạy" chip, "Vận hành", "Lưu thay đổi"
    (disabled);
  - a segmented control with "Thiết lập" selected;
  - the setup panel shows "Trạng thái và giới hạn chơi" then "Vòng quay";
  - preview column width at least 384px;
  - "Hiệu quả" card reads 52 / 40 / 36 / 34 / 65%;
  - no "Bước tiếp theo".
- d. **Editor tabs:**
  - "Nội dung" shows only the seven-field copy widget;
  - "Hình ảnh" shows the two wheel slot cards;
  - after editing a copy field and switching back to "Thiết lập", the
    header still says "Có thay đổi chưa lưu.".
- e. **Editor quiz 1440:** header chip "Sắp mở".
- f. **Editor 390:**
  - preview first, then the segmented control, which fits on one line;
  - no "Hiệu quả" card;
  - the header actions do not overflow ("Vận hành" is icon-only);
  - `scrollWidth === clientWidth`.

### 11.4 Slice H: distribution and rewards

#### 11.4.1 Share links (`ShareLinksPanel.tsx`)

The share panel becomes a list of link objects with their results (R1, R2).
The create form moves into a dialog because it is used once per channel,
while the links are read every day.

**Data.**
- `listShareLinks` as today, plus
  `useQuery(api.analytics.getCampaignShareLinkBreakdown, { campaignId })`.
- A link's numbers come from the breakdown row whose `shareLinkId` equals
  `link.id`. A link with no row shows 0, 0 and "—".
- While the breakdown is loading, render the rows without the stats `dl`.

**Header.** `Widget.Header` keeps its layout:
- Title: "Liên kết chơi công khai".
- Description: "Mỗi liên kết dùng chung cho nhiều người chơi: khách tự bắt
  đầu lượt chơi, không cần Host PIN. Mã QR và kênh cho biết khách đến từ
  đâu."
- On the right, only while `activeGames.length > 0`: the page's single
  primary `Button` ("Tạo liên kết", `Plus` icon), which opens the dialog.
  It does not render when there is no active game.

**Body, top to bottom:**
1. The info/error `Alert` as today. Copy, revoke and restore errors and
   the create success message ("Đã tạo liên kết chơi công khai mới.")
   land here.
2. The "Cần một trò chơi đang chạy" `EmptyState` as today, while there
   is no active game.
3. The loading line as today, or the empty sentence "Chưa có liên kết
   nào. Bấm “Tạo liên kết” để nhận URL và mã QR.", or the link list.

The inline create grid and the schedule hint below it are removed from
the body.

**Create dialog.** Copy the `Modal` structure of the add-game dialog in
`CampaignSectionFeature.tsx` (`Modal.Backdrop isOpen/onOpenChange` →
`Container placement="center"` → `Dialog className="sm:max-w-lg"`).
- Heading "Tạo liên kết chơi"; `Modal.CloseTrigger aria-label="Đóng"`.
- Body: `div.admin-form` with, in order:
  1. a danger `Alert` with the create error (only in the dialog);
  2. the game field exactly as today (`#share-link-game`, label "Trò
     chơi", `aria-label="Trò chơi của liên kết"`), with today's schedule
     line under it as `p.admin-field__hint` (`ScheduleStatusChip` +
     `scheduleRangeText`, or "Không giới hạn thời gian.");
  3. the channel field as today (`#share-link-channel`, label "Kênh",
     default "qr"), with the hint "Mã kênh dùng trong báo cáo, ví dụ qr,
     facebook, zalo.";
  4. the label field as today (`#share-link-label`, label "Ghi chú (tuỳ
     chọn)"), with the hint "Tên dễ nhớ hiển thị trong danh sách liên
     kết.".
- Footer: ghost "Huỷ" (disabled while pending, closes), then the primary
  "Tạo liên kết" (`Plus` icon, `isPending`).
- On success: close the dialog, reset the label to "", keep the channel,
  set the info message. On error: keep the dialog open, show the error
  inside it, and leave the widget alert untouched.
- Opening the dialog clears the previous create error.
- The `createShareLink` arguments are unchanged.

**Link row.** The list keeps
`role="group" aria-label="Danh sách liên kết chơi công khai"`, now with
`className="admin-link-list"`. One row per link:

```tsx
<article className="admin-link-row" data-status={link.status}>
	<div className="admin-link-row__qr">
		<QRCodeSVG … size={80} title={`Mã QR liên kết chơi công khai (${link.channel})`} />
	</div>
	<div className="admin-link-row__main">
		<div className="admin-link-row__title">
			<h2>{link.label || `Liên kết ${link.channel}`}</h2>
			<Chip …>{isActive ? "Đang hoạt động" : "Đã thu hồi"}</Chip>
			<Chip size="sm" variant="soft">Kênh: {link.channel}</Chip>
		</div>
		<p className="admin-link-row__meta">Trò chơi: {name ?? "—"} · Tạo {createdAt vi-VN}</p>
		<p className="admin-link-row__url">{publicUrl}</p>
		<div className="admin-link-row__actions">
			{Sao chép} {Mở liên kết <a>} {Thu hồi | Mở lại}
		</div>
	</div>
	<dl className="admin-link-row__stats">
		<div><dt>Lượt truy cập</dt><dd>{linkOpens}</dd></div>
		<div><dt>Hoàn tất</dt><dd>{completions}</dd></div>
		<div><dt>Chuyển đổi</dt><dd>{formatPercent(conversionRate(row))}</dd></div>
	</dl>
</article>
```

- The QR props, the copy button, the `a` (including its revoked
  `aria-hidden`/`tabIndex`/no-`href` rule) and the revoke/restore
  buttons and handlers are today's. The label chip is dropped because the
  label is now the title.
- Thu hồi / Mở lại move from the top right to the end of the actions
  row (ghost, size sm, from 48rem `ml-auto`).
- Numbers use `toLocaleString("vi-VN")`.

**CSS** (admin.css, `@layer components`):
- `.admin-link-list`: `flex flex-col`.
- `.admin-link-row`:
  - grid, `border-t border-border py-4`, first child `border-t-0 pt-0`;
  - below 48rem: columns `auto minmax(0,1fr)`, `gap-x-4 gap-y-3`, areas
    `"qr main" ". stats"`;
  - from 48rem: columns `auto minmax(0,1fr) auto`, `gap-x-6`, area
    `"qr main stats"`, items at the start.
- `.admin-link-row__qr`: area `qr`, `self-start rounded-xl bg-white p-1.5
  ring-1 ring-border`. With `[data-status="revoked"]` the QR is
  `opacity-40`.
- `.admin-link-row__main`: area `main`, `min-w-0`.
- `.admin-link-row__title`: `flex flex-wrap items-center gap-2`; its `h2`
  is `text-sm font-semibold text-foreground`.
- `.admin-link-row__meta`: `mt-1 text-xs text-muted`.
- `.admin-link-row__url`: `mt-2 break-all text-sm text-foreground`.
- `.admin-link-row__actions`: `mt-3 flex flex-wrap items-center gap-2`.
- `.admin-link-row__stats`: area `stats`.
  - Below 48rem: `flex flex-wrap gap-x-4 gap-y-1 text-xs`; each pair is
    `flex items-baseline gap-1`, `dt` muted, `dd` `font-medium
    tabular-nums text-foreground`.
  - From 48rem: `grid grid-cols-[repeat(3,5.5rem)] gap-x-2 self-center`;
    each pair is a right-aligned column (`flex-col items-end gap-0.5`),
    `dt` `text-xs text-muted`, `dd` `text-lg font-semibold tabular-nums`.

#### 11.4.2 Distribution page (`DistributionFeature.tsx`)

- **Order:** the budget warning `Alert`, the feedback `Alert`,
  `ShareLinksPanel`, the station widget, then the per-session links
  widget. The order is unchanged; only the station widget changes.
- **Station widget.**
  - It lists only station-capable games: budget li xi
    (`templateId === "li-xi"` and reward source `campaign-budget`) or
    `supportsSelfServeStationGame`.
  - When no game qualifies, the widget does not render.
  - Header: title "Mở trạm và vận hành", description "Trò chơi chạy tại
    quầy: host vận hành bằng Host PIN hoặc khách tự chơi trên màn hình
    trạm.".
  - The rows are today's (`ul aria-label="Mở trạm và vận hành"`, mode
    text, "Vận hành" and "Mở trạm" links). The chip becomes
    `GameStatusChip` with
    `resolveEffectiveGameStatus(game, Date.now())`, shown only when the
    state is not `live`. Remove `statusLabels` if nothing else uses it.
  - Under the list, while some games are link-only:
    `p.admin-field__hint` with
    `` `${names.join(", ")} chỉ chơi qua liên kết công khai.` ``
    (`names` in campaign order).
- **Per-session links widget:** unchanged.
- **Games mapping:** the `games` prop passed to `ShareLinksPanel` is
  unchanged.

#### 11.4.3 Shared reward inventory (`RewardInventoryPanel.tsx`)

The save, hydration, reconciliation and epoch logic stays exactly as it
is. Three additions:

**1. Dirty baseline.**
- Add `hydratedSnapshotRef`:
  - at hydration it is set to
    `serializeInventoryDraft(inventory.items.map(inventoryRowFromItem))`
    when the stored list is not empty, else `null`;
  - the campaign-switch effect resets it to `null`.
- Then:
  - `const unsaved = hasUnsavedInventoryEdits(rows, savedSnapshotRef.current ?? hydratedSnapshotRef.current)`;
  - `const saveLoud = unsaved || (savedSnapshotRef.current === null && hydratedSnapshotRef.current === null)`.
    The suggested starter rows of an empty inventory still need their
    first save.
- The "Có thay đổi chưa lưu." line renders when `unsaved` (today it
  needs a completed save first).
- "Lưu kho phần thưởng" gets `variant={saveLoud ? "primary" : "secondary"}`.
  Its `isDisabled`/`isPending` rules are unchanged; it must stay enabled
  when clean.

**2. Card head.** Each `li.admin-item-card` gets a first child
`div.admin-item-card__head`:
- `span.admin-icon-tile` with the type icon (lucide `Ticket` voucher,
  `Banknote` cash, `Gift` physical, `Coins` points).
- `span.admin-row__text` holding:
  - `span.admin-row__title`: `row.name.trim()` or "Phần thưởng chưa đặt
    tên";
  - `span.admin-row__meta`: `` `${rewardTypeLabels[type]} · Tỉ trọng ${formatPercent(share)}` ``
    for an active row with a valid weight. `share` is the row weight
    divided by the sum of the valid weights of the active rows, from the
    draft. Otherwise the meta is `` `${rewardTypeLabels[type]} · Đang tắt` ``.
- On the right:
  - stored rows (`existingItemId` matches an `inventory.items` entry):
    a stock meter from that item's `quantityRemaining`/`quantityTotal`;
  - other rows: `Chip size="sm" variant="soft"` "Chưa lưu".
- The existing fields follow unchanged.

**3. Stock meter** (`.admin-stock`, reused in §11.4.4):

```tsx
<div className="admin-stock">
	<span className="admin-stock__label">
		Còn lại <span className="admin-stock__value">{remaining}/{total}</span>
	</span>
	<ProgressBar aria-label={`Tồn kho ${title}`} color={tone} size="sm" value={percent}>
		<ProgressBar.Track><ProgressBar.Fill /></ProgressBar.Track>
	</ProgressBar>
</div>
```

- `percent` is `remaining / total * 100` (0 when `total` is 0).
- `tone` is `danger` at ≤ 10%, `warning` at ≤ 25%, else `success`.
- Numbers use vi-VN grouping.

**CSS:**
- `.admin-item-card__head`: `flex flex-wrap items-center gap-3 border-b
  border-border pb-4`.
- `.admin-stock`: `ml-auto grid w-full gap-1.5 text-xs text-muted`, and
  `sm:w-44`, so that below 40rem it wraps under the title.
- `.admin-stock__value`: `font-medium tabular-nums text-foreground`.

#### 11.4.4 Rewards page (`RewardsSetupFeature.tsx`)

**Budget meter.** Replace the `dl.admin-stats` (shown while `hasSetup`)
with:

```tsx
<div className="admin-budget">
	<p className="admin-budget__label">Ngân sách còn lại</p>
	<p className="admin-budget__figures">
		<span className="admin-budget__value"><NumberValue … value={remaining} /></span>
		<span className="admin-budget__total">/ <NumberValue … value={total} /></span>
	</p>
	<ProgressBar aria-label="Ngân sách còn lại" color={tone} size="md" value={percent}>…</ProgressBar>
	<p className="admin-budget__note">Đã trao {vnd(total - remaining)} ({formatPercent(1 - remaining / total)})</p>
</div>
```

- `tone` follows the §11.4.3 thresholds.
- With `total === 0` the percent is 0 and the note is omitted.

CSS:
- `.admin-budget`: `grid max-w-xl gap-2`.
- `.admin-budget__label`: `text-xs text-muted`.
- `.admin-budget__figures`: `flex flex-wrap items-baseline gap-x-2`.
- `.admin-budget__value`: `text-3xl font-semibold tracking-tight
  tabular-nums text-foreground`.
- `.admin-budget__total`: `text-sm tabular-nums text-muted`.
- `.admin-budget__note`: `text-xs tabular-nums text-muted`.

**Locked budget.** After the "Ngân sách đã khóa" `Alert`, render a
read-only tier list:
- `ul aria-label="Tồn kho theo mệnh giá" className="admin-stock-list"`.
- One `li.admin-stock-list__row` per `setupState.items` entry, holding:
  - `span.admin-stock-list__name`: the amount as VND, then
    `span.text-muted` " · {RARITY_LABELS[rarity]}";
  - the §11.4.3 stock meter with `remainingQuantity`/`initialQuantity`,
    labelled `` `Tồn kho mức ${vnd(amount)}` ``.
- CSS: `.admin-stock-list` is `flex flex-col`; each row is `flex
  flex-wrap items-center gap-3 border-t border-border py-3
  first:border-t-0`, the name `text-sm font-medium text-foreground`.

**Editable budget save.**
- `budgetDirty` is true when `!hasSetup`, or when the draft tiers
  (`amount|quantity|rarity` per row, in order) differ from
  `setupState.items` (`amount|initialQuantity|rarity`).
- "Lưu cấu hình ngân sách" gets
  `variant={budgetDirty ? "primary" : "secondary"}`; it stays enabled.
- While `hasSetup && budgetDirty`, the footer shows
  `p.text-sm.text-warning role="status"` "Có thay đổi chưa lưu." before
  the summary line.
- The tier editor, the steppers and their `aria-label`s are unchanged.

**Result:** on a clean page no filled primary button is visible (R6).

#### 11.4.5 Fixture (`tests/ui/fixtures/convex-mock.ts`)

- `workspaceSetupState.items` gain `remainingQuantity`: 9 for the 50.000
  tier and 10 for the 120.000 tier (6 × 50.000 = 300.000 ₫ used, matching
  the budget).
- `rewardsMode` accepts `"locked"`. In the `setup:getSetupState` branch,
  after the setup-mode return:
  `if (rewardsMode === "locked") return { ...structuredClone(workspaceSetupState), canConfigure: false };`.
- Nothing else changes. The §11.2.4 share links and breakdown rows
  already drive the distribution stats; the operator fixture's
  `campaign-op` gets empty breakdown rows.

#### 11.4.6 Tests, policy and docs

**`tests/ui/operator.spec.ts`.** Add a helper and use it in the four
distribution tests in place of the inline select/fill/click lines:

```ts
async function createShareLink(page: Page, game: string, fields: { channel?: string; label?: string } = {}) {
	await page.getByRole("button", { name: "Tạo liên kết" }).click();
	const dialog = page.getByRole("dialog");
	await dialog.getByLabel("Trò chơi của liên kết").selectOption(game);
	if (fields.channel !== undefined) await dialog.getByRole("textbox", { name: "Kênh" }).fill(fields.channel);
	if (fields.label !== undefined) await dialog.getByLabel("Ghi chú (tuỳ chọn)").fill(fields.label);
	await dialog.getByRole("button", { name: "Tạo liên kết" }).click();
	await expect(dialog).toBeHidden();
}
```

Every other assertion stays as it is, including the QR > 50px check,
`assertLinkGeometry`, the "Tạo …" and "Hết hạn …" texts, and the
closed-games "Tạo liên kết" hidden check.

**`tests/ui/workspace.spec.ts`**, distribution part of the window test:
- after the `h1` wait, click `page.getByRole("button", { name: "Tạo liên kết" })`;
- scope the "Không giới hạn thời gian.", `#share-link-game`, "Cửa sổ
  đang mở" and "Cửa sổ chơi từ" assertions to `page.getByRole("dialog")`;
- keep the page-level `toHaveCount(0)` for "Cửa sổ đang mở" before the
  wheel is selected.

**`tests/ui/inventory.spec.ts`:** no assertion change; only the two
baselines are refreshed.

**`scripts/test-route-ux-policy.mjs`.** Add two assertions:
- `ShareLinksPanel.tsx` includes `<Modal`,
  `api.analytics.getCampaignShareLinkBreakdown` and `admin-link-row`.
  Message: "Distribution must list share links as objects with per-link
  results and create links from a dialog".
- `RewardInventoryPanel.tsx` includes `quantityRemaining` and
  `saveLoud`, and `RewardsSetupFeature.tsx` includes `admin-budget`,
  `remainingQuantity` and `budgetDirty`. Message: "Rewards must show
  remaining stock and budget as bars and keep saves quiet until there
  are changes".

Add `ShareLinksPanel.tsx`, `DistributionFeature.tsx` and
`RewardInventoryPanel.tsx` to `workspaceCopySources`.

**`docs/admin-design-system.md`:**
- Document `.admin-link-row`, `.admin-stock`, `.admin-stock-list` and
  `.admin-budget`.
- Add the rule: "Creating a secondary object (share link, reward) that
  is done rarely opens a dialog from the section header; the section body
  lists the objects with their results."
- Add the rule: "A section save is a filled primary only while the
  section has unsaved changes."

#### 11.4.7 Slice H visual checklist (1440 and 390)

- a. **Distribution 1440:**
  - "Tạo liên kết" is the only filled primary on the page;
  - three link rows:
    - "Link QR": "Đang hoạt động" + "Kênh: qr", stats 52 / 38 / 72%;
    - "Facebook": 36 / 24 / 58%;
    - "Zalo": "Đã thu hồi", faded QR, 0 / 0 / —, a "Mở lại" button, no
      "Mở liên kết" link;
  - the stats columns are right aligned and line up across the rows;
  - the station widget lists the lì xì, wheel and scratch games only,
    with the hint naming the slot and quiz games;
  - the per-session widget is unchanged.
- b. **Create dialog** (open it in the capture): game select, schedule
  line, channel and label with hints, Huỷ + primary "Tạo liên kết".
- c. **Distribution 390:**
  - QR left of the text;
  - stats on one line under the text, aligned with it;
  - no horizontal overflow.
- d. **Rewards 1440:**
  - the inventory card head shows "Voucher quà tặng A", "Voucher / mã
    quà · Tỉ trọng 100%" and "Còn lại 20/20" with a full green bar;
  - the budget shows "1.650.000 ₫ / 1.950.000 ₫", an 85% bar and "Đã trao
    300.000 ₫ (15%)";
  - both saves are secondary, so no filled primary is visible;
  - after a quantity edit, "Lưu kho phần thưởng" turns primary and "Có
    thay đổi chưa lưu." appears.
- e. **Rewards locked** (`rewardsMode=locked`): the alert plus two stock
  rows, "50.000 ₫ · Phổ biến" 9/15 (60%) and "120.000 ₫ · Huyền thoại"
  10/10.
- f. **Rewards 390:** the stock meter wraps under the title; no overflow.


### 11.5 Slice I: analytics

Today `/analytics` repeats the same bare numbers on every view. Each view
opens with an `admin-stats` row (overview: 5 numbers, games: 3, channels: 3,
rewards: 3), and below it sits a table or a two-line list ("120 mở · 65%").
Nothing is drawn as a ratio, the overview never shows the funnel, and the
rarity chart has a 0–1 axis with "0.25" ticks.

Slice I has three parts:
- The overview becomes the dashboard: the funnel card first, then ranked
  share bars for campaigns, games and channels.
- The detail views (games, channels) drop their duplicate totals and become
  one clean table each, with an inline conversion bar.
- The rewards view replaces the axis chart with share bars and fixes the
  claim-rate number.

The claims view (`RewardClaimsPanel`) is out of scope.

#### 11.5.1 Shared blocks

**`PerformanceSummary`** (new, `app/_workspace/-components/PerformanceSummary.tsx`).
It is the `.admin-perf` body that `CampaignOverviewSummary` renders inline
today, moved into one component. The DOM stays identical, so the overview
baselines must not change.

```tsx
export function PerformanceSummary({ funnelLabel, metrics }: {
	funnelLabel: string;
	metrics: FunnelCounts;
}) {
	return (
		<div className="admin-perf">
			<div className="admin-perf__kpi">…KPI, "Tỉ lệ chuyển đổi", note (exactly as today)…</div>
			<FunnelBars label={funnelLabel} steps={[Lượt mở, Bắt đầu chơi, Hoàn tất, Nhận thưởng]} />
		</div>
	);
}
```

- `CampaignOverviewSummary` replaces its inline block with
  `<PerformanceSummary funnelLabel="Phễu chiến dịch" metrics={metrics} />`.
- Callers keep their own empty-state check (`opens === 0 && starts === 0`).

**`ShareBars`** (new, `app/_workspace/-components/ShareBars.tsx`) is a
ranked list in which a soft bar behind each row shows its size relative to
the largest row. It reads like a top-pages list in a web analytics tool.

```tsx
export type ShareBarRow = { key: string; name: string; meta?: string | null; value: number; rate: number | null };

export function ShareBars({ label, rateLabel, rows, valueLabel }: {
	label: string; rateLabel: string; rows: ShareBarRow[]; valueLabel: string;
}) {
	return (
		<div className="admin-share">
			<div aria-hidden="true" className="admin-share__head">
				<span /><span>{valueLabel}</span><span>{rateLabel}</span>
			</div>
			<ol aria-label={label} className="admin-share__list">
				<li className="admin-share__row" key={row.key}>
					<span aria-hidden="true" className="admin-share__bar" style={{ width: `${width}%` }} />
					<span className="admin-share__name">
						<span className="admin-share__title">{row.name}</span>
						{row.meta ? <span className="admin-share__meta">{row.meta}</span> : null}
					</span>
					<span className="admin-share__value">{vi-VN number}<span className="sr-only"> {valueLabel.toLowerCase()}</span></span>
					<span className="admin-share__rate">{formatPercent(row.rate)}<span className="sr-only"> {rateLabel.toLowerCase()}</span></span>
				</li>
			</ol>
		</div>
	);
}
```

Rules:
- Rows render in the order given; callers sort them.
- `max` is the largest `value`. `width` is 0 when `value` or `max` is 0;
  otherwise it is `max(2, value / max * 100)`.

CSS:
- `.admin-share`: `flex flex-col gap-1`.
- `.admin-share__head` and `.admin-share__row` share the columns
  `minmax(0,1fr) 4.5rem 3.5rem`, with `gap-x-3` and `px-3`.
- The head is `grid pb-1 text-xs font-medium text-muted`, and its 2nd and
  3rd cells are right aligned.
- `.admin-share__list`: `flex flex-col gap-1`.
- `.admin-share__row`: `relative isolate grid min-h-11 items-center
  rounded-lg py-2`.
- `.admin-share__bar`: `absolute inset-y-0 left-0 -z-10 rounded-lg
  bg-accent-soft`.
- `.admin-share__name`: `flex min-w-0 flex-col`.
- `.admin-share__title`: `truncate text-sm font-medium text-foreground`.
- `.admin-share__meta`: `truncate text-xs text-muted`.
- `.admin-share__value`: `text-right text-sm font-semibold tabular-nums
  text-foreground`.
- `.admin-share__rate`: `text-right text-xs tabular-nums text-muted`.

**`RateBar`** is exported from the same file, for table cells:

```tsx
export function RateBar({ rate }: { rate: number | null }) {
	return (
		<span className="admin-rate">
			<span aria-hidden="true" className="admin-rate__track">
				<span className="admin-rate__fill" style={{ width: `${Math.round(Math.min(1, rate ?? 0) * 100)}%` }} />
			</span>
			<span className="admin-rate__value">{formatPercent(rate)}</span>
		</span>
	);
}
```

RateBar CSS:
- `.admin-rate`: `inline-flex items-center justify-end gap-2`.
- `.admin-rate__track`: `block h-1.5 w-12 overflow-hidden rounded-full
  bg-surface-secondary`.
- `.admin-rate__fill`: `block h-full rounded-full bg-accent`.
- `.admin-rate__value`: `w-10 text-right text-sm tabular-nums
  text-foreground`.

#### 11.5.2 `AnalyticsFeature.tsx`

**Removed:**
- the shared top `Widget` with `dl.admin-stats` on the overview, games and
  channels views;
- the `stepPercent` and `formatConversionPercent` helpers (use
  `formatPercent` from `@/lib/campaignMetrics`);
- `BarChart`, `Widget.Legend` and the old overview `ul.admin-rows` lists.

`StatItem` stays (rewards view).

**Game meta helper.**

```ts
gameMeta(row) = [label !== name ? label : null, allScope ? campaignNameById.get(row.campaignId) : null]
  .filter(Boolean).join(" · ") || null
```

- `label` is `gameTemplateBadgeLabel(row.gameTemplateId)`.
- `name` is `row.gameName ?? "Trò chơi"`.
- `allScope` is `!selectedCampaignId`.

**Overview view** (`search.view === "overview"`), top to bottom:

1. **Funnel card.** A `Widget` whose header holds `Widget.Title` "Phễu
   chuyển đổi" and `Widget.Description` with `selectedCampaign?.name ??
   "Tất cả chiến dịch"`.
   - Content: when `gameMetrics.opens === 0 && gameMetrics.starts === 0`,
     show `p.text-sm leading-5 text-muted` "Chưa có lượt chơi nào trong
     phạm vi này.".
   - Otherwise, `<PerformanceSummary funnelLabel="Phễu chuyển đổi"
     metrics={gameMetrics} />`.
2. **Ranked cards**, shown when both breakdowns have loaded:
   `div.admin-rank-grid`, plus `admin-rank-grid--3` in all-campaign
   scope.
   - **"Chiến dịch"** (all-campaign scope only), with no header link.
     - Build one row per campaign in `workspace.campaigns`: take its rows
       from `groupRowsByCampaign(campaignGameBreakdown.rows)` (an empty
       array when it has none) and sum them with `sumFunnelRows`.
     - Row fields: `name` = campaign name; `meta` = `` `${rows.length} trò
       chơi` ``; `value` = opens; `rate` = `conversionRate(sum)`.
     - Sort by opens descending and keep the first 5.
     - `ShareBars` props: `label="Chiến dịch theo lượt mở"`,
       `valueLabel="Lượt mở"`, `rateLabel="Chuyển đổi"`.
   - **"Trò chơi"**, with the existing "Xem chi tiết →" link to the games
     view.
     - Rows are the game breakdown rows, sorted by opens descending, first 5.
     - Row fields: `name` = game name; `meta` = `gameMeta(row)`; `value` =
       opens; `rate` = `conversionRate(row)`.
     - `label="Trò chơi theo lượt mở"`.
   - **"Kênh"**, with the existing "Xem chi tiết →" link to the channels
     view.
     - Rows are the channel rows sorted by opens descending.
     - Row fields: `name` = `channelLabel(row)`; no meta; `value` = opens;
       `rate` = `conversionRate(row)`.
     - `label="Kênh theo lượt mở"`.
   - A card with no rows shows the existing "Chưa có dữ liệu." sentence.
   - Cards use `Widget` > `Widget.Header` (title plus the optional link) >
     `Widget.Content`.

**`.admin-rank-grid` CSS:**
- Base: `grid gap-6`.
- From `@media (min-width: 64rem)`: `grid-cols-2`.
- `.admin-rank-grid--3 > :first-child` is `col-span-2` from 64rem up to
  `90rem`.
- From `@media (min-width: 90rem)`, `.admin-rank-grid--3` uses
  `grid-template-columns: repeat(3, minmax(0, 1fr))` and its first child is
  `col-span-1`.

**Games view.** It has no stats widget, only the "Phân tích theo trò chơi"
`Widget` (title and description unchanged). Grid changes:

- **"Trò chơi" cell:**

  ```tsx
  <span className="flex min-w-0 items-center gap-3">
  	<span className="admin-icon-tile">{known ? <GameTemplateIcon templateId={id} /> : <Gamepad2 aria-hidden="true" size={20} />}</span>
  	<span className="flex min-w-0 flex-col">
  		<span className="truncate font-medium text-foreground">{name}</span>
  		{meta ? <span className="truncate text-xs text-muted">{meta}</span> : null}
  	</span>
  </span>
  ```

  - `known` means `gameTemplates[id]` exists.
  - `meta` is `gameMeta(row)`; the template `Chip` is gone.
  - `minWidth` is 220.
- **Funnel columns** (the `funnelColumns` helper): each number column gets
  `allowsSorting: true` and `sortFn: (a, b) => a[id] - b[id]`.
- **"Chuyển đổi" column:**
  - its cell is `<RateBar rate={conversionRate(item)} />`;
  - `allowsSorting: true`, with `sortFn` that compares the rate and treats
    null as -1;
  - `minWidth` 132.
- **Grid:** `defaultSortDescriptor={{ column: "opens", direction:
  "descending" }}` and `contentClassName="min-w-[760px]"`.

**Channels view.** It has no stats widget.

- **"Phân tích theo kênh"** is unchanged apart from the funnel/RateBar
  column changes above and the same `defaultSortDescriptor`.
- **"Liên kết chia sẻ"** (title unchanged). The description becomes
  `` `${viNumberFormat.format(gameMetrics.channelSharePerformance.publicPlayLinkOpens)} lượt truy cập qua liên kết công khai. Lượt li xì chưa gắn kênh không nằm trong bảng này.` ``
  (this keeps the `channelSharePerformance.publicPlayLinkOpens` policy
  pin).
- **Share-link grid:**
  - The "Liên kết" cell is a flex column: the label (`font-medium`,
    `item.label ?? "Liên kết"`) and then `span.text-xs text-muted`
    `` `Kênh: ${item.channel}` ``. The chip and the "mở liên kết" text are
    gone.
  - A new number column "Lượt truy cập" (`linkOpens`) comes right after it,
    then the existing funnel columns and RateBar.
  - `contentClassName="min-w-[840px]"`, with the same default sort.

**Rewards view.**

1. The top `Widget` keeps `dl.admin-stats` with three items:
   - "Kết quả phần thưởng" = `rewardOutcomes`;
   - "Lượt nhận thưởng" = `claims`;
   - "Tỉ lệ nhận thưởng" = `formatPercent(rewardOutcomes > 0 ? claims /
     rewardOutcomes : null)`, with the note "Nhận thưởng / kết quả phần
     thưởng". This fixes the old value, which was claims/opens under a
     claim-rate label.
2. In the li xi widget, the right column keeps `h2` "Cơ cấu phần thưởng"
   (exactly once on the page; the legend is removed).
   - When `hasRarityBreakdown`, render `<ShareBars label="Cơ cấu phần
     thưởng theo độ hiếm" valueLabel="Lượt trao" rateLabel="Tỉ trọng"
     rows={…} />`.
   - Rows are common/rare/legend in that fixed order: `name` =
     `RARITY_LABELS[rarity]`, `value` = redemptions, `rate` =
     `redemptions / history.length`.
   - Otherwise the existing empty state.
   - Everything else in the widget (header links, its four-item
     `admin-stats`, the leaderboard/history tabs and grids) is unchanged.

**Unchanged:**
- the page shell, the scope select, the view tabs and `viewCopy`;
- the claims view and the loading/invalid-scope logic;
- every query, `channelLabel` and the leaderboard/history columns.

Never write the string literals `"hit"` or `"none"`; a policy check bans
them.

#### 11.5.3 Fixture (`tests/ui/fixtures/convex-mock.ts`)

The workspace now tells one story across the index, the overview and
analytics. In `analyticsQueryValue`:

- **`analytics:getOwnerAnalytics`** returns the sums of every
  `campaignGameBreakdownRows` row:
  - opens 128, starts 102, completions 89, rewardOutcomes 89, claims 82;
  - `conversion: 0.641`;
  - `channelSharePerformance: { publicPlayLinkOpens: 88 }`.
- **`analytics:getCampaignAnalytics`** depends on the campaign:
  - `campaignId === CAMPAIGN_A`: today's `ownerAnalytics` values, unchanged
    (120 / 96 / 84 / 84 / 78, 0.65, 88). Rename the constant
    `campaignAAnalytics`.
  - Any other campaign: the sums of that campaign's rows, with conversion
    rounded to 3 decimals (or null when opens is 0) and
    `publicPlayLinkOpens: 0`. Campaign B gives 8 / 6 / 5 / 5 / 4 and 0.5.
- Keep any `overviewMode === "setup"` branch slice F added.

Nothing else in the fixture changes.

#### 11.5.4 Tests, policy and docs

**`tests/ui/analytics.spec.ts`:**
- The games and channels tests keep their assertions. They still hold:
  the template label is now a meta line, and "Facebook" stays the exact
  label text.
- Add the test "overview leads with the funnel and ranked share bars":
  - At `?view=overview` (all scope):
    - `getByRole("list", { name: "Phễu chuyển đổi" })` has 4 `listitem`s;
    - the text "64%" is visible inside `.admin-perf__kpi`;
    - `getByRole("list", { name: "Chiến dịch theo lượt mở" })`: its first
      `listitem` contains "Chiến dịch tri ân A" and "120";
    - `getByRole("list", { name: "Kênh theo lượt mở" })`: its first item
      contains "Liên kết công khai".
  - At `?view=overview&campaign=campaign-a`:
    - "65%" is in the KPI;
    - the campaigns list has count 0;
    - the first item of "Trò chơi theo lượt mở" contains "Vòng quay may
      mắn".
- Add the test "rewards view: claim rate and rarity share bars" at
  `?view=rewards&campaign=campaign-a`:
  - "93%" is visible;
  - `getByRole("list", { name: "Cơ cấu phần thưởng theo độ hiếm" })` has
    3 items;
  - the page has no `.recharts-wrapper`.

**`tests/ui/workspace.spec.ts`:** no assertion change. The "Cơ cấu phần
thưởng" count test must still pass.

**`scripts/test-route-ux-policy.mjs`**, one new assertion:
- `analyticsFeature` includes `<PerformanceSummary`, `<ShareBars` and
  `<RateBar`, and does not include `<BarChart`;
- `CampaignOverviewSummary.tsx` includes `<PerformanceSummary`.

Message: "Analytics must lead with the conversion funnel and draw ratios as
bars (share bars, rate bars), not axis charts or repeated stat rows".

**`docs/admin-design-system.md`:**
- Document `PerformanceSummary`, `ShareBars`/`.admin-share*`,
  `RateBar`/`.admin-rate` and `.admin-rank-grid`.
- Add the rule: "An overview owns the totals; detail views do not repeat
  them. Tables draw conversion with an inline rate bar."

#### 11.5.5 Slice I visual checklist (1440 and 390)

- a. **Overview, all scope 1440:**
  - the funnel card is first: "64%", "82 nhận thưởng / 128 lượt mở", and
    four bars;
  - then three ranked cards in one row:
    - campaigns: A 120 / 65%, then B 8 / 50%, A's bar full and B's short;
    - games: wheel 52 first, then scratch 30, lunar 26 (meta "Lunar
      Fortune · Chiến dịch tri ân A"), slot 12 and B wheel 8;
    - channels: 88 / 66%, 26 / 77% and 6 / 0%.
- b. **Overview, campaign A 1440:** "65%"; two ranked cards side by side;
  no campaigns card.
- c. **Games:**
  - no stats row;
  - rows sorted by opens with an icon tile;
  - the lunar meta is "Lunar Fortune · …";
  - the wheel has no meta in campaign scope;
  - the conversion column shows bars;
  - the quiz row shows "—" with an empty track.
- d. **Channels:**
  - no stats row;
  - the links description starts "88 lượt truy cập";
  - "Lượt truy cập" 52 / 36;
  - the "Kênh: qr" meta.
- e. **Rewards:**
  - "Tỉ lệ nhận thưởng" 93% (campaign A) or 92% (all);
  - rarity share bars 0 / 1 / 1 with 0% / 50% / 50%;
  - no chart axes.
- f. **390, every view:**
  - no page-level horizontal overflow;
  - the overview cards stack;
  - the KPI sits above the funnel.
- g. **The campaign overview (`campaign-overview`) is pixel-identical** to
  slice G's baseline, because `PerformanceSummary` keeps the DOM.


### 11.6 Slice J: create, operate, page header and round-2 polish

Slice J closes round 2. It applies R1–R6 to the last two screens that
still show bare forms or bare numbers (create, operate). It also fixes
the review defects Q1–Q5 plus the H/I review notes Q6–Q11 in §11.6.6.

Shared blocks come first, so that the two new users and the existing
ones render the same markup.

#### 11.6.1 Shared blocks

**`GameTemplatePreview`** (`app/_workspace/-components/GameTemplatePreview.tsx`):

```tsx
export function GameTemplatePreview({ config, heroUrl, templateId }: {
	config: unknown;
	heroUrl?: string | null;
	templateId: string;
}) {
	const template = getGameTemplate(templateId as GameTemplateId) as GameTemplate | undefined;
	const normalized = useMemo(() => template?.normalizeConfig(config), [template, config]);
	const Preview = template?.Preview;
	return (
		<div aria-hidden="true" inert>
			{template && Preview ? (
				<GamePreviewFrame>
					<Preview config={normalized} heroUrl={heroUrl} />
				</GamePreviewFrame>
			) : (
				<div className="aspect-video rounded-2xl bg-surface-secondary" />
			)}
		</div>
	);
}
```

- `getGameTemplate` comes from `@/app/game-templates/registry`, the same
  import as `CampaignSectionFeature.tsx`. Feature files that are banned
  from importing the registry (the create page) use this component.
- The preview is decorative (`aria-hidden`, `inert`). It never has focus
  stops.
- `CampaignGameCard` and the editor keep their own preview markup.

**`GamePerformanceCard`** (`app/_workspace/-components/GamePerformanceCard.tsx`):
- Props `{ campaignGameId: string; campaignId: string; className?: string }`.
- It owns `useQuery(api.analytics.getCampaignGameBreakdown, { campaignId })`
  and the `breakdownRow` lookup.
- It returns `null` while the query is `undefined`.
- Otherwise it renders the editor's "Hiệu quả" `Widget` verbatim
  (`CampaignGameEditorFeature.tsx` lines ≈398–440): header "Hiệu quả" +
  "Xem phân tích" link, "Chưa có lượt chơi." or the five-row `dl.admin-kv`.
  `className` goes on the `Widget`.
- The editor replaces its inline widget with
  `<GamePerformanceCard campaignGameId={campaignGameId} campaignId={campaignId} className="hidden xl:flex" />`
  and drops the query, the row lookup and the imports that this frees.
- **Proof:** the editor baselines do not change.

**Stock meters** (`app/_workspace/-components/StockMeter.tsx`). Slice H
left `StockMeter` exported from the feature file
`RewardInventoryPanel.tsx`, and the `.admin-budget` block inline in
`RewardsSetupFeature.tsx`. Operate needs both, so they move into one
shared component file:

- `stockTone(percent)` returns `"danger"` at ≤ 10, `"warning"` at ≤ 25,
  else `"success"`.
- `StockMeter`: moved verbatim, using `stockTone`.
  `RewardInventoryPanel.tsx` and `RewardsSetupFeature.tsx` import it from
  here. The feature file no longer exports it.
- `BudgetMeter({ label, note, percent, progressLabel, remaining, total })`:
  - `remaining` and `total` are `ReactNode`; `percent` is a number;
    `note` is an optional `ReactNode`.
  - It renders the exact `.admin-budget` markup from
    `RewardsSetupFeature.tsx`: label `p`, figures `p` with
    `__value`/`__total` spans (the total span text is `/ ` followed by
    `total`), the `size="md"` `ProgressBar` with `aria-label={progressLabel}`
    and `color={stockTone(percent)}`, and the note `p` when `note` is
    given.
  - `RewardsSetupFeature.tsx` swaps to it.
- **Proof:** save `document.querySelector(".admin-budget").outerHTML` on
  `?route=rewards` before and after the swap; the two strings are equal.

#### 11.6.2 Page header (`AdminPageShell.tsx`)

**Q2: description inside the header.** For pages without `stickyHeader`,
the description moves into the header:

```tsx
<header className="admin-page__header" data-sticky={stickyHeader ? "true" : undefined}>
	<div className="admin-page__heading-group">
		<div className="admin-page__heading">…title + status…</div>
		{description && !stickyHeader ? <p className="admin-page__description">{description}</p> : null}
	</div>
	{actions ? <div className="admin-page__actions">{actions}</div> : null}
</header>
{description && stickyHeader ? <p className="admin-page__description">{description}</p> : null}
```

So at 390 the order is title, description, then actions. Sticky pages
keep the description outside the header, so it scrolls away and the
stuck bar stays one row tall.

CSS:
- `.admin-page__header`: `sm:items-center` becomes `sm:items-start`.
- New `.admin-page__heading-group`: `min-w-0 flex-1`.
- `.admin-page__header:has(.admin-page__actions) .admin-page__heading`:
  `sm:min-h-10 md:min-h-9`. The title row is then as tall as the action
  button, so title and button stay centred on each other. (Corrected while
  implementing: the plain `sm:min-h-10` measured here assumed a 40px button,
  but the button is `h-10` only below `md` and `h-9` (36px) from `md`, so at
  1440 it pushed the sticky editor header 4px taller and broke the
  unchanged-resting-position proof; matching the button's responsive height
  restores the ±1px claim.)
- `.admin-page__header[data-sticky="true"]`: add `sm:items-center`.

Result at 1440: title, actions and description keep their current
positions within ±1px on pages with actions. On pages without actions
the description keeps its position too.

**Q4: stuck edge.** Pages with `stickyHeader` get a sentinel in front of
the header:
- `<div aria-hidden="true" className="admin-page__sentinel" ref={sentinelRef} />`
  is rendered only when `stickyHeader`.
- An `IntersectionObserver` (default root, threshold 0) sets `stuck` to
  `!entry.isIntersecting`. It is created in an effect that depends on
  `stickyHeader` and is disconnected on cleanup.
- The header gets `data-stuck={stuck ? "true" : undefined}`. Keep the
  `data-sticky` expression exactly as it is (policy pin).

CSS:
- `.admin-page__sentinel`: `-mt-3 h-px -mb-px`.
- The sticky header loses its `-mt-3`. The sentinel carries it, so the
  header's resting position is unchanged.
- `.admin-page__header[data-stuck="true"]`:
  `shadow-[0_1px_0_0_var(--color-border)]`. This is a shadow, not a
  border, so nothing moves when it appears.

**Proof:**
- The editor and settings baselines (at rest, not scrolled) do not change.
- In a probe scrolled 200px on the wheel editor at 1440:
  - `data-stuck` is `"true"`;
  - a crop of the header bottom shows the hairline and no glyph
    fragments.
- At scroll 0, `data-stuck` is absent.

#### 11.6.3 Create page (`CampaignCreateFeature.tsx`)

- The split becomes `admin-split admin-split--preview`.
- The side stays `admin-split__side hidden xl:flex` and becomes:

```tsx
<p className="admin-group-label">Xem trước</p>
<GameTemplatePreview config={gameTemplateCatalog[templateId].initialCampaignConfig} templateId={templateId} />
<p className="admin-field__hint">Màn mở đầu mặc định của mẫu {gameTemplateCatalog[templateId].name}; nội dung và hình ảnh chỉnh được sau khi tạo.</p>
<p className="admin-group-label mt-4">Sau khi tạo</p>
<ol …>…unchanged steps…</ol>
```

- Choosing another template in the picker updates the preview at once.
- Nothing else on the page changes: fields, picker (two columns), brand
  disclosure, buttons, guard.
- Every policy string that pins this file still holds (route-policy and
  SaaS contract scripts). The file must not import
  `@/app/game-templates/registry`; the component does that.

#### 11.6.4 Operate (`OperatorConsoleFeature.tsx`)

The page titles stay: "Bảng vận hành trò chơi", "Trạm tự phục vụ",
"Trò chơi tự phục vụ". The game identity moves into a status chip and a
product view.

**Status chip (R3).** The li-xi console, the station launch and the
link-only page pass
`status={<GameStatusChip status={resolveEffectiveGameStatus(game.campaignGame, Date.now())} />}`
to `AdminPageShell`. The inactive page gets no chip, because its title
already says it.

**Li-xi console.**
- Keep `admin-split admin-split--rail`.
- Main:
  1. The "Tạo lượt chơi" widget, unchanged.
  2. When `station.hasSetup && station.budget`: a new `Widget`.
     - Header: title "Kho lì xì", description "Ngân sách và số bao còn
       lại theo mệnh giá.".
     - The header action link is "Mở kho phần thưởng →" to
       `/campaigns/$campaignId/rewards`, styled with the accent link class
       already used in this file.
     - Content:
       - `BudgetMeter`, with the same label, progress label, VND
         `NumberValue`s and "Đã trao …" note as the rewards page, and
         values from `station.budget`;
       - then `ul.admin-stock-list aria-label="Tồn kho theo mệnh giá"`,
         rows from `station.budgetItems.filter((item) => item.isActive)`.
         Each row has the name (VND amount, then " · " +
         `RARITY_LABELS[rarity]` in muted) and a stock meter from
         `remainingQuantity`/`totalQuantity`, labelled
         `` `Tồn kho mức ${vnd(amount)}` ``.
       - This is the same row markup as §11.4.4.
- Side:
  1. The pending-links group and "Xem tất cả ở Phân phối →", unchanged.
  2. `<GamePerformanceCard … className="hidden xl:flex" />`.

**Station launch (`StationLaunchCard`).** It takes new props `status`,
`templateId`, `config` and `heroUrl`. The body becomes
`div.admin-split.admin-split--preview`.
- Main:
  1. The alerts, unchanged and above the split.
  2. The launch widget, with the stats footer removed (the `border-t` row
     with the `dl.admin-stats` and the "Mở kho phần thưởng →" link). The
     title, description, both buttons and the Host PIN hint are
     unchanged.
  3. A new `Widget`:
     - Header: title "Kho phần thưởng", plus the "Mở kho phần thưởng →"
       link as the header action.
     - Content: `BudgetMeter`.
       - Label: "Phần thưởng còn lại trong kho".
       - Remaining: `remainingUnits`; total: `totalUnits`, the sum of
         `quantityTotal`. Both use vi-VN grouping.
       - `progressLabel="Tồn kho trạm"`.
       - Note: `Loại phần thưởng đang bật: {inventory.length}`.
     - When `inventory.length > 1`, a `ul.admin-stock-list
       aria-label="Tồn kho theo phần thưởng"` follows, one row per item:
       the item name, then " · " + the type label in muted, and a stock
       meter labelled `` `Tồn kho ${item.name}` ``. A single item would
       only repeat the total, so it gets no list.
     - `getByText("Phần thưởng còn lại trong kho")` and
       `getByText("Loại phần thưởng đang bật")` must each still match
       exactly one element.
- Side (`admin-split__side hidden xl:flex`):
  - `p.admin-group-label` "Màn hình khách";
  - `<GameTemplatePreview config={config} heroUrl={heroUrl} templateId={templateId} />`;
  - `<GamePerformanceCard … />`.

**Link-only page.** Same split and same side as the station launch. The
main column is the existing widget, unchanged.

**Data:**
- `config` is `game.campaignGame.config`;
- `heroUrl` is `game.campaign.heroAsset?.url`;
- `templateId` is `game.campaignGame.templateId`.

No new query. `getCampaignGameBreakdown` is already served by every
fixture.

**Fixture (`tests/ui/fixtures/convex-mock.ts`).** The non-blocked
`draw:getStationState` branch for campaign A returns:
- `budget: { totalBudget: 1950000, remainingBudget: 1650000 }`;
- `budgetItems` derived from `workspaceSetupState.items`:
  `{ id: \`tier-${index}\`, amount, rarity, remainingQuantity, totalQuantity: initialQuantity, isActive: true }`;
- `availableUnits: 19` (9 + 10).

The operator fixture's `draw:getStationState` gets the same three keys
with values consistent with its own data, or `budget: null,
budgetItems: []`. The console must render with either shape.

#### 11.6.5 Small fixes

- **Q1** (`.admin-usage__head`): `flex flex-wrap items-baseline
  justify-between gap-x-3 gap-y-0.5 text-sm`. The label gets
  `whitespace-nowrap`; the value gets `ml-auto whitespace-nowrap`. In the
  overview rail the budget value drops to its own right-aligned line,
  and neither side breaks mid-phrase. Billing is unchanged at 1440.
- **Q3** (`CampaignContextNav.tsx`): "Tổng quan" gets
  `activeOptions={{ exact: true, includeSearch: false }}`.
- **Q5** (`CampaignSectionFeature.tsx`):
  - `p.admin-game-card__meta` always renders, with
    `aria-hidden={metaParts.length === 0 ? true : undefined}`.
  - CSS adds `min-h-5`.
  - Metric strips of cards in one row then share a y position.

#### 11.6.6 From the slice H and I reviews

- **Q6** (`admin.css`): add the missing rule `.admin-item-card__head`:
  `flex flex-wrap items-center gap-3 border-b border-border pb-4`. That
  puts the icon tile, the title/meta and the stock meter on one row, with
  the meter on the right (`ml-auto`). Below 40rem the meter wraps under
  the title at full width.
- **Q7** (`ShareLinksPanel.tsx`): the main `Widget.Content` uses
  `className="admin-stack"` instead of `"admin-form"`. The link list is
  not a form, and `.admin-form > *` capped it at 768px. Rows then span
  the widget, and the stats columns end at the widget's right padding,
  under the "Tạo liên kết" button. The dialog keeps its own `admin-form`.
- **Q8** (`RewardInventoryPanel.tsx`): the "Số lượng" and "Trọng số"
  stepper fields go from `admin-field w-28` to `admin-field w-36`, so
  that "20" renders whole.
- **Q9** (`ShareLinksPanel.tsx`): on a revoked row the "Mở liên kết"
  anchor is not rendered. Active rows are unchanged.
  `operator.spec` only asserts that it is hidden.
- **Q10** (`admin.css`): in `.admin-share__head` the rate column is
  3.5rem, so "Chuyển đổi" wraps onto two lines in every ranked card. The
  `.admin-share__head, .admin-share__row` columns become
  `minmax(0, 1fr) 4.5rem 4.5rem`, and `.admin-share__head` gets
  `whitespace-nowrap`.
- **Q11** (`AnalyticsFeature.tsx`, games table only): the "Trò chơi"
  column stays at its 220px `minWidth` while the number columns share the
  rest, so names truncate at 1440. That column gets `width: "3fr"` (a
  DataGrid `ColumnSize`); keep `minWidth: 220`. At 1440 no game name in
  the fixture truncates.

#### 11.6.7 Tests, policy and docs

- **`scripts/test-route-ux-policy.mjs`.** Add one assertion:
  - `OperatorConsoleFeature.tsx` includes `GameStatusChip`,
    `GamePerformanceCard`, `GameTemplatePreview` and `admin-stock-list`;
  - `CampaignCreateFeature.tsx` includes `GameTemplatePreview`;
  - `AdminPageShell.tsx` includes `admin-page__heading-group` and
    `data-stuck`.
  - Message: "Create and operate must show the product, the computed
    status and remaining stock; page headers keep the description with
    the title and mark a stuck header".
- **No test assertion changes.** The pins listed in the brief must hold.
- **`docs/admin-design-system.md`:**
  - document `GameTemplatePreview`, `GamePerformanceCard`, the heading
    group and the stuck edge;
  - add the rule: "Header order on small screens is title, description,
    actions."

#### 11.6.8 Slice J visual checklist (1440 and 390)

- a. **Create 1440:**
  - the preview of Lunar Fortune is on the right, sticky;
  - choosing "Vòng quay may mắn" switches the preview (probe);
  - the "Sau khi tạo" steps sit under the preview.
- b. **Operate li-xi 1440:**
  - chip "Đang chạy" next to the title;
  - form unchanged;
  - "Kho lì xì" widget: 1.650.000 ₫ / 1.950.000 ₫ with the bar, then two
    tier rows 9/15 (warning-free, success tone) and 10/10;
  - rail: pending link, then "Hiệu quả" with the li-xi row numbers.
- c. **Operate wheel 1440:**
  - chip;
  - launch widget without the footer;
  - "Kho phần thưởng" meter 20/20 and "Loại phần thưởng đang bật: 1";
  - no list (one item);
  - right column: guest preview of the wheel and "Hiệu quả".
- d. **Operate at 390:** no horizontal overflow; preview and performance
  hidden; widgets stacked.
- e. **Header at 390** (index, overview, rewards, operate): title, then
  description, then actions.
- f. **Editor scrolled 200px at 1440:** hairline under the stuck header,
  no glyph fragments. At rest the editor is pixel-identical to the
  current baseline.
- g. **Q1, Q3, Q5–Q11:**
  - the overview rail budget row reads as two clean lines;
  - the setup-mode overview capture shows "Tổng quan" active;
  - in the games grid the metric strips of one row share a y;
  - the rewards item-card head is one row (Q6); link rows span the widget
    (Q7); "20" is whole (Q8);
  - "Chuyển đổi" is one line in the analytics ranked cards (Q10); no
    game name truncates in the analytics games table at 1440 (Q11).
- h. The editor and settings baselines are unchanged; every other admin
  baseline change is explained.
