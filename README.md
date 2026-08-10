# Task Manager - Zone / Gate / Hunter

Ứng dụng web nội bộ quản lý lịch phân công task cho nhân viên trên 3 sản phẩm: **Zone**, **Gate**, **Hunter**.

## Tính năng chính

- Đăng nhập với 3 vai trò: Admin, Manager, Employee
- **Dashboard** tổng quan theo tháng (cards + charts)
- **Lịch phân công** (Gantt Timeline) - màn hình quan trọng nhất
  - Nhân viên (hàng) × Ngày trong tháng (cột)
  - Task bars với màu sắc theo sản phẩm (Zone: xanh, Gate: xanh dương, Hunter: cam)
  - Highlight ngày hôm nay, weekend
- **Quản lý Task** CRUD: tạo, xem, sửa, xóa mềm, khôi phục
- **Quản lý Nhân viên**: danh sách, chi tiết, workload
- **Phân công lại Task** (reassign) với lịch sử đầy đủ
- **Phát hiện trùng lịch** (overlap detection)
- **Báo cáo năm** theo nhân viên + **CSV export**
- **Lịch sử audit**: assignment history, status history, change logs
- **Bình luận** trên từng task

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15, TypeScript, React 19, Tailwind CSS |
| Backend | Next.js Route Handlers (API) |
| Database | SQLite (dev) / PostgreSQL (prod) |
| ORM | Prisma 5 |
| Auth | NextAuth.js v5 (Credentials + JWT) |
| Icons | Lucide React |
| Dates | date-fns |

## Yêu cầu hệ thống

- Node.js 18+
- npm

## Cài đặt và chạy local

```bash
# 1. Cài đặt dependencies
npm install

# 2. Tạo database và migration
npx prisma migrate dev --name init

# 3. Seed dữ liệu mẫu
npx tsx prisma/seed.ts

# 4. Chạy dev server
npm run dev
```

Mở trình duyệt tại: **http://localhost:3000**

## Production Build

```bash
npm run build
npm start
```

## Docker (PostgreSQL)

```bash
docker compose up -d
```

Sau đó cập nhật `.env` với `DATABASE_URL` PostgreSQL và chạy migration.

## Tài khoản mặc định

Tất cả tài khoản dùng mật khẩu: **`password123`**

| Email | Vai trò |
|---|---|
| admin@example.com | ADMIN |
| manager@example.com | MANAGER |
| employee1@example.com | EMPLOYEE (Nguyễn Văn An) |
| employee2@example.com | EMPLOYEE (Trần Thị Bình) |
| employee3@example.com | EMPLOYEE (Lê Văn Cường) |

## Cấu trúc dự án

```
src/
  app/
    login/                   # Trang đăng nhập
    (authenticated)/
      dashboard/             # Tổng quan
      schedule/              # Lịch phân công (Gantt)
      tasks/                 # Danh sách task + tạo mới
        [id]/                # Chi tiết task
        new/                 # Tạo task
      employees/             # Danh sách nhân viên
      reports/annual/        # Báo cáo năm
      settings/              # Cài đặt
    api/
      auth/[...nextauth]/    # NextAuth API
      tasks/                 # Tasks CRUD API
        [id]/
          comments/          # Comments API
          reassign/          # Reassign API
      employees/             # Employees API
      products/              # Products API
      schedule/              # Schedule data API
      reports/annual/        # Annual report API
  components/
    layout/                  # Sidebar, SessionProvider
  lib/
    auth/                    # NextAuth config
    permissions/             # Role-based permissions
    prisma.ts                # Prisma client singleton
    date/                    # Date utilities (date-fns)
  services/
    task.service.ts          # Business logic (task codes, reassign, overlap)
  types/
    index.ts                 # TypeScript types + label maps
prisma/
  schema.prisma              # Database schema (7 models)
  seed.ts                    # Seed data (10 employees, 22 tasks)
  migrations/                # Database migrations
docker-compose.yml           # PostgreSQL container
.env.example                 # Environment vars template
```

## Database Models

| Model | Mô tả |
|---|---|
| User | Tài khoản đăng nhập (ADMIN/MANAGER/EMPLOYEE) |
| Employee | Hồ sơ nhân viên |
| Product | Sản phẩm (Zone/Gate/Hunter) |
| Task | Công việc được giao |
| TaskAssignmentHistory | Lịch sử phân công |
| TaskStatusHistory | Lịch sử thay đổi trạng thái |
| TaskChangeLog | Nhật ký thay đổi field |
| TaskComment | Bình luận trên task |

## Business Rules

- Task codes: `PRODUCT-YEAR-SEQUENCE` (vd: `ZONE-2026-0001`)
- Khi status → COMPLETED, progress tự động = 100%
- Xóa mềm (soft delete): set `deletedAt`, không xóa vĩnh viễn
- Reassign: đóng assignment cũ, tạo mới, ghi change log
- Phát hiện overlap: `startA <= endB AND endA >= startB`
- Permissions được enforce ở server-side

## Scripts

| Command | Mô tả |
|---|---|
| `npm run dev` | Dev server (port 3000) |
| `npm run build` | Production build |
| `npm start` | Production server |
| `npm run lint` | ESLint |
| `npx prisma migrate dev` | Tạo/chạy migration |
| `npx prisma db seed` | Seed dữ liệu (cần config) |
| `npx tsx prisma/seed.ts` | Chạy seed script thủ công |

## Known Limitations (MVP)

- SQLite cho development (sẽ switch sang PostgreSQL khi có Docker)
- Chưa có drag-and-drop trên timeline
- Chưa có i18n đa ngôn ngữ (chỉ tiếng Việt)
- Chưa có unit/integration/e2e tests
- Chưa có email notifications

## Future Improvements

- Japanese/English interface (i18n)
- Working-day calendar + public holidays
- Drag & drop trên Gantt timeline
- PDF/Excel export
- Email/Slack notifications
- File attachments
- Approval workflow
- Leave management