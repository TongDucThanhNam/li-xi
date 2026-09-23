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
  with wheel/lunar surfaces).
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
