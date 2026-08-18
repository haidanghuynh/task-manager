# API reference

Mọi endpoint yêu cầu session trừ NextAuth. Thành công thường `{ success: true, data }`; lỗi
`{ success: false, error: { code, message?, details? } }`. Status: 400 validation, 401 auth,
403 permission, 404 missing, 409 conflict.

## Task

| Endpoint | Method | Quyền | Hành vi |
|---|---|---|---|
| `/api/tasks` | GET | `TASK_VIEW` | Filter/page/group; Employee cùng nhóm |
| `/api/tasks` | POST | `TASK_CREATE` cho PRODUCT; `DAILY_TASK_CREATE` cho DAILY | Tạo task và history trong transaction |
| `/api/tasks/[id]` | GET | `TASK_VIEW` | Detail + audit/comments + scope |
| `/api/tasks/[id]` | PATCH | `TASK_EDIT` cho PRODUCT; `DAILY_TASK_EDIT` cho DAILY; hoặc own + `TASK_UPDATE_OWN` | Sửa, history/log, overlap warning |
| `/api/tasks/[id]` | DELETE | `TASK_DELETE` cho PRODUCT; `DAILY_TASK_DELETE` cho DAILY | Soft delete |
| `/api/tasks/bulk` | POST | `TASK_IMPORT_EXPORT` | CSV tối đa 1.000 dòng |
| `/api/tasks/bulk` | DELETE | Admin | Soft-delete hàng loạt |
| `/api/tasks/assign` | POST | `TASK_ASSIGN` | Giao 1-200 task chờ |
| `/api/tasks/[id]/reassign` | POST | `TASK_ASSIGN` | Đóng assignment cũ/tạo mới |
| `/api/tasks/[id]/unassign` | POST | `TASK_ASSIGN` | Thu hồi; không completed/cancelled |
| `/api/tasks/[id]/comments` | POST | edit hoặc own-update | Thêm bình luận |

GET filters: `page`, `pageSize` (max 100), `search`, `status`, `product`, `workType`, `employee`,
`priority`, `startDate`, `endDate`, `teamId`, `assignment`, `groupBy`, `overdue`, `showDeleted`.
`assignment=unassigned` cần `TASK_ASSIGN`; `groupBy=assignee|team` trả grouped thay pagination.
`status` và `workType` độc lập. Bỏ trống `status` nghĩa là mọi trạng thái và vẫn gồm cả PRODUCT/DAILY;
bỏ trống `workType` nghĩa là cả hai loại công việc. Client list và export phải gửi cùng bộ lọc.
Filter `overdue=true` chỉ lấy task sản phẩm ở trạng thái chưa bắt đầu/đang thực hiện có ngày kết thúc
trước ngày nghiệp vụ hiện tại. Task đang chờ, đến hạn hôm nay và công việc hằng ngày không được xem là quá hạn.

POST: `taskName`, `description?`, `workType`, `dailyCategory?`, `productId?`, `taskNumber?`,
`assigneeId?`, `assigneeIds?`, planned dates, `plannedStartTime?`, `plannedEndTime?`, status, priority, note. End trống dùng start. Suffix cho phép chữ/số,
`.`, `_`, `-`. PATCH nhận các field cần đổi; client chi tiết chỉ gửi field có giá trị thay đổi để
không validate lại dữ liệu legacy không liên quan. `taskCode` cho phép trùng và chỉ áp regex hiện tại
khi chính mã được đổi. Có thể rút ngắn `plannedEndDate` nếu ngày mới vẫn bằng/sau `plannedStartDate`.
COMPLETED tự progress 100/actual end.
Đổi PRODUCT ↔ DAILY cần quyền sửa của cả hai loại. Import dòng DAILY cần đồng thời
`TASK_IMPORT_EXPORT` và `DAILY_TASK_CREATE`.
Người tạo/import không có `TASK_ASSIGN` chỉ được tạo task gán cho Employee liên kết của chính
mình; server không chấp nhận giao người khác hoặc để task chưa phân công.

`assigneeIds` chỉ dùng cho DAILY, tối đa 100 ID. Mỗi ID tạo một Task độc lập có
cùng `assignmentGroupId`; response trả `task` đầu tiên, toàn bộ `tasks`, `assignmentGroupId` và
`overlaps`. Admin chọn mọi Employee active. Manager chỉ chọn Employee active cùng `teamId`, kể cả
khi client gửi ID ngoài nhóm thủ công và không cần `TASK_ASSIGN` cho phạm vi này. Nếu Manager không
có `TASK_ASSIGN`, request phải chọn ít nhất một người; không được tạo task chờ. Employee luôn bị ép
về Employee liên kết với tài khoản.

