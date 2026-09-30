# Scratch-card template — design tokens and constraints

Stage-2a template (immediate immutable outcome). This document records the
visual language and behavioral constraints BEFORE implementation. It follows
`docs/design_system.md`, `docs/admin-design-system.md` and the project's
HeroUI usage; every class is prefixed `scratch-` so this skin never collides
with the li-xi `draw.css`, wheel `wheel-*`, or admin HeroUI layers.

## Identity

- Template id: `scratch-card` (registered in `gameTemplateIds`).
- Public route: `/p` (public-self-serve, like lucky-wheel).
- Fonts: reuse the registered lunar serif stack (Cinzel Decorative /
  Playfair Display / Noto Serif) — no new font downloads.

## Tokens (scratch-card.css, @theme)

- `--scratch-bg`: #141433 family page backdrop (brand dark ink, consistent
  with wheel/lunar surfaces). The layer paints it on `body` scoped with
  `body:has(.scratch-stage)` — each template layer owns its page tokens
  instead of relying on another layer's unscoped `body` rule.
- Cover styles (operator-selected, bounded literal): `gold` (#e9c96a →
  #d4af37 → #8a6d1f), `teal` (#7fe3d8 → #2ec4b6 → #0f5f56), `crimson`
  (#ff8fa9 → #ef476f → #8f0f31). The single source is
  `app/game-templates/scratch-card/coverPalettes.ts`; the beneath backdrop
  mirrors it as `.scratch-cover--*` classes in scratch-card.css. The cover
  is a decorative foil; reward identity NEVER derives from its color.
- `--scratch-ink`: #fff6e8 text on dark surfaces.
- Accent/action: reuse admin `--accent` button tokens; result panel keeps the
  wheel-result-like hierarchy (eyebrow / heading / code / actions) with
  `scratch-result*` classes.

## Constraints

- The coating is a `<canvas>` foil drawn above the authoritative result,
  tinted by the frozen `coverStyle` palette (`coverPalettes.ts` — the same
  three palettes drive the canvas gradient, the beneath-backdrop classes
  `.scratch-cover--gold|teal|crimson`, and the operator preview swatch, so
  the frozen choice is visibly different on the real card).
- Erasing and requesting are INDEPENDENT gates. Pointer/touch strokes erase
  (`destination-out` arcs with pointer capture; cancel/leave simply end the
  stroke) and keep erasing while the reveal request is in flight — the
  pending overlay never intercepts pointers. Progress shown to the guest is
  REAL measured coverage (coarse alpha sampling of the coating canvas), not
  an incrementing estimate.
- The FIRST deliberate input (stroke or keyboard control) authorizes exactly
  ONE immutable server reveal (`scratch-reveal` action). A failed request
  never consumes anything; the next deliberate input retries the same
  capability and replays the same server-side allocation.
- The configured `revealThresholdPercent` (10–100) is PRESENTATION ONLY,
  consulted only AFTER the authoritative outcome is in hand: when measured
  coverage reaches the threshold, the remaining coating fades away
  (instant under reduced motion) and the result panel renders. The
  keyboard control doubles as an immediate full-clear bypass ("Gỡ lớp phủ
  ngay"), and a recovered outcome after reload opens the card directly. The
  threshold is never an anti-bot, eligibility, or security guarantee.
- Recovery vs local play: a recovered outcome (mount-time or adopted after
  mount through the live query) always opens the card without
  re-scratching — the adoption policy refuses to run while a local reveal
  is in flight or already in hand, so a delayed live query can never bypass
  the presentation threshold during a local play. Closure recovery: a
  completed session's capability recovers its result even after the entry
  link is revoked/closed; only NEW participants are blocked by the closed
  entry.
- All interactive controls (reveal/clear, claim, Finish, leave) live OUTSIDE
  the coated card shell, so nothing interactive is ever beneath the coating
  or the pending overlay. Once the card opens, the shell grows with its
  content; labels, codes, instructions and errors wrap with
  `overflow-wrap: anywhere`. The beneath teaser is static text and never
  duplicates the authoritative result label.
- Contrast: the coating instruction and the beneath teaser render as pale
  ink ONLY inside the dark `.scratch-chip` (rgba(14, 14, 40, 0.85)) — never
  directly on the gold/teal/crimson foils or backdrop highlights. The UI
  suite verifies ≥ 4.5:1 (WCAG, normal small text) against the worst-case
  foil pixel actually sampled beneath the chip on all three covers.
- No allocation on page view or admission: only the `scratch-reveal` action
  allocates, exactly once, from the frozen snapshot policy (stocked reward or
  engagement thank-you). Engagement mode never touches stocked inventory.
- Pending (`Đang mở thẻ…`), error (`Thử lại`) and pointer-cancel states are
  required; a failed reveal does not consume the coating or the outcome.
- Reduced motion: coating fade and shimmer are skipped; reveal is instant.
- Keyboard: the visible reveal/clear control triggers the same paths through
  BOTH click and keyboard; the result panel takes focus when it lands.
- Privacy: voucher codes render only after a successful claim; public
  snapshots and outcome reads stay secret-free before that claim.
- All classes prefixed `scratch-`; no `wheel-*`/`draw.css` reuse.

## Asset slots

**Deferred: a "beneath" reveal image is NOT adopted in this template yet.**
The beneath backdrop deliberately mirrors the operator-selected cover palette
(`.scratch-cover--*`), and the UI suite verifies the coating instruction and
beneath teaser at ≥ 4.5:1 (WCAG normal text) against the worst-case foil
pixel sampled beneath the chip on all three covers. An arbitrary
operator-provided image beneath the coating cannot carry that verified
contrast guarantee — honoring it would require an opaque scrim that changes
the frozen cover-style presentation, and skipping it would silently drop a
verified accessibility contract. Revisit only with a documented scrim/token
plan that keeps the contrast suite green; the canvas foil mechanics and the
frozen `coverStyle` snapshot contract stay untouched in the meantime.

## Station mode (self-serve station, `/station/$campaignGameId`)

Station mode renders the SAME template-owned surfaces as `/p` inside the
station shell — no station-specific skin, no admin HeroUI theme on the
guest stage:

- **Waiting screen** = the template `EntryHero` (`ScratchCardEntryHero`),
  full-screen, one large Start CTA; `canStart` false only while the game is
  inactive/sold out. Touch targets ≥ 48px.
- **Play** = the template `PlayStage` (`ScratchCardStage`) with `autoBegin`
  and the frozen admission snapshot as `playContext`
  (`coverStyle`/`revealThresholdPercent`). Shell callbacks wire
  `onPlay` (the once-only `scratch-reveal`) and `onClaim`; the voucher code
  reveals on the station screen after the claim.
- **Reset** = the stage's `onCollect` ("Hoàn tất") returns the station to
  the waiting hero and drops the capability from memory — the capability is
  never written to localStorage/sessionStorage on a shared kiosk; refresh
  recovery comes from the owner-authorized station-state query.
- **Host PIN** guards station exit (same dialog semantics as li xi
  station). Erase/reveal/claim behavior is byte-identical to `/p`; the
  `/p` Playwright baselines must keep matching (stage changes stay
  additive, e.g. an optional `mode: "station"` prop).
- **Large screens (≥ 1024px)**: the card keeps its aspect ratio, centered;
  the coated card may scale to `min(80vmin, 560px)`; no horizontal
  overflow at 1440×900 or 390×844.
- Analytics: one `game_open` per waiting-screen mount (stable client
  openKey, idempotent); starts/completions/claims reuse the shared
  per-transition event keys with `channel: "station"`. No auto-return
  timer ships in this slice — an idle auto-return on the result screen
  remains a documented future option.
- **Recovery**: a completed station play whose reward was never collected
  (or whose claim code was lost to a refresh) resurfaces as a shell-owned
  recovery banner on the waiting screen ("Có phần thưởng chưa nhận") with a
  resume action and a PIN-verified host-dismiss action; Start stays
  disabled until the pending result is resolved.

### Shell chrome CSS (`app/styles/station.css`)

Host/operations chrome around the guest stage (exit trigger, Host PIN
dialog, loading/missing/inactive/fail-closed screens, recovery banner) is
owned by the shell layer `station.css` — never by the template guest stage
and never by admin CSS. The shell reads the variables below, which this
template's tokens drive when the shell is mounted with
`data-template="scratch-card"` (fallbacks are the lunar defaults):

| Shell variable | Scratch-card value |
| --- | --- |
| `--station-shell-bg` | `var(--scratch-bg, #141433)` |
| `--station-shell-ink` | `var(--scratch-ink, #fff6e8)` |
| `--station-shell-ink-soft` | `var(--scratch-ink-soft, rgba(255, 246, 232, 0.72))` |
| `--station-shell-accent` | `var(--scratch-gold, #d4af37)` |
| `--station-shell-accent-border` | `rgba(212, 175, 55, 0.5)` |
| `--station-shell-panel` | `var(--scratch-bg-deep, #0e0e28)` |
| `--station-shell-panel-border` | `var(--scratch-line, rgba(255, 246, 232, 0.16))` |
| `--station-shell-font` | `"Playfair Display", "Noto Serif", system-ui, sans-serif` |
| `--station-shell-display` | `"Cinzel Decorative", "Playfair Display", serif` |

Shell classes are all prefixed `station-*` (`.station-shell`,
`.station-exit-trigger`, `.station-overlay`, `.station-dialog`,
`.station-status*`, `.station-recovery*`), so they never collide with
`scratch-*` guest-stage classes. The station route ships this shell layer
plus every station-capable template layer (same documented order as `/p`);
the guest stage itself stays untouched.
