# Feature Specification: Badge tin nhắn chưa đọc trên biểu tượng Zalo

**Feature Branch**: `main` (chưa tạo nhánh riêng)

**Created**: 2026-09-28

**Status**: Draft

**Input**: User description: "Thêm badge dạng numeric hoặc dot vào góc icon khi có thông báo tin nhắn mới. Khi cửa sổ đang bị ẩn, dù bật hay tắt thông báo, icon ở taskbar và notification bar đều có dot badge hoặc numeric badge. Trên KDE Plasma, ngay cả khi bật thông báo và không bật Không làm phiền vẫn không thấy badge."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Nhận biết tin chưa đọc khi cửa sổ ẩn (Priority: P1)

Khi Zalo đang chạy trên KDE Plasma nhưng cửa sổ bị ẩn, người dùng muốn nhìn vào biểu tượng Zalo trên thanh tác vụ và khay hệ thống (vùng thông báo) để biết có tin nhắn chưa đọc, dù đã bật hoặc tắt thông báo.

**Why this priority**: Đây là tình huống người dùng hiện không có tín hiệu để nhận biết tin nhắn mới.

**Independent Test**: Trên KDE Plasma, ẩn cửa sổ, thử lần lượt khi bật và tắt thông báo, gửi một tin nhắn đến tài khoản đang đăng nhập; quan sát dấu trên cả hai biểu tượng mà không mở cửa sổ.

**Acceptance Scenarios**:

1. **Given** Zalo đang chạy trên KDE Plasma, Không làm phiền đang tắt, thông báo Zalo đang bật, cửa sổ bị ẩn, thanh tác vụ và khay hệ thống đều hiển thị biểu tượng Zalo, và chưa có tin chưa đọc, **When** một tin nhắn mới đến và vẫn chưa được đọc, **Then** cả hai biểu tượng đều có badge dạng chấm hoặc số ở góc biểu tượng.
2. **Given** cùng trạng thái trên nhưng thông báo Zalo đã bị tắt, **When** một tin nhắn mới đến và vẫn chưa được đọc, **Then** badge vẫn xuất hiện trên cả hai biểu tượng.
3. **Given** cùng trạng thái trên và thông báo Zalo đang bật, **When** một tin nhắn mới đến và vẫn chưa được đọc, **Then** badge xuất hiện trên cả hai biểu tượng, bất kể thông báo bật lên có được hiển thị hay không.

---

### User Story 2 - Badge phản ánh đúng trạng thái chưa đọc (Priority: P2)

Người dùng muốn badge còn hiển thị chừng nào vẫn có tin nhắn chưa đọc và biến mất khi đã đọc hết, để biểu tượng không báo sai.

**Why this priority**: Badge chỉ hữu ích khi phản ánh tình trạng hiện tại.

**Independent Test**: Tạo tin chưa đọc trong hai cuộc trò chuyện, đọc lần lượt từng cuộc, rồi khởi động lại ứng dụng ở cả trạng thái còn và không còn tin chưa đọc.

**Acceptance Scenarios**:

1. **Given** có tin chưa đọc ở hai cuộc trò chuyện, **When** người dùng đọc hết tin ở một cuộc trò chuyện, **Then** badge vẫn còn trên các biểu tượng đang hiển thị.
2. **Given** có tin chưa đọc, **When** người dùng đọc hết tin chưa đọc, **Then** badge biến mất khỏi cả hai biểu tượng.
3. **Given** ứng dụng khởi động lại và tài khoản vẫn còn tin chưa đọc, **When** trạng thái tin nhắn được tải xong, **Then** badge xuất hiện lại mà không cần tin nhắn mới đến.
4. **Given** tài khoản không còn tin chưa đọc, **When** người dùng đăng xuất hoặc ứng dụng khởi động lại, **Then** không có badge cũ còn hiển thị.

### Edge Cases

