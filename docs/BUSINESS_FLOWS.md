# Luồng nghiệp vụ

## Loại công việc

```text
PRODUCT -> Product active -> PRODUCT_CODE[-suffix]
DAILY   -> category active hoặc text tự nhập -> DAILY[-suffix]
```

Hai loại dùng chung Task/status/assignee/history/lịch. DAILY ghi họp, đào tạo, hỗ trợ, tài liệu,
báo cáo... Dashboard/lịch có thể include/hide DAILY; màu/nhãn từ cấu hình với fallback.
DAILY có thể đặt cặp giờ dự kiến `HH:mm` (bắt đầu/kết thúc). Cả hai cùng trống hoặc cùng có giá trị;
nếu cùng ngày thì giờ kết thúc không được trước giờ bắt đầu. Giờ dự kiến chỉ để lập lịch, không tự
ghi số giờ thực tế vào NIPPO.
Quyền tạo/sửa/xóa PRODUCT và DAILY được cấp riêng. Admin luôn có tất cả; Admin có thể bật từng
quyền DAILY cho Manager hoặc Employee trong màn hình Tài khoản.

## Tạo, giao, chuyển, thu hồi

```text
Tạo có assignee -> history -> danh sách task + lịch chính
Tạo không assignee -> hàng chờ + timeline chờ
Hàng chờ -> chọn 1..200 task + Employee -> history/log -> lịch chính
Task đã giao -> reassign hoặc unassign -> đóng history cũ
Unassign -> currentAssigneeId null -> quay lại hàng chờ
```

Overlap chỉ cảnh báo. Một Task chỉ một current assignee. Lý do giao/chuyển/thu hồi không bắt buộc.
Không thu hồi completed/cancelled.

Với công việc `DAILY` có nhiều người tham gia (ví dụ họp/đào tạo), hệ thống tạo một bản Task cho
mỗi người và liên kết các bản bằng cùng `assignmentGroupId`. Nội dung, mã và thời gian ban đầu giống
nhau, nhưng trạng thái/tiến độ/NIPPO của từng người độc lập. Admin được chọn mọi Employee active;
Manager chỉ được chọn Employee active có cùng `teamId`; Employee chỉ tạo cho chính mình. Tạo nhiều
người cần `DAILY_TASK_CREATE`. Manager được phân công trong chính nhóm mà không cần `TASK_ASSIGN`;
quyền `TASK_ASSIGN` vẫn điều khiển phân công task sản phẩm, chuyển task và tạo task chờ. Sửa/xóa một bản không tự lan sang các bản
còn lại trong nhóm liên kết.

## Status/lịch

Status: `PLANNED`, `IN_PROGRESS`, `WAITING`, `COMPLETED`, `CANCELLED`. Source không áp state
machine cứng. COMPLETED tự 100% và actual end nếu thiếu. Task sản phẩm còn mở chỉ được tính quá hạn khi
ngày hiện tại theo `Asia/Ho_Chi_Minh` lớn hơn ngày kết thúc; trong toàn bộ ngày kết thúc task vẫn
còn hạn.

- `/tasks`: task đã giao, list/group assignee/group team.
  Bộ lọc trạng thái và loại công việc độc lập: "Tất cả trạng thái" không loại DAILY; khi loại công
  việc là "Tất cả công việc", kết quả gồm cả PRODUCT và DAILY ở mọi trạng thái được phép hiển thị.
- `/waiting-tasks`: task chưa giao, table + timeline.
- `/schedule`: task có assignee giao với tháng, mặc định theo team; nhiều overlap thành nhiều lane.
  Bấm tiêu đề ngày hoặc ô ngày mở timeline ngày: hàng vẫn theo nhóm/nhân viên, trục ngang đổi thành
  24 mốc giờ. Task có giờ bắt đầu ở đúng phút và thanh hiển thị bao gồm cả ô của giờ kết thúc (ví dụ
  `13:00–14:00` phủ ô 13 và 14); task không giờ chạy cả ngày. Nội dung tuân theo các bộ lọc đang bật.
- Header có ngày/thứ; legend động. Completed/cancelled mặc định ẩn, có includeCompleted. Khi bật,
  task `COMPLETED` dùng thanh xanh emerald có sọc và dấu `✓` ở cả lịch tháng lẫn timeline theo giờ.

## Báo cáo hằng ngày

### Cá nhân

Chọn ngày -> API trả task liên quan -> chọn task hoặc dòng tự do -> nhập nội dung, giờ, progress ->
lưu nháp/gửi. Có thể sửa/xóa report đã lưu. Tổng giờ là tổng items. `blockers`/`nextPlan` còn trong
schema để tương thích nhưng UI/route ghi null, không tự đưa lại.

### Nhóm

Người có `NIPPO_MANAGE` xem từng thành viên và item (task, giờ, progress), ghi nghỉ cả/nửa ngày;
lý do tùy chọn. Employee có quyền vẫn chỉ team mình.

### Admin

Admin overview mọi nhóm và mở chi tiết kiểu danh sách task. API còn trả KPI team/totals nhưng UI
đã bỏ các ô tổng members/submitted/missing/absence/hours theo yêu cầu.

## Dashboard/ranking

Filter tháng/khoảng ngày/năm, theo member/team, có include DAILY. Metric: total, completed,
in-progress, cancelled, overdue, completion rate. Link member mở `/tasks` cùng kỳ/filter. Khi sửa
thuật toán phải đối chiếu `/tasks` cùng deleted/assigned/workType/date scope.

## Account/nhân sự

Tạo Employee trước -> Admin tạo account liên kết cho Manager/Employee -> tùy chỉnh permission.
Admin luôn full, Primary Admin bất biến. Xóa account là inactive/ẩn có dấu; xóa Employee là
permanent và cần xác nhận.
Vô hiệu hóa account sẽ đồng thời đặt Employee liên kết thành inactive trong cùng transaction. Người
dùng bị đăng xuất/chặn đăng nhập và Employee biến khỏi danh sách active, bộ chọn phân công, lịch và
NIPPO; task/lịch sử/báo cáo cũ vẫn giữ nguyên. Kích hoạt account sẽ kích hoạt lại Employee và giữ nhóm.
Trong danh sách task, task cũ của Employee inactive vẫn tồn tại nhưng tên/mã được thay bằng nhãn
"Nhân viên đã vô hiệu hóa". Lịch phân công không tạo hàng cho Employee inactive.
