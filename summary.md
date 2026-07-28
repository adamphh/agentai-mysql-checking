BƯỚC 1: CÁC CẤU HÌNH CẦN BẬT (CONFIG)Chạy các lệnh sau để kích hoạt bộ ghi nhận log dữ liệu hệ thống (không cần khởi động lại Server).
* Dành cho cả MySQL & MariaDB (Bật Log câu lệnh chậm):

SET GLOBAL slow_query_log = 'ON';
SET GLOBAL log_output = 'TABLE'; -- Ghi log vào database để dễ dùng lệnh SQL truy vấn
SET GLOBAL long_query_time = 1.0; -- Định nghĩa câu lệnh chậm (giây). Có thể hạ xuống 0.5 nếu cần.

* Dành riêng cho MariaDB (Bật thống kê phần cứng I/O, CPU):
SET GLOBAL user_statistics = 1;

BƯỚC 2: KIỂM TRA HIỆU NĂNG TỔNG THỂ (Xử lý sự cố ngay lập tức)
* Lệnh 1: Xem các câu lệnh đang chạy trực tiếp (Tìm nghẽn cổ chai)
SHOW FULL PROCESSLIST;

Mẹo quét nhanh: Tìm các hàng có cột Time lớn (>5) và cột State hiển thị Locked, Sending data, hoặc Creating sort index

* Lệnh 2: Kiểm tra sức khỏe bộ nhớ đệm RAM (Tỷ lệ hụt cache)
SHOW ENGINE INNODB STATUS\G

Mẹo quét nhanh: Cuộn xuống mục BUFFER POOL AND MEMORY. Xem dòng Buffer pool hit rate. Nếu đạt gần 1000 / 1000 là hoàn hảo. Nếu thấp (ví dụ 900 / 1000), server đang thiếu RAM nghiêm trọng.

BƯỚC 3: PHÂN TÍCH TÀI NGUYÊN (Tìm "sát thủ" ngốn CPU, I/O)
* NẾU BẠN DÙNG MYSQL (8.0+)
- Top 10 câu lệnh ngốn nhiều tài nguyên nhất:
SELECT query, exec_count, total_latency, rows_examined FROM sys.statement_analysis ORDER BY total_latency DESC LIMIT 10;
- Top 10 bảng dữ liệu bị đọc/ghi nhiều nhất (Ổ cứng quá tải):
  SELECT table_name, count_read, count_write FROM sys.schema_table_statistics ORDER BY (count_read + count_write) DESC LIMIT 10;
- Top thành phần đang chiếm dụng nhiều RAM nhất:
  SELECT event_name, current_alloc FROM sys.memory_global_by_current_bytes LIMIT 5;
* NẾU BẠN DÙNG MARIADB
- Top 10 câu lệnh ngốn nhiều tài nguyên nhất:
  SELECT query_time, rows_examined, sql_text FROM mysql.slow_log ORDER BY query_time DESC LIMIT 10;
- Top 10 bảng dữ liệu bị đọc/ghi nhiều nhất (Ổ cứng quá tải):
  SELECT client, cpu_time, rows_read, rows_changed FROM information_schema.client_statistics ORDER BY cpu_time DESC LIMIT 5;
- Top thành phần đang chiếm dụng nhiều RAM nhất:
  SELECT * FROM information_schema.query_response_time;
