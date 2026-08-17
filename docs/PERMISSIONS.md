# Vai trò, quyền và phạm vi dữ liệu

- Admin luôn toàn quyền. Manager/Employee dùng permission JSON; `null` dùng mặc định theo role.
- Permission dependency được thêm bởi `withPermissionDependencies()`.
- Sidebar/page guard chỉ là UX; từng API method phải kiểm auth, permission và data scope.
- Primary Admin không thể hạ role, khóa hoặc xóa; user không tự xóa chính mình.

## Danh sách quyền

| Permission | Cho phép |
|---|---|
| `TASK_VIEW` | Đọc task |
| `TASK_CREATE` | Tạo task sản phẩm |
| `TASK_EDIT` | Sửa task sản phẩm |
| `TASK_DELETE` | Soft-delete task sản phẩm |
| `DAILY_TASK_CREATE` | Tạo công việc hằng ngày |
| `DAILY_TASK_EDIT` | Sửa công việc hằng ngày |
| `DAILY_TASK_DELETE` | Soft-delete công việc hằng ngày |
| `TASK_ASSIGN` | Hàng chờ, giao/chuyển/thu hồi |
| `TASK_IMPORT_EXPORT` | Import/export/bulk task |
| `TASK_UPDATE_OWN` | Cập nhật field hạn chế trên task của mình |
| `SCHEDULE_VIEW` | Xem lịch |
| `REPORT_VIEW` | Dashboard/báo cáo năm |
| `NIPPO_VIEW` | Xem báo cáo hằng ngày |
| `NIPPO_SUBMIT` | Lưu/gửi/xóa báo cáo của mình |
| `NIPPO_MANAGE` | Xem nhóm, ghi/xóa nghỉ |
| `EMPLOYEE_VIEW` | Đọc nhân viên |
| `EMPLOYEE_MANAGE` | Tạo/sửa/xóa nhân viên |
| `EMPLOYEE_IMPORT_EXPORT` | Import/export/bulk nhân viên |
| `TEAM_MANAGE` | Quản lý nhóm/membership |

Mặc định Manager có tất cả, bao gồm ba quyền DAILY, nhưng Admin có thể tùy chỉnh. Employee mặc
định không có quyền tạo/sửa/xóa DAILY; Admin có thể cấp riêng từng quyền. Employee mặc định có `TASK_VIEW`,
`TASK_UPDATE_OWN`, `SCHEDULE_VIEW`, `REPORT_VIEW`, `NIPPO_VIEW`, `NIPPO_SUBMIT`, `EMPLOYEE_VIEW`.

Dependency: action task, kể cả DAILY, thêm `TASK_VIEW`; submit/manage NIPPO thêm `NIPPO_VIEW`;
quản lý/import Employee, tạo task PRODUCT/DAILY, giao task hoặc quản lý team thêm `EMPLOYEE_VIEW`.

Quyền tạo không bao gồm quyền phân công. Nếu không có `TASK_ASSIGN`, task tạo trực tiếp hoặc import
được tự gán cho Employee liên kết với account; không được chọn người khác hoặc đưa task vào hàng
chờ. Muốn chọn assignee/để unassigned phải có `TASK_ASSIGN`.

Tạo DAILY cho nhiều người cần `DAILY_TASK_CREATE`. Admin chọn mọi Employee active; Manager chỉ chọn
Employee active cùng nhóm của tài khoản mà không cần `TASK_ASSIGN`; Employee chỉ tạo cho chính mình. API luôn
kiểm lại phạm vi này, nên chỉnh request từ trình duyệt không thể vượt quyền nhóm.

Khi đổi `workType`, API yêu cầu quyền sửa cả loại hiện tại lẫn loại đích. Ví dụ người chỉ có
`DAILY_TASK_EDIT` không thể đổi một DAILY thành PRODUCT nếu không có thêm `TASK_EDIT`. Import CSV
vẫn cần `TASK_IMPORT_EXPORT`; dòng DAILY còn cần `DAILY_TASK_CREATE`.

## Phạm vi Employee

`getVisibleEmployeeIds()` trả Employee active cùng `teamId`; không có team thì chỉ chính mình.
Employee mặc định chỉ cập nhật task mình đang phụ trách. Nếu được cấp `TASK_EDIT` hoặc
`DAILY_TASK_EDIT`, Employee có thể sửa đầy đủ task đúng loại trong phạm vi cùng nhóm; endpoint
bình luận vẫn chỉ cho Employee bình luận task mình đang phụ trách. Với quyền `TASK_UPDATE_OWN`,
field tự cập nhật chỉ gồm status, progress, ngày thực tế và note.

Manager/Admin hiện không bị giới hạn team. Muốn giới hạn Manager là thay đổi nghiệp vụ lớn phải
sửa đồng bộ mọi API.

## Account

- Manager/Employee phải liên kết Employee active khi tạo/sửa; Admin không bắt buộc.
- Một Employee chỉ liên kết một account.
- Auth yêu cầu Employee liên kết active cho cả Manager và Employee.
- Admin vô hiệu hóa account sẽ đồng bộ Employee liên kết thành inactive; kích hoạt lại đồng bộ active.
  Dữ liệu lịch sử không xóa, nhưng Employee inactive bị loại khỏi danh sách hoạt động/phân công/lịch/NIPPO.

## NIPPO

- `mine`: `NIPPO_VIEW`; lưu/xóa cần `NIPPO_SUBMIT` và Employee link.
- `team`: `NIPPO_MANAGE`; Employee có quyền này vẫn chỉ team mình.
- `overview`: giới hạn cứng role Admin.
- Ghi/xóa nghỉ: `NIPPO_MANAGE` và data scope team.

## Khi thêm quyền

Thêm code/default/dependency; cập nhật account UI + nhãn vi/ja; guard sidebar/page/API; kiểm tra
own/team scope; test Admin, Manager tùy chỉnh và Employee sau khi đổi quyền.

## Lịch sử thao tác

Trang `/settings/audit-logs` trong Cài đặt và API `/api/audit-logs` giới hạn cứng cho role `ADMIN`, không cấp qua danh sách quyền
tùy chỉnh. Manager/Employee không nhìn thấy mục này trên sidebar và server trả `403` nếu gọi trực tiếp.
