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

**Decision**: Phát `com.canonical.Unity.LauncherEntry.Update` cho `application://zalo.desktop` qua một kết nối session D-Bus còn sống cùng ứng dụng; tiếp tục gọi `app.setBadgeCount` để hỗ trợ Unity.

**Rationale**: Người dùng xác nhận Plasma không hiện badge khi thông báo Zalo bật và Không làm phiền tắt. Electron 22 ghi rõ `app.setBadgeCount` trên Linux chỉ hoạt động với Unity launcher, nên không đủ làm đường chính cho Plasma. KDE Task Manager nhận tín hiệu Unity LauncherEntry theo ID `application://<desktop-file>`; sender ngắn hạn bị mất khi tiến trình gửi rời bus. Môi trường cài đặt có `/usr/share/applications/zalo.desktop`, nên dùng ID `zalo.desktop` mặc định và cho phép ghi đè qua `ZALO_DESKTOP_FILE`. Khi còn tin chưa đọc, phát lại trạng thái mỗi 5 giây để KDE khôi phục badge sau khi biểu tượng xuất hiện lại. KDE vẫn có thể ẩn badge khi bật Không làm phiền hoặc tắt badge trong Task Manager.

**Alternatives considered**: Giữ `gdbus emit` một lần (KDE xóa trạng thái khi sender thoát); đổi icon `BrowserWindow` (không đáng tin với launcher đã ghim); chỉ gọi API native (Electron 22 tài liệu hóa Linux badge cho Unity launcher).

**Sources**: [KDE Smart Launcher backend](https://github.com/KDE/plasma-desktop/blob/master/applets/taskmanager/smartlauncherbackend.cpp), [Electron 22 app API](https://github.com/electron/electron/blob/v22.3.27/docs/api/app.md), [dbus-next](https://github.com/dbusjs/node-dbus-next).

## Quyết định 4: Badge khay hệ thống

**Decision**: Chuyển `Tray.setImage` giữa icon gốc và PNG có dấu chấm đóng gói sẵn.

**Rationale**: Tray hiện được tạo bằng một ảnh cố định trong `main.js`; handler Zalo chỉ cập nhật tray ở nhánh Windows. Electron 22 hỗ trợ thay ảnh Tray và đọc PNG, nhưng không có API vẽ chồng dấu chấm trên ảnh ở tiến trình chính. Hai ảnh là thay đổi runtime nhỏ nhất và không cần thư viện ảnh mới.

**Alternatives considered**: Vẽ icon động bằng renderer hoặc thêm thư viện xử lý ảnh (thêm luồng và phụ thuộc không cần thiết); chỉ đổi tooltip (không đáp ứng dấu trên icon).

**Sources**: [Electron 22 Tray API](https://github.com/electron/electron/blob/v22.3.27/docs/api/tray.md), [Electron 22 nativeImage API](https://github.com/electron/electron/blob/v22.3.27/docs/api/native-image.md).

## Giới hạn nghiệm thu

Trường hợp bắt buộc đầu tiên là KDE Plasma với thông báo Zalo bật và Không làm phiền tắt, đúng hiện tượng người dùng báo. Sau đó kiểm tra thông báo Zalo tắt, cửa sổ ẩn, hội thoại tắt tiếng, đọc hết và khởi động lại. Badge taskbar khi KDE bật Không làm phiền không được bảo đảm vì KDE chủ động ẩn nó; icon khay vẫn có thể hiển thị dấu chấm.

## Kết quả T001 và T002

- Người dùng đã tái hiện lỗi gốc trên KDE Plasma: thông báo Zalo bật, Không làm phiền tắt nhưng không có badge. Môi trường hiện tại báo `XDG_CURRENT_DESKTOP=KDE` và `XDG_SESSION_TYPE=wayland`; lệnh truy cập session D-Bus trong sandbox bị từ chối (`Operation not permitted`), nên chưa thể quan sát trực tiếp Task Manager hoặc chạy lại giao diện sau build.
- Desktop entry cài đặt là `/usr/share/applications/zalo.desktop` với `StartupWMClass=zalo` và `Icon=zalo`.
- Bundle `compact-app-pc.*.js` và bản sao `lazy/default-login-main-startup-shared-worker-znotification.*.js` đều có handler `const{unreadNoMute:t,convId:n,curentUnreadNoMute:a}=e.payload;this.totalCurrent=t;`. Bản vá thay `unreadNoMute:t` bằng `totalUnread:t`; nhánh cửa sổ hội thoại tiếp tục dùng `curentUnreadNoMute:a`.
- Hai bundle đều đăng ký `UnreadDataManager.ChangeUnreadCount` sau 100 ms. Manager có `getUnreadByConvIdSync("total")`; bản vá đọc mục `total` sau đăng ký để khôi phục trạng thái đã tải. Mã đăng xuất trong bundle gọi `$zapp.updateBadgeCount(0)` trước khi tải lại màn hình đăng nhập; handler unread cũng kiểm tra `getDidLogOut()` và ép số đếm về 0.
- `app/main-dist/compact-app.js` nhận IPC `badge-count`; số đếm là đối số đầu tiên sau event. Handler Zalo gọi `app.setBadgeCount` trên Linux nhưng không thay ảnh Tray.
- Runtime KDE và kiểm tra badge hai icon vẫn cần xác nhận theo các ca trong [quickstart.md](quickstart.md); sandbox này không cho phép kết nối tới session D-Bus.
- Cần `dbus-next@0.10.2` để giữ kết nối session D-Bus. Registry npm trả về `EAI_AGAIN` trong môi trường này, nên package chưa được cài và `package-lock.json` chưa có cây dependency đầy đủ; workflow `npm ci` cần được xác nhận sau khi registry truy cập được.
- `npm run main:setup` dừng ở kiểm tra phiên bản vì DNS `zalo.me` không phân giải được. Trích xuất trực tiếp DMG cục bộ không hoàn tất sau vài phút và đã bị dừng; không thể xác nhận trọn pipeline build ở đây.
