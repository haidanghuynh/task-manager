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
| `/api/tasks/assign` | POST | `TASK_ASSIGN` | Giao 1-200 task chờ; chặn task chưa có thời hạn |
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
Có thể xóa cả `plannedStartDate` và `plannedEndDate` (gửi `null`) để đánh dấu task "chưa có thời hạn";
hai ngày phải cùng có hoặc cùng trống.
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

## Môi trường test

| Endpoint | Method | Quyền |
|---|---|---|
| `/api/test-environments` | GET | `ENVIRONMENT_VIEW`; trả toàn bộ môi trường active (PERSONAL + SHARED, chỉ đọc) |
| `/api/test-environments` | POST | `ENVIRONMENT_MANAGE` hoặc Employee (tự tạo cá nhân) |
| `/api/test-environments?id=` | PATCH | chủ sở hữu / Manager team / Admin |
| `/api/test-environments?id=` | DELETE | chủ sở hữu / Admin (dùng chung chỉ Admin) |
| `/api/test-environments/[id]/register` | POST | đăng ký dùng (dùng chung đang trống) |
| `/api/test-environments/[id]/release` | POST | trả (người đang giữ / Admin / Manager) |
| `/api/test-environments/[id]/usages` | GET | `ENVIRONMENT_VIEW`, chỉ đọc |
| `/api/test-environments/expiring` | GET | `ENVIRONMENT_VIEW`; `days` 0-30 (mặc định 3), chỉ SHARED; người giữ + trưởng nhóm + Manager team, Admin tất cả |
| `/api/test-environments/import` | POST | Admin hoặc `ENVIRONMENT_MANAGE`; body `{ rows }`, tối đa 1.000 dòng |
| `/api/test-environment-os` | GET | Authenticated; `active=true` chỉ trả option đang dùng |
| `/api/test-environment-os` | POST/PATCH/DELETE | Admin; PATCH/DELETE dùng `?id=`, `syncExisting` đổi tên kèm dữ liệu cũ |

Fields: `type` (PERSONAL/SHARED), `productId` (bắt buộc), `employeeId`, `usagePeriod`, `usageEndDate`, `os`,
`setupType` (NEW/UPDATE), `virus`, `hostName`, `ip`, `url`, `deliveryDomain`, `version`.

Đăng ký dùng gửi `startDate`/`endDate` (`usagePeriod` vẫn được chấp nhận để tương thích). Mỗi lượt đăng ký
tạo một `TestEnvironmentUsage`; trả/đổi người/xóa môi trường sẽ đóng lượt đang mở kèm người thực hiện.
`expiring` trả môi trường có `usageEndDate <= hôm nay + days` (gồm cả đã quá hạn) để UI cảnh báo.
Danh sách trả về phụ thuộc người gọi: người đang giữ, trưởng nhóm (`Team.leadId`) của người đó,
Manager của team, và Admin (tất cả).

CSV import môi trường test (client parse CSV rồi gửi `rows`):

```csv
type,productCode,employeeCode,usagePeriod,usageEndDate,os,setupType,virus,hostName,ip,url,deliveryDomain,version,buildInfo,commonVersion,sophosVersion
SHARED,GATE,,2026-11-18,2026-11-25,Windows 11,NEW,,gate-test-02,10.0.0.12,,,2.22.4,2.20.0(29845),12.48.1(28380),3.5.0(29733)
PERSONAL,ZONE,haontn,2026-11-01,,Ubuntu 22.04,NEW,,zone-dev-02,10.0.0.13,,,2.22.4,,,
```

- `productCode` bắt buộc và phải khớp `Product.code`; `employeeCode` tùy chọn, phải khớp `Employee.employeeCode`.
- `type` nhận `PERSONAL`/`SHARED`; `setupType` nhận `NEW`/`UPDATE`; ngày dạng `yyyy-mm-dd`.
- Dòng trùng `hostName` (không phân biệt hoa thường) với môi trường đang active sẽ bị bỏ qua và ghi vào `errors`.
- Dòng có người dùng sẽ tự tạo một bản ghi `TestEnvironmentUsage` giống luồng đăng ký.

