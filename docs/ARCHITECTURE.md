# Kiến trúc hệ thống

Task Manager là monolith Next.js App Router: React render UI, Route Handler cung cấp API,
NextAuth xử lý session và Prisma truy cập SQLite. Production dùng Nginx port 80 proxy vào Next.js
`127.0.0.1:3000`.

```text
Browser -> Nginx -> Next.js pages / NextAuth / API -> Prisma -> SQLite
```

## Stack

| Lớp | Công nghệ |
|---|---|
| Web | Next.js 16.3, React 19, TypeScript strict |
| Auth | NextAuth v5 Credentials, JWT, bcrypt cost 12 |
| Database | SQLite, Prisma 5 |
| Validation | Zod 4 |
| UI | Tailwind CSS 4, Lucide, Recharts |
| Production | AlmaLinux 9.8, Node 22, systemd, Nginx, SELinux |

## Cấu trúc

```text
deploy/almalinux9/       installer/reset Admin/EL9 docs
docs/                    tài liệu kỹ thuật
prisma/schema.prisma     schema hiện tại
prisma/migrations/       migration bắt buộc commit
prisma/seed.ts           chỉ development
public/                  logo/static assets
scripts/                 bootstrap/reset Admin TypeScript
src/app/                 App Router, pages và API
src/components/          layout/dashboard/component chung
src/i18n/                từ điển vi/ja
src/lib/                 auth, quyền, Prisma, validation/helper
src/services/            transaction nghiệp vụ
src/types/               kiểu/nhãn domain
src/proxy.ts             bảo vệ route/session
```

## Trang

| URL | Chức năng |
|---|---|
| `/login` | Đăng nhập username/password |
| `/dashboard` | KPI/xếp hạng theo tháng, khoảng ngày hoặc năm |
| `/schedule` | Lịch tháng, mặc định theo nhóm, thu gọn nhóm |
| `/tasks` | Task đã phân công, filter/group/import/export |
| `/waiting-tasks` | Task chưa giao, giao hàng loạt và timeline chờ |
| `/tasks/new`, `/tasks/[id]` | Tạo, sửa, audit, bình luận, chuyển/thu hồi |
| `/employees` | Hồ sơ, import/export |
| `/teams` | Nhóm, trưởng nhóm và thành viên |
| `/accounts` | Admin quản lý account/quyền |
| `/reports/annual` | Báo cáo năm |
| `/nippo` | Báo cáo hằng ngày cá nhân/nhóm/Admin |
| `/settings` | Product và DailyWorkCategory |

Authenticated layout bọc session, language provider và sidebar. Menu theo permission chỉ là UX;
API là lớp bảo vệ bắt buộc.

## Luồng API

1. `getCurrentUser()` đọc session và tải lại user từ DB.
2. User phải active; Employee account còn cần Employee active.
3. Route kiểm `hasPermission()` và khi cần `getVisibleEmployeeIds()`.
4. Validate input; thao tác nhiều ghi dùng Prisma transaction/service.
5. Thành công thường trả `{ success: true, data }`, lỗi trả
   `{ success: false, error: { code, message?, details? } }`.

Credentials trim/lowercase username; password tối thiểu 8. Session JWT nhưng callback đọc lại
role, employee link và permissions từ DB. `AUTH_SECRET` phải ổn định; đổi secret làm session cũ
mất hiệu lực.

## Điểm cần chú ý

- `docker-compose.yml` dùng PostgreSQL nhưng Prisma hiện dùng SQLite; Compose không phải cách chạy
  chuẩn nếu chưa đổi provider/migration.
- UI cũ còn bộ dịch DOM tương thích; UI mới nên dùng key typed.
- Chưa có unit/integration test runner; hiện dựa lint, build và manual regression.
- Một số route còn `any`; nên giảm dần khi sửa đúng khu vực.
