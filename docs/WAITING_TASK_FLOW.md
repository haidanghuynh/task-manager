# Flow Task chờ phân công

Flow này dùng khi đã có thông tin task và kế hoạch thời gian nhưng chưa quyết
định người thực hiện.

## Luồng nghiệp vụ

```text
Tạo hoặc import task chờ
→ Task chưa có người phụ trách
→ Hiển thị trong bảng Task chờ phân công
→ Hiển thị trong Lịch task chờ theo sản phẩm
→ Manager chọn task và nhân viên
→ Phân công
→ Task rời bảng/lịch chờ
→ Task xuất hiện trong Lịch phân công chính
```

Task đã phân công có thể quay lại hàng chờ bằng thao tác **Thu hồi về chờ phân
công** trên trang chi tiết task. Lý do là thông tin tùy chọn:

```text
Task đã phân công
→ Admin/Manager có thể nhập lý do thu hồi
→ Gỡ người phụ trách hiện tại
→ Task rời Lịch phân công
→ Task xuất hiện lại trong bảng và Lịch task chờ
```

Hệ thống không sao chép task khi phân công. Cùng một bản ghi được chuyển từ:

```text
currentAssigneeId = null
```

sang:

```text
currentAssigneeId = <nhân viên được chọn>
```

Trạng thái thực hiện vẫn độc lập và dùng `PLANNED`, `IN_PROGRESS`, `WAITING`,
`COMPLETED`, `CANCELLED`. Không tạo trạng thái task mới và không tạo nhân viên
giả tên “Chưa phân công”.

## Giao diện

Màn hình `/waiting-tasks` chỉ dành cho Admin và Manager, gồm hai phần.

### Bảng task chờ

- Tạo task chờ mà không chọn người phụ trách.
- Import/export CSV.
- Tìm theo mã hoặc tên task.
- Lọc theo sản phẩm và độ ưu tiên.
- Sửa hoặc xóa task trước khi phân công.
- Chọn một hoặc nhiều task rồi giao cho một nhân viên.

Lý do trong các thao tác phân công, chuyển người phụ trách và thu hồi đều không
bắt buộc. Nếu được nhập, lý do sẽ được lưu trong lịch sử phân công.

Khi phân công, hệ thống kiểm tra nhân viên còn hoạt động, ghi
`TaskAssignmentHistory`, ghi `TaskChangeLog` và trả về cảnh báo trùng lịch. Chỉ
task đang chưa có người phụ trách mới được dùng trong thao tác hàng loạt này.

Khi thu hồi, hệ thống đóng bản ghi phân công hiện tại, ghi lý do và change log,
nhưng giữ nguyên trạng thái, tiến độ, sản phẩm và thời gian của task. Không thể
thu hồi task `COMPLETED` hoặc `CANCELLED`.

### Lịch task chờ

Lịch nằm dưới bảng task chờ và có timeline theo tháng giống Lịch phân công:

- nhóm theo sản phẩm;
- mỗi task là một hàng;
- màu thanh lấy từ cấu hình sản phẩm;
- hiển thị ngày và thứ;
- chuyển tháng trước/sau hoặc về tháng hiện tại;
- thu gọn/mở rộng từng sản phẩm hoặc tất cả;
- bấm thanh task để mở chi tiết.

Lịch task chờ chỉ lấy task có `currentAssigneeId = null`. Lịch phân công chính
chỉ đặt task vào hàng nhân viên sau khi `currentAssigneeId` có giá trị. Vì vậy
một task không xuất hiện đồng thời ở cả hai lịch.

## Tạo và import

Task chờ cần có tối thiểu:

- sản phẩm;
- tên task;
- ngày bắt đầu dự kiến;
- ngày kết thúc dự kiến, nếu để trống sẽ bằng ngày bắt đầu;
- phần mã phía sau là tùy chọn.

CSV giữ cấu trúc danh sách task hiện tại:

```csv
taskCode,taskName,description,productCode,assigneeCode,plannedStartDate,plannedEndDate,actualStartDate,actualEndDate,status,progress,priority,note
GATE-2.22.4,Fix login,,GATE,,2026-08-13,2026-08-15,,,PLANNED,0,HIGH,
```

Ở màn hình Task chờ, `assigneeCode` luôn được bỏ trống khi import để tránh task
đi thẳng vào lịch phân công. Import tối đa 1.000 dòng mỗi lần.

## Phân quyền

| Chức năng | ADMIN | MANAGER | EMPLOYEE |
|---|:---:|:---:|:---:|
| Xem task chờ và lịch chờ | Có | Có | Không |
| Tạo/import/sửa/xóa task chờ | Có | Có | Không |
| Phân công hàng loạt | Có | Có | Không |
| Thu hồi task đã giao về hàng chờ | Có | Có | Không |
| Xem task sau khi được giao | Có | Có | Task của mình |

## API liên quan

- `POST /api/tasks` với `assigneeId` rỗng: tạo task chờ.
- `GET /api/tasks?assignment=unassigned`: lấy task chờ.
- `POST /api/tasks/bulk`: import; `assigneeCode` có thể rỗng.
- `POST /api/tasks/assign`: phân công nhiều task chờ.
- `POST /api/tasks/[id]/unassign`: thu hồi một task đã giao về hàng chờ.
- `DELETE /api/tasks/[id]`: xóa mềm task chờ.
