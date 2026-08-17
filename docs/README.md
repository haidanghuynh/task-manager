# Tài liệu Task Manager

AI mới nên bắt đầu từ [`AI_CONTEXT.md`](../AI_CONTEXT.md).

| Tài liệu | Nội dung |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | Kiến trúc runtime, thư mục, trang và request |
| [DATABASE.md](DATABASE.md) | Mô hình dữ liệu, quan hệ và migration |
| [BUSINESS_FLOWS.md](BUSINESS_FLOWS.md) | Task, hàng chờ, lịch, DAILY và báo cáo |
| [PERMISSIONS.md](PERMISSIONS.md) | Vai trò, quyền và phạm vi dữ liệu |
| [API_REFERENCE.md](API_REFERENCE.md) | Endpoint, method, quyền, filter và side effect |
| [FRONTEND_I18N_THEME.md](FRONTEND_I18N_THEME.md) | UI, Việt/Nhật và light/dark |
| [DEVELOPMENT.md](DEVELOPMENT.md) | Local, lệnh phát triển và thay đổi schema |
| [TESTING_CHECKLIST.md](TESTING_CHECKLIST.md) | Checklist tự động và hồi quy thủ công |
| [GIT_WORKFLOW.md](GIT_WORKFLOW.md) | Commit, push, pull, revert và rollback |
| [DEPLOYMENT_OPERATIONS.md](DEPLOYMENT_OPERATIONS.md) | Cài/cập nhật AlmaLinux và xử lý sự cố |
| [BACKUP_RESTORE.md](BACKUP_RESTORE.md) | Backup/restore SQLite |
| [WAITING_TASK_FLOW.md](WAITING_TASK_FLOW.md) | Task chờ phân công chi tiết |
| [I18N.md](I18N.md) | Quy ước dịch Việt/Nhật chi tiết |
| [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md) | Tài liệu cấu trúc cũ để tham khảo bổ sung |

## Nguồn sự thật

1. `prisma/schema.prisma` và SQL migration cho dữ liệu.
2. `src/lib/permissions/index.ts`, `src/lib/auth/current-user.ts` cho quyền/phạm vi.
3. `src/app/api` cho hợp đồng và side effect server.
4. `src/app/(authenticated)`, `src/components` cho giao diện.
5. `deploy/almalinux9/install.sh` cho production.

Khi tài liệu lệch code, sửa lại trong cùng thay đổi; không giữ mô tả hành vi đã bỏ.
