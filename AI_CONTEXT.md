# AI context - Task Manager

Đây là điểm bắt đầu bắt buộc cho AI hoặc lập trình viên tiếp quản dự án. Tài liệu được đối
chiếu với source tại commit `ed5c461` ngày 2026-08-17. Nếu tài liệu và code khác nhau, ưu tiên
`prisma/schema.prisma`, `src/lib/permissions`, các Route Handler trong `src/app/api`, sau đó cập
nhật lại tài liệu trong cùng commit.

## Đọc theo thứ tự

1. [`docs/README.md`](docs/README.md) - mục lục và phạm vi tài liệu.
2. [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) - kiến trúc, route và luồng request.
3. [`docs/DATABASE.md`](docs/DATABASE.md) - schema, quan hệ và quy tắc migration.
4. [`docs/BUSINESS_FLOWS.md`](docs/BUSINESS_FLOWS.md) - nghiệp vụ task, lịch và báo cáo hằng ngày.
5. [`docs/PERMISSIONS.md`](docs/PERMISSIONS.md) - vai trò, quyền và phạm vi dữ liệu.
6. [`docs/API_REFERENCE.md`](docs/API_REFERENCE.md) - hợp đồng API.
7. [`docs/FRONTEND_I18N_THEME.md`](docs/FRONTEND_I18N_THEME.md) - UI, Việt/Nhật và light/dark.
8. [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) và
   [`docs/TESTING_CHECKLIST.md`](docs/TESTING_CHECKLIST.md) trước khi sửa code.
9. [`docs/GIT_WORKFLOW.md`](docs/GIT_WORKFLOW.md) trước khi commit, push, pull hoặc rollback.
10. [`docs/DEPLOYMENT_OPERATIONS.md`](docs/DEPLOYMENT_OPERATIONS.md) khi làm production.

## Bất biến không được phá vỡ

- Production dùng SQLite tại `/var/lib/task-manager/task-manager.db`; không seed production.
- `User.username` map vào cột database cũ tên `email`. Không đổi nếu chưa có migration.
- Primary Admin (`isPrimaryAdmin = true`) không được hạ quyền, khóa hoặc xóa qua UI/API.
- Vô hiệu hóa/kích hoạt account phải đồng bộ `User.isActive` và Employee liên kết trong transaction.
  Employee inactive bị ẩn khỏi lịch/các luồng active; danh sách task dùng nhãn inactive thay cho tên
  và mã thật, nhưng dữ liệu task/lịch sử cũ không được xóa.
- Admin luôn toàn quyền. Manager/Employee có permission JSON; mọi API phải tự kiểm tra quyền.
- Quyền tạo/sửa/xóa task sản phẩm (`TASK_CREATE/EDIT/DELETE`) tách biệt với quyền công việc hằng
  ngày (`DAILY_TASK_CREATE/EDIT/DELETE`). Kiểm quyền theo `workType` ở server.
- Employee chỉ đọc dữ liệu thành viên active cùng nhóm; task đồng đội là chỉ đọc. Không có nhóm
  thì phạm vi chỉ là chính mình.
- Một task chỉ có một người phụ trách hiện tại. DAILY nhiều người được biểu diễn bằng nhiều Task độc
  lập cùng `assignmentGroupId`, không phải mảng assignee trên một Task. Manager chỉ tạo nhóm này cho
  Employee active cùng `teamId`; từng bản có progress/status/NIPPO riêng. Giao/chuyển/thu hồi phải
  duy trì assignment history và change log.
- Manager có `DAILY_TASK_CREATE` được chọn nhiều người trong nhóm cho DAILY dù không có `TASK_ASSIGN`.
  Thiếu `TASK_ASSIGN` thì Manager phải chọn ít nhất một người, không được tạo DAILY chưa phân công.
- Task chưa phân công chỉ ở `/waiting-tasks`; task có assignee mới vào lịch chính.
- Ở `/tasks`, filter `status` và `workType` độc lập; status trống không được tự loại DAILY, workType
  trống phải gồm PRODUCT + DAILY. List/group/export phải gửi cùng filter.
- Lịch tháng có dialog timeline 24 giờ khi bấm tiêu đề/ô ngày; hàng giữ theo nhóm/nhân viên và thanh
  đặt theo phút. Phải dùng `visibleTasks` để giữ filter và chỉ đưa Employee active vào dialog.
- Khi bật hiển thị completed, thanh `COMPLETED` dùng màu emerald + sọc + dấu `✓` ở cả hai chế độ lịch.
- `COMPLETED` đặt tiến độ 100%; mặc định completed/cancelled không hiện trên lịch. Task sản phẩm chỉ
  quá hạn từ ngày kế tiếp sau `plannedEndDate`; DAILY và task `WAITING` không bao giờ báo quá hạn.
- Mã task được phép trùng và sửa. Dạng sản phẩm là `<PRODUCT_CODE>` hoặc
  `<PRODUCT_CODE>-<phần tự nhập>`, ví dụ `GATE-2.22.4`.
- Task `DAILY` cần `dailyCategory`, task `PRODUCT` cần Product. Category lưu dạng text không FK để
  giữ lịch sử và giá trị tự nhập.
- DAILY có cặp `plannedStartTime`/`plannedEndTime` dạng `HH:mm`; không gộp vào DateTime ngày và không
  tự đồng bộ với số giờ NIPPO.
- Mọi UI phải kiểm tra `vi`, `ja`, light và dark. Không dịch code, username, tên người/nhóm hoặc dữ
  liệu người dùng nhập.
- Audit log chỉ Admin đọc từ Cài đặt tại `/settings/audit-logs`. Mutation quan trọng gọi `recordAuditLog()` sau khi thành
  công; không ghi password/hash/token/cookie. Log lưu snapshot actor để còn đọc được sau khi xóa account.

## Quy trình tối thiểu

1. Đọc source và migration liên quan; không suy đoán từ tài liệu cũ.
2. Giữ nguyên thay đổi không liên quan trong worktree.
3. Sửa server authorization trước hoặc cùng UI permission.
4. Đổi schema thì tạo/đọc migration, backup trước deploy và commit schema + migration.
5. Chạy `npm run lint`, `npm run build` và checklist nghiệp vụ phù hợp.
6. Kiểm tra diff, chỉ stage file thuộc thay đổi và cập nhật tài liệu nếu hành vi đổi.

## Repository tại thời điểm viết

- Remote: `https://github.com/haidanghuynh/task-manager.git`
- Nhánh production: `master`
- Commit đã push gần nhất: `ed5c461 feat: manage daily work categories`
- Có thể có file local không theo dõi: `.agents/`, `.claude/`, `.windsurf/`, `.local-logs/`,
  `skills-lock.json`, `temp-test.txt`. Không dùng `git add .`; xem `docs/GIT_WORKFLOW.md`.
