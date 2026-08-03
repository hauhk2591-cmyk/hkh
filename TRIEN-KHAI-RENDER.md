# Đưa API lên HTTPS bằng Render

## 1. Đưa mã nguồn lên GitHub

Tạo một repository **Private** mới trên GitHub, sau đó tải toàn bộ nội dung thư
mục `meta-ads-safe-api` lên repository.

Không tải file `.env` lên GitHub. `.gitignore` bảo vệ khi dùng Git trên máy,
nhưng nếu tải thủ công bằng trình duyệt thì phải tự bỏ chọn file `.env`.

## 2. Tạo Web Service trên Render

1. Đăng nhập https://dashboard.render.com/ bằng GitHub.
2. Chọn **New → Blueprint**.
3. Chọn repository vừa tạo.
4. Render sẽ đọc `render.yaml` và tạo dịch vụ `meta-ads-safe-api`.
5. Khi Render yêu cầu giá trị bí mật, nhập ba biến:

   - `META_ACCESS_TOKEN`: token Meta mới, chưa từng xuất hiện trong ảnh.
   - `META_AD_ACCOUNT_ID`: `711345362217102`.
   - `DASHBOARD_API_KEY`: khóa dashboard mới.

6. Nhấn triển khai và chờ trạng thái **Live**.

## 3. Kiểm tra HTTPS

Render cấp địa chỉ dạng:

`https://meta-ads-safe-api-xxxx.onrender.com`

Mở đường dẫn `/health`, ví dụ:

`https://meta-ads-safe-api-xxxx.onrender.com/health`

Kết quả đúng là `{"ok":true}`.

## 4. Cấu hình phần mềm Windows

Mở `config.json` cạnh `MetaAdsReporter.exe` và điền:

```json
{
  "api_url": "https://meta-ads-safe-api-xxxx.onrender.com",
  "api_key": "DASHBOARD_API_KEY_DA_NHAP_TREN_RENDER"
}
```

Không thêm dấu `/v1/meta/insights` vào `api_url`; phần mềm tự thêm đường dẫn này.

## Lưu ý

Gói miễn phí của Render có thể tạm ngủ sau thời gian không sử dụng. Lần mở báo
cáo đầu tiên sau đó có thể chậm khoảng một phút. Dùng gói trả phí nếu cần API
luôn sẵn sàng.