## Thiết bị test

| Endpoint | Method | Quyền |
|---|---|---|
| `/api/test-devices` | GET | `ENVIRONMENT_VIEW`; filter `status`, `category`, `search` |
| `/api/test-devices` | POST | Admin hoặc `ENVIRONMENT_MANAGE` |
| `/api/test-devices/[id]` | PATCH | Admin hoặc `ENVIRONMENT_MANAGE`; trạng thái `MAINTENANCE`/`RETIRED` chỉ khi trống |
| `/api/test-devices/[id]` | DELETE | Admin hoặc `ENVIRONMENT_MANAGE`; đang mượn => 409, có lịch sử => xóa mềm |
| `/api/test-devices/[id]/checkout` | POST | người dùng tự mượn, hoặc Admin/Manager mượn hộ |
| `/api/test-devices/[id]/return` | POST | người đang giữ / Admin / Manager; `returnCondition` OK/DAMAGED/LOST |
| `/api/test-devices/[id]/usages` | GET | `ENVIRONMENT_VIEW`, chỉ đọc |
| `/api/test-devices/expiring` | GET | `ENVIRONMENT_VIEW`; `days` 0-30; người giữ + trưởng nhóm + Manager team, Admin tất cả |
| `/api/test-devices/import` | POST | Admin hoặc `ENVIRONMENT_MANAGE`; body `{ rows }`, tối đa 1.000 dòng |

CSV thiết bị: `code,name,category,purpose,os,serialNumber,location,note,employeeCode,usageStartDate,usageEndDate`.
`code` unique và khớp `^[A-Z0-9._-]{2,50}$`; `category` LAPTOP/DESKTOP/PHONE/TABLET/OTHER; có `employeeCode`
thì thiết bị vào trạng thái `IN_USE` và tạo một bản ghi `TestDeviceUsage`. Trả thiết bị với `DAMAGED`
chuyển `MAINTENANCE`, `LOST` chuyển `RETIRED`.

`os` là text tự do trong DB nhưng UI chọn từ `TestEnvironmentOsOption` (Admin quản lý ở Cài đặt).
Option chưa được dùng thì xóa hẳn; đang được dùng thì chỉ inactive và dữ liệu cũ giữ nguyên.

## Lịch/báo cáo

| Endpoint | Method | Quyền | Query |
|---|---|---|---|
| `/api/schedule` | GET | `SCHEDULE_VIEW` | `month`, `product`, `employee`, `includeCompleted`; kết quả gồm tháng đã chọn và 7 ngày đầu tháng kế tiếp |
| `/api/reports/annual` | GET | `REPORT_VIEW` | `year`, `employee` |

Schedule chỉ task có assignee giao với tháng cùng 7 ngày đầu tháng kế tiếp, mặc định bỏ
completed/cancelled. Annual gom theo
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

## Feature và AI

- `GET /api/features`: cần đăng nhập; trả `aiAssistant`/`aiConfigured` đã xét role. Employee luôn nhận
  `aiAssistant=false`; Admin/Manager còn nhận `aiAssistantName` để UI và prompt dùng cùng một tên.
- `POST /api/ai/chat`: feature flag bật và role Admin/Manager. Body gồm tối đa 12 `messages`,
  `language: vi|ja`, `context.pathname?`, `context.search?` và tối đa 20 giá trị `context.pageState?`.
  Manager thiếu team nhận 403; quá giới hạn nhận 429; chưa có API key nhận 503. Response thành công
  trả `answer`, `toolsUsed`, `model`, `queryMode` và `reasoningEnabled`.

Endpoint AI chỉ đọc. Manager scope được áp tại từng tool, không tin `teamName` hoặc context từ client.
