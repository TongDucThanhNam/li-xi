# Lunar Fortune Design System

## Brand Essence
- Premium lễ hội Tết, sang trọng, điện ảnh, thiên về đỏ son và vàng kim.
- Không dùng theme trung tính, không chuyển sang palette khác.

## Typography
- Display: "Cinzel Decorative" 700/900 (headline, CTA, win amount).
- Body: "Playfair Display" 400/700 (nội dung, mô tả).
- Vietnamese fallback: "Noto Serif" cho dấu tiếng Việt khi cần.
- Uppercase dùng hạn chế; với tiếng Việt ưu tiên giữ nguyên chữ thường/hoa.
- Không thay đổi font stack trừ khi có yêu cầu mới.

## Color Tokens
- `--red-deep`: `#5e0a0a`
- `--red-vivid`: `#b31414`
- `--gold-shine`: `#fff8dc`
- `--gold-base`: `#d4af37`
- `--black-ink`: `#050000`
- `--liner-dark`: `#3e0000`

## Background & Atmosphere
- Nền full-viewport với radial + vignette đậm.
- Luôn có noise overlay (opacity ~0.05).
- 3 ambient lights với blur lớn và opacity thấp.

## Layout
- Stage full-height, centered hero -> grid.
- Grid 5 cột desktop, 2 cột mobile (<=768px).
- Grid ẩn khi chưa bắt đầu; tránh layout shift.

## Components
- Hero:
  - Title: gradient gold text + drop shadow.
  - Subtitle: uppercase, letter spacing lớn.
- Primary CTA (mag button):
  - Rounded pill, gold border, blur, subtle glow.
  - Hover tăng glow và sáng.
- Framed Panels (host/admin screens):
  - Single border with one subtle inner stroke.
  - Soft gold highlight + deep red gradient fill.
  - Optional thin header divider line.
  - Avoid multiple decorative borders on the same panel.
- Stat Pills (budget bar):
  - Rounded capsules with gold outline.
  - Dark fill + light gold text.
- Envelope Card:
  - Layered 3D: lining, pocket, ticket, flap, seal.
  - Foil layer phải phản chiếu theo pointer move.
  - Reveal: flap lật, ticket kéo lên và phóng nhẹ.
- Result Modal:
  - Fullscreen overlay, background đen 95%.
  - Win amount gradient gold.
- Legendary FX (optional, chỉ khi cần):
  - Beam, rainbow, shards, shake effect.

## Motion
- Easing:
  - `--ease-elastic`: `cubic-bezier(0.34, 1.56, 0.64, 1)`
  - `--ease-smooth`: `cubic-bezier(0.16, 1, 0.3, 1)`
  - `--ease-out-quart`: `cubic-bezier(0.25, 1, 0.5, 1)`
- Stagger cards: 80ms.
- Hero hide: 500ms.
- Ready delay: 1000ms.
- Normal reveal: 1500ms.
- Legend reveal: 1800ms.
- Result delay: 2000ms.

## Do / Do Not
- Do dùng token màu và font đúng quy chuẩn.
- Do giữ cảm giác "lễ hội điện ảnh".
- Do dùng gradient cho headline và số tiền thắng.
- Do giữ UI tối và bóng đổ sâu.
- Do not dùng màu pastel, neon lạnh, hoặc minimal phẳng.
- Do not thay đổi font hoặc bỏ noise/ambient light.

## Implementation Notes
- Ưu tiên CSS variables và lớp kiểu `hero-*`, `mag-btn`, `grid-container`, `card-*`.
- Nếu thêm component mới, mô tả trong file này trước khi triển khai.
