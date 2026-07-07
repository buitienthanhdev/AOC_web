/* ============================================================
   palette-service.js — Sinh phương án phối màu
   • Hiện HẾT combo khớp (mỗi tường khớp = 1 combo), không giới hạn số lượng.
   • Tên tiếng Việt có nghĩa — KHÔNG "Combo #N".
   • Classification TẠO GIÁ TRỊ THẬT: era/group sắp thứ tự mood ưu tiên.
   • Tôn trọng màu YÊU/GHÉT + dải tông + (tuỳ chọn) HEX thủ công.
   • Mỗi palette: {id,name,mood,main_wall,trim,accent,source,reason,notes}.
   Pure: nhận catalog qua tham số (mặc định km-catalog) → dễ test.
   ============================================================ */

'use strict';

import { all as kmAll } from '../data/km-catalog.js?v=20260707115237';
import { logger } from '../utils/logger.js?v=20260707115237';

// ~20 màu gợi ý cho bước Sở thích. Mỗi màu có:
//   key    — định danh DUY NHẤT (để hiển thị/chọn ở UI)
//   bucket — 1 trong 9 nhóm chủ đạo của dominantBucket() (để LỌC palette)
// Nhiều swatch có thể chung 1 bucket (vd các sắc đỏ) — vẫn lọc đúng.
export const DOMINANT_FAMILIES = [
  { key: 'do',        bucket: 'do',    vi: 'Đỏ',         hex: '#D32F2F' },
  { key: 'do-do',     bucket: 'do',    vi: 'Đỏ đô',      hex: '#8E1B1B' },
  { key: 'hong',      bucket: 'do',    vi: 'Hồng',       hex: '#EC407A' },
  { key: 'cam',       bucket: 'cam',   vi: 'Cam',        hex: '#F57C00' },
  { key: 'cam-dat',   bucket: 'cam',   vi: 'Cam đất',    hex: '#C75B12' },
  { key: 'nau',       bucket: 'cam',   vi: 'Nâu',        hex: '#795548' },
  { key: 'vang',      bucket: 'vang',  vi: 'Vàng',       hex: '#FBC02D' },
  { key: 'kem',       bucket: 'vang',  vi: 'Kem',        hex: '#E8DCA8' },
  { key: 'luc',       bucket: 'luc',   vi: 'Lục',        hex: '#388E3C' },
  { key: 'luc-nhat',  bucket: 'luc',   vi: 'Lục nhạt',   hex: '#81C784' },
  { key: 'ngoc',      bucket: 'luc',   vi: 'Xanh ngọc',  hex: '#1ABC9C' },
  { key: 'lam',       bucket: 'lam',   vi: 'Lam',        hex: '#1976D2' },
  { key: 'lam-nhat',  bucket: 'lam',   vi: 'Lam nhạt',   hex: '#64B5F6' },
  { key: 'cham',      bucket: 'cham',  vi: 'Chàm',       hex: '#303F9F' },
  { key: 'navy',      bucket: 'cham',  vi: 'Xanh navy',  hex: '#1A237E' },
  { key: 'tim',       bucket: 'tim',   vi: 'Tím',        hex: '#7B1FA2' },
  { key: 'tim-nhat',  bucket: 'tim',   vi: 'Tím nhạt',   hex: '#BA68C8' },
  { key: 'trang',     bucket: 'trang', vi: 'Trắng',      hex: '#F5F5F5' },
  { key: 'xam',       bucket: 'trang', vi: 'Xám',        hex: '#9E9E9E' },
  { key: 'den',       bucket: 'den',   vi: 'Đen',        hex: '#212121' },
];

export function dominantBucket(c) {
  const h = c.h ?? 0, s = c.s ?? 0, l = c.l ?? 50;
  if (l >= 88 && s <= 14) return 'trang';
  if (l <= 16) return 'den';
  if (s <= 8) return l >= 55 ? 'trang' : 'den';
  if (h < 15 || h >= 345) return 'do';
  if (h < 45) return 'cam';
  if (h < 70) return 'vang';
  if (h < 165) return 'luc';
  if (h < 230) return 'lam';
  if (h < 270) return 'cham';
  return 'tim';
}

function hueDiff(a, b) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

