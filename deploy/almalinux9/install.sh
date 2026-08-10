#!/usr/bin/env bash
set -Eeuo pipefail
umask 027

APP_NAME="task-manager"
APP_USER="taskmanager"
APP_GROUP="taskmanager"
APP_DIR="/opt/task-manager"
DATA_DIR="/var/lib/task-manager"
BACKUP_DIR="/var/backups/task-manager"
ENV_DIR="/etc/task-manager"
ENV_FILE="${ENV_DIR}/task-manager.env"
SERVICE_FILE="/etc/systemd/system/task-manager.service"
BACKUP_SERVICE_FILE="/etc/systemd/system/task-manager-backup.service"
BACKUP_TIMER_FILE="/etc/systemd/system/task-manager-backup.timer"
NGINX_FILE="/etc/nginx/conf.d/task-manager.conf"
NODE_VERSION="22.22.3"
APP_PORT="3000"
ASSUME_YES=0
IP_ADDRESS=""
DOMAIN_NAME=""
DOMAIN_WAS_SET=0
ADMIN_USERNAME="${TASK_MANAGER_ADMIN_USERNAME:-}"
ADMIN_NAME="${TASK_MANAGER_ADMIN_NAME:-}"
SOURCE_DIR=""

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
DEFAULT_SOURCE_DIR="$(cd -- "${SCRIPT_DIR}/../.." && pwd -P)"

say() { printf '%s\n' "$*"; }
fail() { printf 'LỖI: %s\n' "$*" >&2; exit 1; }

usage() {
  cat <<'EOF'
Cài Task Manager trên AlmaLinux 9.x (khuyến nghị 9.8).

Cách dùng:
  sudo bash deploy/almalinux9/install.sh [tùy chọn]

Tùy chọn:
  --ip ADDRESS          IP mà người dùng nội bộ truy cập
  --domain NAME         Domain nội bộ đã được DNS trỏ sẵn
  --no-domain           Chỉ dùng IP
  --source-dir PATH     Thư mục source (mặc định: thư mục gốc dự án)
  --app-dir PATH        Nơi cài ứng dụng (mặc định: /opt/task-manager)
  --data-dir PATH       Nơi lưu SQLite (mặc định: /var/lib/task-manager)
  --admin-username NAME Username Admin đầu tiên (chỉ dùng khi DB chưa có Admin)
  --admin-name NAME     Tên Admin đầu tiên
  --yes                 Bỏ qua màn hình xác nhận cuối
  --help                Hiện trợ giúp

Mật khẩu Admin tự động có thể truyền bằng biến TASK_MANAGER_ADMIN_PASSWORD.
Không truyền mật khẩu trực tiếp trên dòng lệnh để tránh lưu vào shell history.
EOF
}

