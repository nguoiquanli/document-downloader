# Changelog

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
