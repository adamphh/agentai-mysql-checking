# Nhật Ký Hoàn Thành & Hướng Dẫn Sử Dụng - MySQL Telegram Monitor Bot

Tài liệu này ghi lại chi tiết các bước đã hoàn thành trong quá trình triển khai mã nguồn dự án **MySQL Telegram Monitor Bot**, cùng hướng dẫn chi tiết cách cấu hình, khởi chạy và kiểm thử hệ thống.

---

## 📋 1. Các Bước Đã Hoàn Thành (Completed Tasks)

Hệ thống đã được triển khai hoàn chỉnh theo đúng kế hoạch 6 Task:

### ✅ Task 1: Khởi Tạo Cấu Trúc & Utility Base (`src/utils/`, `src/config/`)
- [x] Tạo file [src/utils/logger.js](file:///F:/Working/agentai-mysql-checking/src/utils/logger.js): Quản lý ghi log ứng dụng và lỗi hệ thống bằng `winston` vào thư mục `logs/` (`app.log` và `error.log`).
- [x] Tạo file [src/utils/helpers.js](file:///F:/Working/agentai-mysql-checking/src/utils/helpers.js): Cung cấp các hàm tiện ích: `formatUptime` (định dạng thời gian chạy), `safeJsonParse` (parse JSON an toàn) và `truncateText` (rút gọn chuỗi SQL dài).
- [x] Tạo file [src/config/config.js](file:///F:/Working/agentai-mysql-checking/src/config/config.js): Nạp và quản lý cấu hình tập trung từ file môi trường `.env`.

### ✅ Task 2: Tầng Kết Nối Cơ Sở Dữ Liệu (`src/config/mysql-connections.js`)
- [x] Tạo file [src/config/mysql-connections.js](file:///F:/Working/agentai-mysql-checking/src/config/mysql-connections.js): Quản lý Connection Pool cho 3 máy chủ MySQL (`local`, `docker`, `aws`).
- [x] Cung cấp các hàm: `initConnections()`, `query(instance, sql, values)`, `getStatus()`, và `closeAll()`.
- [x] Đã tích hợp cơ chế tự phục hồi và bắt lỗi kết nối an toàn mà không gây sập ứng dụng.

### ✅ Task 3: Thu Thập Chỉ Số & Quản Lý Lịch Sử (`src/services/`)
- [x] Tạo file [src/services/metrics-collector.js](file:///F:/Working/agentai-mysql-checking/src/services/metrics-collector.js): Định kỳ thu thập các chỉ số `PROCESSLIST` và `SHOW STATUS` (truy vấn đang chạy, truy vấn chậm, số lượng kết nối active/max, tỉ lệ dùng kết nối, uptime).
- [x] Tạo file [src/services/history-manager.js](file:///F:/Working/agentai-mysql-checking/src/services/history-manager.js): Lưu trữ chỉ số giám sát dưới dạng file JSON cuốn chiếu theo ngày (`history/metrics-YYYY-MM-DD.json`) và tự động dọn dẹp các file cũ hơn 7 ngày.

### ✅ Task 4: Engine Cảnh Báo Thông Minh (`src/services/alert-detector.js`)
- [x] Tạo file [src/services/alert-detector.js](file:///F:/Working/agentai-mysql-checking/src/services/alert-detector.js): Kiểm tra và phát hiện các sự kiện:
  - `LONG_QUERY`: Cảnh báo khi có câu lệnh SQL chạy lâu hơn 30 giây.
  - `HIGH_CONNECTIONS`: Cảnh báo khi tỉ lệ kết nối vượt quá 80%.
  - `SLOW_QUERY_BURST`: Cảnh báo khi số lượng câu lệnh chậm vượt quá 10.
- [x] Đã tích hợp cơ chế Debouncing 5 phút để tránh gửi lặp lại cùng một cảnh báo liên tục.

### ✅ Task 5: Telegram Bot & Phân Quyền (`src/telegram/`)
- [x] Tạo file [src/telegram/auth.js](file:///F:/Working/agentai-mysql-checking/src/telegram/auth.js): Kiểm tra phân quyền dựa trên Whitelist `ALLOWED_USER_IDS`.
- [x] Tạo file [src/telegram/handlers.js](file:///F:/Working/agentai-mysql-checking/src/telegram/handlers.js): Xử lý các câu lệnh Telegram (`/start`, `/help`, `/status`, `/slowqueries`, `/instances`, `/history`, `/alerts`).
- [x] Tạo file [src/telegram/bot.js](file:///F:/Working/agentai-mysql-checking/src/telegram/bot.js): Khởi tạo Telegraf bot và đăng ký middleware/command router.

### ✅ Task 6: Luồng Khởi Chạy Chính & Scripts Kiểm Thử (`src/index.js`, `scripts/`)
- [x] Tạo file [src/index.js](file:///F:/Working/agentai-mysql-checking/src/index.js): Điểm khởi chạy hệ thống, thiết lập vòng lặp giám sát 30s, lập lịch cron dọn dẹp lúc 2 AM và hỗ trợ Graceful Shutdown (`SIGINT`/`SIGTERM`).
- [x] Tạo các script kiểm thử nhanh trong thư mục `scripts/`:
  - `scripts/test-connections.js`: Kiểm tra kết nối MySQL.
  - `scripts/test-metrics.js`: Kiểm tra thu thập metrics và phát hiện cảnh báo.
  - `scripts/cleanup-history.js`: Kiểm tra dọn dẹp file lịch sử.

---

## 📁 2. Cấu Trúc Thư Mục Dự Án Đã Hoàn Thành

```
mysql-telegram-monitor/
├── src/
│   ├── config/
│   │   ├── config.js              # Cấu hình biến môi trường
│   │   └── mysql-connections.js   # Quản lý 3 Connection Pool MySQL
│   ├── services/
│   │   ├── metrics-collector.js   # Thu thập metrics từ MySQL
│   │   ├── alert-detector.js      # Kiểm tra ngưỡng & tạo cảnh báo
│   │   └── history-manager.js     # Lưu trữ & dọn dẹp file JSON 7 ngày
│   ├── telegram/
│   │   ├── auth.js                # Phân quyền Telegram user whitelist
│   │   ├── bot.js                 # Khởi tạo Telegraf bot
│   │   └── handlers.js            # Router xử lý các lệnh Telegram
│   ├── utils/
│   │   ├── logger.js              # Quản lý ghi log Winston
│   │   └── helpers.js             # Hàm tiện ích trợ giúp
│   └── index.js                   # Điểm khởi chạy chính
├── scripts/
│   ├── test-connections.js        # Script test kết nối MySQL
│   ├── test-metrics.js            # Script test thu thập chỉ số
│   └── cleanup-history.js         # Script test dọn dẹp lịch sử
├── history/                       # Tự động tạo - Lưu trữ metrics JSON 7 ngày
├── logs/                          # Tự động tạo - Lưu trữ app.log & error.log
├── .env.example                   # File mẫu cấu hình môi trường
├── package.json                   # Khai báo thư viện & các lệnh npm
└── COMPLETED_STEPS.md             # Tài liệu nhật ký & hướng dẫn (File này)
```

---

## 🛠️ 3. Hướng Dẫn Cấu Hình & Khởi Chạy

### Bước 1: Tạo file cấu hình `.env`
Tạo file `.env` từ file mẫu `.env.example`:
```bash
cp .env.example .env
```

Cập nhật các thông số trong `.env`:
```env
# Cấu hình 3 MySQL Instance
MYSQL_LOCAL_HOST=localhost
MYSQL_LOCAL_PORT=3306
MYSQL_LOCAL_USER=root
MYSQL_LOCAL_PASSWORD=your_password

MYSQL_DOCKER_HOST=localhost
MYSQL_DOCKER_PORT=3307
MYSQL_DOCKER_USER=root
MYSQL_DOCKER_PASSWORD=your_password

MYSQL_AWS_HOST=your-rds-endpoint.amazonaws.com
MYSQL_AWS_PORT=3306
MYSQL_AWS_USER=admin
MYSQL_AWS_PASSWORD=your_password

# Cấu hình Telegram Bot
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_from_botfather
ALLOWED_USER_IDS=your_telegram_user_id_1,your_telegram_user_id_2

# Giám sát & Lưu trữ
METRICS_INTERVAL=30000     # 30 giây thu thập 1 lần
HISTORY_DAYS=7            # Lưu lịch sử 7 ngày
CLEANUP_HOUR=2            # Chạy dọn dẹp lúc 2 giờ sáng
LOG_LEVEL=info
```

### Bước 2: Khởi động hệ thống

- **Chạy chế độ Development (Tự động reload khi sửa code):**
  ```bash
  npm run dev
  ```

- **Chạy chế độ Production:**
  ```bash
  npm start
  ```

- **Chạy ngầm bằng PM2 (cho server Linux):**
  ```bash
  pm2 start npm --name "mysql-monitor" -- start
  ```

---

## 🧪 4. Hướng Dẫn Kiểm Thử (Testing)

Dự án đã tích hợp sẵn các lệnh kiểm thử nhanh:

1. **Kiểm tra kết nối đến các MySQL Instance:**
   ```bash
   npm run test:connections
   ```
   *Kết quả mong muốn:* Log hiển thị trạng thái `connected` hoặc `disconnected` cho từng instance mà không làm crash app.

2. **Kiểm tra luồng thu thập metrics & phát hiện cảnh báo:**
   ```bash
   npm run test:metrics
   ```
   *Kết quả mong muốn:* Trả về dữ liệu JSON của chỉ số vừa thu thập và danh sách các cảnh báo (nếu có).

3. **Kiểm tra tính năng dọn dẹp lịch sử:**
   ```bash
   npm run cleanup
   ```
   *Kết quả mong muốn:* Kiểm tra thư mục `history/` và xóa các file JSON quá 7 ngày.

4. **Kiểm tra cú pháp toàn bộ mã nguồn:**
   ```bash
   npm run lint
   ```

---

## 🤖 5. Danh Sách Lệnh Telegram Bot

Sau khi khởi động bot, người dùng thuộc whitelist trong `ALLOWED_USER_IDS` có thể gửi các lệnh sau vào chat Telegram:

| Lệnh Telegram | Mô tả |
|---|---|
| `/start` | Chào mừng & hướng dẫn bắt đầu |
| `/status` | Xem bảng tổng quan chỉ số sức khỏe của tất cả instance MySQL |
| `/slowqueries` | Xem danh sách các truy vấn đang chạy chậm hơn 5 giây |
| `/instances` | Kiểm tra trạng thái kết nối (`connected`/`disconnected`) của từng instance |
| `/history [instance] [hours]` | Xem chỉ số lịch sử (Ví dụ: `/history local 24`) |
| `/alerts` | Hướng dẫn về nhật ký cảnh báo trực tiếp |
| `/help` | Hiển thị danh sách tất cả các lệnh hỗ trợ |
