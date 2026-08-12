# Cấu trúc dự án Task Manager

Tài liệu này mô tả cấu trúc đang được sử dụng trong source. Khi tài liệu và code
khác nhau, ưu tiên `package.json`, `prisma/schema.prisma` và các Route Handler
trong `src/app/api`.

## Công nghệ chính

| Thành phần | Công nghệ |
|---|---|
| Giao diện và server | Next.js 16.3 (App Router), React 19, TypeScript |
| CSS | Tailwind CSS 4 và các quy tắc dark mode trong `src/app/globals.css` |
| API | Next.js Route Handlers |
| Đăng nhập | NextAuth v5 Credentials, JWT session |
| Database | SQLite |
| ORM | Prisma 5 |
| Validation | Zod |
| Biểu đồ | Recharts |
| Icon | Lucide React và emoji cấu hình cho nhóm |

## Cây thư mục

```text
task-manager/
├── deploy/almalinux9/       # Installer, reset mật khẩu và hướng dẫn AlmaLinux 9
├── docs/                    # Tài liệu kỹ thuật của dự án
├── prisma/
│   ├── migrations/          # Lịch sử thay đổi database
│   ├── schema.prisma        # Schema SQLite
│   └── seed.ts              # Dữ liệu mẫu, không chạy khi cài production
├── public/                  # Logo và tài nguyên tĩnh
├── scripts/
│   ├── bootstrap-admin.ts   # Tạo Primary Admin đầu tiên
│   └── reset-admin-password.ts
├── src/
│   ├── app/
│   │   ├── (authenticated)/ # Các trang yêu cầu đăng nhập
│   │   ├── api/             # API phía server
│   │   ├── login/           # Trang đăng nhập
│   │   ├── globals.css      # CSS chung và dark mode
│   │   └── layout.tsx       # Metadata, font và khởi tạo theme
│   ├── components/          # Component dùng chung
│   ├── i18n/                # Từ điển tiếng Việt và tiếng Nhật
│   ├── lib/                 # Auth, phân quyền, Prisma, i18n, validation
│   ├── services/            # Nghiệp vụ dùng lại giữa các API
│   ├── types/               # Kiểu và nhãn trạng thái/độ ưu tiên
│   └── proxy.ts             # Bảo vệ route và kiểm tra tài khoản còn hoạt động
├── .env.example
├── next.config.ts
└── package.json
```

## Các trang chính

| URL | File | Chức năng |
|---|---|---|
| `/login` | `src/app/login/page.tsx` | Đăng nhập bằng username và mật khẩu |
| `/dashboard` | `src/app/(authenticated)/dashboard/page.tsx` | Tổng quan và bảng xếp hạng theo kỳ |
| `/schedule` | `src/app/(authenticated)/schedule/page.tsx` | Lịch phân công theo người/nhóm |
| `/tasks` | `src/app/(authenticated)/tasks/page.tsx` | Danh sách, lọc, import/export task |
| `/waiting-tasks` | `src/app/(authenticated)/waiting-tasks/page.tsx` | Bảng và lịch task chờ phân công |
| `/tasks/new` | `src/app/(authenticated)/tasks/new/page.tsx` | Tạo task |
| `/tasks/[id]` | `src/app/(authenticated)/tasks/[id]/page.tsx` | Chi tiết, sửa, bình luận, chuyển task |
| `/employees` | `src/app/(authenticated)/employees/page.tsx` | Danh sách và import/export nhân viên |
| `/teams` | `src/app/(authenticated)/teams/page.tsx` | Quản lý nhóm và thành viên |
| `/accounts` | `src/app/(authenticated)/accounts/page.tsx` | Quản lý tài khoản và phân quyền |
| `/reports/annual` | `src/app/(authenticated)/reports/annual/page.tsx` | Báo cáo năm |
| `/settings` | `src/app/(authenticated)/settings/page.tsx` | Quản lý sản phẩm |

`src/app/(authenticated)/layout.tsx` bọc các trang trên bằng session, ngôn ngữ
và sidebar. `src/proxy.ts` chuyển tài khoản chưa đăng nhập hoặc đã bị khóa về
`/login`.

## API

