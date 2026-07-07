/* ============================================================
   data/km-catalog.js — Adapter quanh catalog Kelly-Moore
   Tách UI khỏi nguồn dữ liệu. Hôm nay đọc window.KM_COLORS;
   mai có thể thay bằng API mà KHÔNG đụng component (chỉ sửa file này).

   NHÓM MÀU (family) trong KM.js được PHÂN LOẠI SẴN bằng thư viện màu học
   coloraide (Python) — mỗi màu tính lại chính xác HSL/Lab từ hex (sRGB),
   rồi xếp nhóm theo hueFamily() (cùng công thức với JS bên dưới, đã hiệu
   chỉnh qua nhiều lượt so khớp với ~1661 màu thật, không phải đoán suông).
   hueFamily() ở ĐÂY chỉ dùng làm phương án DỰ PHÒNG khi 1 màu thiếu sẵn
   field "family" (vd nhập HEX thủ công) — nguồn THẬT lấy từ KM.js.
   ============================================================ */

'use strict';

import { normalizeHex, hexToRgb } from '../utils/validation.js?v=20260707115237';

// Thứ tự hiển thị CHUẨN theo quang phổ (không sắp theo số lượng màu, vì
// vậy trước đây danh sách nhóm hiện thị lộn xộn không theo trật tự nào).
export const FAMILY_ORDER = ['do', 'cam', 'vang', 'luc', 'lam', 'cham', 'tim', 'hong', 'nau', 'xam', 'trang', 'den'];

export const FAMILY_VI = Object.freeze({
  do: 'Đỏ', cam: 'Cam', vang: 'Vàng', luc: 'Lục', lam: 'Lam', cham: 'Chàm', tim: 'Tím',
  hong: 'Hồng', nau: 'Nâu', xam: 'Xám', trang: 'Trắng', den: 'Đen',
});

/**
 * Nhóm màu theo hue thật (H 0–360, S/L 0–100 của HSL) — CÙNG công thức với
 * script Python (coloraide) đã dùng để phân loại sẵn field "family" trong
 * KM.js, giữ 2 bên nhất quán. Mốc hue tham khảo bánh xe màu chuẩn (đỏ=0°,
 * cam=30°, vàng=60°, lục=120°, lam=210°, chàm=240°, tím=280°):
 *   Đỏ 345–15° · Cam 15–45° · Vàng 45–70° · Lục 70–165° ·
 *   Lam 165–225° · Chàm 225–260° · Tím 260–300° · (300–345° → Hồng, xem dưới)
 * TRUNG TÍNH/NÂU/HỒNG tách riêng THEO L/S TRƯỚC — hiệu chỉnh qua đối chiếu
 * mẫu thật (vd 1 màu cam rực HSL l=50 KHÔNG phải "nâu" dù cùng hue với nâu;
 * "nâu" chỉ đúng khi đủ TỐI — l≤42 — nếu không sẽ bắt nhầm cam/vàng rực rỡ).
 */
export function hueFamily(h, s, l) {
  if (l >= 88 && s <= 10) return 'trang';
  if (l <= 12) return 'den';
  if (s <= 10) return 'xam';
  // Nâu: CHỈ dải hue cam/vàng (không vòng qua đỏ ở đầu 360°, vì đó là
  // đỏ mận/đỏ đậm chứ không phải nâu) + đủ TỐI (l≤42, ranh giữa "nâu" và
  // "cam/vàng rực" — ở l=50 màu đã lên tới đỉnh rực của HSL, không còn nâu).
  if (h < 55 && l <= 42 && s >= 12) return 'nau';
  // Hồng: đỏ/tím rất SÁNG + bão hoà vừa — khác Đỏ đậm/Tím đậm.
  if ((h < 20 || h >= 300) && l >= 70 && s >= 15) return 'hong';
  // Đỏ: cần đủ bão hoà (s≥22) — dưới ngưỡng này là màu ấm nhạt/xỉn (be,
  // taupe...) chứ mắt thường không gọi là "đỏ".
  if ((h < 15 || h >= 345) && s >= 22) return 'do';
  if (h < 45) return 'cam';
  if (h < 70) return 'vang';
  if (h < 165) return 'luc';
  if (h < 225) return 'lam';
  if (h < 260) return 'cham';
  return 'tim';
}

let _cache = null;