- Nếu tin nhắn đến cuộc trò chuyện đang mở và được đánh dấu đã đọc ngay, badge phải theo trạng thái chưa đọc thực tế thay vì chỉ theo sự kiện tin nhắn đến.
- Tin nhắn chưa đọc trong cuộc trò chuyện bị tắt tiếng vẫn giữ badge; tắt tiếng cuộc trò chuyện không đồng nghĩa với đã đọc.
- Nếu tin được đánh dấu đã đọc trên thiết bị khác và trạng thái đồng bộ về ứng dụng, badge phải biến mất khi không còn tin chưa đọc.
- Nếu một trong hai vị trí không hiển thị biểu tượng Zalo do cấu hình môi trường máy tính, vị trí còn hiển thị vẫn phải cập nhật; khi biểu tượng xuất hiện lại, badge phải phản ánh trạng thái hiện tại.
- Thông báo không phải tin nhắn mới không tạo badge tin nhắn chưa đọc.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Ứng dụng PHẢI hiển thị badge dạng chấm hoặc số ở góc biểu tượng Zalo trên thanh tác vụ khi tài khoản đang đăng nhập có ít nhất một tin nhắn chưa đọc và biểu tượng đó đang được hiển thị.
- **FR-002**: Ứng dụng PHẢI hiển thị badge dạng chấm hoặc số ở góc biểu tượng Zalo trong khay hệ thống (vùng thông báo) khi có ít nhất một tin nhắn chưa đọc và biểu tượng đó đang được hiển thị.
- **FR-003**: Badge trên cả hai biểu tượng PHẢI hoạt động trên KDE Plasma khi cửa sổ Zalo hiện, bị thu nhỏ hoặc bị ẩn và Không làm phiền đang tắt; việc bật hoặc tắt thông báo Zalo không được làm thay đổi quy tắc hiển thị badge.
- **FR-004**: Badge PHẢI duy trì khi vẫn còn ít nhất một tin nhắn chưa đọc và PHẢI biến mất khi không còn tin nhắn chưa đọc, kể cả sau khi trạng thái đã đọc được đồng bộ từ thiết bị khác.
- **FR-005**: Sau khi ứng dụng khởi động hoặc biểu tượng xuất hiện trở lại, badge PHẢI phản ánh trạng thái tin chưa đọc hiện tại của tài khoản đang đăng nhập; badge của phiên trước không được giữ lại sau đăng xuất.
- **FR-006**: Chỉ trạng thái tin nhắn chưa đọc được phép quyết định badge này; thông báo không phải tin nhắn không được tự tạo badge.
- **FR-007**: Khi không có tin nhắn chưa đọc, biểu tượng PHẢI hiển thị bình thường, không có chấm hoặc số 0.

### Key Entities *(include if feature involves data)*

- **Trạng thái tin nhắn chưa đọc**: Tình trạng còn hoặc không còn tin nhắn chưa đọc của tài khoản đang đăng nhập; thay đổi khi có tin mới, khi đọc tin hoặc khi đồng bộ trạng thái đã đọc.
- **Badge biểu tượng**: Dấu hiệu trực quan trên biểu tượng Zalo ở thanh tác vụ hoặc vùng thông báo, có hai trạng thái: hiện khi còn tin chưa đọc và ẩn khi đã đọc hết.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Trong 100% trường hợp kiểm thử trên KDE Plasma có tin chưa đọc và cả hai biểu tượng đều hiện, người dùng thấy badge ở cả hai vị trí trong vòng 5 giây sau khi trạng thái tin chưa đọc được cập nhật, với cửa sổ hiện, thu nhỏ và ẩn.
- **SC-002**: Trong 100% trường hợp kiểm thử trên KDE Plasma với Không làm phiền tắt và thông báo Zalo bật hoặc tắt, badge vẫn xuất hiện khi có tin chưa đọc và biến mất trong vòng 5 giây sau khi đọc hết.
- **SC-003**: Sau khi khởi động lại ứng dụng, 100% trường hợp kiểm thử hiển thị badge đúng với trạng thái còn hoặc không còn tin chưa đọc trong vòng 5 giây sau khi danh sách tin nhắn tải xong.
- **SC-004**: Ít nhất 9 trên 10 người tham gia thử nghiệm nhận biết được có tin chưa đọc từ biểu tượng Zalo trong vòng 5 giây mà không mở cửa sổ ứng dụng.

## Assumptions

- Dấu chấm là mức hiển thị tối thiểu; số lượng là cách hiển thị thay thế nếu môi trường máy tính hỗ trợ. Tính năng không yêu cầu người dùng chọn kiểu badge.
- KDE Plasma là môi trường bắt buộc để nghiệm thu; trên các môi trường Linux khác, áp dụng cùng quy tắc ở những vị trí thực sự hiển thị biểu tượng Zalo.
- Ca nghiệm thu bắt buộc chạy khi KDE Plasma không bật Không làm phiền; KDE có thể tự ẩn badge thanh tác vụ khi bật chế độ này.
- Trạng thái đã đọc/chưa đọc của Zalo là nguồn xác định badge; sự xuất hiện của thông báo bật lên không phải nguồn xác định.
- Yêu cầu đối với từng vị trí áp dụng khi môi trường máy tính thực sự hiển thị biểu tượng Zalo tại vị trí đó.
- Phạm vi chỉ gồm tin nhắn của tài khoản đang đăng nhập và các biểu tượng Zalo ngoài cửa sổ ứng dụng; không thay đổi badge bên trong giao diện trò chuyện.
