# Quickstart: Kiểm chứng badge trên KDE Plasma

## Điều kiện

- Máy chạy KDE Plasma với Không làm phiền tắt; bật hiển thị badge trong Task Manager và hiển thị icon Zalo ở khay hệ thống.
- Có hai tài khoản để gửi tin nhắn thử, tài khoản nhận đã đăng nhập Zalo for Linux.
- Chạy bản build mới của tính năng và tích hợp `.desktop` của chính bản build vào menu ứng dụng; xác nhận taskbar đang nhóm cửa sổ dưới đúng launcher Zalo.

## Chuẩn bị và chạy

```bash
npm install
npm run main:setup
npm run main:build
node --test test/launcher-badge.test.js
```

Chạy AppImage vừa tạo trong `dist/` sau khi tích hợp nó vào menu KDE. Nếu ứng dụng đã cài bằng gói hệ thống, cài bản build mới rồi khởi chạy từ mục Zalo trong menu. Mở cửa sổ Zalo một lần để xác nhận icon taskbar và khay cùng hiện, sau đó ẩn cửa sổ.

## Ca kiểm thử bắt buộc

1. **Ca lỗi gốc**: bật thông báo Zalo, tắt Không làm phiền, gửi một tin mới. Trong 5 giây, taskbar và khay đều có badge. Đọc tin: cả hai badge biến mất trong 5 giây.
2. Tắt thông báo Zalo, gửi tin mới khi cửa sổ ẩn. Badge vẫn xuất hiện ở cả hai vị trí; popup có thể không xuất hiện.
3. Tắt tiếng một cuộc trò chuyện rồi gửi tin vào đó. Badge vẫn hiện cho đến khi đọc; đây là phép thử của `totalUnread`.
4. Tạo tin chưa đọc trong hai cuộc trò chuyện. Đọc một cuộc: badge còn; đọc cuộc thứ hai: badge biến mất. Thử đánh dấu đã đọc từ thiết bị khác và chờ đồng bộ.
5. Để lại tin chưa đọc rồi khởi động lại ứng dụng: badge hiện sau khi dữ liệu tải xong. Đăng xuất: không còn badge cũ.
6. Lặp ca 1 khi cửa sổ hiện và khi thu nhỏ. Nếu có phiên KDE X11, lặp ca 1–2 trên X11.

Nếu taskbar không hiện badge nhưng khay có dấu chấm, kiểm tra ID `.desktop` của launcher đã cài và tín hiệu `com.canonical.Unity.LauncherEntry.Update` từ tiến trình Zalo; xem [research.md](research.md). Khi KDE bật Không làm phiền, taskbar có thể tự ẩn badge; đó không phải ca nghiệm thu bắt buộc.

## Trạng thái kiểm thử môi trường

Ca giao diện KDE sau build chưa chạy được trong sandbox phát triển: kết nối session D-Bus trả về `Operation not permitted`. Người dùng đã xác nhận lỗi nền trên Plasma khi thông báo Zalo bật và Không làm phiền tắt. `npm install` và `npm run main:setup` cũng chưa chạy xong vì DNS registry/Zalo bị chặn; dependency `dbus-next` cần được cài để đồng bộ lockfile trước khi build. Cần chạy lại các ca trên bản build mới để xác nhận icon taskbar và icon khay cùng đổi trạng thái.
