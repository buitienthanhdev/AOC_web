/* ============================================================
   utils/image-thumb.js — Nén ảnh về thumbnail TỐI THIỂU (canvas)
   Dùng cho danh sách lịch sử: chỉ cần liếc nhanh, không cần tải ảnh
   gốc/kết quả đầy đủ cho mỗi mục. Ảnh THẬT (results.day/night) không
   đụng tới — chỉ tải khi khách chủ động mở lại.
   ============================================================ */

'use strict';

/**
 * @param {string} src URL ảnh nguồn (cùng gốc/blob — KHÔNG cross-origin
 *   thiếu CORS, canvas sẽ bị "tainted" và toDataURL ném lỗi).
 * @param {number} maxDim Cạnh dài tối đa (px).
 * @param {number} quality Chất lượng JPEG 0–1.
 * @returns {Promise<string>} data URL đã nén, hoặc '' nếu lỗi.
 */
export function makeThumbDataUrl(src, maxDim = 120, quality = 0.55) {
  return new Promise((resolve) => {
    if (!src) { resolve(''); return; }
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.max(1, Math.round(img.naturalWidth * scale));
        const h = Math.max(1, Math.round(img.naturalHeight * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      } catch (_) { resolve(''); }
    };
    img.onerror = () => resolve('');
    img.src = src;
  });
}

export default { makeThumbDataUrl };
