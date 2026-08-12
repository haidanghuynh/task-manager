# Hướng dẫn phát triển và bảo trì

## Yêu cầu

- Node.js 22 được khuyến nghị để giống môi trường AlmaLinux.
- npm đi kèm Node.js.
- SQLite; không cần cài database server riêng.

## Chạy local

```bash
npm install
copy .env.example .env
npx prisma generate
npx prisma migrate dev
npm run dev
```

Trên PowerShell có thể dùng `Copy-Item .env.example .env`. Nếu port 3000 đang
được dùng, Next.js sẽ chọn port khác hoặc báo dev server cũ đang chạy; nên mở URL
được in trong terminal.

Các biến môi trường bắt buộc:

```dotenv
DATABASE_URL="file:./dev.db"
AUTH_SECRET="replace-with-a-long-random-secret"
```

Với Prisma, đường dẫn SQLite tương đối được tính từ thư mục chứa schema. Cấu hình
trên thường tạo database local tại `prisma/dev.db`.

## Lệnh thường dùng

| Lệnh | Tác dụng |
|---|---|
| `npm run dev` | Chạy development server trên mọi interface |
| `npm run lint` | Kiểm tra ESLint |
| `npm run build` | Type check và production build |
| `npm start` | Chạy build production |
| `npx prisma generate` | Sinh Prisma Client |
| `npx prisma migrate dev` | Tạo/chạy migration khi phát triển |
| `npx prisma migrate deploy` | Chạy migration đã commit ở production |
| `npm run bootstrap-admin` | Tạo Primary Admin nếu chưa có Admin hoạt động |
| `npm run reset-admin-password` | Chạy phần TypeScript của luồng reset mật khẩu |

Không chạy `prisma/seed.ts` trên môi trường mới nếu không muốn dữ liệu mẫu. Bộ
cài AlmaLinux không seed database.

## Quy trình thay đổi database

1. Sửa `prisma/schema.prisma`.
2. Chạy `npx prisma migrate dev --name <ten_ngan_gon>`.
3. Kiểm tra file SQL mới trong `prisma/migrations`.
4. Chạy lint và build.
5. Commit đồng thời schema và migration.

Không sửa trực tiếp database production để thay cho migration. Trước khi triển
khai migration có thay đổi/xóa dữ liệu, cần sao lưu file SQLite.

## Đăng nhập và tài khoản

- Người dùng đăng nhập bằng `username`, không phải email.
- Username được chuẩn hóa về chữ thường.
- Mật khẩu tối thiểu 8 ký tự và được băm bcrypt với cost 12.
- Session dùng JWT; `AUTH_SECRET` phải được giữ ổn định sau khi triển khai.
- Tài khoản hoặc hồ sơ Employee bị khóa sẽ không đăng nhập được.
- Primary Admin chỉ được tạo khi chưa có Admin hoạt động và được bảo vệ khỏi hạ
  quyền, khóa hoặc xóa.

## Theme

Theme được lưu trong `localStorage` với key `task-manager-theme`. Script trong
`src/app/layout.tsx` áp theme trước khi React render để tránh nháy sáng. CSS dark
mode dựa trên selector `:root[data-theme="dark"]` trong `src/app/globals.css`.

Khi thêm màu Tailwind mới, phải kiểm tra dark mode thực tế; các class động hoặc
hover có thể cần rule tương ứng trong `globals.css`.

## Kiểm tra trước khi commit

```bash
npm run lint
npm run build
git diff --check
git status --short
```

Ngoài kiểm tra tự động, nên thử tối thiểu:

- đăng nhập bằng từng vai trò bị ảnh hưởng;
- chuyển Việt/Nhật và light/dark;
- tạo/sửa dữ liệu rồi tải lại trang;
- tháng trước/sau ở lịch phân công;
- import/export nếu thay đổi cột dữ liệu;
- API trả 401/403 đúng với tài khoản không đủ quyền.

## Rollback thay đổi trên local

Trước thay đổi lớn, nên sao lưu `prisma/dev.db` và patch source chưa commit vào
một thư mục con của `.backups`. Nếu migration hoặc flow mới không phù hợp:

1. dừng dev server;
2. hoàn tác đúng các file source của thay đổi mới bằng Git;
3. chép bản `dev.db` đã sao lưu trở lại `prisma/dev.db`;
4. chạy `npx prisma generate`;
5. khởi động lại dev server.

Không dùng `git reset --hard` khi working tree có thay đổi chưa commit của người
khác. Với flow Task chờ được chỉnh ngày 12/08/2026, checkpoint local trước khi
thay đổi nằm tại:

```text
.backups/before-intake-flow-20260812-084522/
```

Checkpoint gồm `dev.db`, `git-status.txt` và `preexisting-changes.patch`.

## Cập nhật production AlmaLinux

Tài liệu đầy đủ nằm tại `deploy/almalinux9/README.md`. Source mới chỉ có hiệu lực
sau khi production build lại và restart service. Riêng thay đổi chỉ ở file `.md`
thì không cần build hoặc restart.

### Ảnh hưởng của từng lệnh đến database

| Lệnh | Ảnh hưởng database |
|---|---|
| `git pull --ff-only` | Không; chỉ cập nhật source |
| `npm ci` | Không; cài dependency theo lockfile |
| `npx prisma generate` | Không; chỉ tạo Prisma Client |
| `npm run build` | Không; tạo production build trong `.next` |
| `systemctl restart task-manager` | Không xóa dữ liệu; chỉ khởi động lại app |
| `npx prisma migrate deploy` | Có thể đổi schema theo migration đã commit |

Database production nằm ngoài source tại
`/var/lib/task-manager/task-manager.db`, do đó pull hoặc build không ghi đè file
này. Tuy nhiên luôn backup trước khi chạy migration.

### Cập nhật bản cài do installer quản lý

Installer sao chép source vào `/opt/task-manager` và không sao chép thư mục
`.git`. Vì vậy cách cập nhật được khuyến nghị là pull tại thư mục source rồi chạy
lại installer:

```bash
cd /root/task-manager
git pull --ff-only
sudo systemctl start task-manager-backup.service
sudo bash deploy/almalinux9/install.sh
```

Installer tự backup database hiện tại, cài dependency, chạy
`prisma migrate deploy`, build và restart các service. Nó giữ lại file môi trường
và database production.

### Cập nhật khi `/opt/task-manager` là Git checkout

Chỉ dùng quy trình này nếu `git -C /opt/task-manager status` chạy thành công:

```bash
sudo systemctl start task-manager-backup.service
cd /opt/task-manager
git pull --ff-only
npm ci
npx prisma generate
npx prisma migrate deploy
npm run build
sudo systemctl restart task-manager
sudo systemctl status task-manager --no-pager
curl -I http://127.0.0.1:3000/login
```

Nếu các lệnh npm được chạy bằng user dịch vụ trong môi trường hiện tại, tiếp tục
dùng cùng user đó để tránh sai quyền sở hữu `node_modules` và `.next`.

### Các lệnh không chạy trên production

Các lệnh sau có thể xóa, reset hoặc chèn dữ liệu mẫu:

```bash
npx prisma migrate reset
npx prisma db push --force-reset
npx tsx prisma/seed.ts
```

Không ghi đè `/etc/task-manager/task-manager.env` hoặc
`/var/lib/task-manager/task-manager.db`. Xem quy trình backup và phục hồi tại
[`docs/BACKUP_RESTORE.md`](BACKUP_RESTORE.md).
