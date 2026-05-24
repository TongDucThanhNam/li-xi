# Draw Template Design System: Lunar Fortune

This document governs the custom draw/claim experience only: station guest draw
screens, public claim links, and the current `li-xi` draw template. Admin,
Campaign Studio, setup, leaderboard, billing, and operational management screens
should use HeroUI Pro patterns and tokens instead of this red/gold skin.

For admin UI direction, see `docs/admin-design-system.md`.

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
- OAuth / Social Auth Button:
  - Dùng cùng cấu trúc pill cao như primary CTA nhưng nền tối hơn để phân biệt hành động phụ.
  - Border vàng mảnh, text gold-shine, icon nằm bên trái trong vòng tròn sáng nhẹ.
  - Không dùng màu thương hiệu OAuth làm palette chính; chỉ dùng icon/label để nhận diện.
- Framed Panels (draw host screens):
  - Single border with one subtle inner stroke.
  - Soft gold highlight + deep red gradient fill.
  - Optional thin header divider line.
  - Avoid multiple decorative borders on the same panel.
- Host/setup status banners:
  - Error, locked, or unavailable states use red-vivid borders/fill with gold-shine text.
  - Success or informational states use gold-base borders/fill with gold-shine text.
  - Do not introduce green, orange, blue, or other status palettes.
- Claim Copy Controls:
  - Preview trong admin phải phản ánh copy end-user nhưng không kéo red/gold admin styling vào form quản trị.
  - Cho phép brand chỉnh headline, subtitle, nhãn CTA ngắn, và thông điệp chờ; không cho đổi font hoặc palette.
  - Preview phải phản ánh copy end-user, nhưng vẫn giữ title gradient gold, subtitle tracking lớn, và CTA pill.
  - CTA label tối đa ngắn để không vỡ nút mobile; nếu trống dùng mặc định “Thử vận may”.
- Brand Campaign Template:
  - `brand` dùng cùng shell điện ảnh đỏ/vàng như `li-xi` để không phá palette draw hiện tại.
  - Brand khác biệt bằng campaign copy, brand name, hero asset, collect copy, và snapshot dữ liệu, không bằng font hoặc màu mới.
  - Route draw/claim phải resolve template từ campaign theme để `brand` không chỉ là nhãn trong admin.
- Station Guest Wait:
  - Sau Collect, màn station giữ full-screen hero với CTA disabled và thông điệp chờ lượt rút tiếp theo.
  - Nút quay lại host chỉ là control nhỏ ở góc trên, viền vàng mảnh, nền black-ink trong suốt; không dùng màu hoặc panel mới.
- Public Claim Loading/Closed:
  - Loading, invalid, completed, expired, or replayed claim states use the same full-viewport Lunar shell as the guest draw.
  - Use one centered framed panel with icon, short title, and one concise message; avoid extra decorative borders or oversized shadows.
  - Loading copy must remain readable on mobile and should not use aggressive uppercase for Vietnamese text.
  - Closed/invalid states use gold icon treatment for neutral/completed states and red-vivid only for genuine invalid/error states.
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
