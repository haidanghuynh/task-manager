# Dữ liệu và migration

| Môi trường | `DATABASE_URL` | File |
|---|---|---|
| Local | `file:./dev.db` | `prisma/dev.db` |
| AlmaLinux | `file:/var/lib/task-manager/task-manager.db` | `/var/lib/task-manager/task-manager.db` |

DB local, `.env`, journal và backup không commit. Production là SQLite; Docker Compose PostgreSQL
hiện không khớp schema.

## Models

| Model | Vai trò |
|---|---|
| `User` | Username unique (map cột `email`), hash, role, permission JSON, Employee 0..1, primary Admin |
| `Employee` | Hồ sơ/mã, active, một `teamId`, User 0..1 |
| `Team`, `TeamMember` | Nhóm/trưởng nhóm/membership; API đồng bộ với `Employee.teamId` |
| `Product` | Code unique, tên, màu, active |
| `DailyWorkCategory` | Code unique, tên vi/ja, màu, active; Task không FK |
| `Task` | Code không unique, PRODUCT/DAILY, thời gian/status/progress, một assignee, nhóm liên kết tùy chọn, soft delete |
| `TaskAssignmentHistory` | Giai đoạn phân công và lý do tùy chọn |
| `TaskStatusHistory`, `TaskChangeLog` | Audit status/field |
| `TaskComment` | Bình luận soft delete |
| `NippoReport` | Một report/Employee/ngày, DRAFT/SUBMITTED |
| `NippoItem` | Task tùy chọn, nội dung, giờ, tiến độ |
| `NippoAbsence` | Một absence/Employee/ngày, loại/khoảng nghỉ |

## Bất biến

- `User.employeeId` unique. `Employee.teamId` là nguồn phạm vi chính; API phải đồng bộ TeamMember.
- `Task.currentAssigneeId` là người hiện tại; history dùng audit.
- Task/User xóa mềm; Employee API xóa vĩnh viễn qua transaction.
- Product/category đang được dùng thì deactivate; chưa dùng mới xóa hẳn.
- `Task.dailyCategory` là text không FK để giữ category cũ và giá trị tự nhập.
- `Task.taskCode` có index nhưng không unique.
- `Task.assignmentGroupId` nullable, có index. Khi tạo DAILY cho nhiều người, mỗi người có một Task
  riêng cùng group ID; không dùng field này để đồng bộ tiến độ hoặc trạng thái.
- `Task.plannedStartTime`/`plannedEndTime` là text nullable `HH:mm`, chỉ dùng cho DAILY. Tách khỏi
  DateTime ngày để tránh lệch múi giờ giữa local và product.
- Migration `20260817113000_sync_account_employee_status` đồng bộ dữ liệu User/Employee cũ. Sau đó
  API account duy trì `User.isActive = Employee.isActive` cho hồ sơ liên kết.
- NIPPO/absence unique theo Employee + ngày; xóa report cascade item; xóa task set taskId item null.

```text
role: ADMIN | MANAGER | EMPLOYEE
workType: PRODUCT | DAILY
status: PLANNED | IN_PROGRESS | WAITING | COMPLETED | CANCELLED
priority: LOW | MEDIUM | HIGH | URGENT
nippo: DRAFT | SUBMITTED
absenceType: PAID | SICK | PERSONAL | OTHER
period: FULL | HALF_AM | HALF_PM
```

Đây là string, không phải Prisma enum; validation/UI phải đồng bộ.

## Migrations hiện có

```text
20260807061940_init
20260807064200_add_teams
20260807085640_add_team_icon
20260807091431_remove_employee_unique
20260810110000_use_username_for_login
20260810150000_protect_primary_admin
20260810170000_allow_duplicate_task_codes
20260813090000_add_user_permissions
20260814120000_add_daily_work
20260814133000_add_nippo_reports
20260814140000_backfill_nippo_permissions
20260814170000_add_daily_work_categories
```

Thay schema:

```bash
npx prisma migrate dev --name ten_ngan_gon
npx prisma generate
npm run lint
npm run build
```

Đọc SQL, commit schema + migration. SQLite migration có thể dựng bảng mới/copy/rename. Production
backup rồi dùng `prisma migrate deploy`. Không chạy `migrate reset`, `db push --force-reset` hoặc
seed trên production.

## AuditLog

`AuditLog` lưu snapshot tên/username của người thao tác, action, loại/id/nhãn đối tượng, chi tiết JSON,
IP, User-Agent và thời gian. Quan hệ `actorId` dùng `onDelete: SetNull`, nên lịch sử còn nguyên khi tài
khoản bị xóa. Helper `src/lib/audit-log.ts` loại các khóa nhạy cảm trước khi ghi và không làm thao tác
nghiệp vụ thất bại nếu riêng việc ghi audit gặp lỗi.

Migration tạo bảng: `20260817143000_add_audit_logs`. Khi triển khai production phải backup DB rồi chạy
`npx prisma migrate deploy`; không seed hoặc reset database.
