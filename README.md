# Task Manager

Ứng dụng web nội bộ quản lý task và lịch phân công nhân viên theo sản phẩm, nhóm
và khoảng thời gian. Giao diện hỗ trợ tiếng Việt, tiếng Nhật, light mode và dark
mode.

## Tính năng chính

- Đăng nhập bằng username với ba vai trò `ADMIN`, `MANAGER`, `EMPLOYEE`.
- Quản lý tài khoản, phân quyền và bảo vệ Primary Admin được tạo khi cài đặt.
- Dashboard, bảng xếp hạng theo thành viên/nhóm và bộ lọc thời gian.
- Lịch phân công theo người hoặc theo nhóm, hỗ trợ nhiều task chồng thời gian.
- Quản lý task, mã task tùy chỉnh, chuyển người phụ trách và lịch sử thay đổi.
- Import/export danh sách task và nhân viên.
- Quản lý nhân viên, nhóm, trưởng nhóm và sản phẩm.
- Báo cáo năm và xuất CSV.
- Giao diện Việt–Nhật và light/dark.

## Công nghệ

| Thành phần | Công nghệ |
|---|---|
| Web | Next.js 16.3, React 19, TypeScript |
| API | Next.js Route Handlers |
| Database | SQLite, Prisma 5 |
| Auth | NextAuth v5 Credentials + JWT |
| UI | Tailwind CSS 4, Lucide React, Recharts |

## Chạy local

Yêu cầu Node.js 22 và npm.

```bash
npm install
copy .env.example .env
npx prisma generate
npx prisma migrate dev
npm run dev
```

Trên PowerShell có thể thay `copy` bằng `Copy-Item`. Mở URL được Next.js in ra
terminal, thường là `http://localhost:3000`.

Hai biến môi trường bắt buộc:

```dotenv
DATABASE_URL="file:./dev.db"
AUTH_SECRET="replace-with-a-long-random-secret"
```

`prisma/seed.ts` chỉ dành cho dữ liệu mẫu khi phát triển và không được bộ cài
production chạy tự động.

## Kiểm tra production build

```bash
npm run lint
npm run build
npm start
```

## Tài liệu

- [Cấu trúc dự án và luồng nghiệp vụ](docs/PROJECT_STRUCTURE.md)
- [Cách phát triển giao diện Việt Nam - Nhật Bản](docs/I18N.md)
- [Hướng dẫn phát triển và bảo trì](docs/DEVELOPMENT.md)
- [Backup và khôi phục database](docs/BACKUP_RESTORE.md)
- [Flow Task chờ phân công](docs/WAITING_TASK_FLOW.md)
- [Cài đặt và vận hành trên AlmaLinux 9.8](deploy/almalinux9/README.md)

## Cấu trúc rút gọn

```text
deploy/almalinux9/  Bộ cài và công cụ vận hành production
docs/               Tài liệu kỹ thuật
prisma/             Schema, migrations và seed development
public/             Logo và static assets
scripts/            Bootstrap/reset mật khẩu Admin
src/app/            Trang App Router và API Route Handlers
src/components/     Component dùng chung
src/i18n/           Từ điển Việt/Nhật
src/lib/            Auth, permissions, Prisma, i18n, validation
src/services/       Nghiệp vụ task và nhân viên
```

## Quy ước quan trọng

- Task code có dạng mã sản phẩm hoặc `<PRODUCT_CODE>-<phần tự nhập>`, ví dụ
  `GATE-2.22.4`; mã trùng được chấp nhận.
- Một task có một người phụ trách hiện tại và lưu lịch sử mỗi lần chuyển người.
- Trạng thái `COMPLETED` đặt tiến độ thành 100%.
- Primary Admin không thể bị hạ quyền, khóa hoặc xóa qua UI/API.
- Quyền phải được kiểm tra ở server; việc ẩn nút ở giao diện không thay thế kiểm
  tra API.