// ── Vai trò theo LRV (quy ước ngoại thất Body/Trim/Accent ≈ 60/30/10) ──
//   Trim sáng hơn Body; Accent (cửa/điểm nhấn) tối hơn Body.
const ROLE = {
  body:   { min: 35, max: 75 },
  trim:   { min: 75, max: 96 },
  accent: { min: 5,  max: 45 },
};

function clamp01(x) { return Math.max(0, Math.min(1, x)); }
function rangeScore(v, lo, hi) {
  if (v >= lo && v <= hi) return 1;
  const span = (hi - lo) || 1;
  return Math.max(0, 1 - (v < lo ? lo - v : v - hi) / span);
}

// ΔE CIE76 trên CIELAB (dùng field lab thật của catalog KM).
function deltaE(a, b) {
  if (!a || !b) return 999;
  const dL = a.L - b.L, da = a.a - b.a, db = a.b - b.b;
  return Math.sqrt(dL * dL + da * da + db * db);
}

// Nhiệt màu không được xung đột ấm↔lạnh (neutral hợp với cả hai).
function tempClash(x, y) {
  if (!x || !y || x === 'neutral' || y === 'neutral') return false;
  return x !== y;
}

// Hue coi như hợp nếu 1 trong 2 gần xám (hue nhiễu) hoặc lệch < limit.
function hueOk(a, b, limit) {
  if (a.s < 10 || b.s < 10) return true;
  return hueDiff(a.h, b.h) < limit;
}

// Phân loại hoà sắc theo quan hệ hue Body↔Accent (color theory chuẩn).
function harmonyType(body, accent) {
  if (body.s < 10 && accent.s < 10) return 'Trung tính';
  const d = hueDiff(body.h, accent.h);
  if (d < 20) return 'Đơn sắc';
  if (d < 45) return 'Tương đồng';
  if (d >= 150) return 'Bổ túc';
  return 'Tương phản';
}

// Chấm điểm scheme 0–100 theo: hoà sắc, tương phản, nhiệt màu, hue, độ phổ dụng.
function scoreScheme(b, t, a) {
  const dTB = t.lrv - b.lrv;   // Trim sáng hơn Body
  const dTA = b.lrv - a.lrv;   // Body sáng hơn Accent
  const hTB = (b.s < 10 || t.s < 10) ? 0 : hueDiff(b.h, t.h);
  const hTA = (b.s < 10 || a.s < 10) ? 0 : hueDiff(b.h, a.h);
  const hueScore = clamp01(1 - (hTB / 25) * 0.5 - (hTA / 35) * 0.5);
  const satProfile = (t.s <= b.s + 6 ? 0.5 : 0) + (a.s >= b.s - 4 ? 0.5 : 0);
  const harmony = 0.6 * hueScore + 0.4 * satProfile;
  const contrast = 0.5 * rangeScore(dTB, 15, 35) + 0.5 * rangeScore(dTA, 25, 55);
  const temps = [b.temp, t.temp, a.temp].filter((x) => x && x !== 'neutral');
  const temperature = new Set(temps).size <= 1 ? 1 : 0;
  const popularity = clamp01((b.s <= 25 ? 0.6 : 0.3) + (t.lrv >= 82 ? 0.4 : 0.15));
  const total = 0.35 * harmony + 0.25 * contrast + 0.15 * temperature + 0.15 * hueScore + 0.10 * popularity;
  return { score: Math.round(total * 100), dTB: Math.round(dTB), dTA: Math.round(dTA) };
}

const TEMP_VI = { warm: 'ấm', cool: 'lạnh', neutral: 'trung tính' };

// Giới hạn số lần 1 màu Trim/Accent lặp lại trong `max` kết quả đầu — giữ
// nguyên thứ tự điểm số, chỉ ĐẨY XUỐNG (không loại bỏ) ứng viên vượt trần để
// bảng kết quả không bị 1 vài màu áp đảo nhìn giống hệt nhau. Không đụng
// tới `list` gốc (đã sort theo score).
function diversify(list, max, cap = 3) {
  const accentCount = new Map();
  const trimCount = new Map();
  const picked = [];
  const overflow = [];
  for (const s of list) {
    const ac = accentCount.get(s.accent.hex) || 0;
    const tc = trimCount.get(s.trim.hex) || 0;
    if (ac < cap && tc < cap) {
      picked.push(s);
      accentCount.set(s.accent.hex, ac + 1);
      trimCount.set(s.trim.hex, tc + 1);
      if (picked.length >= max) return picked;
    } else {
      overflow.push(s);
    }
  }
  return picked.concat(overflow).slice(0, max);
}

