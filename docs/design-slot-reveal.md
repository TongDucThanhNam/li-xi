# Slot-reveal template — design tokens and constraints

Stage-2a template (immediate immutable outcome). Documented BEFORE
implementation, like `docs/design-scratch-card.md`. It follows
`docs/design_system.md`, `docs/admin-design-system.md` and the project's
HeroUI usage; every class is prefixed `slot-` so this skin never collides
with the li-xi `draw.css`, the `wheel-*` classes, the `scratch-*` classes,
or the admin HeroUI layers.

## Identity

- Template id: `slot-reveal` (registered in `gameTemplateIds`; stable
  symbol keys and mapping are part of the frozen snapshot contract).
- Public route: `/p` (public-self-serve, like lucky-wheel / scratch-card).
- Fonts: Bungee (display marquee) + Be Vietnam Pro (text) via the registered
  Google-font links; the slot layer is the only consumer of Bungee.
- Station mode: `public-self-serve` — NO monetary stake, no credits, no
  gambling account functions. A spin is a free branded thank-you reveal, and
  the server allocates the immutable outcome exactly once per admitted
  session.

## Symbols (stable IDs, documented)

Eight fixed symbol keys — the display glyph may evolve, the KEY never does:

| key        | label (vi)  | glyph   |
| ---------- | ----------- | ------- |
| `bell`     | Chuông      | 🔔      |
| `star`     | Ngôi sao    | ⭐      |
| `gem`      | Viên ngọc   | 💎      |
| `heart`    | Trái tim    | 💖      |
| `clover`   | Cỏ bốn lá   | 🍀      |
| `gift`     | Hộp quà     | 🎁      |
| `sparkles` | Lấp lánh    | ✨      |
| `moon`     | Vầng trăng  | 🌙      |

The stage renders symbol identities from lucide icon components (stable
`data-symbol` attributes), never from formatted labels or amounts.

## Combinations (documented, deterministic)

- Three reels, one symbol each.
- REWARD ⇒ a WINNING combination: the same symbol on all three reels
  (`[k, k, k]`). At admission every candidate inventory item of the frozen
  pool gets its own symbol by bounded display order
  (`buildSlotWinningCombinations`, max `MAX_SLOT_CANDIDATES = 8` items; item
  i → `slotSymbolKeys[i]`). Mapping is by ITEM ID, never by label/amount, so
  duplicate display labels stay unambiguous.
- NO-REWARD ⇒ the documented non-winning combination
  `SLOT_MISS_COMBINATION = ["moon", "star", "clover"]` (three different
  symbols).
- The stage resolves the combination from the outcome's `segmentKey` (item
  id) against the FROZEN snapshot projection; an unknown key falls back to
  presenting the result without a reel landing (truthful fallback, like the
  wheel). The combination is display-only: identity/copy always come from
  the authoritative outcome.

## Tokens (slot-reveal.css, @theme)

- `--slot-bg`: #170f33 family stage backdrop; `--slot-bg-deep`: #0f0a24.
- `--slot-ink`: #fff7ec text; `--slot-ink-soft`: rgba(255,247,236,0.75).
- Reel themes (operator-selected, bounded literal `reelTheme`):
  `gold` (#f2c14e marquee, #8a6d1f frame), `neon` (#4cc9f0 marquee,
  #1b2a4a frame), `festive` (#ef476f marquee, #4d1226 frame). Decorative
  only — never a reward signal.
- `--slot-cell`: reel window height (clamp(64px, 20vw, 92px)).
- Highlight/action: gold-to-deep CTA gradient like the scratch CTA; result
  hierarchy mirrors the wheel result classes with `slot-result*` names.

## Constraints

- Exactly ONE server action per session: `{ type: "spin-reels" }`, fired by
  the Spin control (pointer or keyboard). No allocation on page view or
  admission; a failed request allocates nothing and may be retried (the
  server replays the same immutable outcome).
- The frozen snapshot (`rulesSnapshot.slotReels`) freezes reelTheme, the
  winning combinations (candidate item set included) and the miss
  combination at ADMISSION; live config/pool edits cannot change an
  in-flight play. Allocation for slot sessions is bounded to the frozen
  candidate items, so every supported reward keeps its own unambiguous
  combination.
- Reel motion: one deterministic settle per spin — reels loop while the
  request is in flight, then each reel transitions to its final symbol with
  a staggered ease-out (`REEL_BASE_MS`/`REEL_STAGGER_MS`, constants) and
  `data-reel-symbol` marks the settled identity. The motion always SETTLES
  ON the authoritative symbols: a late response keeps looping until it
  lands; a failed/lost response stops looping, returns to idle and offers
  the retry; recovery (reload/closure) presents the settled combination
  without any spin.
- Reduced motion skips the loop and settle transitions entirely (instant
  settled identity, no blur/marquee).
- Long labels/codes/instructions wrap (`overflow-wrap: anywhere`); the
  result panel grows the shell; controls are never occluded; claim is
  optional (Finish/leave-without-claim preserved); secret codes render only
  after a successful claim.
- All classes prefixed `slot-`; no wheel/draw/scratch class reuse.