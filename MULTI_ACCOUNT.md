# Chạy nhiều tài khoản Zalo song song

Hướng dẫn chạy 2 (hoặc nhiều) phiên Zalo cùng lúc trên Linux để đăng nhập các tài khoản khác nhau.

## Nguyên lý

Zalo lưu toàn bộ dữ liệu (phiên đăng nhập, tin nhắn, cache…) trong
`$XDG_CONFIG_HOME/ZaloData` (mặc định là `~/.config/ZaloData`), và chỉ cho phép
**một phiên duy nhất cho mỗi thư mục dữ liệu**. Khi mở lần thứ hai, phiên mới sẽ
tự thoát và chỉ đưa cửa sổ cũ lên.

Vì vậy, để chạy song song, chỉ cần cho mỗi phiên một `XDG_CONFIG_HOME` riêng:
mỗi phiên sẽ có thư mục dữ liệu và khóa phiên riêng, hoàn toàn độc lập với nhau.

> **Lưu ý:** cờ `--user-data-dir` của Electron **không dùng được** — Zalo tự đặt
> lại thư mục dữ liệu dựa trên `XDG_CONFIG_HOME` trong lúc khởi động.

## Chạy từ terminal

Tài khoản chính mở như bình thường:

```bash
zalo
```

Tài khoản thứ hai:

```bash
XDG_CONFIG_HOME=~/.config/zalo-profiles/account2 zalo
```

- Dữ liệu tài khoản 2 nằm ở `~/.config/zalo-profiles/account2/ZaloData`.
- Đăng nhập được lưu lại, lần sau mở lại không cần quét mã QR.
- Muốn thêm tài khoản thứ 3, thứ 4… chỉ cần đổi tên thư mục (`account3`, `account4`, …).

> Nếu dùng bản AppImage thay vì `.deb`, thay `zalo` bằng đường dẫn tới file
> `.AppImage` (và thêm `--no-sandbox` nếu gặp lỗi SUID sandbox).

## Tạo biểu tượng trong menu ứng dụng

Chạy lệnh sau để tạo file `~/.local/share/applications/zalo-account2.desktop`
(biến `$HOME` sẽ được tự điền đúng đường dẫn trên máy của bạn):

```bash
cat > ~/.local/share/applications/zalo-account2.desktop <<EOF
[Desktop Entry]
Name=Zalo (Tài khoản 2)
Exec=env XDG_CONFIG_HOME=$HOME/.config/zalo-profiles/account2 /opt/Zalo/zalo %U
Icon=zalo
Type=Application
Categories=Network;
StartupWMClass=zalo
EOF
update-desktop-database ~/.local/share/applications
```

Sau đó "Zalo (Tài khoản 2)" sẽ xuất hiện trong menu ứng dụng.

## Những điều cần biết

- **Gõ tiếng Việt:** fcitx5 kết nối qua D-Bus nên không bị ảnh hưởng. Nếu dùng
  **IBus** mà phiên thứ 2 không gõ được tiếng Việt, liên kết thư mục cấu hình
  IBus sang profile mới:

  ```bash
  rm -rf ~/.config/zalo-profiles/account2/ibus
  ln -s ~/.config/ibus ~/.config/zalo-profiles/account2/ibus
  ```

- **Thanh tác vụ:** hai cửa sổ cùng tên ứng dụng (`zalo`) nên sẽ được gộp chung
  một biểu tượng trên taskbar/dock, và khay hệ thống sẽ có 2 biểu tượng Zalo.

- **Khởi động cùng hệ thống:** tùy chọn *"Khởi động Zalo cùng hệ thống"* trong
  phiên thứ 2 sẽ ghi file autostart vào thư mục profile chứ không phải
  `~/.config/autostart/`, nên **không có tác dụng**. Muốn tài khoản 2 tự khởi
  động, tạo file autostart từ biểu tượng menu ở trên:

  ```bash
  sed 's|%U$|--hidden|' ~/.local/share/applications/zalo-account2.desktop \
    > ~/.config/autostart/zalo-account2.desktop
  ```

- **Gọi điện:** mỗi phiên có Wine prefix riêng cho tính năng gọi điện, nên phiên
  thứ 2 sẽ tự thiết lập lại ở lần gọi đầu tiên.

- **Log lúc khởi động lần đầu:** các thông báo `spawn codesign ENOENT` (công cụ
  riêng của macOS) và `Failed to parse meta` (profile mới) là vô hại.

## Xóa một tài khoản

Thoát phiên đó rồi xóa thư mục profile và file `.desktop` tương ứng:

```bash
rm -rf ~/.config/zalo-profiles/account2
rm -f ~/.local/share/applications/zalo-account2.desktop ~/.config/autostart/zalo-account2.desktop
```