GET `/api/tasks/[id]` trả thêm `assignmentGroup`. Với Manager/Employee, danh sách liên kết được lọc
theo nhóm được phép nhìn thấy.

CSV columns:

```text
taskCode,taskName,description,productCode,assigneeCode,plannedStartDate,plannedEndDate,
actualStartDate,actualEndDate,status,progress,priority,note,workType,dailyCategory,plannedStartTime,plannedEndTime
```

## Employee/team/account

| Endpoint | Method | Quyền |
|---|---|---|
| `/api/employees` | GET/POST | `EMPLOYEE_VIEW` / `EMPLOYEE_MANAGE` |
| `/api/employees/[id]` | GET/PATCH/DELETE | view/manage + team scope |
| `/api/employees/bulk` | POST | `EMPLOYEE_IMPORT_EXPORT`, max 5.000 |
| `/api/employees/bulk` | DELETE | Admin |
| `/api/teams` | GET | Authenticated; Employee chỉ team mình |
| `/api/teams` | POST/PATCH/DELETE | `TEAM_MANAGE` |
| `/api/teams/members` | POST/DELETE | `TEAM_MANAGE` |
| `/api/users`, `/api/users/[id]` | mọi method | Admin |

Import Employee upsert theo employeeCode, có thể tạo team theo tên, đồng bộ teamId/TeamMember và
account link. Xóa Employee vĩnh viễn. Account username lowercase `[a-z0-9._-]`, 3-50; password
min 8. Xóa account đổi username, inactive, unlink và đặt deletedAt; primary/self được bảo vệ.
PATCH trạng thái account đồng bộ `User.isActive` và `Employee.isActive` trong transaction. Vô hiệu hóa
không xóa dữ liệu cũ; kích hoạt lại giữ nguyên liên kết và nhóm. Primary Admin và chính account đang
đăng nhập không thể bị vô hiệu hóa.

## Cấu hình

| Endpoint | Method | Quyền/ghi chú |
|---|---|---|
| `/api/products` | GET | Authenticated, cả active/inactive |
| `/api/products` | POST/PATCH/DELETE | Admin; used => inactive, unused => delete |
| `/api/daily-work-categories` | GET | Authenticated; `active=true` filter |
| `/api/daily-work-categories` | POST/PATCH/DELETE | Admin; code uppercase, tên vi/ja, màu hex |

Task lưu category code string. Edit không đổi category code; inactive không làm mất task cũ.

## Lịch/báo cáo

| Endpoint | Method | Quyền | Query |
|---|---|---|---|
| `/api/schedule` | GET | `SCHEDULE_VIEW` | `month`, `product`, `employee`, `includeCompleted` |
| `/api/reports/annual` | GET | `REPORT_VIEW` | `year`, `employee` |

Schedule chỉ task có assignee giao với tháng, mặc định bỏ completed/cancelled. Annual gom theo
assignee hiện tại, đếm completed/cancelled/on-time/late/days/reassignments/ZONE/GATE/HUNTER/DAILY.

## Báo cáo hằng ngày

| Endpoint | Method | Quyền |
|---|---|---|
| `/api/nippo?mode=mine&date=YYYY-MM-DD` | GET | `NIPPO_VIEW` |
| `/api/nippo?mode=team&teamId=...&date=...` | GET | `NIPPO_MANAGE` |
| `/api/nippo?mode=overview&date=...` | GET | role Admin |
| `/api/nippo` | POST/DELETE | `NIPPO_SUBMIT` |
| `/api/nippo/absences` | POST/DELETE | `NIPPO_MANAGE` |

Mine trả report/absence/candidate task giao với ngày (current/history) và previous progress. POST
upsert report rồi thay toàn bộ items trong transaction; max 50 items, hours 0-24, progress 0-100.
TaskId phải thuộc người báo cáo tại ngày đó. Absence upsert theo Employee + ngày.

## Lịch sử thao tác (Admin)

| Endpoint | Method | Quyền | Query |
|---|---|---|---|
| `/api/audit-logs` | GET | role `ADMIN` | `page`, `pageSize`, `search`, `action`, `entityType`, `from`, `to` |

API trả log mới nhất trước, danh sách giá trị lọc và pagination. `from`/`to` dùng ngày theo múi giờ
`+07:00`. `details` được parse từ JSON; password, hash, secret, token, authorization và cookie không
được ghi vào log.