// ── 4 nhóm phong cách × ~50 kiến trúc nhận diện = 200 hướng phối màu ──
// Mỗi nhóm là 1 HỒ SƠ ràng buộc color-science (lọc MỀM — thiếu ứng viên thì
// tự nới, không bao giờ rỗng). Kiến trúc nhận diện được cho SEED xác định
// (hue ưu tiên + xoay điểm khởi đầu chọn Body) → cùng nhóm phong cách nhưng
// khác kiến trúc sẽ ra danh sách combo KHÁC nhau, ổn định giữa các lần chạy.
// Màu vẫn 100% mã Kelly-Moore thật — KHÔNG bịa màu.
const STYLE_PROFILES = {
  modern: {     // Sạch, khoẻ khoắn, tương phản
    vi: 'Hiện đại',
    body: (c) => c.s <= 24,
    bodyOrder: (c) => (c.s <= 14 ? 1 : 0) + (c.temp !== 'warm' ? 0.5 : 0),
    trimBonus: (t, b) => (t.lrv - b.lrv >= 22 ? 0.8 : 0),
    accBonus: (a, b) => (b.lrv - a.lrv >= 38 ? 0.8 : 0) + (a.s >= 30 ? 0.4 : 0),
  },
  minimalist: { // Sáng, nhẹ, ít màu
    vi: 'Tối giản',
    body: (c) => c.s <= 14 && c.lrv >= 55,
    bodyOrder: (c) => c.lrv / 100,
    trimBonus: (t, b) => (t.lrv - b.lrv <= 24 ? 0.8 : 0),
    accBonus: (a, b) => (a.s <= 22 ? 0.8 : 0) + (b.lrv - a.lrv <= 40 ? 0.4 : 0),
  },
  classic: {    // Be/taupe trầm, lịch lãm
    vi: 'Cổ điển',
    body: (c) => c.temp !== 'cool' && c.s >= 6 && c.s <= 30 && ['cam', 'vang', 'trang'].includes(c.bucket),
    bodyOrder: (c) => (c.temp === 'warm' ? 1 : 0) + (['cam', 'vang'].includes(c.bucket) ? 0.5 : 0),
    trimBonus: (t) => (t.temp !== 'cool' ? 0.6 : 0),
    accBonus: (a) => (a.temp === 'warm' ? 0.6 : 0) + (a.bucket === 'cam' ? 0.3 : 0),
  },
  luxury: {     // Tông sâu, ấm, cao cấp
    vi: 'Sang trọng',
    body: (c) => c.lrv <= 60,
    bodyOrder: (c) => 1 - c.lrv / 100,
    trimBonus: (t, b) => (t.lrv - b.lrv >= 25 ? 0.6 : 0),
    accBonus: (a) => (a.lrv <= 20 ? 0.6 : 0) + (a.h >= 30 && a.h <= 60 && a.s >= 25 ? 0.4 : 0),
  },
};

