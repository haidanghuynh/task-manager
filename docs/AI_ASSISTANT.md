# Trợ lý AI

Trợ lý AI là tính năng đọc dữ liệu lịch và khối lượng công việc bằng ngôn ngữ tự nhiên. Tính năng
mặc định tắt, không thay đổi database và không tự tạo, sửa, xóa hoặc phân công task.

## Bật/tắt

Local dùng `.env`; production dùng `/etc/task-manager/task-manager.env`:

```dotenv
AI_ASSISTANT_ENABLED="true"
AI_ASSISTANT_NAME="Tiểu Mỹ"
AI_MODEL="deepseek-v4-flash"
DEEPSEEK_API_KEY="<api-key-phia-server>"
AI_RATE_LIMIT_PER_MINUTE="10"
AI_DAILY_CAPACITY_HOURS="8"
```

`AI_ASSISTANT_ENABLED=false` là mặc định an toàn. API key không dùng tiền tố `NEXT_PUBLIC_` và không
được gửi xuống browser. Sau khi đổi env, restart process; không cần migration hay seed. Production cần
cho phép kết nối HTTPS outbound tới `api.deepseek.com:443`.

`AI_ASSISTANT_NAME` điều khiển đồng thời tên trên nút/panel và danh tính trong system prompt. Backend
lấy `User.name` trực tiếp từ database để AI có thể gọi tên hiển thị khi tự nhiên; không tin tên do
client gửi. Prompt cấm gọi cố định “anh/chị/bạn” và không lặp tên ở mọi câu trả lời.

Backend xác định ngôn ngữ trực tiếp từ câu hỏi mới nhất và gửi chỉ thị bắt buộc cho từng lượt: hỏi tiếng
Nhật trả lời tiếng Nhật, hỏi tiếng Việt trả lời tiếng Việt. Câu trộn hoặc không xác định mới dùng ngôn ngữ
UI làm fallback. Lịch sử hội thoại và dữ liệu tool không được đổi ngôn ngữ trả lời; không dịch tên
người/nhóm/sản phẩm, username, task code hoặc tên task do người dùng nhập.

```bash
sudo systemctl restart task-manager
sudo journalctl -u task-manager -n 100 --no-pager
```

### Bật trên production (từng bước)

Máy production cài bằng installer dùng `/etc/task-manager/task-manager.env`. Bản cài cũ có thể chưa
có dòng cấu hình AI nào; khi đó AI đang tắt (mặc định `false` khi thiếu biến) và cần thêm thủ công.

1. Kiểm tra cấu hình AI hiện có:

   ```bash
   sudo grep -E '^(AI_|DEEPSEEK_API_KEY)' /etc/task-manager/task-manager.env
   ```

   Không có output nghĩa là chưa cấu hình AI.

2. Thêm cấu hình nếu thiếu:

   ```bash
   sudo tee -a /etc/task-manager/task-manager.env > /dev/null <<'EOF'
   AI_ASSISTANT_ENABLED="true"
   AI_ASSISTANT_NAME="Tiểu Mỹ"
   AI_MODEL="deepseek-v4-flash"
   DEEPSEEK_API_KEY="<api-key-phia-server>"
   AI_RATE_LIMIT_PER_MINUTE="10"
   AI_DAILY_CAPACITY_HOURS="8"
   EOF
   ```

3. Restart và xem log:

   ```bash
   sudo systemctl restart task-manager
   sudo journalctl -u task-manager -n 100 --no-pager
   ```

   `status=143/n/a` khi restart là SIGTERM dừng process cũ, không phải lỗi; chỉ cần thấy `✓ Ready`.

4. Kiểm tra mạng ra DeepSeek (tường lửa có thể chặn outbound 443):

   ```bash
   curl -sS -o /dev/null -w "%{http_code}\n" https://api.deepseek.com
   ```

   Có mã HTTP (ví dụ `401`) nghĩa là kết nối được — `401` chỉ vì lệnh curl không kèm API key. Treo
   hoặc timeout nghĩa là cần mở tường lửa outbound tới `api.deepseek.com:443`.

5. Xác nhận bằng UI: đăng nhập Admin/Manager, thấy nút "Tiểu Mỹ" là thành công; Employee không thấy.

## Quyền và phạm vi

- Admin thấy chatbox và có thể hỏi toàn bộ hoặc nêu tên một nhóm.
- Manager thấy chatbox nhưng từng tool luôn ép theo `teamId` của Employee liên kết. Manager không có
  team bị chặn.
- Employee không nhận feature flag, không thấy chatbox và `/api/ai/chat` trả `403` nếu gọi trực tiếp.
- Khi feature flag tắt, chatbox không hiển thị và API chat trả `404 FEATURE_DISABLED`.

UI guard chỉ là trải nghiệm; kiểm tra role, team và feature flag đều lặp lại ở server.

## Luồng request

