# Tasks: Badge tin nhắn chưa đọc trên biểu tượng Zalo

**Input**: `specs/001-message-icon-badge/spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/badge.md`, `quickstart.md`

**Prerequisites**: KDE Plasma đang hiển thị biểu tượng Zalo ở thanh tác vụ và khay hệ thống; Không làm phiền tắt.

**Tests**: Một kiểm tra `node --test` nhỏ cho luồng badge và các ca nghiệm thu thủ công trong `quickstart.md`, theo `plan.md`.

**Organization**: Mỗi user story có một pha riêng. US1 tạo badge hoạt động cho tin mới; US2 giữ badge đúng qua đọc tin, khởi động lại và đăng xuất.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Có thể chạy song song sau khi các nhiệm vụ phụ thuộc đã xong; không sửa cùng file.
- **[Story]**: `[US1]` hoặc `[US2]` theo `spec.md`.
- Mọi đường dẫn trong nhiệm vụ tính từ gốc repository.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Ghi nhận lỗi gốc và môi trường KDE trước khi thay đổi mã.

- [ ] T001 Tái hiện ca thông báo Zalo bật, Không làm phiền tắt, cửa sổ ẩn trên KDE Wayland; kiểm tra `badge-count`, tín hiệu `com.canonical.Unity.LauncherEntry.Update`, thiết lập badge của Task Manager và ID `.desktop` đang nhóm cửa sổ, rồi ghi kết quả vào `specs/001-message-icon-badge/research.md` (tham khảo `specs/001-message-icon-badge/quickstart.md`).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Chốt điểm nối vào bundle của phiên bản Zalo hiện tại, dùng chung cho cả hai story.

- [ ] T002 Đối chiếu `app/pc-dist/compact-app-pc.*.js`, bản sao `app/pc-dist/lazy/default-login-main-startup-shared-worker-znotification.*.js` nếu có, và `app/main-dist/compact-app.js` với `totalUnread`, `unreadNoMute` và payload `badge-count`; ghi chuỗi neo bản vá cùng thứ tự đối số vào `specs/001-message-icon-badge/research.md` để bản vá fail rõ khi nguồn thay đổi.

**Checkpoint**: Đã biết tin chưa đọc đi qua nguồn nào và taskbar hiện nhận định danh ứng dụng nào.

---

## Phase 3: User Story 1 - Nhận biết tin chưa đọc khi cửa sổ ẩn (Priority: P1) 🎯 MVP

**Goal**: Có ít nhất một tin chưa đọc thì biểu tượng taskbar và khay KDE có badge, dù thông báo Zalo bật hoặc tắt và cửa sổ bị ẩn.

**Independent Test**: Với Không làm phiền tắt và cả hai icon đang hiện, gửi tin mới khi cửa sổ ẩn; cả hai badge xuất hiện trong 5 giây khi thông báo Zalo bật, rồi lặp khi thông báo Zalo tắt. Tin trong hội thoại tắt tiếng cũng làm badge hiện.

### Tests for User Story 1

- [ ] T003 [P] [US1] Viết một kiểm tra `node:test` trong `test/launcher-badge.test.js` cho `totalUnread` là số nguyên không âm, `hasUnread = totalUnread > 0`, IPC `badge-count` và ảnh tray `normal`/`dot`; chạy kiểm tra để xác nhận nó thất bại trước khi viết phần xử lý.

### Implementation for User Story 1

- [ ] T004 [P] [US1] Tạo `assets/tray-unread.png` từ biểu tượng Zalo với dấu chấm dễ thấy ở kích thước khay 16–24 px; giữ `app/pc-dist/favicon-512x512.png` làm ảnh bình thường và xác nhận asset mới được đóng gói bởi `package.json`.
- [ ] T005 [US1] Thêm bản vá exact-match trong `scripts/patches/patch-unread-badge-source.js` và gọi nó từ `scripts/prepare-app.js`: handler badge của cửa sổ chính phải dùng `totalUnread` thay `unreadNoMute`, gồm bản sao bundle được dùng lúc chạy; báo lỗi nếu chuỗi neo không còn khớp, không sửa trực tiếp file theo dõi dưới `app/`.
- [ ] T006 [US1] Trong `plugins/launcher-badge/index.js`, thay IPC riêng và parser tiêu đề bằng listener `badge-count`; từ số nguyên không âm suy ra `hasUnread = count > 0`, đổi `Tray.setImage` sang `assets/tray-unread.png` khi true và ảnh gốc khi false, không phụ thuộc popup thông báo hoặc cửa sổ hiện/ẩn.
- [ ] T007 [P] [US1] Trong `main.js`, truyền Tray và hai đường dẫn ảnh cho `plugins/launcher-badge/index.js` sau khi tạo Tray, đồng thời giữ controller hoạt động nếu máy không có khay hệ thống.
- [ ] T008 [P] [US1] Trong `plugins/launcher-badge/index.js`, bỏ `gdbus emit` ngắn hạn và bảo đảm `taskbarBadgeRequested = hasUnread` được phát từ kết nối sống cùng ứng dụng cho đúng ID `.desktop` ghi ở T001; dùng `app.setBadgeCount` nếu T001 xác nhận nó bền trên KDE, còn nếu không thì dùng client D-Bus sống cùng ứng dụng (cập nhật `package.json` chỉ khi cần phụ thuộc).
- [ ] T009 [P] [US1] Bỏ lệnh gọi bản vá IPC riêng cũ trong `scripts/prepare-app.js` và xóa `scripts/patches/patch-notification-badge.js` sau khi T005 được nối vào pipeline; không để hai publisher badge cạnh tranh.
- [ ] T010 [US1] Chạy ca 1–3 của `specs/001-message-icon-badge/quickstart.md` trên bản build KDE mới, ghi kết quả hai icon, bật/tắt thông báo Zalo, hội thoại tắt tiếng và thời gian hiển thị vào chính file đó; chỉ đánh dấu US1 xong khi cả hai icon đạt.

