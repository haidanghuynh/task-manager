# Checklist kiểm thử

Chưa có unit/integration test runner. Baseline:

```bash
npm run lint
npm run build
```

Không thêm lint error. Với lockfile, nên xác nhận `npm ci` sạch.

## Smoke/UI

- Login đủ CSS/logo, đúng/sai/logout; reload authenticated URL không redirect loop.
- Mở `/` hoặc đăng nhập thành công đi tới `/schedule` khi có `SCHEDULE_VIEW`; tài khoản không có quyền
  xem lịch được đưa về `/dashboard` và không gặp vòng lặp redirect.
- Sidebar đúng permission, logo/logout không chồng; report menu collapse.
- VI/日本語 chuyển hai chiều và giữ sau reload, không sót ngôn ngữ.
- Light/dark trên login và app, giữ sau reload, text/controls đủ contrast.

## Quyền

- Primary Admin không hạ quyền/khóa/xóa; Admin khác quản lý được.
- Vô hiệu hóa account thường: phiên đăng nhập bị chặn, Employee liên kết inactive và không còn trong
  danh sách chọn/lịch/NIPPO; danh sách task giữ task cũ nhưng thay tên/mã bằng nhãn inactive. Kích hoạt
  lại: Employee active, tên thật hiển thị lại và xuất hiện đúng nhóm.
- Manager/Employee link Employee active.
- Custom permission khớp menu và API 403 khi thiếu.
- Cấp riêng DAILY create/edit/delete cho Manager/Employee; quyền PRODUCT không tự cho phép sửa
  DAILY và ngược lại; đổi loại task cần cả hai quyền.
- Account có DAILY create nhưng không có TASK_ASSIGN chỉ tạo/import cho chính mình; không chọn
  đồng đội và không tạo task chờ.
- Employee chỉ cùng team, chỉ sửa task chính mình.

## Task/hàng chờ

- Tạo PRODUCT/DAILY; suffix trống/`2.22.4`; code trùng; sửa full code và employeeCode.
- DAILY: giờ cùng trống/cùng nhập; chặn thiếu một đầu, sai `HH:mm`, cùng ngày end trước start; hiển thị
  đúng ở list/detail/tooltip lịch và round trip CSV. PRODUCT không nhận giờ.
- Admin tạo DAILY cho 2+ người: sinh đúng số Task, cùng `assignmentGroupId`, mỗi người có progress
  riêng và đều xuất hiện đúng trong lịch/NIPPO/xếp hạng.
- Manager có DAILY create nhưng không có TASK_ASSIGN vẫn chọn được nhiều người active cùng nhóm;
  không chọn ai bị chặn, gửi thủ công ID ngoài nhóm phải nhận 403.
- Employee có DAILY create vẫn chỉ tạo được cho chính mình; tài khoản không liên kết Employee bị chặn.
- Unassigned chỉ ở hàng chờ; assign xong chỉ list/lịch; reassign/unassign reason trống.
- Completed tự 100%, mặc định khỏi lịch; completed/cancelled không unassign.
- Sau khi sửa task và bấm Lưu, chi tiết mới hiển thị ngay không cần F5; nút Lưu khóa khi request đang chạy.
- Có thể rút ngắn ngày kết thúc nếu vẫn bằng/sau ngày bắt đầu; sửa field khác không bị chặn bởi sản phẩm cũ đã inactive.
- Khi chỉ sửa ngày, form không gửi/validate lại mã task cũ; chỉ khi đổi mã task mới áp dụng regex mã hiện tại.
- Import/export task/Employee round trip UTF-8.
- Filter/group assignee/team; group/status đọc được dark.
- "Tất cả trạng thái" + "Tất cả công việc" gồm cả PRODUCT và DAILY; chọn riêng PRODUCT/DAILY phải
  lọc đúng ở list, group và export.

## Lịch

- Chọn tháng đổi đúng dữ liệu/số ngày.
- Task một ngày, cắt đầu/cuối tháng, overlap đủ lane.
- Bấm tiêu đề/ô ngày mở timeline 24 giờ cùng hàng nhóm/nhân viên; thanh bắt đầu đúng phút và gồm ô
  giờ kết thúc (`13:00–14:00` phủ ô 13 + 14),
  task không giờ chạy cả ngày, overlap có lane riêng, link mở đúng task; bộ lọc PRODUCT/DAILY/completed
  được giữ và Employee inactive không xuất hiện.
- Bar chạm vạch cuối, không vỡ góc; sticky header/cột khi scroll; vùng đủ cao.
- Lịch tháng có thêm ngày 1–7 của tháng kế tiếp bên phải; header và thanh task qua tháng đồng bộ khi
  cuộn ngang, ngày mở rộng dùng cùng màu với tháng hiện tại và có nhãn `ngày/tháng`. Trên desktop có thể giữ chuột ở vùng
  trống rồi kéo trái/phải mà không vô tình mở chi tiết ngày.