| Nhóm API | Mục đích |
|---|---|
| `/api/auth/[...nextauth]` | Đăng nhập và session |
| `/api/tasks`, `/api/tasks/[id]` | Danh sách, tạo, sửa và xóa task |
| `/api/tasks/bulk` | Import và xóa nhiều task |
| `/api/tasks/assign` | Phân công nhiều task đang chờ |
| `/api/tasks/[id]/reassign` | Chuyển người phụ trách |
| `/api/tasks/[id]/unassign` | Thu hồi task đã giao về hàng chờ |
| `/api/tasks/[id]/comments` | Thêm bình luận |
| `/api/employees`, `/api/employees/[id]` | Quản lý nhân viên |
| `/api/employees/bulk` | Import hoặc xóa nhiều nhân viên |
| `/api/teams`, `/api/teams/members` | Quản lý nhóm và thành viên |
| `/api/users`, `/api/users/[id]` | Tài khoản, vai trò và trạng thái |
| `/api/products` | Cấu hình sản phẩm và màu |
| `/api/schedule` | Task giao nhau với tháng được chọn |
| `/api/reports/annual` | Dữ liệu báo cáo |

API chủ yếu trả về dạng `{ success, data }`; lỗi trả về `{ success: false,
error: { code, message? } }`. Phân quyền phải luôn được kiểm tra ở API, không chỉ
ẩn nút trên giao diện.

## Dữ liệu và quan hệ

- `User`: tài khoản đăng nhập, username, mật khẩu băm, vai trò và trạng thái.
- `Employee`: hồ sơ nhân viên, mã nhân viên có thể sửa và nhóm hiện tại.
- `Team`, `TeamMember`: nhóm, trưởng nhóm và thành viên. Mỗi nhân viên hiện chỉ
  thuộc một nhóm; API đồng bộ `TeamMember` với `Employee.teamId`.
- `Product`: mã, tên, màu và trạng thái hoạt động.
- `Task`: công việc, sản phẩm, một người phụ trách hiện tại, thời gian, trạng
  thái và tiến độ.
- `TaskAssignmentHistory`: lịch sử đổi người phụ trách.
- `TaskStatusHistory`: lịch sử trạng thái.
- `TaskChangeLog`: log thay đổi field.
- `TaskComment`: bình luận và thông tin xóa mềm.

Task code được tạo theo `<PRODUCT_CODE>` hoặc `<PRODUCT_CODE>-<phần người dùng
nhập>`, ví dụ `GATE-2.22.4`. Mã task có thể trùng. Một task hiện có một người phụ
trách tại một thời điểm; cần thay đổi schema và UI nếu muốn nhiều người đồng phụ
trách cùng một task.

## Vai trò và quyền

| Chức năng | ADMIN | MANAGER | EMPLOYEE |
|---|:---:|:---:|:---:|
| Quản lý tài khoản, sản phẩm | Có | Không | Không |
| Quản lý nhân viên, nhóm | Có | Có | Không |
| Tạo/sửa/xóa/chuyển task | Có | Có | Không |
| Xem toàn bộ task, báo cáo, export | Có | Có | Không |
| Cập nhật task của chính mình | Có | Có | Có |
| Khôi phục task và xem audit đầy đủ | Có | Không | Không |

Primary Admin được tạo lúc cài đặt có `isPrimaryAdmin = true`, không thể hạ
quyền, khóa hoặc xóa qua UI/API. Admin khác có thể được tạo và quản lý trong UI.

## Luồng nghiệp vụ đáng chú ý

- Tạo task kiểm tra sản phẩm và nhân viên còn hoạt động, sau đó ghi lịch sử phân
  công và lịch sử trạng thái trong transaction.
- Task trùng lịch khi hai khoảng ngày giao nhau. Đây là cảnh báo, không ngăn tạo.
- Chuyển task đóng bản ghi phân công hiện tại, tạo bản ghi mới và ghi change log.
- Chuyển trạng thái sang `COMPLETED` đặt tiến độ thành 100% và tự điền ngày hoàn
  thành nếu chưa có.
- Lịch phân công lấy màu từ cấu hình Product; task chồng thời gian được xếp thành
  nhiều lane.
- Task dùng xóa mềm qua `deletedAt`; một số luồng xóa nhân viên là xóa vĩnh viễn
  và xử lý các quan hệ liên quan trong transaction.
