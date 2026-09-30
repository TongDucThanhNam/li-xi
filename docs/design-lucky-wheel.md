# Game Template Design System: Vòng quay may mắn (Lucky Wheel)

This document governs the `lucky-wheel` game template only: the generic
public entry stage rendered at `/p/$shareCode`, its config editor preview, and
its CSS/font layer. Like every game template, lucky wheel owns its visual
language and must not import the Lunar Fortune red/gold skin or the admin
HeroUI theme.

For admin UI direction see `docs/admin-design-system.md`; for the li xi
template see `design_system.md`.

## Brand Essence
- Vui tươi, lễ hội, năng lượng tích cực; tối giản kiểu "sảnh game show" hiện đại.
- Nền tối indigo/trắng kem, điểm nhấn vàng hổ phách và xanh ngọc; khác biệt rõ với đỏ/vàng Tết của li xi.

## Typography
- Display/headline: "Baloo 2" 600/800 (vòng tròn thân thiện, hỗ trợ tiếng Việt).
- Body: "Be Vietnam Pro" 400/500/700 (fallback tiếng Việt chuẩn).
- Không dùng font stack của template khác.

## Color Tokens
- `--wheel-bg`: `#141433` (nền sân khấu)
- `--wheel-bg-soft`: `#1e1e4d`
- `--wheel-cream`: `#fff6e8` (chữ chính trên nền tối)
- `--wheel-amber`: `#f5a623` (điểm nhấn chính, viền vòng quay, CTA)
- `--wheel-amber-deep`: `#c47f10`
- `--wheel-teal`: `#2ec4b6` (điểm nhấn phụ)
- `--wheel-coral`: `#ef476f` (ô trúng thưởng đặc biệt)
- `--wheel-ink`: `#201a30` (con quay, chữ trên ô sáng)
- Segment palette (luân phiên theo chỉ số ô): `#f5a623`, `#2ec4b6`, `#ef476f`, `#7b6cf6`, `#ffd166`, `#4cc9f0`, `#fff6e8`, `#9b5de5`.

## Layout
- Stage full-height, centered: hero copy → vòng quay → result panel.
- Vòng quay vuông, `min(78vw, 420px)`; mobile giữ nguyên tỉ lệ, không tràn ngang.
- Con quay (pointer) nằm ở đỉnh vòng quay, chỉ xuống.
- Số ô vòng quay = số phần thưởng của nhóm kho được trò chơi chọn cộng một ô "không trúng"
  (không còn cấu hình `segmentCount` tĩnh). Kết quả chốt theo khóa phần thưởng ổn định
  (`segmentKey`), không ghép theo nhãn hiển thị; tập ô hiển thị đóng băng trong suốt một phiên
  chơi, và nếu giải thưởng nằm ngoài tập này, kết quả hiển thị thẳng không quay tới ô tùy ý.

## Components
- Primary CTA (`wheel-cta`): pill amber, chữ ink đậm, shadow ấm; disabled giảm độ sáng.
- Wheel (`wheel-disc`): vòng tròn 12 tầng: viền amber dày, 8 đinh sáng, các ô màu palette xen kẽ, label chữ cream/ink đọc được ở cả desktop và mobile.
- Result panel (`wheel-result`): panel bo góc lớn nền `--wheel-bg-soft`, viền amber khi trúng, viền trung tính khi không trúng; hiển thị label phần thưởng và (sau claim) mã voucher.
- Closed/error states dùng chung shell tối, icon + tiêu đề + một dòng mô tả; không dùng đỏ/vàng Tết.

## Asset slots

Registered campaign-game asset slots (declared in `app/game-templates/registry.ts`,
uploaded through the generalized game-editor assets panel). Slot images are
PRESENTATION ONLY: they are resolved live as renderable R2 URLs at read time
(the same trust level as the campaign hero), never frozen into
`rulesSnapshot`, and never a reward/eligibility signal.

### `game-wheel-hub` — hub/logo image

- **Purpose**: brand the center hub of the wheel disc with the campaign's own
  round mark, replacing the default rotate glyph.
- **Aspect ratio**: 1:1 (square, at least 256×256 recommended). Rendered
  inside the fixed-size circular hub (`width: 17%` of the disc), cropped with
  `object-fit: cover` and fully rounded corners — no layout shift in any
  spin phase.
- **Max size**: 8 MB. Types: JPG, PNG, WebP, GIF, AVIF (shared campaign asset
  policy, `lib/assetPolicy.ts`).
