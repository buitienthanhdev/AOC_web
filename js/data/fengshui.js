/* ============================================================
   data/fengshui.js — Gợi ý màu theo phong thuỷ (mệnh Ngũ hành) và
   theo độ tuổi bé (0–2 / 2–4 / 4–6 tuổi, tách trai/gái ở 4–6).
   • Mệnh do KHÁCH TỰ CHỌN (không tự tính từ năm sinh — bảng nạp âm 60
     năm dễ tra sai nếu nhớ nhầm; khách thường đã biết mệnh của mình).
   • Quy tắc màu = màu BẢN THÂN của mệnh (không dùng vòng tương sinh
     phức tạp) — khớp cách hiểu phổ thông: Kim=trắng sáng/be/kem,
     Mộc=xanh lá, Thuỷ=xanh dương, Hoả=đỏ, Thổ=nâu/đen.
   • Mỗi mệnh/độ tuổi có `match(c)` — hàm lọc nhận 1 màu từ km-catalog.js
     (đã có family/h/s/l/temp), trả true/false. Truyền thẳng vào
     km-catalog.search({ predicate }).
   ============================================================ */

'use strict';

export const MENH_LIST = Object.freeze([
  {
    key: 'kim', vi: 'Kim', icon: '⚪',
    hint: 'Trắng sáng, be, kem — tông ánh kim nhẹ nhàng.',
    // Trắng (family "trang") LUÔN hợp; be/kem là hue Cam/Vàng nhưng RẤT
    // SÁNG + bão hoà thấp (không phải Nâu — Nâu trong km-catalog.js đã
    // tách riêng cho tông tối/trầm).
    match: (c) => c.family === 'trang'
      || ((c.family === 'cam' || c.family === 'vang') && c.l >= 72 && c.s <= 35),
  },
  {
    key: 'moc', vi: 'Mộc', icon: '🟢',
    hint: 'Xanh lá (Lục).',
    match: (c) => c.family === 'luc',
  },
  {
    key: 'thuy', vi: 'Thuỷ', icon: '🔵',
    hint: 'Xanh dương (Lam, Chàm).',
    match: (c) => c.family === 'lam' || c.family === 'cham',
  },
  {
    key: 'hoa', vi: 'Hoả', icon: '🔴',
    hint: 'Đỏ.',
    match: (c) => c.family === 'do',
  },
  {
    key: 'tho', vi: 'Thổ', icon: '🟤',
    hint: 'Nâu, Đen.',
    match: (c) => c.family === 'nau' || c.family === 'den',
  },
]);

export function menhByKey(key) { return MENH_LIST.find((m) => m.key === key) || null; }

// ── Gợi ý màu theo độ tuổi bé (tham khảo thiết kế phổ biến, KHÔNG phải
// khuyến nghị y khoa) ────────────────────────────────────────────────
export const BABY_AGE_GROUPS = Object.freeze([
  {
    key: '0-2', vi: '0 – 2 tuổi (nằm nôi – biết bò)',
    hint: 'Bé chủ yếu ăn/ngủ, nhìn tường rất nhiều mỗi ngày — chọn tông DỊU NHẸ, ẤM ÁP, ít tương phản để mắt bé thoải mái và dễ ngủ.',
    match: (c) => c.s <= 38 && c.l >= 55 && c.temp !== 'cool',
  },
  {
    key: '2-4', vi: '2 – 4 tuổi',
    hint: 'Bé bắt đầu chơi đồ chơi, tô vẽ — tông NÓNG, MẠNH (giống màu đồ chơi trẻ em) giúp kích thích thị giác, hỗ trợ phát triển não bộ.',
    match: (c) => ['vang', 'do', 'lam', 'luc'].includes(c.family) && c.s >= 50,
  },
  {
    key: '4-6', vi: '4 – 6 tuổi',
    hint: 'Tính cách bắt đầu phân hoá theo giới — chọn thêm bên dưới cho đúng gu của bé.',
    variants: [
      {
        key: 'boy', vi: '👦 Bé trai — mạnh mẽ, năng động',
        hint: 'Bé trai giai đoạn này thường hiếu động, thích tông màu MẠNH, NÓNG.',
        match: (c) => ['lam', 'do', 'cam'].includes(c.family) && c.s >= 45,
      },
      {
        key: 'girl', vi: '👧 Bé gái — nhẹ nhàng, dịu dàng',
        hint: 'Bé gái giai đoạn này thường thích tông màu NHẸ NHÀNG, DỊU DÀNG.',
        match: (c) => ['hong', 'tim', 'vang'].includes(c.family) && c.s <= 45 && c.l >= 58,
      },
    ],
  },
]);

/** Tìm theo key ở CẢ 2 cấp (nhóm tuổi thường + biến thể trai/gái của 4-6). */
export function ageGroupByKey(key) {
  for (const g of BABY_AGE_GROUPS) {
    if (g.key === key) return g;
    if (g.variants) {
      const v = g.variants.find((x) => x.key === key);
      if (v) return v;
    }
  }
  return null;
}

export default { MENH_LIST, menhByKey, BABY_AGE_GROUPS, ageGroupByKey };
