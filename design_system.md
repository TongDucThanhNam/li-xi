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
- OAuth / Social Auth Button:
  - Dùng cùng cấu trúc pill cao như primary CTA nhưng nền tối hơn để phân biệt hành động phụ.
  - Border vàng mảnh, text gold-shine, icon nằm bên trái trong vòng tròn sáng nhẹ.
  - Không dùng màu thương hiệu OAuth làm palette chính; chỉ dùng icon/label để nhận diện.
- Framed Panels (host/admin screens):
  - Single border with one subtle inner stroke.
  - Soft gold highlight + deep red gradient fill.
  - Optional thin header divider line.
  - Avoid multiple decorative borders on the same panel.
- Host/setup status banners:
  - Error, locked, or unavailable states use red-vivid borders/fill with gold-shine text.
  - Success or informational states use gold-base borders/fill with gold-shine text.
  - Do not introduce green, orange, blue, or other status palettes.
- Campaign Studio:
  - Dùng cùng Framed Panel cho cấu hình chiến dịch, nhưng layout được phép dày hơn host/admin.
  - Asset upload/dropzone là vùng viền vàng đứt nhẹ, nền black-ink/red-deep, thumbnail nằm trong khung 8px radius.
  - Asset retry state dùng hàng compact trong dropzone, viền vàng mảnh, nền black-ink/red-deep, nút outline vàng; không tạo toast hoặc panel màu mới.
  - Trạng thái active/draft dùng stat pill nhỏ, không tạo palette mới ngoài red/gold/black hiện có.
- Claim Copy Controls:
  - Đặt trong Campaign Studio dưới nhóm cấu hình chiến dịch, dùng input/textarea cùng kiểu Framed Panel.
  - Cho phép brand chỉnh headline, subtitle, nhãn CTA ngắn, và thông điệp chờ; không cho đổi font hoặc palette.
  - Preview phải phản ánh copy end-user, nhưng vẫn giữ title gradient gold, subtitle tracking lớn, và CTA pill.
  - CTA label tối đa ngắn để không vỡ nút mobile; nếu trống dùng mặc định “Thử vận may”.
- Station Guest Wait:
  - Sau Collect, màn station giữ full-screen hero với CTA disabled và thông điệp chờ lượt rút tiếp theo.
  - Nút quay lại host chỉ là control nhỏ ở góc trên, viền vàng mảnh, nền black-ink trong suốt; không dùng màu hoặc panel mới.
- Plan Usage Panel:
  - Dùng panel nhỏ nền black-ink với viền vàng mảnh, đặt trong admin/campaign sidebar.
  - Usage bar dùng gold-base khi còn hạn mức và red-vivid khi đầy/vượt, không thêm màu trạng thái mới.
  - Badge billing/plan dùng capsule nhỏ cùng kiểu Stat Pills, giữ chữ ngắn để không vỡ layout mobile.
- Billing Actions:
  - Đặt trong Plan Usage Panel hoặc ngay bên dưới, dùng 2 nút tối đa trên một hàng desktop và xếp dọc trên mobile.
  - Checkout/upgrade dùng viền vàng + nền gold-base nhẹ; customer portal dùng nút outline tối để phân cấp thấp hơn.
  - Trạng thái đang xử lý giữ chiều cao nút cố định, không đổi layout; lỗi billing dùng red-vivid trong panel hiện có.
  - Không thêm màu nhận diện Polar riêng; billing vẫn theo palette red/gold/black của hệ thống.
- Campaign Metrics Panel:
  - Đặt trong sidebar admin/campaign, cùng nền black-ink và viền vàng mảnh như Plan Usage Panel.
  - Metric tile dùng 2 cột, radius 8px, số liệu bằng Cinzel, label bằng font-vn nhỏ.
  - Không dùng chart màu mới; nếu cần trạng thái cảnh báo thì dùng red-vivid hiện có.
- Ops Readiness Panel:
  - Đặt trong sidebar admin/campaign, cùng nền black-ink và viền vàng mảnh như Plan Usage Panel.
  - Hiển thị trạng thái cấu hình OAuth/R2/Polar bằng hàng compact, không lộ secret value.
  - Dùng gold-base cho nhóm đã đủ cấu hình và red-vivid cho nhóm còn thiếu; không thêm màu trạng thái mới.
  - Nếu host đang ở legacy bridge, hiển thị trạng thái không khả dụng thay vì yêu cầu nhập token trong UI.
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
