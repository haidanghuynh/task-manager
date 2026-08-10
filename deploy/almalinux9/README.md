# Triển khai nhanh trên AlmaLinux 9.8

Script này triển khai Task Manager cho mạng nội bộ bằng Node.js 22, Nginx,
systemd và SQLite. Script **không seed dữ liệu mẫu**. Nếu database mới chưa có
Admin, script chỉ hỏi để tạo một Admin đầu tiên; các tài khoản nhân viên/quản lý
khác được tạo và phân quyền trong UI web.

## Chuẩn bị

- Máy AlmaLinux 9.8 truy cập được Internet để tải package và Node.js.
- Source dự án đã được chép lên máy, ví dụ `/root/task-manager`.
- DNS nội bộ (nếu dùng domain) đã trỏ sẵn. Script không kiểm tra DNS.
- Chạy bằng `root` hoặc `sudo`.

## Cài đặt tương tác

```bash
cd /root/task-manager
sudo bash deploy/almalinux9/install.sh
```

Script tự phát hiện IP và domain rồi hỏi xác nhận:

```text
IP truy cập [192.168.149.136]:
Domain nội bộ [bỏ trống để dùng IP]: task.intra.example
```

Nhấn Enter để nhận giá trị trong ngoặc. Ở màn hình tổng kết, nhấn Enter để bắt
đầu, nhập `back` để sửa IP/domain, hoặc `cancel` để thoát mà chưa thay đổi máy.

Trên database mới, nhập username, tên và mật khẩu (tối thiểu 8 ký tự) cho Admin
đầu tiên. Đây là tài khoản đăng nhập web, không phải tài khoản quản trị Linux hay
DNS.

## Chạy không tương tác

Chỉ dùng IP:

```bash
sudo TASK_MANAGER_ADMIN_USERNAME='admin' \
  TASK_MANAGER_ADMIN_NAME='Administrator' \
  TASK_MANAGER_ADMIN_PASSWORD='mat-khau-rat-manh' \
  bash deploy/almalinux9/install.sh \
  --ip 192.168.149.136 --no-domain --yes
```

Dùng domain nội bộ đã trỏ DNS:

```bash
sudo TASK_MANAGER_ADMIN_USERNAME='admin' \
  TASK_MANAGER_ADMIN_NAME='Administrator' \
  TASK_MANAGER_ADMIN_PASSWORD='mat-khau-rat-manh' \
  bash deploy/almalinux9/install.sh \
  --ip 192.168.149.136 --domain task.intra.example --yes
```

Nếu database đã có Admin hoạt động, các biến Admin được bỏ qua và không có tài
khoản thứ hai được tạo tự động.

## Kết quả và vận hành

- Ứng dụng: `/opt/task-manager`
- Database: `/var/lib/task-manager/task-manager.db`
- Cấu hình bí mật: `/etc/task-manager/task-manager.env`
- URL: `http://<IP>` hoặc `http://<domain>`
- Backup SQLite hằng ngày: `/var/backups/task-manager`, giữ 14 ngày

Các lệnh thường dùng:

```bash
systemctl status task-manager
journalctl -u task-manager -f
systemctl restart task-manager
systemctl list-timers task-manager-backup.timer
```

## Quên mật khẩu Admin

Script cài đặt tạo sẵn lệnh chỉ dành cho `root`. Lệnh này chỉ đổi mật khẩu của
tài khoản đã có quyền Admin; nó không tạo tài khoản mới và không tự nâng quyền:

```bash
sudo task-manager-reset-admin-password
```

Lệnh sẽ liệt kê các Admin, hỏi username, sau đó yêu cầu nhập mật khẩu mới hai
lần. Mật khẩu không hiển thị trên màn hình, không được đưa vào tham số dòng lệnh
và phải có ít nhất 8 ký tự. Không cần restart ứng dụng sau khi đổi.

Nếu chưa chạy installer, có thể gọi trực tiếp từ source:

```bash
sudo bash deploy/almalinux9/reset-admin-password.sh
```

Script có thể chạy lại. Trước khi thay source, nó sao lưu ứng dụng cũ và database
hiện tại. File môi trường hiện có được giữ nguyên để không đổi khóa đăng nhập.
