/* ============================================================
   validation.js — HEX / mime / size validation + color helpers
   Pure functions (không đụng DOM) → dễ unit test.
   ============================================================ */

'use strict';

import { CONFIG } from '../config.js?v=20260707115237';

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const HEX_SHORT_RE = /^#[0-9a-fA-F]{3}$/;

export function isValidHex(s) {
  return typeof s === 'string' && HEX_RE.test(s.trim());
}

/** Chuẩn hoá HEX: thêm '#', mở rộng dạng 3 ký tự, lowercase. Trả null nếu không hợp lệ. */
export function normalizeHex(s) {
  if (typeof s !== 'string') return null;
  let h = s.trim();
  if (!h.startsWith('#')) h = '#' + h;
  if (HEX_SHORT_RE.test(h)) {
    h = '#' + h.slice(1).split('').map((c) => c + c).join('');
  }
  return HEX_RE.test(h) ? h.toLowerCase() : null;
}

export function hexToRgb(hex) {
  const h = normalizeHex(hex);
  if (!h) return null;
  return {
    r: parseInt(h.slice(1, 3), 16),
    g: parseInt(h.slice(3, 5), 16),
    b: parseInt(h.slice(5, 7), 16),
  };
}

export function rgbToHex(r, g, b) {
  const c = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return ('#' + c(r) + c(g) + c(b)).toLowerCase();
}

/** Độ sáng tương đối (0..255) — dùng để chọn màu chữ tương phản trên swatch. */
export function luminance(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  return 0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b;
}

export function contrastText(hex) {
  return luminance(hex) > 140 ? '#111111' : '#ffffff';
}

// Đuôi file ảnh phổ biến — dùng làm phương án dự phòng khi hệ điều hành/
// trình duyệt KHÔNG gán đúng file.type (thường gặp với HEIC/HEIF từ iPhone,
// hoặc file.type rỗng do OS không nhận diện). Không giới hạn nhóm định dạng
// nào — chỉ cần rõ ràng là ảnh.
const IMAGE_EXT_RE = /\.(jpe?g|png|webp|gif|bmp|svg|avif|heic|heif|tiff?|ico|jfif|jxl)$/i;

/**
 * Validate file upload. CHẤP NHẬN MỌI ĐỊNH DẠNG ẢNH — không giới hạn theo
 * whitelist mime cụ thể (JPG/PNG/WEBP chỉ là gợi ý hiển thị, không phải rào
 * chặn). Định dạng trình duyệt không tự xem trước được (vd HEIC trên
 * Chrome/Firefox) vẫn cho qua ở đây; lỗi thật (nếu có) sẽ lộ ra rõ ràng ở
 * bước decode ảnh (services/image-service.js) thay vì bị chặn oan từ đầu.
 * @returns {{ok:boolean, errorCode?:string, message?:string}}
 */
export function validateUpload(file, cfg = CONFIG) {
  if (!file) {
    return { ok: false, errorCode: 'INVALID_IMAGE', message: 'Chưa chọn ảnh.' };
  }
  const type = (file.type || '').toLowerCase();
  const looksLikeImage = type.startsWith('image/') || (!type && IMAGE_EXT_RE.test(file.name || ''));
  if (!looksLikeImage) {
    return {
      ok: false,
      errorCode: 'INVALID_IMAGE',
      message: 'File này không phải ảnh. Vui lòng chọn 1 file hình ảnh.',
    };
  }
  if (typeof file.size === 'number' && file.size > cfg.MAX_UPLOAD_BYTES) {
    const mb = Math.round(cfg.MAX_UPLOAD_BYTES / (1024 * 1024));
    return {
      ok: false,
      errorCode: 'INVALID_IMAGE',
      message: `Ảnh quá lớn (tối đa ${mb} MB).`,
    };
  }
  // Vẫn CHO QUA (không chặn — xem comment ở validateUpload) nhưng cảnh báo
  // sớm: HEIC/HEIF (mặc định của iPhone) thường không xem trước được trên
  // Chrome/Firefox desktop, khách dễ tưởng app lỗi khi thấy preview trống.
  const isHeic = /\.hei[cf]$/i.test(file.name || '') || type === 'image/heic' || type === 'image/heif';
  if (isHeic) {
    return { ok: true, warning: 'Ảnh định dạng HEIC (iPhone) có thể không xem trước được trên một số trình duyệt. Nếu ảnh preview bị trống, hãy đổi sang JPG/PNG rồi tải lại.' };
  }
  return { ok: true };
}

export default { isValidHex, normalizeHex, hexToRgb, rgbToHex, luminance, contrastText, validateUpload };
