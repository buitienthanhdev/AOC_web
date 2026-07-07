/* ============================================================
   api/client.js — fetch wrapper
   • timeout (AbortController)
   • retry CHỈ cho transient + exponential backoff + jitter
   • KHÔNG retry validation/malformed
   • correlation id mỗi request
   • parse lỗi → AppError (không ném chi tiết kỹ thuật ra UI)
   ============================================================ */

'use strict';

import { CONFIG } from '../config.js?v=20260707115237';
import { logger } from '../utils/logger.js?v=20260707115237';
import { AppError, ErrorCode, codeFromHttp, isTransient, toAppError } from '../services/error-service.js?v=20260707115237';

let _seq = 0;
export function newCorrelationId(prefix = 'req') {
  _seq += 1;
  return `${prefix}-${Date.now().toString(36)}-${_seq.toString(36)}`;
}

/** Backoff mũ + jitter (pure, testable). attempt bắt đầu từ 0. */
export function computeBackoff(attempt, cfg = CONFIG) {
  const base = cfg.RETRY_BASE_DELAY_MS;
  const max = cfg.RETRY_MAX_DELAY_MS;
  const raw = Math.min(max, base * Math.pow(2, attempt));
  const jitter = raw * (cfg.RETRY_JITTER_RATIO || 0) * (Math.random() * 2 - 1);
  return Math.max(0, Math.round(raw + jitter));
}

export function isRetryableStatus(status) {
  return status === 0 || status === 408 || status === 429
    || status === 502 || status === 503 || status === 504;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Thực hiện request có timeout + retry.
 * @param {string} url
 * @param {object} opts - fetch opts mở rộng: {context, timeoutMs, retries, signal, correlationId, parseJson}
 */
export async function request(url, opts = {}) {
  const cfg = CONFIG;
  const context = opts.context || 'render';
  const timeoutMs = opts.timeoutMs ?? cfg.REQUEST_TIMEOUT_MS;
  const maxRetries = opts.retries ?? cfg.MAX_RETRIES;
  const correlationId = opts.correlationId || newCorrelationId(context);
  const parseJson = opts.parseJson !== false;

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new AppError(ErrorCode.NETWORK_OFFLINE, { correlationId });
  }

  let attempt = 0;
  // total tries = maxRetries + 1
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    // nối external signal (cancel job) nếu có — { once:true } chỉ tự gỡ khi
    // SỰ KIỆN abort thật sự bắn ra; nếu request xong bình thường (không bị
    // huỷ) listener vẫn còn treo trên opts.signal. Tự gỡ thủ công ở mọi
    // nhánh thoát (removeAbortListener() bên dưới) để không rò rỉ, kể cả
    // khi vòng lặp retry tạo listener mới mỗi lượt.
    let onAbort = null;
    if (opts.signal) {
      if (opts.signal.aborted) ctrl.abort();
      else {
        onAbort = () => ctrl.abort();
        opts.signal.addEventListener('abort', onAbort, { once: true });
      }
    }
    const removeAbortListener = () => {
      if (onAbort && opts.signal) opts.signal.removeEventListener('abort', onAbort);
    };
    try {
      // X-Correlation-Id là custom header → kích hoạt CORS preflight. Với
      // request cross-origin (classify :8189) phải tắt để giữ "simple request"
      // (multipart POST không preflight), tránh bị CORS chặn.
      const headers = Object.assign({}, opts.headers || {});
      if (opts.correlationHeader !== false) headers['X-Correlation-Id'] = correlationId;
      const res = await fetch(url, {
        method: opts.method || 'GET',
        headers,
        body: opts.body,
        signal: ctrl.signal,
      });

      if (!res.ok) {
        const retryable = isRetryableStatus(res.status) && attempt < maxRetries;
        const detail = await _safeText(res);
        logger.warn('http_error', { url, status: res.status, attempt, correlationId, context, detail: detail.slice(0, 200) });
        if (retryable) {
          await sleep(computeBackoff(attempt, cfg));
          attempt += 1;
          continue;
        }
        throw new AppError(codeFromHttp(res.status, context), {
          technical: `HTTP ${res.status} ${url} :: ${detail.slice(0, 300)}`,
          correlationId,
        });
      }

      return parseJson ? await res.json() : res;
    } catch (err) {
      if (err instanceof AppError) throw err;

      const aborted = err && err.name === 'AbortError';
      // Aborted bởi external signal = cancel → không retry
      if (aborted && opts.signal && opts.signal.aborted) {
        throw toAppError(err, ErrorCode.RENDER_FAILED, correlationId);
      }
      const code = aborted ? ErrorCode.RENDER_TIMEOUT : codeFromHttp(0, context);
      const canRetry = isTransient(code) && attempt < maxRetries;
      logger.warn('fetch_error', { url, attempt, correlationId, context, aborted, technical: err && err.message });
      if (canRetry) {
        await sleep(computeBackoff(attempt, cfg));
        attempt += 1;
        continue;
      }
      throw new AppError(code, { technical: err && (err.stack || err.message), correlationId, cause: err });
    } finally {
      clearTimeout(timer);
      removeAbortListener();
    }
  }
}

async function _safeText(res) {
  try { return await res.text(); } catch (_) { return ''; }
}

export function getJson(url, opts = {}) {
  return request(url, Object.assign({ method: 'GET' }, opts));
}
export function postJson(url, obj, opts = {}) {
  return request(url, Object.assign({
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {}),
    body: JSON.stringify(obj),
  }, opts, { headers: Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {}) }));
}

export default { request, getJson, postJson, computeBackoff, isRetryableStatus, newCorrelationId };
