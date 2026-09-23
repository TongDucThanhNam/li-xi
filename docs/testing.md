# Testing workflow

Three complementary layers. Mocked UI tests are UI integration/visual tests —
never call them real-backend E2E.

| Layer | Runner | Scope |
| --- | --- | --- |
| Unit/behavior | Vitest (edge-runtime) + convex-test | Pure helpers, real Convex handlers on synthetic data (`*.test.ts`) |
| UI integration/visual | Playwright Test, headless Chromium | Actual components mounted by repo-owned fixtures with synthetic Convex responses (`tests/ui/*.spec.ts`) |
| Real-backend E2E | Planned: Playwright against an isolated local Convex backend | Not implemented yet; will be a separate `test:e2e` command with explicit failure if the backend is unavailable |

## Commands

| Command | What it does |
| --- | --- |
| `npm run test:once` | Normal Vitest suite (product behavior tests) |
| `npm run test:ui` | Headless Playwright UI/visual suite; runs with `--update-snapshots=none` — existing screenshot baselines are compared, never written; a missing baseline FAILS without recreating it |
| `npm run test:ui:update` | Deliberately (re)generate screenshot baselines (`--update-snapshots=all`); review the diff before accepting |
| `npm run test:report` | Open the last HTML report (`tests/ui/reports/html`) |
| `npm run test:contracts`, `npm run test:route-policy`, `npm run test:smoke` | Existing policy/SSR checks |
| `npm run ui:fixture-server` | Start the test-only Vite fixture server alone (port 3210) |

First-time setup on a fresh Windows checkout: `npm install` then
`npx playwright install chromium` (exact-pinned `@playwright/test` in
`package.json`; the browser build is pinned by that version). Baselines are
currently generated on this Windows/Chromium environment; treat them as
platform-specific until cross-platform baselines are deliberately added.

## What runs where

- `tests/ui/fixtures/` — test-only Vite entry points (never part of the
  production route/build graph). They import the ACTUAL product components
  with real CSS/Tailwind scanning and a synthetic `convex/react` replacement
  exposing deterministic data and programmatic controls:
  - `inventory.html` mounts `RewardInventoryPanel` with controls on
    `window.__inventoryFixture`: campaign switch, delayed-save mode,
    pending-release (oldest/newest), and recorded mutation calls.
  - `participant.html` mounts `PublicShareEntryFeature` (real registry
    stages, real template CSS/font order: li-xi, then wheel, then
    scratch-card, then slot-reveal) with controls on
    `window.__participantFixture`: share-code scenarios
    (`wheel` / `wheel-engagement` / `lunar` / `scratch` / `scratch-high` /
    `scratch-crimson` / `slot`), saved-session seeds
    (`seed=saved-unclaimed|saved-claimed`), lost-start simulation, delayed
    outcome/claim delivery, held-or-failing reveal-action delivery
    (`setActionDelivery` + `deliverActions`), engagement switching, remote
    session completion (`completeSessionRemotely` — models finishing on
    another device), entry closure, counters and recorded mutation calls
    with session id/token identity.
  - Controls change mock data/response timing only — never the product
    behavior under test.
  - Motion preference is per-scope: gameplay motion coverage runs under
    native `reducedMotion: "no-preference"` (asserting the real 4.2s spin
    easing transition and result focus), and a separate describe runs under
    native `"reduce"` (asserting suppression). The fixture does not disable
    animations for participant specs.
- `tests/ui/*.spec.ts` — Playwright specs with semantic locators and
  assertions on actual recorded calls/state. Playwright specs are excluded
  from Vitest discovery (`vitest.config.ts` excludes `tests/**`).

## Artifacts

- Fresh current-run checkpoint PNGs for the desktop/390px visual cases are
  written by the specs to `tests/ui/artifacts/screenshots/` (git-ignored) on
  every successful run and attached to the HTML/JSON reports (attachment names
  `inventory-desktop-current` / `inventory-390-current`).
- Reviewed screenshot baselines live in
  `tests/ui/inventory.spec.ts-snapshots/` (tracked references). On mismatch,
  expected/actual/diff images are produced; a missing baseline FAILS the run
  without recreating the tracked file (the actual capture is preserved under
  `tests/ui/artifacts/test-results/`).
- `tests/ui/reports/html/` — HTML report (includes checkpoint attachments);
  `tests/ui/reports/ui-results.json` — machine-readable results.
- `tests/ui/artifacts/test-results/` — failure traces (`trace.zip`) and
  failure screenshots. Open a trace with
  `npx playwright show-trace <path>`.
- Deliberate-failure evidence (fault injections, missing-baseline demos) is
  copied OUT of the transient folders into the review run directory before
  the next clean run, since `artifacts/test-results/` is cleaned per run.

Transient folders (`tests/ui/artifacts/`, `tests/ui/reports/`) are
git-ignored; snapshot baselines are reviewed references and stay tracked.
Never commit a baseline you did not review, and never accept a large pixel
diff just to go green — update baselines only via `test:ui:update` after
deliberately reviewing the change.

## Direct scenario selection

```bash
npx playwright test --config tests/ui/playwright.config.ts -g "delayed Save20"
npm run test:ui -- -g "390px"
```

Fixture scenarios are regular URLs of the test-only server, e.g.
`http://127.0.0.1:3210/inventory.html` (single inventory view). Response
timing (immediate/delayed) and campaign switching are controlled
programmatically from the specs via `window.__inventoryFixture`.

## Scope boundaries

- UI specs run against synthetic Convex responses: they assert component
  behavior, emitted mutation payloads, and rendered states. They do not prove
  backend behavior — that is the Vitest + convex-test layer's job (e.g.
  `convex/rewardInventory.test.ts`).
- Snapshot policy: normal runs execute with `--update-snapshots=none` and the
  config sets no ignore flags — screenshot assertions always execute. Only
  `test:ui:update` (`--update-snapshots=all`) writes references. Do not set
  `ignoreSnapshots` to a truthy value: that would skip the assertions
  entirely and vacuously pass.
- Real-backend E2E (isolated local Convex binary, seeded data, actual public
  play link in a real browser) is a planned separate `test:e2e` command and is
  not part of the current UI suite.
- Auth (Google OAuth), R2 uploads, Polar billing and cloud deployment are not
  covered by any automated browser layer.
