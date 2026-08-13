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
JITLESS_OVERRIDE_FILE="/etc/systemd/system/task-manager.service.d/jitless.conf"
BACKUP_SERVICE_FILE="/etc/systemd/system/task-manager-backup.service"
BACKUP_TIMER_FILE="/etc/systemd/system/task-manager-backup.timer"
NGINX_FILE="/etc/nginx/conf.d/task-manager.conf"
NODE_STREAM="22"
APP_PORT="3000"
APP_PATH="/usr/bin:/usr/local/bin:/bin"
NODE_BIN="/usr/bin/node"
NPM_BIN="/usr/bin/npm"
NPX_BIN="/usr/bin/npx"
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
fail() { printf 'LOI: %s\n' "$*" >&2; exit 1; }

available_bytes() {
  df -PB1 "$1" | awk 'NR == 2 { print $4 }'
}

require_free_space() {
  local path="$1"
  local required="$2"
  local available
  available="$(available_bytes "$path")"
  [[ "$available" =~ ^[0-9]+$ ]] || fail "Khong doc duoc dung luong trong tai $path."
  (( available >= required )) || fail "Khong du dung luong tai $path. Can it nhat $((required / 1024 / 1024)) MiB, hien con $((available / 1024 / 1024)) MiB."
}

cleanup_invalid_app_backups() {
  local backup
  while IFS= read -r -d '' backup; do
    if ! gzip -t -- "$backup" 2>/dev/null; then
      say "Xoa file backup app bi hong: $backup"
      rm -f -- "$backup"
    fi
  done < <(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'app-before-install-*.tar.gz' -print0)
  find "$BACKUP_DIR" -maxdepth 1 -type f -name '.app-before-install-*.tmp' -delete
}