- **Placement**: inside `.wheel-disc__hub` on `LuckyWheelStage` (public `/p`
  stage and the station play stage — the same component). The hub ring,
  border and idle motion stay template-owned; only the glyph swaps for the
  image.
- **Fallback**: when no hub image is attached, the hub renders the default
  `RotateCw` glyph exactly as before, byte-identical presentation (existing
  guest snapshots must keep matching).
- **Constraint**: the image never replaces segment fills, the pointer, or the
  result panel; it is decorative only.

## Motion
- Easing spin: `cubic-bezier(0.12, 0.8, 0.18, 1)` (tăng tốc đầu, giảm tốc dài cuối).
- Thời gian xoay: 4200ms + 4–6 vòng tùy kết quả; `prefers-reduced-motion` → fade-in kết quả, không xoay.
- Idle: vòng quay lắc nhẹ (subtle sway) khi chờ bắt đầu; tắt khi reduced motion.

## Station Mode (self-serve station, `/station/$campaignGameId`)

Station mode reuses the SAME template-owned surfaces as `/p` — no separate
station skin, no admin chrome on the guest stage:

- **Waiting screen** = the template `EntryHero` (`WheelEntryHero`), rendered
  full-screen on the station shell (`bg` stays `--wheel-bg`). One large
  Start CTA (`copy.ctaLabel`, fallback "Bắt đầu chơi"); `canStart` is false
  only while the game is inactive/sold out. Touch targets stay ≥ 48px.
- **Play** = the template `PlayStage` (`LuckyWheelStage`) with `autoBegin`,
  receiving the frozen admission snapshot as `playContext`
  (`noRewardLabel`/`segments`/`noRewardKey`). Shell-owned callbacks wire
  `onPlay` → the capability-gated play action and `onClaim` → the claim;
  the claim reveals voucher codes on the station screen itself.
- **Reset** = the stage's existing `onCollect` ("Hoàn tất") returns the
  station to the waiting screen; the shell drops the session capability
  from memory (never localStorage/sessionStorage).
- **Kiosk constraints**: station is a shared host-authenticated device —
  the session capability lives in React state only and refresh recovery
  comes from the owner-authorized station-state query. The station exits
  only through the Host PIN dialog (same semantics as li xi station).
- **Large screens (≥ 1024px)**: keep the stage centered at its natural
  size (`min(78vw, 420px)` disc may scale up to `min(60vmin, 560px)` via
  the existing clamp); never stretch text beyond the display scale. No
  horizontal overflow at 1440×900 or 390×844.
- Analytics: one `game_open` per waiting-screen mount (stable client
  openKey, idempotent); starts/completions/claims flow through the shared
  per-transition event keys with `channel: "station"`.
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
`data-template="lucky-wheel"` (fallbacks are the lunar defaults):

| Shell variable | Wheel value |
| --- | --- |
| `--station-shell-bg` | `var(--color-wheel-bg, #141433)` |
| `--station-shell-ink` | `var(--color-wheel-cream, #fff6e8)` |
| `--station-shell-ink-soft` | `rgba(255, 246, 232, 0.72)` |
| `--station-shell-accent` | `var(--color-wheel-amber, #f5a623)` |
| `--station-shell-accent-border` | `rgba(245, 166, 35, 0.55)` |
| `--station-shell-panel` | `var(--color-wheel-bg-soft, #1e1e4d)` |
| `--station-shell-panel-border` | `rgba(245, 166, 35, 0.4)` |
| `--station-shell-font` | `var(--font-wheel-body, "Be Vietnam Pro", system-ui, sans-serif)` |
| `--station-shell-display` | `var(--font-wheel-display, "Baloo 2", "Be Vietnam Pro", system-ui, sans-serif)` |

Shell classes are all prefixed `station-*` (`.station-shell`,
`.station-exit-trigger`, `.station-overlay`, `.station-dialog`,
`.station-status*`, `.station-recovery*`), so they never collide with
`wheel-*` guest-stage classes. The station route ships this shell layer
plus every station-capable template layer (same documented order as `/p`);
the guest stage itself stays untouched.

## Do / Do Not
- Do giữ nền tối + palette amber/teal/coral đúng token ở trên.
- Do đảm bảo chữ trên mỗi ô đọc được ≥ 320px.
- Do not dùng palette đỏ/vàng Lunar Fortune, noise overlay, hoặc font Cinzel.
- Do not chia sẻ class `.card-*`, `.hero-*`, `.mag-btn` của li xi; mọi class phải prefix `wheel-`.
- Do not fork a station-specific stage; station renders `EntryHero` and
  `PlayStage` unchanged, and `/p` snapshots must keep matching.