while (( $# > 0 )); do
  case "$1" in
    --ip) [[ $# -ge 2 ]] || fail "--ip cần một giá trị"; IP_ADDRESS="$2"; shift 2 ;;
    --domain) [[ $# -ge 2 ]] || fail "--domain cần một giá trị"; DOMAIN_NAME="$2"; DOMAIN_WAS_SET=1; shift 2 ;;
    --no-domain) DOMAIN_NAME=""; DOMAIN_WAS_SET=1; shift ;;
    --source-dir) [[ $# -ge 2 ]] || fail "--source-dir cần một giá trị"; SOURCE_DIR="$2"; shift 2 ;;
    --app-dir) [[ $# -ge 2 ]] || fail "--app-dir cần một giá trị"; APP_DIR="$2"; shift 2 ;;
    --data-dir) [[ $# -ge 2 ]] || fail "--data-dir cần một giá trị"; DATA_DIR="$2"; shift 2 ;;
    --admin-username) [[ $# -ge 2 ]] || fail "--admin-username cần một giá trị"; ADMIN_USERNAME="$2"; shift 2 ;;
    --admin-name) [[ $# -ge 2 ]] || fail "--admin-name cần một giá trị"; ADMIN_NAME="$2"; shift 2 ;;
    --yes) ASSUME_YES=1; shift ;;
    --help|-h) usage; exit 0 ;;
    *) fail "Tùy chọn không hợp lệ: $1" ;;
  esac
done

[[ "${EUID}" -eq 0 ]] || fail "Hãy chạy script bằng sudo hoặc tài khoản root."
[[ -r /etc/os-release ]] || fail "Không đọc được /etc/os-release."
# shellcheck disable=SC1091
source /etc/os-release
[[ "${ID:-}" == "almalinux" ]] || fail "Script này chỉ hỗ trợ AlmaLinux. Hệ điều hành hiện tại: ${ID:-không rõ}."
[[ "${VERSION_ID:-}" == 9.* ]] || fail "Cần AlmaLinux 9.x. Phiên bản hiện tại: ${VERSION_ID:-không rõ}."
if [[ "${VERSION_ID}" != "9.8" ]]; then
  say "Cảnh báo: script được thiết kế cho AlmaLinux 9.8; máy này đang chạy ${VERSION_ID}."
fi

SOURCE_DIR="${SOURCE_DIR:-$DEFAULT_SOURCE_DIR}"
SOURCE_DIR="$(cd -- "$SOURCE_DIR" 2>/dev/null && pwd -P)" || fail "Không tìm thấy source: $SOURCE_DIR"
[[ -f "${SOURCE_DIR}/package.json" && -f "${SOURCE_DIR}/prisma/schema.prisma" ]] || fail "Source không hợp lệ: $SOURCE_DIR"

validate_safe_path() {
  local value="$1" label="$2"
  [[ "$value" == /* ]] || fail "$label phải là đường dẫn tuyệt đối: $value"
  [[ "$value" != "/" && "$value" != "/opt" && "$value" != "/var" && "$value" != "/var/lib" ]] || fail "$label quá rộng: $value"
}
validate_safe_path "$APP_DIR" "APP_DIR"
validate_safe_path "$DATA_DIR" "DATA_DIR"

valid_ipv4() {
  local ip="$1" part
  [[ "$ip" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]] || return 1
  IFS='.' read -r -a parts <<< "$ip"
  for part in "${parts[@]}"; do (( 10#$part <= 255 )) || return 1; done
}

valid_domain() {
  local domain="$1"
  [[ ${#domain} -le 253 ]] || return 1
  [[ "$domain" =~ ^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$ ]] || return 1
  [[ "$domain" != *".."* ]]
}

detect_ip() {
  local detected
  detected="$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for (i=1; i<=NF; i++) if ($i=="src") {print $(i+1); exit}}')"
  if [[ -z "$detected" ]]; then
    detected="$(hostname -I 2>/dev/null | awk '{print $1}')"
  fi
  printf '%s' "$detected"
}

detect_domain() {
  local detected
  detected="$(hostname -f 2>/dev/null || true)"
  if [[ "$detected" == "localhost" || "$detected" != *.* || "$detected" =~ \.localdomain$ ]]; then
    detected=""
  fi
  printf '%s' "$detected"
}

prompt_network() {
  local detected_ip detected_domain answer
  detected_ip="$(detect_ip)"
  detected_domain="$(detect_domain)"

  while ! valid_ipv4 "$IP_ADDRESS" 2>/dev/null; do
    [[ -n "$IP_ADDRESS" ]] && say "IP không hợp lệ: $IP_ADDRESS"
    [[ -t 0 ]] || fail "Không tự xác định được IP. Hãy chạy lại với --ip."
    read -r -p "IP truy cập [${detected_ip:-không phát hiện được}]: " answer
    IP_ADDRESS="${answer:-$detected_ip}"
  done

  if (( DOMAIN_WAS_SET == 0 )); then
    [[ -t 0 ]] || DOMAIN_NAME=""
    if [[ -t 0 ]]; then
      read -r -p "Domain nội bộ [${detected_domain:-bỏ trống để dùng IP}]: " answer
      DOMAIN_NAME="${answer:-$detected_domain}"
    fi
  fi
  DOMAIN_NAME="${DOMAIN_NAME,,}"
  [[ -z "$DOMAIN_NAME" ]] || valid_domain "$DOMAIN_NAME" || fail "Domain không hợp lệ: $DOMAIN_NAME"
}

while true; do
  prompt_network
  PUBLIC_HOST="${DOMAIN_NAME:-$IP_ADDRESS}"
  PUBLIC_URL="http://${PUBLIC_HOST}"
  SERVER_NAMES="$IP_ADDRESS"
  [[ -z "$DOMAIN_NAME" ]] || SERVER_NAMES="${DOMAIN_NAME} ${IP_ADDRESS}"

  say ""
  say "===== XÁC NHẬN CÀI ĐẶT ====="
  say "Source       : $SOURCE_DIR"
  say "Thư mục app  : $APP_DIR"
  say "Database     : ${DATA_DIR}/task-manager.db"
  say "IP           : $IP_ADDRESS"
  say "Domain       : ${DOMAIN_NAME:-không dùng}"
  say "Địa chỉ web  : $PUBLIC_URL"
  say "Seed dữ liệu : KHÔNG"
  say "=============================="

  (( ASSUME_YES == 1 )) && break
  read -r -p "Enter để cài, gõ 'back' để nhập lại, hoặc 'cancel' để thoát: " answer
  case "${answer,,}" in
    "") break ;;
    back) IP_ADDRESS=""; DOMAIN_WAS_SET=0; DOMAIN_NAME="" ;;
    cancel|c) say "Đã hủy, hệ thống chưa bị thay đổi."; exit 0 ;;
    *) say "Lựa chọn không hợp lệ." ;;
  esac
done

say "[1/9] Cài các gói hệ thống..."
dnf install -y nginx curl tar xz rsync sqlite openssl policycoreutils

say "[2/9] Cài Node.js ${NODE_VERSION}..."
case "$(uname -m)" in
  x86_64) NODE_ARCH="x64" ;;
  aarch64) NODE_ARCH="arm64" ;;
  *) fail "Kiến trúc CPU chưa được hỗ trợ: $(uname -m)" ;;
esac
NODE_DIST="node-v${NODE_VERSION}-linux-${NODE_ARCH}"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf -- "$TMP_DIR"' EXIT
curl --fail --location --silent --show-error "https://nodejs.org/dist/v${NODE_VERSION}/${NODE_DIST}.tar.xz" -o "${TMP_DIR}/${NODE_DIST}.tar.xz"
curl --fail --location --silent --show-error "https://nodejs.org/dist/v${NODE_VERSION}/SHASUMS256.txt" -o "${TMP_DIR}/SHASUMS256.txt"
(cd "$TMP_DIR" && grep " ${NODE_DIST}.tar.xz\$" SHASUMS256.txt | sha256sum --check --status) || fail "Checksum Node.js không hợp lệ."
mkdir -p /usr/local/lib/nodejs
rm -rf -- "/usr/local/lib/nodejs/${NODE_DIST}"
tar -xJf "${TMP_DIR}/${NODE_DIST}.tar.xz" -C /usr/local/lib/nodejs
# The installer runs with umask 027. Keep Node root-owned, but make its parent
# and distribution tree traversable/readable by the unprivileged app user.
chmod 0755 /usr/local/lib/nodejs
chmod -R a+rX "/usr/local/lib/nodejs/${NODE_DIST}"
ln -sfn "/usr/local/lib/nodejs/${NODE_DIST}/bin/node" /usr/local/bin/node
ln -sfn "/usr/local/lib/nodejs/${NODE_DIST}/bin/npm" /usr/local/bin/npm
ln -sfn "/usr/local/lib/nodejs/${NODE_DIST}/bin/npx" /usr/local/bin/npx

say "[3/9] Tạo user và thư mục dịch vụ..."
getent group "$APP_GROUP" >/dev/null || groupadd --system "$APP_GROUP"
id "$APP_USER" >/dev/null 2>&1 || useradd --system --gid "$APP_GROUP" --home-dir "$APP_DIR" --shell /sbin/nologin "$APP_USER"
runuser -u "$APP_USER" -- /usr/local/bin/node --version >/dev/null || fail "User $APP_USER không chạy được Node.js."
runuser -u "$APP_USER" -- /usr/local/bin/npm --version >/dev/null || fail "User $APP_USER không chạy được npm."
mkdir -p "$APP_DIR" "$DATA_DIR" "$BACKUP_DIR" "$ENV_DIR"

TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
if [[ -f "${APP_DIR}/package.json" ]]; then
  say "Sao lưu bản ứng dụng cũ..."
  tar -czf "${BACKUP_DIR}/app-before-install-${TIMESTAMP}.tar.gz" -C "$APP_DIR" .
fi
if [[ -f "${DATA_DIR}/task-manager.db" ]]; then
  say "Sao lưu database hiện tại..."
  sqlite3 "${DATA_DIR}/task-manager.db" ".backup '${BACKUP_DIR}/db-before-install-${TIMESTAMP}.db'"
fi

say "[4/9] Sao chép source và cài dependencies..."
rsync -a --delete \
  --exclude='.git/' --exclude='.next/' --exclude='node_modules/' \
  --exclude='.env' --exclude='.backups/' --exclude='.logs/' \
  --exclude='prisma/*.db' --exclude='prisma/*.db-journal' \
  "${SOURCE_DIR}/" "${APP_DIR}/"
chown -R "$APP_USER:$APP_GROUP" "$APP_DIR" "$DATA_DIR" "$BACKUP_DIR"
runuser -u "$APP_USER" -- bash -lc "cd '$APP_DIR' && /usr/local/bin/npm ci"

say "[5/9] Cấu hình môi trường và database..."
if [[ ! -f "$ENV_FILE" ]]; then
  AUTH_SECRET="$(openssl rand -base64 48 | tr -d '\n')"
  cat > "$ENV_FILE" <<EOF
NODE_ENV=production
PORT=${APP_PORT}
HOSTNAME=127.0.0.1
DATABASE_URL=file:${DATA_DIR}/task-manager.db
AUTH_SECRET=${AUTH_SECRET}
AUTH_TRUST_HOST=true
AUTH_URL=${PUBLIC_URL}
EOF
else
  say "Giữ nguyên khóa bí mật và cập nhật URL truy cập trong: $ENV_FILE"
  cp -a "$ENV_FILE" "${ENV_FILE}.bak-${TIMESTAMP}"
  ENV_TEMP="$(mktemp)"
  awk -v url="$PUBLIC_URL" '
    BEGIN { found = 0 }
    /^AUTH_URL=/ { print "AUTH_URL=" url; found = 1; next }
    { print }
    END { if (!found) print "AUTH_URL=" url }
  ' "$ENV_FILE" > "$ENV_TEMP"
  install -m 0640 -o root -g "$APP_GROUP" "$ENV_TEMP" "$ENV_FILE"
  rm -f -- "$ENV_TEMP"
fi
chown root:"$APP_GROUP" "$ENV_FILE"
chmod 0640 "$ENV_FILE"
runuser -u "$APP_USER" -- bash -lc "set -a; source '$ENV_FILE'; set +a; cd '$APP_DIR'; /usr/local/bin/npx prisma generate; /usr/local/bin/npx prisma migrate deploy"

set +e
runuser -u "$APP_USER" -- bash -lc "set -a; source '$ENV_FILE'; set +a; cd '$APP_DIR'; /usr/local/bin/npm run bootstrap-admin -- --check"
ADMIN_CHECK_STATUS=$?
set -e
if (( ADMIN_CHECK_STATUS == 2 )); then
  if [[ -z "$ADMIN_USERNAME" ]]; then
    [[ -t 0 ]] || fail "DB chưa có Admin. Đặt TASK_MANAGER_ADMIN_USERNAME, TASK_MANAGER_ADMIN_NAME và TASK_MANAGER_ADMIN_PASSWORD rồi chạy lại."
    read -r -p "Username Admin đầu tiên: " ADMIN_USERNAME
  fi
  if [[ -z "$ADMIN_NAME" ]]; then
    [[ -t 0 ]] || fail "Thiếu TASK_MANAGER_ADMIN_NAME."
    read -r -p "Tên Admin đầu tiên: " ADMIN_NAME
  fi
  ADMIN_PASSWORD="${TASK_MANAGER_ADMIN_PASSWORD:-}"
  if [[ -z "$ADMIN_PASSWORD" ]]; then
    [[ -t 0 ]] || fail "Thiếu TASK_MANAGER_ADMIN_PASSWORD."
    while true; do
      read -r -s -p "Mật khẩu Admin (ít nhất 8 ký tự): " ADMIN_PASSWORD; say ""
      read -r -s -p "Nhập lại mật khẩu: " ADMIN_PASSWORD_CONFIRM; say ""
      [[ "$ADMIN_PASSWORD" == "$ADMIN_PASSWORD_CONFIRM" ]] || { say "Hai mật khẩu không khớp."; continue; }
      (( ${#ADMIN_PASSWORD} >= 8 )) || { say "Mật khẩu phải có ít nhất 8 ký tự."; continue; }
      break
    done
  fi
  runuser -u "$APP_USER" -- env \
    BOOTSTRAP_ADMIN_USERNAME="$ADMIN_USERNAME" \
    BOOTSTRAP_ADMIN_NAME="$ADMIN_NAME" \
    BOOTSTRAP_ADMIN_PASSWORD="$ADMIN_PASSWORD" \
    bash -lc "set -a; source '$ENV_FILE'; set +a; cd '$APP_DIR'; /usr/local/bin/npm run bootstrap-admin"
  unset ADMIN_PASSWORD ADMIN_PASSWORD_CONFIRM TASK_MANAGER_ADMIN_PASSWORD || true
elif (( ADMIN_CHECK_STATUS != 0 )); then
  fail "Không kiểm tra được tài khoản Admin (mã lỗi ${ADMIN_CHECK_STATUS})."
fi

say "[6/9] Build ứng dụng..."
runuser -u "$APP_USER" -- bash -lc "set -a; source '$ENV_FILE'; set +a; cd '$APP_DIR'; /usr/local/bin/npm run build"

say "[7/9] Cấu hình systemd và sao lưu tự động..."
install -m 0700 -o root -g root "${APP_DIR}/deploy/almalinux9/reset-admin-password.sh" /usr/local/sbin/task-manager-reset-admin-password
cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=Task Manager web application
Wants=network-online.target
After=network-online.target

[Service]
Type=simple
User=${APP_USER}
Group=${APP_GROUP}
WorkingDirectory=${APP_DIR}
EnvironmentFile=${ENV_FILE}
ExecStart=/usr/local/bin/npm run start -- --hostname 127.0.0.1 --port ${APP_PORT}
Restart=on-failure
RestartSec=5
TimeoutStopSec=30
KillSignal=SIGTERM

[Install]
WantedBy=multi-user.target
EOF

cat > /usr/local/sbin/task-manager-backup <<EOF
#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
DB='${DATA_DIR}/task-manager.db'
DEST='${BACKUP_DIR}'
mkdir -p "\$DEST"
[[ -f "\$DB" ]] || exit 0
TARGET="\$DEST/task-manager-\$(date +%Y%m%d-%H%M%S).db"
sqlite3 "\$DB" ".backup '\$TARGET'"
find "\$DEST" -maxdepth 1 -type f -name 'task-manager-*.db' -mtime +14 -delete
EOF
chmod 0750 /usr/local/sbin/task-manager-backup
chown root:"$APP_GROUP" /usr/local/sbin/task-manager-backup

cat > "$BACKUP_SERVICE_FILE" <<EOF
[Unit]
Description=Backup Task Manager SQLite database

[Service]
Type=oneshot
User=${APP_USER}
Group=${APP_GROUP}
ExecStart=/usr/local/sbin/task-manager-backup
EOF

cat > "$BACKUP_TIMER_FILE" <<'EOF'
[Unit]
Description=Daily Task Manager database backup

[Timer]
OnCalendar=daily
Persistent=true
RandomizedDelaySec=15m

[Install]
WantedBy=timers.target
EOF

say "[8/9] Cấu hình Nginx, SELinux và firewall..."
if [[ -f "$NGINX_FILE" ]]; then cp -a "$NGINX_FILE" "${NGINX_FILE}.bak-${TIMESTAMP}"; fi
cat > "$NGINX_FILE" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${SERVER_NAMES};

    client_max_body_size 10m;

    location / {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_buffering off;
    }
}
EOF
nginx -t
if [[ "$(getenforce 2>/dev/null || true)" != "Disabled" ]]; then
  setsebool -P httpd_can_network_connect 1
fi
if systemctl is-active --quiet firewalld; then
  firewall-cmd --permanent --add-service=http
  firewall-cmd --reload
else
  say "Lưu ý: firewalld không chạy, script không thay đổi firewall."
fi

say "[9/9] Khởi động và kiểm tra dịch vụ..."
systemctl daemon-reload
systemctl enable --now task-manager-backup.timer
systemctl enable --now task-manager.service
systemctl enable --now nginx

HEALTHY=0
for _ in {1..30}; do
  if curl --fail --silent --show-error "http://127.0.0.1:${APP_PORT}/login" >/dev/null; then
    HEALTHY=1
    break
  fi
  sleep 1
done
if (( HEALTHY == 0 )); then
  journalctl -u task-manager.service --no-pager -n 80 >&2 || true
  fail "Ứng dụng chưa phản hồi. Xem log phía trên hoặc chạy: journalctl -u task-manager -f"
fi

say ""
say "Cài đặt hoàn tất."
say "Mở: ${PUBLIC_URL}"
say "Dịch vụ: systemctl status task-manager"
say "Log: journalctl -u task-manager -f"
say "Backup DB hằng ngày tại: ${BACKUP_DIR} (giữ 14 ngày)"
say "Tạo nhân viên, tài khoản quản lý và phân quyền tiếp theo trong giao diện web."
