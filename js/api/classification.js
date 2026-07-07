/* ============================================================
   api/classification.js — Architecture classification API
   POST {CLASSIFICATION_API_BASE_URL}/classify  (multipart image)
   Trả về classification đã chuẩn hoá (đủ field giàu) cho gate.
   ============================================================ */

'use strict';

import { CONFIG } from '../config.js?v=20260707115237';
import { request, newCorrelationId } from './client.js?v=20260707115237';
import { normalizeClassification } from '../services/classification-gate.js?v=20260707115237';
import { AppError, ErrorCode, toAppError } from '../services/error-service.js?v=20260707115237';
import { logger } from '../utils/logger.js?v=20260707115237';

function base() { return CONFIG.CLASSIFICATION_API_BASE_URL.replace(/\/$/, ''); }

/**
 * Phân loại kiến trúc.
 * @param {File|Blob} file
 * @returns {Promise<object>} classification đã normalize
 */
export async function classify(file, opts = {}) {
  const correlationId = opts.correlationId || newCorrelationId('classify');
  const form = new FormData();
  form.append('image', file, (file && file.name) || 'image.jpg');
  logger.time('classify');
  try {
    const raw = await request(`${base()}/classify`, {
      method: 'POST',
      body: form,
      context: 'classify',
      correlationId,
      // Cross-origin (:8189): KHÔNG gửi custom header → giữ "simple request",
      // tránh CORS preflight bị chặn (allow_headers backend không có X-Correlation-Id).
      correlationHeader: false,
      // Classify lỗi 5xx có thể do cold-start model → cho retry transient.
      retries: opts.retries,
      timeoutMs: opts.timeoutMs ?? CONFIG.REQUEST_TIMEOUT_MS,
    });
    logger.timeEnd('classify', { correlationId, style: raw && raw.architectural_style });
    return normalizeClassification(raw);
  } catch (err) {
    logger.timeEnd('classify', { correlationId, failed: true });
    throw toAppError(err, ErrorCode.CLASSIFICATION_FAILED, correlationId);
  }
}

/** Health check nhẹ (nếu API có /health). Trả {ok} — không ném. */
export async function health() {
  try {
    await request(`${base().replace(/\/api\/v1$/, '')}/health`, {
      // Cross-origin (:8190): như classify() — không gửi custom header để giữ
      // "simple request", tránh CORS preflight bị backend từ chối.
      context: 'classify', retries: 0, timeoutMs: 4000, correlationHeader: false,
    });
    return { ok: true };
  } catch (_) {
    return { ok: false };
  }
}

export default { classify, health };
