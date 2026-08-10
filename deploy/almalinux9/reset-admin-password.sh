#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

APP_DIR="${TASK_MANAGER_APP_DIR:-/opt/task-manager}"
ENV_FILE="${TASK_MANAGER_ENV_FILE:-/etc/task-manager/task-manager.env}"
APP_USER="${TASK_MANAGER_APP_USER:-taskmanager}"
APP_PATH="/usr/local/bin:/usr/bin:/bin"

fail() { printf 'LỖI: %s\n' "$*" >&2; exit 1; }

[[ "${EUID}" -eq 0 ]] || fail "Hãy chạy bằng sudo hoặc tài khoản root."
[[ -d "$APP_DIR" && -f "${APP_DIR}/package.json" ]] || fail "Không tìm thấy ứng dụng tại: $APP_DIR"
[[ -r "$ENV_FILE" ]] || fail "Không đọc được cấu hình: $ENV_FILE"
id "$APP_USER" >/dev/null 2>&1 || fail "Không tìm thấy user dịch vụ: $APP_USER"

printf '%s\n' "Danh sách tài khoản Admin:"
runuser -u "$APP_USER" -- env PATH="$APP_PATH" RESET_ADMIN_LIST=1 \
  bash -lc "export PATH='$APP_PATH'; set -a; source '$ENV_FILE'; set +a; cd '$APP_DIR'; /usr/local/bin/npm run reset-admin-password"
printf '\n'

read -r -p "Username Admin cần đặt lại mật khẩu: " ADMIN_USERNAME
[[ -n "$ADMIN_USERNAME" ]] || fail "Username không được để trống."

while true; do
  IFS= read -r -s -p "Mật khẩu mới (ít nhất 8 ký tự): " ADMIN_PASSWORD
  printf '\n'
  IFS= read -r -s -p "Nhập lại mật khẩu mới: " ADMIN_PASSWORD_CONFIRM
  printf '\n'
  [[ "$ADMIN_PASSWORD" == "$ADMIN_PASSWORD_CONFIRM" ]] || { printf '%s\n' "Hai mật khẩu không khớp."; continue; }
  (( ${#ADMIN_PASSWORD} >= 8 )) || { printf '%s\n' "Mật khẩu phải có ít nhất 8 ký tự."; continue; }
  [[ "$ADMIN_PASSWORD" != *$'\n'* && "$ADMIN_PASSWORD" != *$'\r'* ]] || { printf '%s\n' "Mật khẩu không được chứa ký tự xuống dòng."; continue; }
  break
done

printf '%s' "$ADMIN_PASSWORD" | runuser -u "$APP_USER" -- env PATH="$APP_PATH" RESET_ADMIN_USERNAME="$ADMIN_USERNAME" \
  bash -lc "export PATH='$APP_PATH'; set -a; source '$ENV_FILE'; set +a; cd '$APP_DIR'; /usr/local/bin/npm run reset-admin-password"

unset ADMIN_PASSWORD ADMIN_PASSWORD_CONFIRM
printf '%s\n' "Hoàn tất. Không cần khởi động lại ứng dụng."
