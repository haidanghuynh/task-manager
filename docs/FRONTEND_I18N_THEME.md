# Frontend, i18n và theme

## File chính

- `src/app/layout.tsx`: metadata/logo/font/theme bootstrap.
- `src/app/login/page.tsx`: login ngoài authenticated provider.
- `src/app/(authenticated)/layout.tsx`: session/language/sidebar.
- `src/components/layout/sidebar.tsx`: menu, report collapse, VI/日本語, logout.
- `src/components/layout/theme-toggle.tsx`: light/dark.
- `src/app/globals.css`: CSS và dark overrides.

## Việt/Nhật

Ngôn ngữ `vi|ja`, mặc định Việt, lưu `localStorage` key `lang`. `vi.ts` là shape typed gốc;
`ja.ts` cùng shape và có `jaUi`; `src/lib/i18n.tsx` cung cấp provider, `t`, `tr` và MutationObserver
tương thích UI cũ.

Ưu tiên `t.section.key`; chuỗi riêng có thể `lang === "ja"`; `tr()` chỉ cho UI cũ. Login tự quản
lý nhãn vì ngoài provider. Gắn `data-i18n-ignore` cho code, username, tên/dữ liệu động hoặc text đã
tự chọn ngôn ngữ. Không dịch enum/value gửi API.

Thêm key ở cả vi/ja. Test text, placeholder, tooltip, aria, alert/confirm, empty/loading và chuỗi
ghép số khi đổi qua lại cả hai chiều.

## Daily category

`useDailyWorkCategories()` gọi API với fallback tĩnh; `dailyWorkLabel/Color()` dùng chung. Form mới
chỉ active, edit phải giữ current inactive; `__CUSTOM__` mở input tự do. List, schedule, waiting,
NIPPO và legend phải dùng cùng nguồn, không hard-code riêng.

## Theme

Theme lưu `task-manager-theme`, áp `data-theme` trên `<html>`. Light dùng Tailwind gốc; dark override
dưới `:root[data-theme="dark"]`. `.text-blue-600` chỉ sáng hơn trong dark. Header group task dark
dùng gradient `#172554 -> #000000`.

Kiểm text/icon/badge/input/table/modal/hover/focus. Không sửa utility global cho lỗi chỉ một
component nếu các nơi khác không cần.

## Lịch

Grid ngày, cột trái/header sticky, mặc định group team và collapse. Overlap tạo lane. Các lỗi dễ
tái phát: overflow làm mất sticky, vỡ góc bo, bar hụt/vượt vạch cuối, viewport quá ngắn, text chìm
dark. Test tháng 28/29/30/31, task một ngày/cắt tháng/overlap, scroll, collapse và hai theme.
