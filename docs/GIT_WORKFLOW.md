# Quản lý Git

```text
Working tree: C:\Users\OS\Downloads\task manager\task-manager
Remote:       https://github.com/haidanghuynh/task-manager.git
Branch:       master
Production:   origin/master
```

Thư mục cha từng có repository Git nhầm. Luôn vào đúng repo và kiểm tra:

```powershell
cd "C:\Users\OS\Downloads\task manager\task-manager"
git rev-parse --show-toplevel
git remote -v
git status --short --branch
```

## Commit/push an toàn

Không mặc định `git add .`; stage file rõ ràng:

```powershell
git diff
git add AI_CONTEXT.md docs/README.md docs/GIT_WORKFLOW.md
git diff --cached
git commit -m "docs: document architecture and git workflow"
git push origin master
```

Đổi dependency phải review/commit `package-lock.json`. Không commit `.env`, DB, password/secret,
`.next`, `node_modules`, log hoặc backup.

Các file local đã từng xuất hiện untracked, không stage nếu chưa chủ đích:

```text
.agents/  .claude/  .windsurf/  .local-logs/  skills-lock.json  temp-test.txt
```

Không tự xóa vì có thể thuộc công cụ/người dùng.

## Commit convention

```text
feat: chức năng mới       fix: sửa lỗi
docs: tài liệu            refactor: đổi cấu trúc không đổi hành vi
chore: cấu hình/phụ thuộc/bảo trì
```

Một commit một mục tiêu, build được, kèm migration/docs cần thiết.

## Đồng bộ

```powershell
git fetch origin
git status --short --branch
git log --oneline --decorate -8
git pull --ff-only origin master
npm run lint
npm run build
git push origin master
```

`--ff-only` dừng khi diverge. Không force push master. Khi diverge, xem
`git log --graph --oneline --all` rồi thống nhất rebase/merge.

Production:

```bash
cd /root/task-manager
git status --short --branch
git pull --ff-only origin master
sudo systemctl start task-manager-backup.service
sudo bash deploy/almalinux9/install.sh
```

## Hoàn tác

Chưa commit, chỉ restore file đã xác nhận:

```powershell
git diff -- path/to/file
git restore -- path/to/file
```

Không `reset --hard`, `clean -fd` hoặc restore cả repo khi còn thay đổi người dùng.

Đã push, dùng revert giữ lịch sử:

```powershell
git log --oneline -10
git revert <commit-sha>
git push origin master
```

Commit có migration cần kế hoạch DB riêng; revert code không hoàn tác schema/data.

Thay đổi rủi ro nên làm branch:

```powershell
git switch -c feat/ten-chuc-nang
# code, test, commit
git push -u origin feat/ten-chuc-nang
```

Nên tag bản deploy tốt và ghi SHA/backup tương ứng:

```powershell
git tag -a v2026.08.17 -m "Production 2026-08-17"
git push origin v2026.08.17
```

## Checklist push

- Đúng repo/branch/remote; staged diff không có secret/DB/log/file công cụ.
- Lint/build phù hợp đã chạy; migration đã đọc và có backup plan.
- Docs API/quyền/flow/deploy cập nhật nếu hành vi đổi.
- `git diff --cached` đúng phạm vi; push thành công và branch không còn ahead.
