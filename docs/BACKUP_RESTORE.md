# Backup và khôi phục database

Tài liệu này áp dụng cho bản cài AlmaLinux 9.8 sử dụng SQLite.

## Vị trí dữ liệu

| Nội dung | Đường dẫn |
|---|---|
| Database đang sử dụng | `/var/lib/task-manager/task-manager.db` |
| Thư mục backup | `/var/backups/task-manager/` |
| Chương trình backup | `/usr/local/sbin/task-manager-backup` |
| Systemd service | `task-manager-backup.service` |
| Systemd timer | `task-manager-backup.timer` |

## Cơ chế backup tự động

Installer tạo một systemd timer với các đặc điểm:

- chạy hằng ngày bằng `OnCalendar=daily`;
- trì hoãn ngẫu nhiên tối đa 15 phút để tránh nhiều dịch vụ chạy cùng lúc;
- dùng `Persistent=true`, vì vậy máy tắt đúng lịch sẽ chạy bù sau khi bật lại;
- dùng lệnh `.backup` của SQLite để tạo bản sao nhất quán khi ứng dụng đang chạy;
- tự động xóa file `task-manager-*.db` cũ hơn 14 ngày.

Tên file backup hằng ngày có dạng:

```text
task-manager-YYYYMMDD-HHMMSS.db
```

Mỗi lần chạy lại installer, nếu database đã tồn tại, installer tạo thêm:

```text
db-before-install-YYYYMMDD-HHMMSS.db
```

Các file `db-before-install-*` không nằm trong quy tắc tự xóa 14 ngày. Quản trị
viên cần kiểm tra và dọn các file này thủ công khi không còn cần thiết.

## Kiểm tra lịch và các bản backup

```bash
sudo systemctl status task-manager-backup.timer
sudo systemctl list-timers task-manager-backup.timer
sudo ls -lh /var/backups/task-manager/
```

Xem log các lần backup:

```bash
sudo journalctl -u task-manager-backup.service
```

## Chạy backup thủ công

```bash
sudo systemctl start task-manager-backup.service
sudo systemctl status task-manager-backup.service --no-pager
sudo ls -lt /var/backups/task-manager/ | head
```

`task-manager-backup.service` là service `oneshot`, vì vậy trạng thái
`inactive (dead)` sau khi chạy thành công là bình thường. Kiểm tra `Result=success`
hoặc log để xác nhận.

## Kiểm tra tính toàn vẹn

Chọn đúng file cần kiểm tra:

```bash
BACKUP_FILE=/var/backups/task-manager/task-manager-20260811-150000.db
sudo sqlite3 "$BACKUP_FILE" "PRAGMA integrity_check;"
```

Kết quả phải là:

```text
ok
```

Không phục hồi từ file báo lỗi integrity.

## Khôi phục database

Khôi phục sẽ thay toàn bộ dữ liệu hiện tại bằng dữ liệu trong file backup. Thực
hiện trong thời gian bảo trì và đảm bảo không có người đang sử dụng ứng dụng.

```bash
BACKUP_FILE=/var/backups/task-manager/task-manager-20260811-150000.db

sudo test -f "$BACKUP_FILE"
sudo sqlite3 "$BACKUP_FILE" "PRAGMA integrity_check;"
sudo systemctl stop task-manager

sudo cp -a /var/lib/task-manager/task-manager.db \
  /var/backups/task-manager/db-before-restore-$(date +%Y%m%d-%H%M%S).db

sudo install -o taskmanager -g taskmanager -m 0600 \
  "$BACKUP_FILE" /var/lib/task-manager/task-manager.db

sudo systemctl start task-manager
sudo systemctl status task-manager --no-pager
```

Sau đó kiểm tra ứng dụng và log:

```bash
curl -I http://127.0.0.1:3000/login
sudo journalctl -u task-manager -n 100 --no-pager
```

Nếu bản vừa phục hồi không đúng, dừng service và phục hồi lại file
`db-before-restore-*` vừa tạo.

## Backup ra thiết bị khác

Backup hiện tại nằm cùng server với database. Cơ chế này bảo vệ khỏi lỗi thao tác
hoặc migration nhưng không bảo vệ khi ổ đĩa hoặc cả server bị hỏng.

Nên đồng bộ `/var/backups/task-manager/` hằng ngày sang một trong các nơi sau:

- NAS nội bộ;
- máy backup khác;
- ổ lưu trữ được quản lý riêng.

Nên giữ ít nhất một bản ngoài server, kiểm tra quyền truy cập và thử phục hồi
định kỳ. Database có thể chứa thông tin tài khoản và dữ liệu nội bộ nên thư mục
backup không được chia sẻ công khai.

## Checklist vận hành

- Hằng ngày hoặc hằng tuần kiểm tra timer vẫn hoạt động.
- Kiểm tra dung lượng và ngày cập nhật của file backup mới nhất.
- Định kỳ chạy `PRAGMA integrity_check` trên một bản backup.
- Thử khôi phục trên máy thử nghiệm, không đợi đến khi có sự cố.
- Theo dõi và dọn các file `db-before-install-*`, `db-before-restore-*` cũ.
- Duy trì ít nhất một bản backup nằm ngoài server ứng dụng.
