/* ============================================================
   services/reference-palette.js — Trích màu chủ đạo từ 1 ảnh tham khảo
   Khách upload ảnh nhà mẫu họ thích (không phải ảnh nhà của họ) → đọc
   pixel qua canvas, gom cụm màu theo lượng tử hoá thô (quantize RGB),
   đếm tần suất, trả về N màu chủ đạo (loại bỏ màu gần trắng/đen/xám
   thuần vì thường là nền trời/bóng đổ, không phải màu sơn thật).
   ============================================================ */

'use strict';

const MAX_SIDE = 160;   // resize nhỏ trước khi đọc pixel — đủ đại diện màu, rất nhanh
const STEP = 24;         // lượng tử hoá mỗi kênh RGB về bội số của STEP

function loadImageFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Không đọc được ảnh')); };
    img.src = url;
  });
}

function isNearGray(r, g, b) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const sat = max === 0 ? 0 : (max - min) / max;
  return sat < 0.08 || (max > 235 && sat < 0.15) || max < 20; // gần trắng/đen/xám thuần
}

function rgbToHex(r, g, b) {
  const c = (n) => n.toString(16).padStart(2, '0');
  return ('#' + c(r) + c(g) + c(b)).toLowerCase();
}

/** Trích tối đa `count` màu chủ đạo (hex) từ 1 file ảnh, sắp theo tần suất giảm dần. */
export async function extractDominantColors(file, { count = 6 } = {}) {
  const img = await loadImageFile(file);
  const ratio = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * ratio));
  const h = Math.max(1, Math.round(img.naturalHeight * ratio));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  try { URL.revokeObjectURL(img.src); } catch (_) { /* noop */ }

  let data;
  try { data = ctx.getImageData(0, 0, w, h).data; }
  catch (_) { throw new Error('Không đọc được pixel ảnh (ảnh lỗi định dạng?)'); }

  const buckets = new Map(); // key lượng tử hoá → { sumR,sumG,sumB, n }
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
    if (a < 200) continue;
    if (isNearGray(r, g, b)) continue;
    const qr = Math.round(r / STEP) * STEP, qg = Math.round(g / STEP) * STEP, qb = Math.round(b / STEP) * STEP;
    const key = `${qr}_${qg}_${qb}`;
    const cur = buckets.get(key) || { sumR: 0, sumG: 0, sumB: 0, n: 0 };
    cur.sumR += r; cur.sumG += g; cur.sumB += b; cur.n += 1;
    buckets.set(key, cur);
  }

  const ranked = [...buckets.values()]
    .sort((a, b) => b.n - a.n)
    .slice(0, count)
    .map((c) => ({
      hex: rgbToHex(Math.round(c.sumR / c.n), Math.round(c.sumG / c.n), Math.round(c.sumB / c.n)),
      weight: c.n,
    }));

  return ranked;
}

export default { extractDominantColors };
