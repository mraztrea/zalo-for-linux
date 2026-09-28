# Data Model: Badge tin nhắn chưa đọc

Không thêm bảng hay tệp trạng thái. Badge là biểu diễn tạm thời của dữ liệu chưa đọc do Zalo quản lý.

## UnreadStatus

| Field | Type | Rule |
|-------|------|------|
| `totalUnread` | Số nguyên không âm | Tổng tin nhắn chưa đọc của tài khoản đang đăng nhập, gồm hội thoại tắt tiếng |
| `hasUnread` | Boolean | `totalUnread > 0` |

Nguồn: sự kiện `UnreadDataManager.ChangeUnreadCount`, với giá trị ban đầu lấy từ trạng thái đã tải. Khi đăng xuất, `hasUnread = false`.

## BadgeState

| Field | Type | Rule |
|-------|------|------|
| `hasUnread` | Boolean | Bản sao gần nhất của `UnreadStatus.hasUnread` trong tiến trình chính |
| `taskbarBadgeRequested` | Boolean | Bằng `hasUnread`; KDE quyết định việc vẽ badge theo thiết lập của môi trường |
| `trayImage` | `normal` hoặc `dot` | `dot` khi `hasUnread`, `normal` khi không |

## Transitions

| Event | Before | After |
|-------|--------|-------|
| Tin mới chưa đọc, gồm hội thoại tắt tiếng | `false` | `true` |
| Đọc bớt nhưng vẫn còn tin chưa đọc | `true` | `true` |
| Đọc hết hoặc trạng thái đọc được đồng bộ | `true` | `false` |
| Tải lại tài khoản còn tin chưa đọc | chưa biết | `true` |
| Đăng xuất/thoát | bất kỳ | `false` |

Không lưu badge riêng: khi khởi động lại, lấy lại `UnreadStatus` và phát trạng thái mới. Các cập nhật trùng trạng thái không làm đổi ảnh hoặc phát lại tín hiệu.
