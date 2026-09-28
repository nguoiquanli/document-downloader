# Changelog

## 2.1.1 — 2026-09-28

- Đối chiếu StudocuHack v2.12.1 và tích hợp sửa lỗi phù hợp cho trình xem Studocu.
- Ẩn hộp thoại đăng nhập chống bot không thể đóng khi nó che tài liệu đã tải.
- Gỡ khóa cuộn trên `html` và `body` do hộp thoại này tạo ra, gồm cả trường hợp Android.
- Chỉ tác động tới `AuthWall` không có lớp `hideable`; các hộp đăng nhập do người dùng chủ động mở vẫn hoạt động.
- Không tích hợp website và GitHub Pages mới của StudocuHack vì không thuộc chức năng extension.

## 2.1.0 — 2026-09-22

- Đối chiếu và chọn lọc các thay đổi phù hợp từ StudocuHack v2.11.0–v2.12.0.
- Bổ sung hỗ trợ miền `studocu.id`, bao gồm content script, quyền truy cập và xử lý cookie.
- Sửa URL text fragment của trang 10 trở đi: fragment dùng số thập phân, chỉ ảnh nền `bg*.png` dùng số hexadecimal.
- Làm sạch fragment bằng DOM và sửa ảnh figure tương đối sang URL CDN đã ký trước khi chèn.
- Khôi phục chính xác vị trí cuộn của cửa sổ hoặc viewer sau khi capture.
- Tạo `@page` riêng theo kích thước thật của từng trang, hỗ trợ tài liệu có trang dọc và ngang xen kẽ.
- Nhận diện nút Download gốc bằng nhãn đa ngôn ngữ và đánh dấu bằng thuộc tính ổn định.
- Thêm số trang, hướng dẫn lưu PDF và phím Esc cho overlay Studocu.
- Tạm dừng quét định kỳ khi tab bị ẩn để giảm tài nguyên.
- Giữ nguyên tối ưu capture 75 ms và nhúng ảnh đồng thời 12 luồng của Document Downloader.

## 2.0.3 — 2026-09-07

- Nhận diện nút tải Scribd bằng thuộc tính `data-e2e` chứa vai trò tải và cấu trúc DropdownMenu, không phụ thuộc vào ngôn ngữ của nhãn.
- Sao chép nguyên nội dung hiển thị của nút Scribd gốc sang nút thay thế rồi loại bỏ listener dropdown.
- SlideShare giữ nguyên nhãn bản địa hóa lấy từ element `.ellipsis` của nút gốc, không ép tên “Download” và không tạo nhãn trùng.
- Mở rộng content script Scribd ra toàn miền và nhận diện ID tài liệu trong cả đường dẫn có tiền tố ngôn ngữ.
- Hoàn thiện README với mô tả kỹ thuật, credit nguồn tham khảo và miễn trừ trách nhiệm cho mục đích học tập.

## 2.0.2 — 2026-09-07

- Lấy liên kết Embed của SlideShare trực tiếp từ trường `secretUrl` trong dữ liệu trang, không còn mở hoặc thao tác với hộp thoại Embed.
- Thay nút Download dạng dropdown của Scribd bằng nút một hành động độc lập để loại bỏ hoàn toàn hiện tượng menu chớp khi rê chuột.
- Không còn đóng hoặc xóa các menu khác của Scribd, giữ nguyên hoạt động của Share và các tính năng còn lại.
- Loại bỏ nút Download và Print trong nhóm menu thao tác tài liệu của Scribd.
- Xác nhận và duy trì đầy đủ quyền truy cập cho các miền Studocu, Studeersnel, Scribd, SlideShare và SlideShare CDN.

## 2.0.1 — 2026-09-04

- Tăng tốc capture Studocu bằng cách giảm chu kỳ kiểm tra trạng thái trang từ 150 ms xuống 75 ms.
- Giảm thời gian chờ tối đa cho một trang chưa ổn định từ khoảng 4,5 giây xuống khoảng 2,5 giây.
- Tăng số ảnh được tải và nhúng đồng thời từ 6 lên 12.
- Giữ nguyên capture tuần tự để tương thích với virtual scroller và tránh bỏ sót trang.
- Kiểm tra và xác nhận toàn extension không còn `console.*`, `debugger` hoặc mã chẩn đoán runtime.

## 2.0.0 — 2026-09-04

- Hợp nhất bộ tải Studocu, Scribd và SlideShare thành Chrome extension Manifest V3.
- Tách logic theo từng website để dễ bảo trì.
- Thêm luồng Embed và xử lý ảnh 2048 cho SlideShare.
- Thêm bố cục in A4 cho Scribd và Studocu.
- Việt hóa giao diện tải và thêm thao tác lưu có xác nhận.
- Loại bỏ nút “Download free for 30 days” khỏi thanh trên cùng của Scribd và SlideShare.
- Loại bỏ mã debug khỏi bản phát hành.
- Ẩn CTA dùng thử bằng CSS tải sớm và MutationObserver trên Scribd/SlideShare.
- Tái sử dụng nút Download gốc của Studocu cho chức năng lưu PDF và đổi nút sang xanh biển.
- Xóa cookie Studocu/Studeersnel khi bắt đầu nạp trang để khởi tạo phiên xem sạch.
- Chạy module Studocu từ `document_start` và tái áp dụng trạng thái chống blur khi DOM thay đổi.
- Bắt trực tiếp nút Download gốc bằng CSS và capture event, không còn chậm hoặc mất thay thế khi React dựng lại thanh công cụ lúc cuộn.
- Khôi phục cơ chế in gốc ổn định của StudocuHack: in trực tiếp các trang `.pf` đã clone trong `.p2hv`, không bọc trang A4, không tự scale và không dùng iframe.
- Khôi phục thời gian chờ trang ổn định cùng mức đồng thời nhúng ảnh của StudocuHack v2.11.0 để tránh clone nội dung chưa dựng xong.