// LRV (Light Reflectance Value) ≈ độ chói tương đối sRGB (WCAG), thang 0–100.
function chanLin(v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
function lrvFromRgb(rgb) {
  const r = rgb[0] || 0, g = rgb[1] || 0, b = rgb[2] || 0;
  return Math.round((0.2126 * chanLin(r) + 0.7152 * chanLin(g) + 0.0722 * chanLin(b)) * 1000) / 10;
}

/** Toàn bộ catalog đã chuẩn hoá: {code,name,hex,rgb,h,s,l,lab,temp,lrv,family,familyVi}.
 *  "family" đọc THẲNG từ KM.js (đã phân loại sẵn bằng coloraide — xem chú
 *  thích đầu file); chỉ tính lại tại chỗ bằng hueFamily() nếu màu nào đó
 *  thiếu field này. "tone"/"ai_prompt_color" đã bỏ khỏi nguồn — không ai
 *  dùng tới. */
export function all() {
  if (_cache) return _cache;
  const src = (typeof window !== 'undefined' && window.KM_COLORS) || [];
  _cache = src.map((c) => {
    const hex = normalizeHex(c.hex) || '#000000';
    const hsl = c.hsl || {};
    const rgb = c.rgb || Object.values(hexToRgb(hex) || { r: 0, g: 0, b: 0 });
    const H = hsl.h ?? 0, S = hsl.s ?? 0, L = hsl.l ?? 50;
    const family = c.family || hueFamily(H, S, L);
    return {
      code: c.code != null ? String(c.code) : '',
      name: c.name || hex,
      hex,
      rgb,
      h: H, s: S, l: L,
      lab: c.lab || null,                          // CIELAB {L,a,b} để tính ΔE
      temp: (c.temperature || '').toLowerCase(),   // warm | cool | neutral
      lrv: lrvFromRgb(rgb),                         // Light Reflectance Value 0–100
      family,
      familyVi: FAMILY_VI[family] || 'Khác',
    };
  });
  return _cache;
}

/** Danh sách family (kèm nhãn VN) hiện có trong catalog, ĐÚNG THỨ TỰ quang
 *  phổ (FAMILY_ORDER) — không sắp theo số lượng như trước (gây lộn xộn). */
export function families() {
  const counts = new Map();
  for (const c of all()) counts.set(c.family, (counts.get(c.family) || 0) + 1);
  return FAMILY_ORDER
    .filter((k) => counts.has(k))
    .map((k) => ({ key: k, label: FAMILY_VI[k], count: counts.get(k) }));
}

/**
 * Tìm theo tên hoặc mã (không phân biệt hoa thường). Mặc định trả HẾT kết
 * quả khớp (không còn cắt cứng 60 màu — bấm "Tất cả" phải thấy đủ toàn bộ
 * catalog, vd 1661 màu, để khách tự lướt/so sánh).
 * @param {object} opts
 * @param {string}   [opts.family]    1 family duy nhất (nhóm màu bấm thường).
 * @param {string[]} [opts.families]  NHIỀU family cùng lúc.
 * @param {object}   [opts.hsl]       lọc theo dải {minS,maxS,minL,maxL} (0–100).
 * @param {Function} [opts.predicate] hàm lọc tuỳ ý nhận 1 màu, trả true/false
 *   — dùng cho quy tắc phong thuỷ/độ tuổi bé phức tạp hơn family/hsl đơn thuần.
 */
export function search(query, { family = null, families = null, hsl = null, predicate = null, limit = 2000 } = {}) {
  const q = (query || '').trim().toLowerCase();
  let list = all();
  if (family) list = list.filter((c) => c.family === family);
  if (families && families.length) list = list.filter((c) => families.includes(c.family));
  if (hsl) {
    list = list.filter((c) =>
      (hsl.minS == null || c.s >= hsl.minS) && (hsl.maxS == null || c.s <= hsl.maxS)
      && (hsl.minL == null || c.l >= hsl.minL) && (hsl.maxL == null || c.l <= hsl.maxL));
  }
  if (predicate) list = list.filter(predicate);
  if (q) {
    list = list.filter((c) =>
      c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q));
  }
  // Sắp XẾP THEO NHÓM QUANG PHỔ rồi NHẠT → ĐẬM (L giảm dần) trong từng
  // nhóm — khoa học, nhất quán, không còn xen kẽ ngẫu nhiên giữa các tông.
  const order = list.slice().sort((a, b) => {
    const fa = FAMILY_ORDER.indexOf(a.family), fb = FAMILY_ORDER.indexOf(b.family);
    return fa !== fb ? fa - fb : b.l - a.l;
  });
  return order.slice(0, limit);
}

/** Màu KM gần nhất với 1 HEX bất kỳ (đặt tên cho màu thủ công). */
export function nearest(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  let best = null; let bestD = Infinity;
  for (const c of all()) {
    const cr = hexToRgb(c.hex); if (!cr) continue;
    const d = (rgb.r - cr.r) ** 2 + (rgb.g - cr.g) ** 2 + (rgb.b - cr.b) ** 2;
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}

/** Tên thân thiện cho 1 HEX: tên KM gần nhất nếu rất gần, ngược lại trả HEX. */
export function nameFor(hex) {
  const n = nearest(hex);
  return n ? n.name : (normalizeHex(hex) || hex);
}

export function byCode(code) {
  const k = String(code).toLowerCase();
  return all().find((c) => c.code.toLowerCase() === k) || null;
}

/** Cho phép test/inject catalog khác (reset cache). */
export function _setCatalogForTest(arr) { _cache = arr; }

export default { all, families, search, nearest, nameFor, byCode, FAMILY_VI, FAMILY_ORDER, hueFamily };
