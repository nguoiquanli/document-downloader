# Document Downloader

Document Downloader là Chrome extension Manifest V3 giúp lưu tài liệu đang xem từ Studocu, Scribd và SlideShare. Mỗi website nằm trong một module riêng để dễ bảo trì khi giao diện nguồn thay đổi.

## Miễn trừ trách nhiệm

Dự án này chỉ được cung cấp cho mục đích học tập, nghiên cứu kỹ thuật và thử nghiệm cá nhân. Dự án không khuyến khích việc tải xuống, sao chép, phân phối hoặc sử dụng trái phép nội dung có bản quyền.

Người dùng chỉ nên xử lý tài liệu do mình sở hữu, tài liệu thuộc phạm vi công cộng hoặc tài liệu mà mình đã được chủ sở hữu cho phép truy cập và sử dụng. Người dùng tự chịu trách nhiệm tuân thủ pháp luật, quy định bản quyền và điều khoản dịch vụ của các website liên quan. Tác giả và những người đóng góp không chịu trách nhiệm đối với hành vi sử dụng sai mục đích hoặc thiệt hại phát sinh từ việc sử dụng dự án.

Tên, nhãn hiệu và dịch vụ Studocu, Scribd, SlideShare thuộc về các chủ sở hữu tương ứng. Dự án không liên kết, không được tài trợ và không được chứng thực bởi các dịch vụ này.

## Nguồn được hỗ trợ

| Website | Cách xử lý | Đầu ra |
| --- | --- | --- |
| Studocu / Studeersnel | Nạp trang, giữ nguyên lớp chữ, hình ảnh và kích thước trang gốc | **Tệp PDF** |
| Scribd | Mở bản đọc nhúng, chụp từng trang và dựng bố cục A4 | **Tệp PDF** |
| SlideShare | Đọc `secretUrl` trong dữ liệu trang, mở bản Embed trực tiếp, tải ảnh chất lượng cao và ghép PDF | **Tệp PDF** |

## Tính năng

- Thay nút tải gốc bằng luồng tải phù hợp cho từng website, đồng thời giữ nguyên nhãn theo ngôn ngữ hiện tại của trang.
- Loại bỏ nút “Download free for 30 days” trên thanh trên cùng của Scribd và SlideShare.
- Loại bỏ menu xổ xuống khỏi nút Download của Scribd.
- Tải ảnh SlideShare đồng thời, giữ đúng thứ tự và độ phân giải 2048.
- Nén SlideShare thành JPEG 90% để giảm dung lượng mà vẫn giữ độ rõ.
- Giữ nguyên bố cục trang gốc của Studocu; căn trang Scribd vào khổ A4.
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
3. Extension tự lấy `secretUrl`, mở bản Embed trực tiếp và xử lý ảnh.
4. Khi báo sẵn sàng, bấm **Lưu thành PDF**.

### Studocu

1. Mở tài liệu trong trình xem Studocu hoặc Studeersnel.
2. Bấm **Download**.
3. Hộp thoại in tự mở sau khi quét xong.
4. Chọn **Save as PDF**, lề `None` và tắt header/footer. Giữ tỷ lệ mặc định để Chrome dùng đúng kích thước trang của tài liệu.

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
│   ├── scribd.css
│   ├── slideshare.css
│   └── studocu.css
└── assets/icons/
```

- `background.js`: tải ảnh SlideShare qua host permission.
- `sites/*.js`: module độc lập cho từng website.
- `styles/*.css`: quy tắc hiển thị riêng cho từng website.

## Quyền extension

| Quyền | Mục đích |
| --- | --- |
| `cookies` | Xóa cookie trên các miền Studocu/Studeersnel khi trang bắt đầu nạp |
| `tabs` | Nhận biết lần điều hướng mới tới trang Studocu/Studeersnel |
| Host Studocu/Studeersnel | Can thiệp trình xem và tải tài nguyên |
| Host Scribd | Chạy giao diện tải và bản đọc nhúng |
| Host SlideShare/CDN | Đọc trang Embed và tải ảnh slide |

Extension không thu thập phân tích sử dụng, không lưu lịch sử duyệt web và không truyền tài liệu ra ngoài máy chủ nguồn. Việc xóa cookie Studocu có thể đăng xuất phiên hiện tại; cookie của Scribd, SlideShare và các website khác không bị tác động.

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

## Nguồn tham khảo và ghi nhận

Dự án được phát triển độc lập và có tham khảo ý tưởng, phương pháp xử lý từ:

- [StudocuHack](https://github.com/danieltyukov/studocuhack) của Daniel Tyukov cho cơ chế xử lý tài liệu Studocu.
- Bài viết của [Chu Minh Hiếu](https://www.facebook.com/groups/j2team.community/posts/2594998714165566/) trong cộng đồng J2TEAM Community cho phương pháp xử lý tài liệu Scribd.

Xin cảm ơn các tác giả và cộng đồng đã chia sẻ kiến thức làm nền tảng tham khảo cho dự án.

## Giấy phép

Mã nguồn được phát hành theo giấy phép MIT. Xem [LICENSE](LICENSE).
