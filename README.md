# Horus Leadership Meals (v1.0)

Ứng dụng quản lý bữa ăn **Leadership Lunch** (Ăn trưa đội ngũ lãnh đạo/nhân sự chủ chốt) và **Game Strategy Dinner** (Ăn tối Ban Chiến lược Game), theo dõi điểm danh thực tế, phân bổ chi phí cá nhân và đối soát hoàn ứng cho người ứng tiền mặc định (**Doãn Thế Cường**) của **Horus Entertainment**.

---

## 1. Tính năng cốt lõi (Theo PRD v1.0)

1. **Quản lý 2 chương trình độc lập & báo cáo gộp (`F01`)**:
   - `LEADERSHIP_LUNCH` — Ăn trưa hằng ngày (Công ty chi trả 100%).
   - `GAME_STRATEGY_DINNER` — Ăn tối thứ Năm hằng tuần của Ban Chiến lược Game.
2. **Danh bạ 8 thành viên BOD ban đầu & Lịch sử tư cách thành viên (`F02`, `AC-04`, `AC-20`)**:
   - Quản lý động `start_date` và `end_date` theo từng chương trình để tính chính xác mẫu số **Số buổi đủ điều kiện** khi thành viên mới gia nhập giữa tháng (ví dụ: Trần Việt Phú gia nhập từ 15/10/2026).
3. **Ghi nhận bữa ăn Mobile-First, Điểm danh & Chứng từ (`F03`, `F04`, `F05`, `AC-07`, `AC-08`)**:
   - Gợi ý thành viên đủ điều kiện theo ngày diễn ra bữa ăn (**không tự động chọn tất cả**).
   - Bắt buộc có `>= 1` ảnh chứng từ thanh toán khi gửi hồ sơ (`SUBMITTED`), cho phép lưu nháp (`DRAFT`) khi chưa có ảnh; hóa đơn VAT là tùy chọn.
   - Tự động cảnh báo nếu nghi ngờ ghi trùng bữa ăn.
4. **Phân bổ chi phí nguyên đồng VND (`F06`, `AC-05`, `AC-06`)**:
   - Hỗ trợ 3 chế độ: Chia đều (`EQUAL`), Nhập tay (`MANUAL`), Theo tỷ trọng (`WEIGHTED`).
   - Chia đều tiền lẻ đến từng đồng nguyên (`100.000đ / 3 = 33.334 + 33.333 + 33.333 = 100.000đ`).
5. **Tách bạch 3 câu hỏi tài chính & Bộ kiểm tra cân đối tháng (`Mục 6.2 & 13.1`, `AC-11`)**:
   - Tổng thực chi của nhóm, Chi phí phân bổ cá nhân và Số dư hoàn ứng là 3 hệ số liệu độc lập, đối soát khớp 100%, không bao giờ nhân trùng chi phí theo số người tham gia.
6. **Quản lý Đợt hoàn ứng & Xác nhận thanh toán (`F11`, `AC-12`, `AC-13`, `AC-14`)**:
   - Lập đợt hoàn ứng (`HU-2026-10-001`), xuất bảng kê trình ký.
   - Chỉ khi Finance xác nhận giao dịch chuyển tiền thực tế thì số dư nợ hoàn ứng mới giảm.
7. **Xuất dữ liệu chuẩn Kế toán (`F12`, `AC-16`, `AC-17`)**:
   - **Excel (`.xlsx`)** đủ 4 sheet: `Tong_quan_thang`, `Danh_sach_bua_an`, `Thong_ke_nhan_su`, `Hoan_ung`.
   - **PDF Bảng kê hoàn ứng chuẩn A4** (có chữ ký & tùy chọn in kèm phụ lục ảnh chứng từ).
   - **ZIP Chứng từ** kèm `manifest.csv` và `manifest.json`.
8. **Commit & Đồng bộ Hệ thống (`Server DB` + `Git` + `Supabase Cloud` + `GitHub Cloud API`)**:
   - Nút **Commit Hệ thống** lưu phiên bản dữ liệu, ghi nhật ký `Audit Logs`, commit vào Git và đồng bộ lên Supabase / GitHub Cloud.

---

## 2. Chạy dự án tại máy cục bộ

```bash
npm install
npm run dev
```

Kiểm thử tự động toàn bộ tiêu chí nghiệm thu (`AC-01` → `AC-20`):

```bash
npm run test:logic
```

---

## 3. Hướng dẫn Public Web (Vercel) & Kết nối Lưu trữ Cloud (Supabase / GitHub)

### Cách 1: Kết nối Supabase Cloud (Khuyên dùng)
1. Mở **SQL Editor** trên Supabase và chạy toàn bộ nội dung file [`supabase_schema.sql`](./supabase_schema.sql).
2. Trên Vercel (hoặc trong nút **Commit Hệ thống → Cấu hình kết nối Cloud** ngay trên giao diện web), điền:
   - `NEXT_PUBLIC_SUPABASE_URL`: URL project Supabase của bạn
   - `SUPABASE_SERVICE_ROLE_KEY` (hoặc `NEXT_PUBLIC_SUPABASE_ANON_KEY`): API Key của Supabase

### Cách 2: Commit dữ liệu trực tiếp vào GitHub Repository (Không cần tạo DB ngoài)
Điền biến môi trường trên Vercel hoặc trong hộp thoại **Commit Hệ thống** trên giao diện web:
- `GITHUB_REPO`: `thecuong92/horus-leadership-meals` (tên repo của bạn)
- `GITHUB_TOKEN`: GitHub Personal Access Token (quyền `repo` / `contents:write`)

Mỗi khi thêm/sửa bữa ăn hoặc bấm **Commit Hệ thống**, dữ liệu sẽ được lưu trực tiếp lên Cloud để mọi thành viên truy cập link public đều thấy dữ liệu mới nhất theo thời gian thực.
