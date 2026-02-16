# Lì Xì Station

Ứng dụng rút lì xì theo flow thực tế:

1. Chủ ví đăng ký/đăng nhập.
2. Cấu hình ngân sách theo số lượng tờ từng mệnh giá.
3. Chủ ví tạo lượt rút cho từng người (tên + PIN 6 số một lần).
4. Người rút nhập PIN kiểu OTP, chọn 1 trong 10 phong bao.
5. Kết quả được lưu và hiển thị leaderboard theo từng chủ ví.

## Công nghệ

- Next.js 16 + React 19
- Convex
- TypeScript

## Chạy local

```bash
# Terminal 1
npx convex dev

# Terminal 2
npm run dev
```

Truy cập:

- `http://localhost:3000/auth`
- `http://localhost:3000/setup`
- `http://localhost:3000/draw`
- `http://localhost:3000/leaderboard`

## Quy tắc nghiệp vụ chính

- PIN luôn 6 chữ số.
- PIN của lượt rút là một lần (session-based), sai tối đa 3 lần.
- Mỗi tên người rút chỉ được nhận 1 lượt rút thành công trong cùng chủ ví.
- Ngân sách dựa trên tồn kho số lượng tờ (`amount x quantity`), mỗi lượt rút trừ đúng 1 tờ.
- Sau khi có lượt rút, cấu hình ngân sách bị khóa để giữ toàn vẹn dữ liệu lịch sử.
