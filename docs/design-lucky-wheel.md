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

## Motion
- Easing spin: `cubic-bezier(0.12, 0.8, 0.18, 1)` (tăng tốc đầu, giảm tốc dài cuối).
- Thời gian xoay: 4200ms + 4–6 vòng tùy kết quả; `prefers-reduced-motion` → fade-in kết quả, không xoay.
- Idle: vòng quay lắc nhẹ (subtle sway) khi chờ bắt đầu; tắt khi reduced motion.

## Do / Do Not
- Do giữ nền tối + palette amber/teal/coral đúng token ở trên.
- Do đảm bảo chữ trên mỗi ô đọc được ≥ 320px.
- Do not dùng palette đỏ/vàng Lunar Fortune, noise overlay, hoặc font Cinzel.
- Do not chia sẻ class `.card-*`, `.hero-*`, `.mag-btn` của li xi; mọi class phải prefix `wheel-`.