**Checkpoint**: US1 chạy độc lập như MVP; còn tin chưa đọc thì có badge ở cả hai vị trí, không cần hoàn thiện khôi phục sau khởi động.

---

## Phase 4: User Story 2 - Badge phản ánh đúng trạng thái chưa đọc (Priority: P2)

**Goal**: Badge còn khi vẫn có tin chưa đọc và biến mất khi đọc hết, đồng bộ đã đọc, đăng xuất; khi khởi động lại phải phản ánh dữ liệu đã tải.

**Independent Test**: Tạo tin chưa đọc ở hai cuộc trò chuyện, đọc từng cuộc, khởi động lại khi còn tin, đánh dấu đã đọc từ thiết bị khác, rồi đăng xuất; hai icon luôn cùng trạng thái và không có dấu cũ.

### Tests for User Story 2

- [ ] T011 [US2] Mở rộng `test/launcher-badge.test.js` cho chuỗi `0 → dương → dương → 0`, cập nhật trùng không đổi ảnh, giá trị ban đầu sau tải dữ liệu và đặt 0 khi đăng xuất/thoát; chạy kiểm tra để xác nhận các ca mới thất bại trước khi sửa mã.

### Implementation for User Story 2

- [ ] T012 [P] [US2] Trong `scripts/patches/patch-unread-badge-source.js`, sau khi đăng ký sự kiện hãy phát trạng thái ban đầu từ tổng chưa đọc đã tải và đặt 0 khi Zalo đăng xuất; vẫn dùng `totalUnread` là số nguyên không âm, gồm hội thoại tắt tiếng.
- [ ] T013 [P] [US2] Trong `plugins/launcher-badge/index.js`, chỉ cập nhật khi `hasUnread` đổi, khôi phục ảnh `normal` và xóa badge taskbar khi nhận 0 hoặc `before-quit`, không để badge của tài khoản cũ sau đăng xuất hay sự kiện đồng bộ đã đọc.
- [ ] T014 [US2] Chạy ca 4–6 của `specs/001-message-icon-badge/quickstart.md` trên KDE: đọc một trong hai cuộc trò chuyện, đọc hết, đồng bộ từ thiết bị khác, khởi động lại, đăng xuất và cửa sổ hiện/thu nhỏ; ghi kết quả và độ trễ vào file đó.

**Checkpoint**: US2 có thể kiểm chứng riêng bằng các chuyển trạng thái, trên nền badge đã có của US1.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Xác nhận bản vá đi qua quy trình build và gói phát hành.

- [ ] T015 Chạy `node --test test/launcher-badge.test.js`, `npm run main:setup` và `npm run main:build`; xác nhận `assets/tray-unread.png` có trong bản đóng gói, bản vá nguồn chưa đọc fail rõ khi bundle đổi, rồi chạy lại ca lỗi gốc trong `specs/001-message-icon-badge/quickstart.md` và ghi mọi giới hạn còn lại ở đó.

---

## Dependencies & Execution Order

### Phase Dependencies

```text
T001 (KDE baseline) → T002 (bundle/IPC anchors) → US1 (T003–T010) → US2 (T011–T014) → T015
```

- T005 cần T002. T006 cần T003–T005. T007 và T008 cần T006. T009 cần T005. T010 cần T004–T009.
- US2 dùng controller và bản vá của US1: T011 chạy trước T012–T013; T014 cần T011–T013. T015 cần cả hai story.
- T003 và T004 độc lập; T007, T008 và T009 sửa các file khác nhau sau các tiền nhiệm; T012 và T013 sửa các file khác nhau.

### User Story Dependencies

- **US1 (P1)**: Bắt đầu sau T002; tạo giá trị sử dụng được cho người dùng và là phạm vi MVP.
- **US2 (P2)**: Cần badge cơ bản của US1 nhưng có tiêu chí nghiệm thu chuyển trạng thái riêng.

## Parallel Execution Examples

### User Story 1

Sau T002, T003 (`test/launcher-badge.test.js`) và T004 (`assets/tray-unread.png`) có thể thực hiện song song. Sau T005–T006, T007 (`main.js`), T008 (`plugins/launcher-badge/index.js` và có thể `package.json`) và T009 (`scripts/prepare-app.js`) có thể thực hiện song song.

### User Story 2

Sau T011, T012 (`scripts/patches/patch-unread-badge-source.js`) và T013 (`plugins/launcher-badge/index.js`) có thể thực hiện song song; T014 là bước tích hợp chung.

## Implementation Strategy

1. Hoàn thành T001–T002 để khoanh đúng nguyên nhân KDE và chuỗi neo của phiên bản Zalo đang dùng.
2. Hoàn thành US1, chạy T010 và chỉ nhận MVP khi cả taskbar lẫn khay có badge ở ca người dùng báo lỗi.
3. Hoàn thành US2, chạy T014 để bảo đảm badge không mắc kẹt sau đọc tin hoặc khởi động lại.
4. Chạy T015 trên bản đóng gói, không chỉ trên mã nguồn hoặc ứng dụng dev.

## Notes

- `[P]` chỉ đánh dấu các nhiệm vụ không sửa cùng file sau khi tiền nhiệm đã hoàn tất.
- Badge taskbar khi KDE bật Không làm phiền nằm ngoài ca nghiệm thu bắt buộc vì KDE có thể tự ẩn nó; khay vẫn phải theo trạng thái chưa đọc.
