## 1. THUẬT TOÁN ĐIỀU TIẾT CHIẾN LƯỢC (REVISED LOGIC)

Hệ thống sẽ thực hiện quét 2 tiếng/lần và phân loại tài khoản ngay lập tức dựa trên dữ liệu từ **Cột F (Total Spent)** của Google Sheet.

### Bước 1: Phân loại tài khoản (Classification)
Tại mỗi nhịp quét, app sẽ duyệt qua danh sách ID tài khoản trong Group và chia thành 2 nhóm:
* **Nhóm Active:** Tài khoản có `Total Spent > 0`.
* **Nhóm Inactive:** Tài khoản có `Total Spent = 0`.

### Bước 2: Xác định tổng số tài khoản được cấp tiền ($N_{fund}$)
* **Trường hợp A (Đầu ngày):** Nếu **tất cả** tài khoản đều có `Spent = 0`.
    * $\Rightarrow N_{fund} = \text{Tổng tất cả tài khoản trong Group}$.
* **Trường hợp B (Trong ngày):** Nếu có **ít nhất một** tài khoản đã có `Spent > 0`.
    * $\Rightarrow N_{fund} = \text{Số lượng tài khoản thuộc Nhóm Active}$.

### Bước 3: Tính toán hạn mức ($Limit_{per\_acc}$)
Hệ thống lấy giá trị `Remaining` từ **Cột G** để chia:
$$Limit_{per\_acc} = \min\left(100, \frac{Remaining}{N_{fund}}\right)$$

### Bước 4: Thực thi API (Execution)
* **Đối với Nhóm được cấp tiền:** Gọi API set `Daily Spending Limit` = $Limit_{per\_acc}$.
* **Đối với Nhóm Inactive (Trong Trường hợp B):** Gọi API **Xóa (Delete)** hoặc Set Limit về 0 để thu hồi ngân sách ảo.

---

## 2. VÍ DỤ MINH HỌA (SCENARIO)

Giả sử Group có 5 tài khoản (A, B, C, D, E) và `Remaining` = $400.

| Thời điểm | Trạng thái Spent | $N_{fund}$ | Tính toán | Kết quả API |
| :--- | :--- | :--- | :--- | :--- |
| **08:00 (Sáng)** | Tất cả = $0 | 5 | $400 / 5 = $80 | **Cấp $80 cho cả 5 TK** |
| **10:00 (Trưa)** | A, B tiêu tiền; C, D, E vẫn $0 | 2 | $400 / 2 = $200 $\rightarrow$ Max $100 | **Cấp $100 cho A & B. Xóa Limit C, D, E.** |



---

## 3. CẬP NHẬT PROJECT BRIEF CHO CODER

Bạn hãy yêu cầu coder bổ sung các module xử lý sau vào kiến trúc Electron:

* **Logic Xóa Limit:** Cần xử lý lệnh API `DELETE` hoặc `POST` để gỡ bỏ spending limit đối với các tài khoản không phát sinh chi tiêu trong ngày.
* **Data Validation:** Hệ thống phải kiểm tra `Spent` liên tục từ Google Sheet. Chỉ cần `Spent > 0.01`, tài khoản đó lập tức được đưa vào danh sách "Ưu tiên cấp vốn".
* **Cấu hình trên UI:** Bổ sung một Toggle (Bật/Tắt) tính năng: *"Tự động thu hồi limit của tài khoản không spent"* để người dùng có thể chủ động kiểm soát chiến lược này.

---

## 4. ƯU ĐIỂM CỦA CHIẾN LƯỢC NÀY
1.  **Tập trung nguồn lực:** Tiền luôn được đổ vào những tài khoản đang hoạt động tốt nhất.
2.  **An toàn tuyệt đối:** Tránh việc các tài khoản "lỗi" hoặc "ngủ quên" bỗng dưng cắn tiền hàng loạt vào cuối ngày khi ngân sách tổng đã cạn.
3.  **Tối ưu hóa $Remaining:** Tận dụng tối đa số tiền còn lại của khách hàng mà không bị "găm" ảo bởi các tài khoản không chạy.

**BMAD Orchestrator's Note:** Chiến lược này cực kỳ hiệu quả cho các dàn tài khoản lớn. Mọi logic đã được "chốt" chặt chẽ. Bạn đã sẵn sàng để gửi bản yêu cầu này cho coder chưa? Nếu cần tôi viết hẳn một đoạn mã giả (Pseudo-code) cho phần chia tiền này, hãy cho tôi biết!