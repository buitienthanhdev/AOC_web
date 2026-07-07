/* ============================================================
   data/surfaces.js — Danh mục BỀ MẶT MỞ RỘNG (mái, sàn, cổng…)
   Dùng chung cho UI (surface-editor) và backend (comfyui.injectSurfaces).

   Mỗi bề mặt:
     key         — khoá lưu trong store.surfaces
     label       — nhãn tiếng Việt hiển thị
     hint        — gợi ý ngắn
     enLabel     — NHÃN RECOLOR chèn vào prompt workflow ("<enLabel>\nHEX: #..")
     allow       — các token cần GỠ khỏi danh sách "Never repaint" của prompt
                   (để AI được phép sơn bề mặt này). Khớp THEO DÒNG, không phân biệt hoa thường.

   Quy ước: nếu khách KHÔNG chọn màu → bề mặt rỗng (hex null) → BỎ QUA, prompt giữ nguyên.
   ============================================================ */

'use strict';

export const SURFACES = Object.freeze([
  { key: 'roof',      label: 'Mái / mái ngói',        hint: 'Mái nhà, mái ngói, mái tôn.',                 enLabel: 'Roof / Roof tiles',     allow: ['Roof', 'Roof tiles'] },
  { key: 'floor',     label: 'Sàn / nền / lối đi',     hint: 'Sàn sân, nền bê tông, lối đi.',               enLabel: 'Floor / Pavement',      allow: ['Concrete pavement', 'Road'] },
  { key: 'fence',     label: 'Hàng rào',               hint: 'Hàng rào, tường rào.',                        enLabel: 'Fence',                 allow: ['Fence unless painted'] },
  { key: 'gate',      label: 'Cổng',                   hint: 'Cổng chính, cổng phụ. Cổng sắt có thể kém ổn định.', enLabel: 'Gate',           allow: ['Metal'] },
  { key: 'brick',     label: 'Tường gạch trần',        hint: 'Mảng gạch để mộc.',                           enLabel: 'Brick surface',         allow: ['Brick'] },
  { key: 'stone',     label: 'Mảng đá ốp',             hint: 'Đá ốp, đá trang trí.',                        enLabel: 'Stone surface',         allow: ['Stone'] },
  { key: 'metal',     label: 'Chi tiết kim loại',      hint: 'Lan can sắt, khung kim loại. Có thể kém ổn định.', enLabel: 'Metal elements',     allow: ['Metal'] },
  { key: 'shutters',  label: 'Cửa chớp / lá sách',     hint: 'Cửa chớp, lá sách che nắng.',                 enLabel: 'Shutters',              allow: [] },
  { key: 'balcony',   label: 'Lan can / ban công',     hint: 'Lan can, tay vịn ban công.',                  enLabel: 'Balcony railing',       allow: [] },
  { key: 'columns',   label: 'Cột / trụ',              hint: 'Cột, trụ, hàng cột.',                         enLabel: 'Columns / Pillars',     allow: [] },
  { key: 'awning',    label: 'Mái hiên / mái che',     hint: 'Mái hiên, mái che cửa.',                      enLabel: 'Awning / Canopy',       allow: [] },
  { key: 'stairs',    label: 'Cầu thang / bậc thềm',   hint: 'Bậc thềm, cầu thang ngoài.',                  enLabel: 'Stairs / Steps',        allow: [] },
  { key: 'ceiling',   label: 'Trần (nội thất)',        hint: 'Trần nhà, trần thạch cao.',                   enLabel: 'Ceiling',               allow: [] },
  { key: 'pool',      label: 'Hồ bơi',                 hint: 'Thành / đáy hồ bơi.',                         enLabel: 'Pool surface',          allow: ['Pool', 'Water'] },
]);

export const SURFACE_BY_KEY = Object.freeze(
  SURFACES.reduce((m, s) => { m[s.key] = s; return m; }, {}),
);

export default { SURFACES, SURFACE_BY_KEY };