```text
Chatbox -> POST /api/ai/chat -> auth/role/rate limit -> DeepSeek tool call
        -> tool Prisma chỉ đọc, ép team -> DeepSeek diễn giải -> chatbox
```

Backend phân loại từng câu thành `fact` hoặc `analysis`. Câu hỏi dữ liệu thông thường tắt thinking để
phản hồi nhanh; câu đề xuất/so sánh bật thinking và tự hạ về chế độ thường nếu provider không hỗ trợ.
Prompt được giữ ngắn, không chứa câu trả lời mẫu cố định. Audit lưu mode và trạng thái thinking nhưng
không lưu nội dung câu hỏi.

Tool hiện có:

- `get_available_members`: ngày nghỉ, giờ DAILY, số task active và giờ trống ước tính trong một ngày.
- `get_team_workload`: khối lượng task active theo người trong khoảng ngày.
- `get_schedule_conflicts`: cặp DAILY có giờ bị chồng nhau trong một ngày.
- `get_task_activity`: tìm task theo ngày/khoảng ngày, sản phẩm, nhân viên, trạng thái, loại công việc
  và tình trạng phân công; trả cả danh sách chi tiết lẫn tổng hợp theo người/sản phẩm/trạng thái.
- `get_task_risks`: task PRODUCT đã giao đang quá hạn, đến hạn hôm nay hoặc sắp đến hạn. Quy tắc quá
  hạn bắt đầu từ ngày kế tiếp sau `plannedEndDate`; bỏ DAILY, WAITING, completed và cancelled.

`get_task_activity` tính summary trên toàn bộ kết quả trước khi giới hạn tối đa 100 dòng chi tiết. Task
chi tiết có URL nội bộ để câu trả lời có thể liên kết trực tiếp tới `/tasks/[id]`. Tìm team, product và
employee hỗ trợ khớp chính xác hoặc khớp một phần duy nhất; kết quả mơ hồ buộc người dùng nêu rõ hơn.

Prompt yêu cầu trả lời linh hoạt theo ý định thay vì một template cố định. Các câu “đang làm” được
phân biệt với “đã được phân công”: `IN_PROGRESS` là đang thực hiện, còn lịch phân công có thể gồm cả
`PLANNED`, `IN_PROGRESS` và `WAITING` có assignee.

Giờ trống chỉ là ước tính. `AI_DAILY_CAPACITY_HOURS` mặc định 8; giờ DAILY và ngày nghỉ làm giảm công
suất. PRODUCT hoặc task không nhập giờ vẫn tăng workload nhưng không trừ được giờ chính xác. AI phải
nêu giới hạn này khi đề xuất.

Chatbox gửi pathname, query string và page state nhỏ, không tin cậy. Trang lịch hiện gửi tháng/ngày
đang chọn, chế độ nhóm/nhân viên và các cờ lọc. Context chỉ dùng để hiểu “tháng đang xem” hoặc “ngày
này”; câu hỏi viết rõ luôn được ưu tiên. Lịch sử được cắt tối đa 12 tin và luôn bắt đầu từ một tin user
để tránh gửi một assistant message bị mất câu hỏi gốc.

## An toàn và audit

- Model không nhận Prisma, SQL, cookie, token hoặc API key; chỉ nhận kết quả tool đã rút gọn.
- Input tối đa 2.000 ký tự/tin, 12 tin gần nhất và mặc định tối đa 10 request/phút/user.
- Tool chỉ đọc và không có endpoint mutation trong danh sách AI.
- Audit log ghi model, tên tool, số tin và độ dài câu hỏi; không lưu nguyên nội dung hội thoại.
- Prompt không thay thế authorization. Mọi tham số do model sinh được backend validate và ép scope.
- Câu trả lời được render bằng `react-markdown` + `remark-gfm`: hỗ trợ tiêu đề, in đậm, danh sách,
  link, code và bảng. HTML thô bị bỏ qua; link mở tab mới với `noopener noreferrer`.

## Kiểm tra nhanh

1. Flag tắt: cả ba role không thấy nút; API chat trả `404` sau khi đã đăng nhập Admin/Manager.
2. Flag bật nhưng thiếu key: Admin/Manager thấy cảnh báo cấu hình, Employee vẫn không thấy.
3. Admin hỏi một nhóm cụ thể; Manager hỏi tương tự nhưng chỉ nhận nhóm mình.
4. Kiểm tra tiếng Việt/Nhật, light/dark, mobile full-screen và desktop panel bên phải.
5. Kiểm tra audit chỉ có metadata, không có nội dung câu hỏi hoặc bí mật.

Nút Tiểu Mỹ khi chatbox đóng có thể kéo bằng chuột hoặc cảm ứng. Vị trí được giới hạn trong viewport,
hít vào cạnh khi thả gần mép và lưu ở `localStorage` key `task-manager-ai-button-position`. Panel mở
vẫn cố định bên phải; kéo không được tính là click mở chat.
