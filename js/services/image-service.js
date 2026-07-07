/* ============================================================
   services/image-service.js — Chuẩn hoá ảnh upload
   • Validate (mime/size).
   • Đo kích thước GỐC → geometry (originalAspectRatio).
   • GIỮ NGUYÊN byte ảnh khách tải/dán lên — KHÔNG resize, KHÔNG nén lại,
     KHÔNG đổi định dạng. AI phải nhận đúng ảnh gốc chất lượng cao nhất.
   • Quản objectURL (revoke tránh leak).
   ============================================================ */

'use strict';

import { CONFIG } from '../config.js?v=20260707115237';
import { validateUpload } from '../utils/validation.js?v=20260707115237';
import { buildGeometry } from '../utils/ratio.js?v=20260707115237';
import { AppError, ErrorCode } from '../services/error-service.js?v=20260707115237';
import { logger } from '../utils/logger.js?v=20260707115237';

function loadImageEl(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('decode failed'));
    img.src = src;
  });
}
function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = (e) => resolve(e.target.result);
    r.onerror = () => reject(new Error('read failed'));
    r.readAsDataURL(file);
  });
}

/**
 * @returns {Promise<{file, dataUrl, objectUrl, geometry}>}
 */
export async function normalize(file, cfg = CONFIG) {
  const v = validateUpload(file, cfg);
  if (!v.ok) throw new AppError(v.errorCode || ErrorCode.INVALID_IMAGE, { technical: v.message });

  let dataUrl;
  let img;
  try {
    dataUrl = await readAsDataUrl(file);
    img = await loadImageEl(dataUrl);
  } catch (e) {
    throw new AppError(ErrorCode.INVALID_IMAGE, { technical: 'Không đọc được ảnh: ' + e.message });
  }

  const origW = img.naturalWidth || img.width;
  const origH = img.naturalHeight || img.height;

  // KHÔNG canvas, KHÔNG resize, KHÔNG re-encode — objectUrl trỏ THẲNG vào
  // file gốc nên byte gửi lên AI y hệt byte khách tải/dán lên.
  const objectUrl = URL.createObjectURL(file);
  const geometry = buildGeometry(origW, origH, cfg);

  logger.event('image_normalized', {
    origW, origH,
    modelDims: `${geometry.modelInputWidth}x${geometry.modelInputHeight}`,
    plannedRatioError: geometry.plannedRatioError,
    bytes: file.size,
  });

  return { file, dataUrl, objectUrl, geometry, warning: v.warning || null };
}

export function revoke(objectUrl) {
  if (objectUrl && objectUrl.startsWith && objectUrl.startsWith('blob:')) {
    try { URL.revokeObjectURL(objectUrl); } catch (_) {}
  }
}

export default { normalize, revoke };