prune_app_backups() {
  local -a backups=()
  mapfile -t backups < <(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'app-before-install-*.tar.gz' -printf '%T@ %p\n' | sort -nr | cut -d' ' -f2-)
  if (( ${#backups[@]} > 3 )); then
    printf '%s\0' "${backups[@]:3}" | xargs -0r rm -f --
  fi
}

usage() {
  cat <<'EOF'
Cai Task Manager tren AlmaLinux 9.x (khuyen nghi 9.8).

Cach dung:
  sudo bash deploy/almalinux9/install.sh [tuy chon]

Tuy chon:
  --ip ADDRESS          IP ma nguoi dung noi bo truy cap
  --domain NAME         Domain noi bo da duoc DNS tro san
  --no-domain           Chi dung IP
  --source-dir PATH     Thu muc source (mac dinh: thu muc goc du an)
  --app-dir PATH        Noi cai ung dung (mac dinh: /opt/task-manager)
  --data-dir PATH       Noi luu SQLite (mac dinh: /var/lib/task-manager)
  --admin-username NAME Username Admin dau tien (chi dung khi DB chua co Admin)
  --admin-name NAME     Ten Admin dau tien
  --yes                 Bo qua man hinh xac nhan cuoi
  --help                Hien tro giup

Mat khau Admin tu dong co the truyen bang bien TASK_MANAGER_ADMIN_PASSWORD.
Khong truyen mat khau truc tiep tren dong lenh de tranh luu vao shell history.
EOF
}

while (( $# > 0 )); do
  case "$1" in
    --ip) [[ $# -ge 2 ]] || fail "--ip can mot gia tri"; IP_ADDRESS="$2"; shift 2 ;;
    --domain) [[ $# -ge 2 ]] || fail "--domain can mot gia tri"; DOMAIN_NAME="$2"; DOMAIN_WAS_SET=1; shift 2 ;;
    --no-domain) DOMAIN_NAME=""; DOMAIN_WAS_SET=1; shift ;;
    --source-dir) [[ $# -ge 2 ]] || fail "--source-dir can mot gia tri"; SOURCE_DIR="$2"; shift 2 ;;
    --app-dir) [[ $# -ge 2 ]] || fail "--app-dir can mot gia tri"; APP_DIR="$2"; shift 2 ;;
    --data-dir) [[ $# -ge 2 ]] || fail "--data-dir can mot gia tri"; DATA_DIR="$2"; shift 2 ;;
    --admin-username) [[ $# -ge 2 ]] || fail "--admin-username can mot gia tri"; ADMIN_USERNAME="$2"; shift 2 ;;
    --admin-name) [[ $# -ge 2 ]] || fail "--admin-name can mot gia tri"; ADMIN_NAME="$2"; shift 2 ;;
    --yes) ASSUME_YES=1; shift ;;
    --help|-h) usage; exit 0 ;;
    *) fail "Tuy chon khong hop le: $1" ;;
  esac
done

[[ "${EUID}" -eq 0 ]] || fail "Hay chay script bang sudo hoac tai khoan root."
[[ -r /etc/os-release ]] || fail "Khong doc duoc /etc/os-release."
# shellcheck disable=SC1091
source /etc/os-release
[[ "${ID:-}" == "almalinux" ]] || fail "Script nay chi ho tro AlmaLinux. He dieu hanh hien tai: ${ID:-khong ro}."
[[ "${VERSION_ID:-}" == 9.* ]] || fail "Can AlmaLinux 9.x. Phien ban hien tai: ${VERSION_ID:-khong ro}."
if [[ "${VERSION_ID}" != "9.8" ]]; then
  say "Canh bao: script duoc thiet ke cho AlmaLinux 9.8; may nay dang chay ${VERSION_ID}."
fi

SOURCE_DIR="${SOURCE_DIR:-$DEFAULT_SOURCE_DIR}"
SOURCE_DIR="$(cd -- "$SOURCE_DIR" 2>/dev/null && pwd -P)" || fail "Khong tim thay source: $SOURCE_DIR"
[[ -f "${SOURCE_DIR}/package.json" && -f "${SOURCE_DIR}/prisma/schema.prisma" ]] || fail "Source khong hop le: $SOURCE_DIR"

validate_safe_path() {
  local value="$1" label="$2"
  [[ "$value" == /* ]] || fail "$label phai la duong dan tuyet doi: $value"
  [[ "$value" != "/" && "$value" != "/opt" && "$value" != "/var" && "$value" != "/var/lib" ]] || fail "$label qua rong: $value"
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
    [[ -n "$IP_ADDRESS" ]] && say "IP khong hop le: $IP_ADDRESS"
    [[ -t 0 ]] || fail "Khong tu xac dinh duoc IP. Hay chay lai voi --ip."
    read -r -p "IP truy cap [${detected_ip:-khong phat hien duoc}]: " answer
    IP_ADDRESS="${answer:-$detected_ip}"
  done

  if (( DOMAIN_WAS_SET == 0 )); then
    [[ -t 0 ]] || DOMAIN_NAME=""
    if [[ -t 0 ]]; then
      read -r -p "Domain noi bo [${detected_domain:-bo trong de dung IP}]: " answer
      DOMAIN_NAME="${answer:-$detected_domain}"
    fi
  fi
  DOMAIN_NAME="${DOMAIN_NAME,,}"
  [[ -z "$DOMAIN_NAME" ]] || valid_domain "$DOMAIN_NAME" || fail "Domain khong hop le: $DOMAIN_NAME"
}

while true; do
  prompt_network
  PUBLIC_HOST="${DOMAIN_NAME:-$IP_ADDRESS}"
  PUBLIC_URL="http://${PUBLIC_HOST}"
  SERVER_NAMES="$IP_ADDRESS"
  [[ -z "$DOMAIN_NAME" ]] || SERVER_NAMES="${DOMAIN_NAME} ${IP_ADDRESS}"

  say ""
  say "===== XAC NHAN CAI DAT ====="
  say "Source       : $SOURCE_DIR"
  say "Thu muc app  : $APP_DIR"
  say "Database     : ${DATA_DIR}/task-manager.db"
  say "IP           : $IP_ADDRESS"
  say "Domain       : ${DOMAIN_NAME:-khong dung}"
  say "Dia chi web  : $PUBLIC_URL"
  say "Seed du lieu : KHONG"
  say "=============================="

  (( ASSUME_YES == 1 )) && break
  read -r -p "Enter de cai, go 'back' de nhap lai, hoac 'cancel' de thoat: " answer
  case "${answer,,}" in
    "") break ;;
    back) IP_ADDRESS=""; DOMAIN_WAS_SET=0; DOMAIN_NAME="" ;;
    cancel|c) say "Da huy, he thong chua bi thay doi."; exit 0 ;;
    *) say "Lua chon khong hop le." ;;
  esac
done

say "[1/9] Cai cac goi he thong..."
dnf install -y nginx curl tar xz rsync sqlite openssl policycoreutils

say "[2/9] Cai Node.js ${NODE_STREAM} tu AlmaLinux AppStream..."
# Use the distribution package so Node receives EL9-compatible SELinux labels.
# The generic upstream tarball can be denied executable JIT memory when it is
# launched by systemd, which otherwise forces the much slower --jitless mode.
dnf module reset -y nodejs
dnf module enable -y "nodejs:${NODE_STREAM}"
dnf install -y nodejs npm
[[ -x "$NODE_BIN" && -x "$NPM_BIN" && -x "$NPX_BIN" ]] || fail "Khong tim thay Node.js/npm tu AppStream."
NODE_MAJOR="$($NODE_BIN -p 'process.versions.node.split(".")[0]')"
(( NODE_MAJOR >= 22 )) || fail "Can Node.js 22 tro len, phien ban hien tai: $($NODE_BIN --version)"

say "[3/9] Tao user va thu muc dich vu..."
getent group "$APP_GROUP" >/dev/null || groupadd --system "$APP_GROUP"
id "$APP_USER" >/dev/null 2>&1 || useradd --system --gid "$APP_GROUP" --home-dir "$APP_DIR" --shell /sbin/nologin "$APP_USER"
runuser -u "$APP_USER" -- env PATH="$APP_PATH" "$NODE_BIN" --version >/dev/null || fail "User $APP_USER khong chay duoc Node.js."
runuser -u "$APP_USER" -- env PATH="$APP_PATH" "$NPM_BIN" --version >/dev/null || fail "User $APP_USER khong chay duoc npm."
mkdir -p "$APP_DIR" "$DATA_DIR" "$BACKUP_DIR"
# The environment file is root-owned and group-readable. Its parent directory
# must also be traversable by the service group, including on installer reruns.
install -d -m 0750 -o root -g "$APP_GROUP" "$ENV_DIR"

TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
cleanup_invalid_app_backups
prune_app_backups
if [[ -f "${APP_DIR}/package.json" ]]; then
  say "Sao luu ban ung dung cu..."
  require_free_space "$BACKUP_DIR" $((100 * 1024 * 1024))
  APP_BACKUP="${BACKUP_DIR}/app-before-install-${TIMESTAMP}.tar.gz"
  APP_BACKUP_TMP="${BACKUP_DIR}/.app-before-install-${TIMESTAMP}.tmp"
  if ! tar -czf "$APP_BACKUP_TMP" \
    --exclude='./node_modules' --exclude='./.next' --exclude='./.git' \
    --exclude='./.env' --exclude='./.backups' --exclude='./.logs' \
    --exclude='./prisma/*.db' --exclude='./prisma/*.db-journal' \
    -C "$APP_DIR" .; then
    rm -f -- "$APP_BACKUP_TMP"
    fail "Khong the sao luu source cu. Kiem tra dung luong bang: df -h $BACKUP_DIR"
  fi
  mv -- "$APP_BACKUP_TMP" "$APP_BACKUP"
  prune_app_backups
fi
if [[ -f "${DATA_DIR}/task-manager.db" ]]; then
  say "Sao luu database hien tai..."
  DB_SIZE="$(stat -c %s "${DATA_DIR}/task-manager.db")"
  require_free_space "$BACKUP_DIR" $((DB_SIZE + 50 * 1024 * 1024))
  DB_BACKUP="${BACKUP_DIR}/db-before-install-${TIMESTAMP}.db"
  DB_BACKUP_TMP="${DB_BACKUP}.tmp"
  rm -f -- "$DB_BACKUP_TMP"
  if ! sqlite3 "${DATA_DIR}/task-manager.db" ".backup '${DB_BACKUP_TMP}'"; then
    rm -f -- "$DB_BACKUP_TMP"
    fail "Khong the sao luu database. Kiem tra dung luong bang: df -h $BACKUP_DIR"
  fi
  mv -- "$DB_BACKUP_TMP" "$DB_BACKUP"
fi

say "[4/9] Sao chep source va cai dependencies..."
rsync -a --delete \
  --exclude='.git/' --exclude='.next/' --exclude='node_modules/' \
  --exclude='.env' --exclude='.backups/' --exclude='.logs/' \
  --exclude='prisma/*.db' --exclude='prisma/*.db-journal' \
  "${SOURCE_DIR}/" "${APP_DIR}/"
chown -R "$APP_USER:$APP_GROUP" "$APP_DIR" "$DATA_DIR" "$BACKUP_DIR"
runuser -u "$APP_USER" -- env PATH="$APP_PATH" bash -lc "export PATH='$APP_PATH'; cd '$APP_DIR' && '$NPM_BIN' ci"

say "[5/9] Cau hinh moi truong va database..."
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
  say "Giu nguyen khoa bi mat va cap nhat URL truy cap trong: $ENV_FILE"
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
runuser -u "$APP_USER" -- test -r "$ENV_FILE" || fail "User $APP_USER khong doc duoc cau hinh: $ENV_FILE"
runuser -u "$APP_USER" -- env PATH="$APP_PATH" bash -lc "export PATH='$APP_PATH'; set -a; source '$ENV_FILE'; set +a; cd '$APP_DIR'; '$NPX_BIN' prisma generate; '$NPX_BIN' prisma migrate deploy"

set +e
runuser -u "$APP_USER" -- env PATH="$APP_PATH" bash -lc "export PATH='$APP_PATH'; set -a; source '$ENV_FILE'; set +a; cd '$APP_DIR'; '$NPM_BIN' run bootstrap-admin -- --check"
ADMIN_CHECK_STATUS=$?
set -e
if (( ADMIN_CHECK_STATUS == 2 )); then
  if [[ -z "$ADMIN_USERNAME" ]]; then
    [[ -t 0 ]] || fail "DB chua co Admin. Dat TASK_MANAGER_ADMIN_USERNAME, TASK_MANAGER_ADMIN_NAME va TASK_MANAGER_ADMIN_PASSWORD roi chay lai."
    read -r -p "Username Admin dau tien: " ADMIN_USERNAME
  fi
  if [[ -z "$ADMIN_NAME" ]]; then
    [[ -t 0 ]] || fail "Thieu TASK_MANAGER_ADMIN_NAME."
    read -r -p "Ten Admin dau tien: " ADMIN_NAME
  fi
  ADMIN_PASSWORD="${TASK_MANAGER_ADMIN_PASSWORD:-}"
  if [[ -z "$ADMIN_PASSWORD" ]]; then
    [[ -t 0 ]] || fail "Thieu TASK_MANAGER_ADMIN_PASSWORD."
    while true; do
      read -r -s -p "Mat khau Admin (it nhat 8 ky tu): " ADMIN_PASSWORD; say ""
      read -r -s -p "Nhap lai mat khau: " ADMIN_PASSWORD_CONFIRM; say ""
      [[ "$ADMIN_PASSWORD" == "$ADMIN_PASSWORD_CONFIRM" ]] || { say "Hai mat khau khong khop."; continue; }
      (( ${#ADMIN_PASSWORD} >= 8 )) || { say "Mat khau phai co it nhat 8 ky tu."; continue; }
      break
    done
  fi
  runuser -u "$APP_USER" -- env \
    PATH="$APP_PATH" \
    BOOTSTRAP_ADMIN_USERNAME="$ADMIN_USERNAME" \
    BOOTSTRAP_ADMIN_NAME="$ADMIN_NAME" \
    BOOTSTRAP_ADMIN_PASSWORD="$ADMIN_PASSWORD" \
    bash -lc "export PATH='$APP_PATH'; set -a; source '$ENV_FILE'; set +a; cd '$APP_DIR'; '$NPM_BIN' run bootstrap-admin"
  unset ADMIN_PASSWORD ADMIN_PASSWORD_CONFIRM TASK_MANAGER_ADMIN_PASSWORD || true
elif (( ADMIN_CHECK_STATUS != 0 )); then
  fail "Khong kiem tra duoc tai khoan Admin (ma loi ${ADMIN_CHECK_STATUS})."
fi

say "[6/9] Build ung dung..."
runuser -u "$APP_USER" -- env PATH="$APP_PATH" bash -lc "export PATH='$APP_PATH'; set -a; source '$ENV_FILE'; set +a; cd '$APP_DIR'; '$NPM_BIN' run build"

say "[7/9] Cau hinh systemd va sao luu tu dong..."
install -m 0700 -o root -g root "${APP_DIR}/deploy/almalinux9/reset-admin-password.sh" /usr/local/sbin/task-manager-reset-admin-password
cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=Task Manager web application
Wants=network-online.target
After=network-online.target
StartLimitIntervalSec=60
StartLimitBurst=5

[Service]
Type=simple
User=${APP_USER}
Group=${APP_GROUP}
WorkingDirectory=${APP_DIR}
EnvironmentFile=${ENV_FILE}
Environment=PATH=${APP_PATH}
ExecStart=${NODE_BIN} ${APP_DIR}/node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port ${APP_PORT}
Restart=on-failure
RestartSec=5
TimeoutStopSec=30
KillSignal=SIGTERM

[Install]
WantedBy=multi-user.target
EOF

if [[ -f "$JITLESS_OVERRIDE_FILE" ]]; then
  say "Go override --jitless cu de khoi phuc hieu nang V8 JIT..."
  rm -f -- "$JITLESS_OVERRIDE_FILE"
fi

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

say "[8/9] Cau hinh Nginx, SELinux va firewall..."
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
  say "Luu y: firewalld khong chay, script khong thay doi firewall."
fi

say "[9/9] Khoi dong va kiem tra dich vu..."
systemctl daemon-reload
systemctl enable --now task-manager-backup.timer
systemctl enable --now task-manager.service
systemctl enable --now nginx

HEALTHY=0
for _ in {1..30}; do
  if curl --fail --silent "http://127.0.0.1:${APP_PORT}/login" >/dev/null; then
    HEALTHY=1
    break
  fi
  if ! systemctl is-active --quiet task-manager.service; then
    break
  fi
  sleep 1
done
if (( HEALTHY == 0 )); then
  systemctl status task-manager.service --no-pager --full >&2 || true
  journalctl -u task-manager.service --no-pager -n 80 >&2 || true
  fail "Ung dung chua phan hoi. Xem log phia tren hoac chay: journalctl -u task-manager -f"
fi

say ""
say "Cai dat hoan tat."
say "Mo: ${PUBLIC_URL}"
say "Dich vu: systemctl status task-manager"
say "Log: journalctl -u task-manager -f"
say "Backup DB hang ngay tai: ${BACKUP_DIR} (giu 14 ngay)"
say "Tao nhan vien, tai khoan quan ly va phan quyen tiep theo trong giao dien web."
