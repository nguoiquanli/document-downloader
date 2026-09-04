# Document Downloader

Chrome extension Manifest V3 gộp ba bộ công cụ tải tài liệu:

- **Studocu / Studeersnel:** mở khóa phần xem trước, tải đủ trang và tạo bản HTML có thể in thành PDF.
- **Scribd:** thay nút Download gốc, mở bản đọc nhúng, cố định từng trang và in đúng khổ A4.
- **SlideShare:** thay nút Download gốc, tải ảnh slide chất lượng cao và ghép trực tiếp thành PDF.

Phiên bản 1.1 tăng tốc tải song song, chủ động thử ảnh SlideShare 2048 trước khi hạ xuống 1024/bản gốc và tự co từng trang Studocu vào đúng một tờ A4.

Phiên bản 1.2 biến nút Scribd thành nút tải đơn không còn menu xổ xuống và chuyển SlideShare sang đọc ảnh trực tiếp từ trang Embed trong overlay.

Phiên bản 1.2.1 bổ sung bridge chạy trực tiếp trong iframe Embed, quyền cho mọi subdomain SlideShare và bảng debug có thể sao chép trong overlay.

Phiên bản 1.2.2 chuyển phản hồi WebP của CDN sang JPEG trước khi ghép PDF và tự đóng popup Embed ngay khi lấy được liên kết.

Phiên bản 1.2.3 loại bỏ debug, đóng cưỡng chế dialog Embed và nén JPEG ở chất lượng 90% trong khi giữ nguyên độ phân giải 2048.

Phiên bản 1.3 Việt hóa các nút lưu/đóng, tự mở giao diện in Studocu, chờ người dùng xác nhận lưu SlideShare và lấy URL Embed tức thời bằng MutationObserver.

## Cài đặt

1. Giải nén tệp ZIP.
2. Mở `chrome://extensions`.
3. Bật **Developer mode**.
4. Chọn **Load unpacked** và trỏ tới thư mục đã giải nén.

## Cấu trúc

```text
document-downloader-extension/
├── manifest.json
├── background.js          # cookie Studocu và tải ảnh SlideShare qua miền
├── sites/
│   ├── studocu.js         # toàn bộ logic dành riêng cho Studocu
│   ├── scribd.js          # toàn bộ logic dành riêng cho Scribd
│   └── slideshare.js      # toàn bộ logic dành riêng cho SlideShare
├── styles/
│   └── studocu.css
└── assets/icons/
```

Mỗi website chỉ có một tệp JavaScript đầu vào, vì vậy có thể sửa hoặc tắt riêng mà không ảnh hưởng hai website còn lại. Extension không ghi log chẩn đoán ra Console trong hoạt động bình thường; lỗi cần thiết được hiển thị trực tiếp trong giao diện tải.

## Lưu ý

- Khi in từ Scribd hoặc Studocu, chọn **Save as PDF**, khổ A4 và tắt header/footer của trình duyệt.
- Giao diện website có thể thay đổi selector theo thời gian; khi đó chỉ cần chỉnh tệp tương ứng trong `sites/`.
- Chỉ tải tài liệu mà bạn có quyền truy cập và sử dụng.
