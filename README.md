# Web xử lý công việc

Web gọi Google Apps Script backend để chạy 3 tác vụ: So sánh EBMS, Trích xuất nhân viên v1, v2.

## Deploy lên GitHub Pages

1. Tạo repo mới trên GitHub (public)
2. Upload 4 file: `index.html`, `style.css`, `app.js`, `README.md`
3. Vào **Settings** → **Pages**
4. Source: **Deploy from a branch** → Branch: **main** → Folder: **/ (root)**
5. Bấm **Save**
6. Chờ 1-2 phút, truy cập: `https://<username>.github.io/<repo-name>/`

## Backend

Backend là Google Apps Script Web App, URL đã cấu hình trong `app.js` (biến `API_URL`).

## Cách dùng

1. Kéo thả file Excel (.xlsx) vào khung "Kho dữ liệu"
2. Chờ upload xong (✅ Sẵn sàng)
3. Bấm 1 trong 3 nút tác vụ
4. Xem kết quả hiển thị bên dưới
5. Bấm "Xuất CSV" nếu muốn tải về