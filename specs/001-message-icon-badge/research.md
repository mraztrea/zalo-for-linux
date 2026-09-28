# Research: Badge tin nhắn chưa đọc

## Quyết định 1: Nguồn trạng thái chưa đọc

**Decision**: Dùng `totalUnread` từ sự kiện `UnreadDataManager.ChangeUnreadCount` và thay đầu vào cho handler badge khi build. Dùng boolean `totalUnread > 0` cho dấu chấm.

**Rationale**: Bundle hiện đã phát `totalUnread` (`smsUnreadCount`) và `unreadNoMute` (`smsUnreadNomute`). Handler badge hiện chỉ dùng `unreadNoMute`, nên hội thoại tắt tiếng có tin chưa đọc vẫn cho kết quả 0. Sự kiện phát lại khi dữ liệu chưa đọc tải từ cơ sở dữ liệu và khi trạng thái đọc thay đổi. Bản vá cần chụp trạng thái ngay sau đăng ký để tránh bỏ sót lần tải đầu. Bundle renderer là đầu vào build, nên sửa bằng script trong `scripts/patches/`, không sửa `app/` trực tiếp.

**Alternatives considered**: Đọc tiêu đề cửa sổ hoặc badge trong DOM (không bảo đảm cập nhật khi ẩn/đọc hết); đếm popup thông báo (sai khi tắt thông báo); dùng nguyên `unreadNoMute` (bỏ sót hội thoại tắt tiếng).

## Quyết định 2: Đường truyền đến tiến trình chính

**Decision**: Nghe sự kiện IPC sẵn có `badge-count` do `$zapp.updateBadgeCount` gửi. Một controller áp dụng trạng thái này cho cả taskbar và khay hệ thống.

**Rationale**: `app/main-dist/compact-app.js` đã đăng ký handler `badge-count`, với số đếm ở đối số đầu tiên sau event; Zalo gọi `app.setBadgeCount` trên Linux nhưng không cập nhật ảnh khay. `plugins/launcher-badge` và bản vá `patch-notification-badge.js` hiện nghe một tên IPC riêng (`zalo-notification-badge-count`) mà bundle không gửi; hai đường đó còn trùng lặp. Handler gốc có thể tiếp tục hoạt động song song trong lúc wrapper quan sát cùng sự kiện.

**Alternatives considered**: Tạo IPC mới trong renderer (thêm kênh không cần thiết); chỉ dựa vào `app.setBadgeCount` của bundle (không cập nhật khay và không giải quyết nguồn tin tắt tiếng).

## Quyết định 3: Badge thanh tác vụ trên KDE

**Decision**: Gắn badge với ID `.desktop` thực tế và phát từ kết nối còn sống. Kiểm chứng `app.setBadgeCount` của Electron 22 trước; chỉ thêm client D-Bus duy trì kết nối nếu đường native không tạo badge ổn định trên KDE.

**Rationale**: KDE Task Manager nhận `com.canonical.Unity.LauncherEntry.Update`, tìm ứng dụng theo `application://<desktop-file>` và loại badge khi tiến trình gửi rời bus. Lệnh `gdbus emit` hiện tại là tiến trình ngắn hạn, nên không thể là nguồn badge bền. Trên máy thử nghiệm có `/usr/share/applications/zalo.desktop`, còn các gói có thể dùng ID khác; cần đối chiếu file cài thực tế. KDE cũng tự ẩn badge taskbar khi bật Không làm phiền hoặc tắt badge trong Task Manager; đó là giới hạn của môi trường, không dùng cách thay icon cửa sổ để lách vì KDE ưu tiên icon của launcher đã cài.

**Alternatives considered**: Giữ `gdbus emit` một lần (KDE xóa trạng thái khi sender thoát); đổi icon `BrowserWindow` (không đáng tin với launcher đã ghim); thêm D-Bus dependency ngay (chỉ làm khi native path không đủ).

**Sources**: [KDE Smart Launcher backend](https://github.com/KDE/plasma-desktop/blob/master/applets/taskmanager/smartlauncherbackend.cpp), [Electron 22 app API](https://github.com/electron/electron/blob/v22.3.27/docs/api/app.md), [Flatpak Electron desktop integration](https://github.com/flatpak/flatpak-docs/blob/master/docs/electron.rst).

## Quyết định 4: Badge khay hệ thống

**Decision**: Chuyển `Tray.setImage` giữa icon gốc và PNG có dấu chấm đóng gói sẵn.

**Rationale**: Tray hiện được tạo bằng một ảnh cố định trong `main.js`; handler Zalo chỉ cập nhật tray ở nhánh Windows. Electron 22 hỗ trợ thay ảnh Tray và đọc PNG, nhưng không có API vẽ chồng dấu chấm trên ảnh ở tiến trình chính. Hai ảnh là thay đổi runtime nhỏ nhất và không cần thư viện ảnh mới.

**Alternatives considered**: Vẽ icon động bằng renderer hoặc thêm thư viện xử lý ảnh (thêm luồng và phụ thuộc không cần thiết); chỉ đổi tooltip (không đáp ứng dấu trên icon).

**Sources**: [Electron 22 Tray API](https://github.com/electron/electron/blob/v22.3.27/docs/api/tray.md), [Electron 22 nativeImage API](https://github.com/electron/electron/blob/v22.3.27/docs/api/native-image.md).

## Giới hạn nghiệm thu

Trường hợp bắt buộc đầu tiên là KDE Plasma với thông báo Zalo bật và Không làm phiền tắt, đúng hiện tượng người dùng báo. Sau đó kiểm tra thông báo Zalo tắt, cửa sổ ẩn, hội thoại tắt tiếng, đọc hết và khởi động lại. Badge taskbar khi KDE bật Không làm phiền không được bảo đảm vì KDE chủ động ẩn nó; icon khay vẫn có thể hiển thị dấu chấm.
