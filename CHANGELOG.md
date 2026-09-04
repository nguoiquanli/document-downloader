# Changelog

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
