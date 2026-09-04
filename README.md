# Document Downloader

Document Downloader là Chrome extension Manifest V3 giúp lưu tài liệu đang xem từ Studocu, Scribd và SlideShare. Mỗi website nằm trong một module riêng để dễ bảo trì khi giao diện nguồn thay đổi.

## Nguồn được hỗ trợ

| Website | Cách xử lý | Đầu ra |
| --- | --- | --- |
| Studocu / Studeersnel | Nạp trang, giữ lớp chữ và hình ảnh, căn từng trang vào A4 | Hộp thoại **Lưu thành PDF** |
| Scribd | Mở bản đọc nhúng, chụp từng trang và dựng bố cục A4 | Hộp thoại **Lưu thành PDF** |
| SlideShare | Đọc URL Embed, tải ảnh 2048, chuyển WebP sang JPEG và ghép PDF | Tệp PDF qua nút **Lưu thành PDF** |

## Tính năng

- Thay nút tải gốc bằng luồng tải phù hợp cho từng website.
- Loại bỏ nút “Download free for 30 days” trên thanh trên cùng của Scribd và SlideShare.
- Loại bỏ menu xổ xuống khỏi nút Download của Scribd.
- Tải ảnh SlideShare đồng thời, giữ đúng thứ tự và độ phân giải 2048.
- Nén SlideShare thành JPEG 90% để giảm dung lượng mà vẫn giữ độ rõ.
- Tự căn từng trang Studocu và Scribd vào khổ A4.
- Giao diện tiếng Việt, hiển thị tiến trình và cho phép hủy.
- Không gửi nội dung tài liệu tới máy chủ trung gian.

## Cài đặt

1. Tải ZIP tại mục [Releases](../../releases).
2. Giải nén vào một thư mục cố định.
3. Mở `chrome://extensions`.
4. Bật **Developer mode**.
5. Chọn **Load unpacked** và chọn thư mục vừa giải nén.

Khi cập nhật, giải nén bản mới đè lên thư mục cũ rồi nhấn **Reload** trong trang quản lý extension.

## Cách sử dụng

### Scribd

1. Mở URL dạng `scribd.com/document/...`.
2. Bấm **Download**.
3. Chờ extension quét đủ trang trong overlay.
4. Bấm **Lưu thành PDF**, rồi chọn **Save as PDF** trong hộp thoại in.

### SlideShare

1. Mở URL dạng `slideshare.net/slideshow/...`.
2. Bấm **Download**.
3. Extension tự lấy liên kết Embed, đóng popup và xử lý ảnh.
4. Khi báo sẵn sàng, bấm **Lưu thành PDF**.

### Studocu

1. Mở tài liệu trong trình xem Studocu hoặc Studeersnel.
2. Bấm **Download**.
3. Hộp thoại in tự mở sau khi quét xong.
4. Chọn **Save as PDF**, khổ A4, lề `None` và tắt header/footer.

## Cấu trúc

```text
.
├── manifest.json
├── background.js
├── sites/
│   ├── scribd.js
│   ├── slideshare.js
│   └── studocu.js
├── styles/
│   └── studocu.css
└── assets/icons/
```

- `background.js`: quản lý cookie Studocu và tải ảnh SlideShare qua host permission.
- `sites/*.js`: module độc lập cho từng website.
- `styles/studocu.css`: giao diện và quy tắc hiển thị của Studocu.

## Quyền extension

| Quyền | Mục đích |
| --- | --- |
| `cookies` | Xóa cookie mục tiêu khi Studocu/Studeersnel được nạp |
| `tabs` | Nhận biết điều hướng tới trang Studocu |
| Host Studocu/Studeersnel | Can thiệp trình xem và tải tài nguyên |
| Host Scribd | Chạy giao diện tải và bản đọc nhúng |
| Host SlideShare/CDN | Đọc trang Embed và tải ảnh slide |

Extension không thu thập phân tích sử dụng, không lưu lịch sử duyệt web và không truyền tài liệu ra ngoài máy chủ nguồn.

## Phát triển

Không cần bước build. Sau khi sửa mã:

```bash
node --check background.js
node --check sites/scribd.js
node --check sites/slideshare.js
node --check sites/studocu.js
```

Sau đó kiểm tra `manifest.json`, nhấn **Reload** tại `chrome://extensions` và thử từng module trên website tương ứng.

## Giới hạn

- Selector có thể cần cập nhật khi website thay đổi giao diện.
- Scribd và Studocu chỉ xử lý được nội dung mà trình duyệt thực sự nhận.
- Chất lượng PDF phụ thuộc tài nguyên do website nguồn cung cấp.

## Sử dụng có trách nhiệm

Chỉ tải tài liệu bạn sở hữu hoặc có quyền truy cập và sử dụng. Người dùng chịu trách nhiệm tuân thủ điều khoản dịch vụ và quy định bản quyền áp dụng.

## Giấy phép

Phát hành theo giấy phép MIT. Xem [LICENSE](LICENSE).
