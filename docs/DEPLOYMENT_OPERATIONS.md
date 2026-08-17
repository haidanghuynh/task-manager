# Triển khai và vận hành

Chi tiết installer ở [`deploy/almalinux9/README.md`](../deploy/almalinux9/README.md), backup ở
[`BACKUP_RESTORE.md`](BACKUP_RESTORE.md).

```text
Nginx :80 -> 127.0.0.1:3000 -> task-manager.service
app:    /opt/task-manager
DB:     /var/lib/task-manager/task-manager.db
env:    /etc/task-manager/task-manager.env
backup: /var/backups/task-manager
```

Installer dùng Node 22 AlmaLinux AppStream, npm, Prisma migrations, Next build, systemd, Nginx,
SELinux/firewall và backup timer. Không check DNS, không seed. Lần đầu chỉ tạo Primary Admin web.

## Cài mới

```bash
cd /root/task-manager
sudo bash deploy/almalinux9/install.sh
```

Xác nhận IP tự phát hiện, domain đã trỏ DNS nếu có; Enter tại summary, hoặc `back`/`cancel`.

## Update sau khi push

`/opt/task-manager` do installer copy thường không có `.git`; pull ở source gốc:

```bash
cd /root/task-manager
git fetch origin
git status --short --branch
git pull --ff-only origin master
sudo systemctl start task-manager-backup.service
sudo bash deploy/almalinux9/install.sh
```

Pull không tự cập nhật Next production. Code mới cần npm ci, Prisma generate/migrate, build và
restart; installer thực hiện. Chỉ đổi `.md` thì không cần build.

Nếu `/opt/task-manager` thật sự là Git checkout:

```bash
sudo systemctl start task-manager-backup.service
cd /opt/task-manager
git pull --ff-only origin master
npm ci
npx prisma generate
npx prisma migrate deploy
npm run build
sudo systemctl restart task-manager
```

Chạy npm bằng service user phù hợp. Không đổi `AUTH_SECRET`, env hoặc DB trong update.

## Verify

```bash
sudo systemctl status task-manager --no-pager --full
sudo nginx -t
curl -I http://127.0.0.1:3000/login
curl -I http://<ip-hoac-domain>/login
sudo journalctl -u task-manager -n 150 --no-pager
```

Smoke test login, một thao tác ghi, schedule, NIPPO, vi/ja và light/dark.

## Lỗi thường gặp

- `npm: Permission denied`/`node: No such file`: kiểm `/usr/bin/node`, `/usr/bin/npm`, PATH,
  owner/SELinux và service user. Installer cố định binary hệ thống.
- `npm ci` lockfile lệch: chạy `npm install` ở development, review/commit lockfile; không chữa tạm
  bằng npm install production.
- `DATABASE_URL not found`: Prisma process phải source `/etc/task-manager/task-manager.env` và user
  phải đọc được file.
- Port 3000 refused: xem systemctl/journal; migration/build/env có thể làm app chưa start.
- HTML thô: `/_next/*` không load; kiểm Nginx, `.next`, browser network/cache và log.
- Redirect loop: kiểm cookie, `AUTH_URL`, `AUTH_SECRET`, proxy headers, user active; xóa cookie sau
  khi sửa cấu hình.
- No space: kiểm `df -h`, `df -i`, `du` tại backup/app/data; giữ ít nhất một DB backup tốt.

Rollback code không tự rollback schema. Migration không backward-compatible cần khôi phục đúng DB
backup trong maintenance. Không chạy production: `prisma migrate reset`, `db push --force-reset`,
hoặc `prisma/seed.ts`.

Reset Admin:

```bash
sudo task-manager-reset-admin-password
```

Chỉ đổi password Admin tồn tại (min 8), không tạo/nâng quyền, không cần restart.
