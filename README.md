# Meta Ads Safe API

Dịch vụ trung gian chỉ đọc, dùng để chia sẻ số liệu hiệu quả quảng cáo Meta mà
không xuất chi phí, ngân sách, bid, CPC, CPM hoặc ROAS.

## Điều kiện bảo mật quan trọng

- Không thêm BM, App hoặc System User của bên nhận dashboard vào tài khoản quảng cáo.
- Không gửi Meta access token cho họ.
- Họ chỉ nhận `DASHBOARD_API_KEY` của API trung gian này.
- Nếu họ vẫn có quyền `ads_read` trực tiếp trên tài khoản, họ có thể tự lấy `spend`
  và API này không thể ngăn được.

## 1. Chuẩn bị

Cài Node.js 20 trở lên. Sao chép `.env.example` thành `.env`, rồi điền:

- `META_ACCESS_TOKEN`: token Meta chỉ lưu trên máy chủ này.
- `META_AD_ACCOUNT_ID`: ID tài khoản quảng cáo, có thể có hoặc không có `act_`.
- `META_GRAPH_VERSION`: phiên bản Graph API App của bạn đang dùng.
- `AD_NAME_CONTAINS`: chỉ trả quảng cáo có tên chứa nội dung này; đặt là
  `Instagram` để lọc theo yêu cầu hiện tại.
- `META_REQUEST_TIMEOUT_MS`: thời gian tối đa chờ Meta phản hồi, mặc định 120000
  mili giây (2 phút).
- `DASHBOARD_API_KEY`: chuỗi bí mật dài, chỉ cấp cho dashboard.
- `ALLOWED_ORIGIN`: tên miền dashboard nếu dashboard gọi từ trình duyệt.

Node.js không tự đọc file `.env`. Khi chạy cục bộ, nạp các biến bằng hệ thống triển
khai của bạn hoặc PowerShell như ví dụ dưới đây:

```powershell
$env:META_ACCESS_TOKEN="your-token"
$env:META_AD_ACCOUNT_ID="123456789012345"
$env:META_GRAPH_VERSION="v26.0"
$env:AD_NAME_CONTAINS="Instagram"
$env:DASHBOARD_API_KEY="a-long-random-dashboard-secret"
$env:ALLOWED_ORIGIN="https://dashboard.example.com"
npm start
```

Trên Render, Railway, Fly.io, Cloud Run hoặc VPS, khai báo các giá trị này trong
phần Environment/Secrets của dịch vụ, không đưa chúng vào mã nguồn.

## 2. Gọi API

```bash
curl "https://your-api.example.com/v1/meta/insights?since=2026-07-01&until=2026-07-31" \
  -H "X-API-Key: a-long-random-dashboard-secret"
```

Nếu không truyền ngày, API trả 30 ngày gần nhất. Khoảng ngày tối đa mặc định là
93 ngày. Cấp báo cáo được cố định ở `ad`; phía dashboard không thể đổi trường dữ
liệu, tài khoản hoặc cấp báo cáo. Mỗi quảng cáo có một dòng tổng hợp cho toàn bộ
khoảng ngày được yêu cầu; dữ liệu không bị tách thành từng ngày.

Ví dụ phản hồi:

```json
{
  "data": [
    {
      "ad_name": "Video 01",
      "impressions": 1520,
      "clicks": 42,
      "reactions": 18,
      "engagements": 67
    }
  ],
  "meta": {
    "since": "2026-07-01",
    "until": "2026-07-31",
    "level": "ad"
  }
}
```

## 3. Kiểm tra

```bash
npm test
```

Bộ kiểm tra sẽ thất bại nếu danh sách cho phép vô tình chứa trường chi phí, ngân
sách, bid hoặc ROAS. Mỗi phản hồi từ Meta cũng được lọc lại trước khi gửi đi.

## Các chỉ số được xuất

Danh sách truy vấn Meta chính xác nằm trong `src/safety.js`. Phản hồi công khai
chỉ gồm `ad_name`, `impressions`, `clicks`, `reactions`, `engagements` và
`image_url`. Ảnh được lấy từ thumbnail của creative khi Meta cung cấp được.
`actions` thô được xử lý trong máy chủ rồi bị loại bỏ khỏi phản hồi.

Không xuất `spend`, `cpc`, `cpm`, `cpp`, `cost_*`, `*_roas`, budget hoặc bid.
Không nên thêm các chỉ số chi phí trung bình vì chúng có thể dùng để tính ngược
tổng chi phí.

Bộ lọc tên quảng cáo chạy ở phía máy chủ sau khi dữ liệu được làm sạch. Dashboard
không có tham số để thay đổi hoặc bỏ qua bộ lọc này.