- Mặc định theo team, collapse; legend Product/category động; includeCompleted đúng. Task hoàn thành
  có màu xanh emerald, sọc, dấu `✓` và chú thích trạng thái ở cả lịch tháng/timeline giờ.

## Dashboard/report

- Month/range/year khớp `/tasks` cùng filter; member/team ranking và link đúng.
- Annual report và DAILY count.
- NIPPO draft/submit/edit/delete, task/dòng tự do, giờ/progress/previous progress.
- Manager xem team và absence (reason optional); Admin overview mọi team; Employee không vượt scope.
- DAILY và task WAITING đã qua ngày kết thúc không tăng số Quá hạn; PRODUCT ở PLANNED/IN_PROGRESS cùng điều kiện vẫn tăng.

## Production

- systemd, nginx, health URL tốt; login/ghi không chậm bất thường.
- Journal không Prisma/env/permission error.
- Backup timer active và backup pass `PRAGMA integrity_check`.

## Lịch sử thao tác

- Admin vào Cài đặt → Lịch sử thao tác (`/settings/audit-logs`), lọc theo từ khóa/hành động/đối tượng/ngày và chuyển trang đúng.
- Manager/Employee không thấy menu audit; gọi trực tiếp API trả `403`.
- Tạo/sửa/xóa/phân công task, account, employee, team, cấu hình và NIPPO sinh log sau khi thành công.
- Chi tiết log không chứa password, passwordHash, token, cookie hoặc Authorization.

## Trợ lý AI

- Flag tắt: không có nút và API chat bị khóa; bật nhưng thiếu key hiện cảnh báo cấu hình.
- Admin dùng được toàn hệ thống; Manager chỉ có dữ liệu team mình; Employee không thấy UI và API 403.
- Câu hỏi lịch gọi tool, không bịa số; availability nêu rõ task không giờ chỉ tính workload.
- Hỏi “ngày X sản phẩm Gate có ai đang làm” trả đúng người/task/progress; phân biệt `IN_PROGRESS` với
  task chỉ được lên lịch hoặc phân công và vẫn giữ scope nhóm của Manager.
- Rate limit, giới hạn input, lỗi provider và reset hội thoại hoạt động; audit không lưu nguyên câu hỏi.
- Panel desktop/mobile, tiếng Việt/Nhật và light/dark đủ tương phản.
- Markdown AI render đúng in đậm, danh sách, bảng GFM, code và link; bảng cuộn ngang, HTML thô không chạy.
- Tên `AI_ASSISTANT_NAME` đồng bộ nút/header/prompt; AI thỉnh thoảng gọi đúng `User.name`, không dùng
  “anh/chị/bạn”, không lặp tên trong mọi câu và không nhận tên giả từ request client.
- Kéo nút Tiểu Mỹ bằng chuột/cảm ứng không mở nhầm chat, không ra ngoài viewport; vị trí giữ sau reload,
  tự clamp khi resize và panel vẫn mở cố định bên phải.
- UI tiếng Việt nhưng hỏi tiếng Nhật phải trả lời tiếng Nhật và ngược lại; câu trộn khó xác định dùng
  ngôn ngữ UI, không dịch tên người/nhóm/sản phẩm, username, task code hoặc tên task nhập tay.
- Sau nhiều câu tiếng Việt, hỏi tiếp bằng tiếng Nhật trong cùng hội thoại vẫn phải trả lời hoàn toàn bằng
  tiếng Nhật; lịch sử cũ không được lấn át ngôn ngữ của câu hỏi mới nhất.
- Câu hỏi dữ liệu đơn giản trả `queryMode=fact`; câu đề xuất/so sánh trả `analysis`, bật thinking khi
  provider hỗ trợ và tự fallback nếu không hỗ trợ.
- Hỏi task quá hạn/đến hạn/sắp đến hạn gọi `get_task_risks`, không tính DAILY hoặc WAITING là quá hạn và
  dùng đúng quy tắc chỉ trễ từ ngày kế tiếp sau ngày kết thúc.
- Trên `/schedule`, câu “tháng đang xem” dùng đúng `selectedMonth`; thay filter/ngày rồi hỏi lại nhận
  context mới. Context client giả không vượt được scope team của Manager.
- Task link trong câu trả lời mở đúng `/tasks/[id]` cùng tab; link ngoài mở tab mới an toàn.
- Tạo hơn 100 task phù hợp filter: `matchedTaskCount`, `byStatus`, `byProduct`, `byEmployee` và số chưa
  phân công vẫn tính toàn bộ; chỉ mảng chi tiết báo `truncated=true`.
