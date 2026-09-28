# Implementation Plan: Badge tin nhắn chưa đọc trên biểu tượng Zalo

**Branch**: `main` | **Date**: 2026-09-28 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/001-message-icon-badge/spec.md`

## Summary

Zalo for Linux cần hiện dấu chấm khi còn tin nhắn chưa đọc trên cả biểu tượng thanh tác vụ và khay hệ thống KDE Plasma, kể cả khi tắt thông báo Zalo hoặc ẩn cửa sổ. Dùng sự kiện số tin chưa đọc vốn có của Zalo, nhưng lấy tổng số tin chưa đọc thay vì số chỉ tính các hội thoại chưa tắt tiếng. Đưa một trạng thái badge qua luồng IPC sẵn có đến tiến trình chính; từ đó cập nhật badge thanh tác vụ bằng một kết nối sống cùng ứng dụng và đổi ảnh khay hệ thống giữa biểu tượng thường và biểu tượng có dấu chấm. Không dùng sự kiện thông báo bật lên để suy ra số tin chưa đọc.

## Technical Context

**Language/Version**: JavaScript CommonJS; Electron 22.3.27, Node.js đi kèm Electron và Node.js dùng trong build

**Primary Dependencies**: Electron (`app`, `ipcMain`, `Tray`), Zalo desktop bundle được trích xuất khi build; công cụ hệ thống KDE/DBus để xác minh launcher

**Storage**: Không thêm lưu trữ; trạng thái tin chưa đọc do Zalo quản lý

**Testing**: `node --test` cho bản vá và controller badge; kiểm thử thủ công trên KDE Plasma Wayland với ứng dụng đóng gói

**Target Platform**: Linux desktop, bắt buộc KDE Plasma với Không làm phiền tắt; kiểm tra X11 nếu có phiên thử nghiệm

**Project Type**: Ứng dụng desktop Electron, bọc ứng dụng Zalo gốc

**Performance Goals**: Badge phản ánh trạng thái mới trong 5 giây; cập nhật chỉ khi trạng thái hiện/ẩn thay đổi

**Constraints**: `app/` được tái tạo và không theo dõi trong Git; không sửa trực tiếp bundle đã trích xuất. Tên ứng dụng gửi badge phải khớp `.desktop` đã cài. KDE có thể tự ẩn badge thanh tác vụ khi bật Không làm phiền.

**Scale/Scope**: Một phiên Zalo đang chạy, tài khoản đang đăng nhập, hai vị trí biểu tượng; chỉ cần trạng thái có/không có tin chưa đọc, không cần hiển thị số chính xác

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Không có `.specify/memory/constitution.md`, nên không có quy tắc hiến chương riêng để đối chiếu. Gate trước nghiên cứu: **PASS**. Sau thiết kế: **PASS**; thiết kế dùng các luồng sẵn có, không thêm kho dữ liệu và không sửa trực tiếp `app/`.

## Project Structure

### Documentation (this feature)

```text
specs/001-message-icon-badge/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── badge.md
└── checklists/
    └── requirements.md
```

### Source Code (repository root)

```text
main.js                                  # tạo Tray, đăng ký controller trước bootstrap Zalo
plugins/launcher-badge/index.js          # tiếp nhận trạng thái và cập nhật hai biểu tượng
scripts/prepare-app.js                   # áp dụng bản vá khi tái tạo app/
scripts/patches/patch-notification-badge.js  # bản vá cũ dùng IPC riêng; thay hoặc bỏ
scripts/patches/                          # bản vá nguồn số tin chưa đọc trong renderer
assets/                                   # ảnh khay hệ thống có dấu chấm
test/                                     # kiểm tra bản vá và chuyển trạng thái badge
app/                                      # bundle sinh ra khi build, không sửa trực tiếp
```

**Structure Decision**: Giữ luồng hiện có của dự án. Một controller trong `plugins/launcher-badge` nhận sự kiện badge của Zalo, còn bản vá build chỉ đổi dữ liệu đầu vào của sự kiện đó. Bỏ đường IPC badge riêng và bản vá trùng lặp nếu không còn caller. Không thêm service, cơ sở dữ liệu hay thư viện ảnh ở runtime.

## Design Steps

1. Tái hiện ca lỗi gốc trên KDE: xác nhận `badge-count` có đến tiến trình chính, `app.setBadgeCount` trả về gì, KDE nhận tín hiệu D-Bus nào, launcher thực tế dùng `.desktop` nào và Task Manager có bật badge. Kết quả phân biệt lỗi nguồn số đếm với lỗi gắn biểu tượng.
2. Trong bản vá build, sửa đúng handler badge của renderer để dùng `totalUnread` từ `UnreadDataManager` cho cửa sổ chính; kiểm tra bản vá khớp đúng nguồn của phiên bản Zalo đang đóng gói và fail rõ nếu bundle thay đổi. Đồng bộ giá trị ban đầu sau khi đăng ký sự kiện để không bỏ sót lần tải đầu.
3. Trong wrapper, nghe sự kiện IPC `badge-count` vốn được `$zapp.updateBadgeCount` gửi đi. Quy về một boolean `hasUnread`; bỏ qua lần cập nhật trùng. Bỏ listener dựa trên tiêu đề cửa sổ, IPC badge riêng không có sender và bản vá `patch-notification-badge.js` trùng lặp. Khi đăng xuất hoặc ứng dụng thoát, đặt trạng thái về false. Giữ badge độc lập với cài đặt thông báo Zalo và trạng thái hiển thị cửa sổ.
4. Với thanh tác vụ KDE, dùng đường phát badge có kết nối tồn tại cùng tiến trình ứng dụng và định danh đúng file `.desktop` đã cài. Kiểm chứng lời gọi `app.setBadgeCount` vốn có của Zalo trên Electron 22 trước; bỏ `gdbus emit` ngắn hạn. Nếu kiểm tra D-Bus cho thấy đường native không phát badge lâu bền, dùng client D-Bus sống cùng ứng dụng. Không thêm client D-Bus khi đường Electron hoạt động.
5. Với khay hệ thống, dùng `Tray.setImage` để chuyển giữa icon gốc và một PNG có dấu chấm được đóng gói sẵn. Khôi phục icon gốc khi hết tin chưa đọc. Không gắn nội dung hoặc tên người gửi vào badge.
6. Thêm một kiểm tra tự động nhỏ cho nguồn `totalUnread` và chuyển trạng thái 0 → dương → 0, rồi chạy ma trận kiểm thử KDE trong [quickstart.md](quickstart.md), gồm ca lỗi gốc: bật thông báo, Không làm phiền tắt, cửa sổ ẩn.

## Complexity Tracking

Không có vi phạm hiến chương cần biện minh.
