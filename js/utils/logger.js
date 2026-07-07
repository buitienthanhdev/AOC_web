/* ============================================================
   logger.js — Structured client logging
   Không log raw image binary, API key, hay dữ liệu nhạy cảm.
   Mỗi event: {event, ts, jobId?, stage?, durationMs?, errorCode?,
   ratio?, workflowVersion?, ...}
   ============================================================ */

'use strict';

const _timers = new Map();

function _safe(data) {
  if (!data || typeof data !== 'object') return data;
  const out = {};
  for (const k of Object.keys(data)) {
    const v = data[k];
    // Chặn rò rỉ: bỏ base64/dataURL/binary dài, và các khoá nhạy cảm.
    if (/secret|token|password|api[_-]?key/i.test(k)) { out[k] = '***'; continue; }
    if (typeof v === 'string' && (v.startsWith('data:') || v.length > 512)) {
      out[k] = `[omitted:${v.length}b]`;
      continue;
    }
    out[k] = v;
  }
  return out;
}

export const logger = {
  event(name, data = {}) {
    const rec = Object.assign({ event: name, ts: new Date().toISOString() }, _safe(data));
    // eslint-disable-next-line no-console
    console.log('[paint]', rec);
    return rec;
  },
  warn(name, data = {}) {
    const rec = Object.assign({ event: name, ts: new Date().toISOString(), level: 'warn' }, _safe(data));
    console.warn('[paint]', rec);
    return rec;
  },
  error(name, data = {}) {
    const rec = Object.assign({ event: name, ts: new Date().toISOString(), level: 'error' }, _safe(data));
    console.error('[paint]', rec);
    return rec;
  },
  // Đo thời lượng theo nhãn: time('render') ... timeEnd('render', {jobId})
  time(label) { _timers.set(label, performance.now()); },
  timeEnd(label, data = {}) {
    const t0 = _timers.get(label);
    const durationMs = t0 != null ? Math.round(performance.now() - t0) : null;
    _timers.delete(label);
    return this.event(label, Object.assign({ durationMs }, data));
  },
};

export default logger;
