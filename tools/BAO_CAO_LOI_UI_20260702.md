# Báo cáo test DOM tự động — 02/07/2026

Chạy web thật (Playwright + Edge headless) qua đủ 5 bước wizard, kể cả render
ComfyUI thật, ở 1920×1080 + mobile 390×844, light + dark, VI + EN.
Script test: xem scratchpad phiên Claude (`dom_test.py`). Kết quả cuối: **0 lỗi**.

## Lỗi đã phát hiện & đã sửa

### 1. Đệ quy vô hạn khi vào bước Chọn màu (nghiêm trọng)
- **Triệu chứng:** console `wizard_onEnter_error: Maximum call stack size exceeded`
  mỗi lần vào bước 3; CPU giật, palette sinh lại hàng trăm lần.
- **Nguyên nhân:** `js/wizard.js` cập nhật `prevStep` SAU khi gọi `onEnter`.
  `generateSchemes()` trong `onEnter` gọi `store.set({palettes})` đồng bộ →
  subscriber tái kích hoạt khi `prevStep` còn giá trị cũ → `onEnter` gọi lại
  chính nó vô hạn.
- **Fix:** cập nhật `prevStep` TRƯỚC khi gọi `onEnter` (wizard.js).

### 2. Viewer đen ở bước 3 (nghiêm trọng)
- **Triệu chứng:** vào bước Chọn màu, khung so sánh trước/sau đen kịt, mất nút zoom.
- **Nguyên nhân:** `.row` Bootstrap mặc định `flex-wrap: wrap` — flex container
  dạng wrap cho phép DÒNG flex nở theo nội dung. Panel trái bước 3 dài ~9400px
  kéo cả hàng layout + `.cmp-stage` cao 9416px → ảnh bị đẩy ra ngoài vùng nhìn.
- **Fix:** trong `css/bootstrap-theme.css` (media ≥992px): `.layout{flex-wrap:nowrap}`
  + `.panel-left/.panel-right{height:100%;max-height:100%}` → nội dung dài cuộn
  nội bộ trong `.wz-body`.

### 3. Tooltip treo lơ lửng sau khi bấm nút
- **Triệu chứng:** tooltip "Tắt đèn — giao diện tối" kẹt lại trên màn hình sau khi
  bấm nút Sáng/Tối rồi mở panel Lịch sử.
- **Nguyên nhân:** `wireTooltips()` dùng `trigger: 'hover focus'` — focus ở lại
  nút sau click giữ tooltip mở.
- **Fix:** đổi thành `trigger: 'hover'` + tự `hide()` khi click (main.js).

## Ghi chú không phải lỗi
- Nút "Dự toán sơn" (`#peOpenBtn`) đang bị ẩn CÓ CHỦ ĐÍCH bằng
  `.pe-open-btn{display:none!important}` trong CSS. Muốn hiện lại thì xoá dòng đó.
- Render ComfyUI end-to-end hoạt động: ảnh ngày/đêm, toggle Day/Night, mã màu
  KM, tải xuống, history, modal dự toán, dark mode, song ngữ — đều pass.