// Hash xác định (FNV-1a) → seed ổn định theo tên kiến trúc nhận diện.
function hashStr(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

/**
 * Sinh combo Body/Trim/Accent bằng PIPELINE color-science (không bịa):
 *   1) Phân vai trò theo LRV (Body 35–75, Trim 75–96, Accent 5–45).
 *   2) Với mỗi Body: chọn Trim & Accent TỐT NHẤT theo ràng buộc
 *      nhiệt màu (không xung đột ấm/lạnh), hue gần (analogous/bổ túc),
 *      tương phản ΔL hợp lý, CIELAB ΔE ≥ 8 (tránh gần trùng).
 *   3) Chấm điểm (hoà sắc/tương phản/nhiệt/hue/phổ dụng), sắp xếp, lấy top.
 * Màu là mã Kelly-Moore THẬT (KM.js); ràng buộc theo nguyên lý color science.
 * @param {object} opts {love, hate, toneMin, toneMax, catalog, max}
 * @returns {Array} palettes (đã sắp theo điểm giảm dần)
 */
export function generate(opts = {}) {
  const catalog = opts.catalog || kmAll();
  const loveBucket = opts.love && opts.love.bucket;
  const hateBucket = opts.hate && opts.hate.bucket;
  const toneMin = opts.toneMin ?? 0;
  const toneMax = opts.toneMax ?? 100;
  // Nhóm phong cách (4 thẻ bước 2) + kiến trúc nhận diện (~50 lớp) → hướng màu riêng.
  const profile = STYLE_PROFILES[opts.style] || null;
  const clsName = (opts.classification && (opts.classification.style || opts.classification.styleLabel)) || '';
  const seed = clsName ? hashStr(clsName) : 0;
  const seedHue = seed % 360;

  // Gắn nhóm chủ đạo + loại nhóm GHÉT + yêu cầu có LAB (để tính ΔE).
  const cols = catalog
    .map((c) => Object.assign({ bucket: dominantBucket(c) }, c))
    .filter((c) => c.lab && (!hateBucket || c.bucket !== hateBucket));

  const trims = cols.filter((c) => c.lrv >= ROLE.trim.min && c.lrv <= ROLE.trim.max);
  const accents = cols.filter((c) => c.lrv >= ROLE.accent.min && c.lrv <= ROLE.accent.max);
  let bodies = cols.filter((c) => c.lrv >= ROLE.body.min && c.lrv <= ROLE.body.max);

  // YÊU: màu yêu phải XUẤT HIỆN trong combo (Tường HOẶC Viền HOẶC Cửa) —
  // KHÔNG ép cứng vào vai trò Tường. Nhờ vậy màu TỐI như "đỏ đô" (thuộc dải
  // Accent) vẫn hiện ra ở vai trò Cửa/điểm nhấn trên nền trung tính.
  const wantLove = loveBucket && loveBucket !== 'trang';
  if (loveBucket === 'trang') {
    // Thích Trắng → chủ đạo là KEM/trắng ngà ấm dịu (sáng, ít bão hoà),
    // KHÔNG để tường trắng gắt; vàng/đỏ tự động rơi vào vai trò Accent.
    const cream = bodies.filter((c) =>
      c.lrv >= 60 && c.s <= 24 && ['trang', 'vang', 'cam'].includes(c.bucket));
    if (cream.length >= 6) bodies = cream;
  } else if (wantLove) {
    // Body = màu yêu (nếu đủ sáng để làm tường) HOẶC trung tính (nền tôn màu
    // yêu ở viền/điểm nhấn). Combo không chứa màu yêu sẽ bị loại ở bước sau.
    const keep = bodies.filter((c) => c.bucket === loveBucket || c.bucket === 'trang' || c.s <= 14);
    if (keep.length >= 6) bodies = keep;
  }
  // TÔNG (Nhạt/Vừa/Đậm) → ưu tiên Body theo dải sáng (mềm, tránh rỗng).
  const toned = bodies.filter((c) => c.l >= toneMin && c.l <= toneMax);
  if (toned.length >= 10) bodies = toned;
  // Hồ sơ nhóm phong cách: lọc MỀM (đủ ≥10 ứng viên mới áp, tránh rỗng).
  if (profile) {
    const pb = bodies.filter(profile.body);
    if (pb.length >= 10) bodies = pb;
  }
  // Sắp Body theo: ưu tiên hồ sơ nhóm + độ gần hue seed (kiến trúc) + LRV.
  const seedW = clsName ? 0.35 : 0;
  const bodyKey = (c) => (profile ? profile.bodyOrder(c) : 0)
    + seedW * (c.s > 10 ? (1 - hueDiff(c.h, seedHue) / 180) : 0)
    + c.lrv / 400;
  bodies = bodies.slice().sort((x, y) => bodyKey(y) - bodyKey(x));
  // Xoay điểm khởi đầu theo seed → mỗi kiến trúc bắt đầu từ cụm Body khác
  // (dedup + trần combo khiến tập Body được chọn thật sự khác nhau).
  if (clsName && bodies.length > 8) {
    const off = seed % Math.min(bodies.length, 12);
    bodies = bodies.slice(off).concat(bodies.slice(0, off));
  }

  // Số Trim/Accent giữ cho MỖI Body:
  //   • KHÔNG có sở thích → bung rộng (10×10) để đạt hàng nghìn combo.
  //   • CÓ love/hate → thu gọn (4×4) → danh sách tập trung, ít mà đúng gu.
  const hasPref = !!(loveBucket || hateBucket);
  const perTrim = opts.trimsPerBody || (hasPref ? 4 : 6);
  const perAccent = opts.accentsPerBody || (hasPref ? 4 : 6);
  const bodyDedup = hasPref ? 4 : 3;   // có sở thích → gộp Body mạnh hơn cho gọn

  const schemes = [];
  const usedBodies = [];

  for (const body of bodies) {
    // Dedup Body → tránh hàng loạt sắc gần trùng.
    if (usedBodies.some((u) => deltaE(u.lab, body.lab) < bodyDedup)) continue;
    usedBodies.push(body);

    // TẤT CẢ Trim hợp lệ (chấm điểm) → giữ top perTrim.
    const trimCand = [];
    for (const t of trims) {
      if (t.hex === body.hex) continue;
      const dl = t.lrv - body.lrv;
      if (dl < 12 || dl > 40) continue;
      if (tempClash(body.temp, t.temp)) continue;
      if (!hueOk(body, t, 25)) continue;
      if (deltaE(body.lab, t.lab) < 8) continue;
      const sc = rangeScore(dl, 15, 35) * 2 + (t.s <= body.s + 6 ? 1 : 0)
        + (t.lrv >= 82 ? 0.5 : 0) - (t.s < 10 || body.s < 10 ? 0 : hueDiff(body.h, t.h) / 100)
        + (profile ? profile.trimBonus(t, body) : 0);
      trimCand.push({ t, sc });
    }
    if (!trimCand.length) continue;
    trimCand.sort((p, q) => q.sc - p.sc);
    let topTrims = trimCand.slice(0, perTrim);
    // Đảm bảo có sẵn 1 lựa chọn Viền thuộc nhóm màu YÊU (nếu tồn tại).
    if (wantLove) {
      const lt = trimCand.find((x) => x.t.bucket === loveBucket);
      if (lt && !topTrims.includes(lt)) topTrims = topTrims.concat(lt);
    }

    // TẤT CẢ Accent hợp lệ (chấm điểm) → giữ top perAccent.
    const accCand = [];
    for (const a of accents) {
      if (a.hex === body.hex) continue;
      const dl = body.lrv - a.lrv;
      if (dl < 25 || dl > 55) continue;
      if (tempClash(body.temp, a.temp)) continue;
      const hd = (body.s < 10 || a.s < 10) ? 0 : hueDiff(body.h, a.h);
      if (!(hd < 35 || (hd >= 150 && hd <= 210))) continue; // analogous hoặc complementary
      if (deltaE(body.lab, a.lab) < 8) continue;
      const sc = rangeScore(dl, 25, 55) * 2 + (a.s >= body.s ? 1 : 0) - hd / 200
        + (profile ? profile.accBonus(a, body) : 0);
      accCand.push({ a, sc });
    }
    if (!accCand.length) continue;
    accCand.sort((p, q) => q.sc - p.sc);
    let topAccents = accCand.slice(0, perAccent);
    // Đảm bảo có sẵn 1 lựa chọn Cửa/điểm nhấn thuộc nhóm màu YÊU (vd đỏ đô).
    if (wantLove) {
      const la = accCand.find((x) => x.a.bucket === loveBucket);
      if (la && !topAccents.includes(la)) topAccents = topAccents.concat(la);
    }

    // Tích Descartes topTrims × topAccents → nhiều combo THẬT cho mỗi Body.
    for (const { t: bt } of topTrims) {
      for (const { a: ba } of topAccents) {
        if (ba.hex === bt.hex) continue;
        const sr = scoreScheme(body, bt, ba);
        // Điểm cộng theo hồ sơ nhóm + độ khớp hue seed kiến trúc → thứ hạng
        // cuối cùng cũng khác nhau giữa 200 tổ hợp (nhóm × kiến trúc).
        let bonus = 0;
        if (profile) bonus += Math.round(10 * (profile.trimBonus(bt, body) + profile.accBonus(ba, body)));
        if (clsName && body.s > 10) bonus += Math.round(8 * (1 - hueDiff(body.h, seedHue) / 180));
        // Jitter xác định theo (kiến trúc + bộ màu): xáo thứ hạng ổn định giữa
        // các lần chạy nhưng KHÁC nhau giữa các kiến trúc — nếu không, sort theo
        // điểm sẽ hội tụ về cùng top list cho mọi kiến trúc trong 1 nhóm.
        if (clsName) bonus += hashStr(clsName + body.hex + bt.hex + ba.hex) % 11;
        schemes.push({ body, trim: bt, accent: ba, ...sr, score: sr.score + bonus, harmony: harmonyType(body, ba) });
      }
    }
    // Đủ ứng viên rồi thì dừng — khỏi dựng hết ~40k tổ hợp cho nhanh.
    // (Body đã sắp theo LRV nên vẫn phủ đủ dải sáng phổ biến.) Không áp
    // dụng khi có màu YÊU vì còn phải lọc "chứa màu yêu" ở dưới.
    if (!wantLove && schemes.length >= (opts.max || 240) * 2) break;
  }

  // LỌC THEO MÀU YÊU: chỉ giữ combo có nhóm màu yêu ở Tường/Viền/Cửa.
  // → đúng kỳ vọng "thêm combo có màu yêu, số lượng tự co lại". Fallback:
  //   nếu quá ít (<12) thì giữ nguyên để không rỗng.
  let finalSchemes = schemes;
  if (wantLove) {
    const rel = schemes.filter((s) =>
      s.body.bucket === loveBucket || s.trim.bucket === loveBucket || s.accent.bucket === loveBucket);
    if (rel.length >= 12) finalSchemes = rel;
  }
  finalSchemes.sort((s1, s2) => s2.score - s1.score);
  // Trước đây dựng tới 5000 combo/lần → tạo + sort + map đồng bộ làm ĐƠ khi
  // sang bước 4. Lưới chỉ hiện 48/lần (có "Xem thêm"), nên 240 là quá đủ mà
  // chuyển bước tức thì. Muốn nhiều hơn: truyền opts.max.
  const max = opts.max || 240;

  // ĐA DẠNG HOÁ: nếu lấy thẳng top-N theo điểm, vài màu Trim/Accent "đẹp
  // điểm cao" (vd 1 màu đỏ đô cụ thể) sẽ áp đảo hàng chục combo liên tiếp →
  // nhìn cứ y chang nhau dù Tường khác nhau. Giới hạn số lần 1 màu Trim/Accent
  // được lặp lại trong danh sách hiển thị, phần dư đẩy xuống cuối (không bỏ
  // hẳn — vẫn đủ combo nếu catalog ít lựa chọn).
  const diversified = diversify(finalSchemes, max);

  const palettes = diversified.map((s) => {
    const { body: b, trim: t, accent: a } = s;
    const tempVi = TEMP_VI[b.temp] || 'trung tính';
    return {
      id: `km-${b.code || b.hex.replace('#', '')}-${t.code || t.hex.replace('#', '')}-${a.code || a.hex.replace('#', '')}`,
      name: b.name,
      mood: `${profile ? profile.vi + ' · ' : ''}${s.harmony} · tông ${tempVi}`,
      main_wall: { hex: b.hex, name: b.name, code: b.code },
      trim: { hex: t.hex, name: t.name, code: t.code },
      accent: { hex: a.hex, name: a.name, code: a.code },
      source: 'kelly-moore',
      score: s.score,
      harmony: s.harmony,
      reason: `Hoà sắc ${s.harmony.toLowerCase()} · cùng tông ${tempVi} · LRV ${Math.round(b.lrv)}/${Math.round(t.lrv)}/${Math.round(a.lrv)} · tương phản ΔL ${s.dTB} & ${s.dTA} · điểm ${s.score}/100`,
      notes: 'Quy ước ngoại thất Body/Trim/Accent (≈60/30/10): Trim sáng hơn Tường, Cửa/điểm nhấn tối hơn. Ràng buộc theo LRV, CIELAB ΔE (≥8) và hoà sắc hue — nguyên lý color science; màu là mã Kelly-Moore thật.',
    };
  });

  logger.event('palette_generated', {
    count: palettes.length, candidates: schemes.length, kept: finalSchemes.length, love: loveBucket, hate: hateBucket,
  });
  return palettes;
}

export default { generate, dominantBucket, DOMINANT_FAMILIES };
