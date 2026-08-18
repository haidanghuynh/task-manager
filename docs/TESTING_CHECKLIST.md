# Checklist kiểm thử

Chưa có unit/integration test runner. Baseline:

```bash
npm run lint
npm run build
```

Không thêm lint error. Với lockfile, nên xác nhận `npm ci` sạch.

## Smoke/UI

- Login đủ CSS/logo, đúng/sai/logout; reload authenticated URL không redirect loop.
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
