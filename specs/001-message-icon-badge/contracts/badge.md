# Badge Contract

## Hành vi người dùng nhìn thấy

| Trạng thái | Taskbar KDE | Khay hệ thống |
|------------|-------------|---------------|
| Không có tin nhắn chưa đọc | Icon thường | Icon thường |
| Có ít nhất một tin chưa đọc, thông báo Zalo bật, Không làm phiền tắt | Badge chấm hoặc số | Dấu chấm |
| Có ít nhất một tin chưa đọc, thông báo Zalo tắt, Không làm phiền tắt | Badge chấm hoặc số | Dấu chấm |
| Cửa sổ hiện, thu nhỏ hoặc ẩn | Theo trạng thái chưa đọc | Theo trạng thái chưa đọc |
| KDE bật Không làm phiền | KDE có thể ẩn badge | Dấu chấm vẫn theo trạng thái chưa đọc |

Badge không hiện tên người gửi hoặc nội dung tin nhắn. Khi một vị trí không có biểu tượng, vị trí còn lại vẫn cập nhật.

## Tín hiệu tích hợp nội bộ

Renderer của Zalo phát sự kiện `badge-count` qua `$zapp.updateBadgeCount`; đối số đầu tiên là số tin chưa đọc. Wrapper quy về `hasUnread = count > 0` và không dựa vào các đối số ảnh/trạng thái focus. Giá trị 0 xóa badge. Nguồn số đếm đã được bản vá build đổi thành tổng số tin chưa đọc, gồm hội thoại tắt tiếng. Đây là kênh nội bộ, không phải API công khai.
