/* ============================================================
   services/job-state-machine.js — Vòng đời render THẬT
   IDLE→VALIDATING→UPLOADING→QUEUED→RUNNING→POST_PROCESSING→COMPLETED
   (WAITING_FOR_MODEL khi cold-start) / FAILED / CANCELLED.
   Progress = trạng thái rời rạc THẬT (không phải tries*3).
   Cold-start suy luận từ /queue + thời gian; nếu không chắc → câu
   trung thực. Có Cancel (AbortController).
   ============================================================ */

'use strict';

import { CONFIG } from '../config.js?v=20260707115237';
import { uploadImage, submitPrompt, getHistory, getQueue, buildWorkflow, viewUrl } from '../api/comfyui.js?v=20260707115237';
import { validateOutputRatio } from '../utils/ratio.js?v=20260707115237';
import { AppError, ErrorCode, toAppError } from './error-service.js?v=20260707115237';
import { logger } from '../utils/logger.js?v=20260707115237';
import { newCorrelationId } from '../api/client.js?v=20260707115237';

export const JobState = Object.freeze({
  IDLE: 'IDLE', VALIDATING: 'VALIDATING', UPLOADING: 'UPLOADING',
  QUEUED: 'QUEUED', WAITING_FOR_MODEL: 'WAITING_FOR_MODEL', RUNNING: 'RUNNING',
  POST_PROCESSING: 'POST_PROCESSING', COMPLETED: 'COMPLETED',
  FAILED: 'FAILED', CANCELLED: 'CANCELLED',
});

// Thứ tự + nhãn tiếng Việt cho progress rời rạc (THẬT).
const STAGES = [
  { state: JobState.VALIDATING, label: 'Đang kiểm tra ảnh' },
  { state: JobState.UPLOADING, label: 'Đang tải ảnh lên' },
  { state: JobState.QUEUED, label: 'Đang chờ trong hàng đợi' },
  { state: JobState.WAITING_FOR_MODEL, label: 'AI đang khởi động lần đầu, có thể mất 1–2 phút' },
  { state: JobState.RUNNING, label: 'Đang phối màu' },
  { state: JobState.POST_PROCESSING, label: 'Đang kiểm tra tỉ lệ & hoàn thiện ảnh' },
  { state: JobState.COMPLETED, label: 'Hoàn tất' },
];
function stageInfo(state) {
  const idx = STAGES.findIndex((s) => s.state === state);
  return { index: idx < 0 ? 0 : idx, total: STAGES.length, label: idx < 0 ? '' : STAGES[idx].label };
}

const sleep = (ms, signal) => new Promise((resolve, reject) => {
  const t = setTimeout(resolve, ms);
  if (signal) signal.addEventListener('abort', () => { clearTimeout(t); reject(new DOMException('aborted', 'AbortError')); }, { once: true });
});

export function createRenderJob({ onStage } = {}) {
  let abort = null;

  function emit(state, extra = {}) {
    const info = stageInfo(state);
    const payload = Object.assign({ state, stage: info.label, stageIndex: info.index, totalStages: info.total }, extra);
    if (onStage) { try { onStage(payload); } catch (_) {} }
    return payload;
  }

  async function run(params) {
    const jobId = newCorrelationId('job');
    const t0 = performance.now();
    abort = new AbortController();
    const signal = abort.signal;
    const opts = { correlationId: jobId, signal };
    logger.time(`render_${jobId}`);

    try {
      emit(JobState.VALIDATING, { jobId });
      if (!params.template) throw new AppError(ErrorCode.RENDER_FAILED, { technical: 'workflow template missing', correlationId: jobId });

      emit(JobState.UPLOADING, { jobId });
      const imageName = await uploadImage(params.dataUrl, params.imageName, opts);

      // Workflow chạy đúng bản chất — KHÔNG can thiệp seed/step/cfg, không retry đổi chất lượng.
      const { graph, meta } = buildWorkflow(Object.assign({}, params, { imageName, jobId }));

      emit(JobState.QUEUED, { jobId });
      const promptId = await submitPrompt(graph, opts);
      logger.event('render_submitted', { jobId, promptId, mode: meta.mode });

      const results = await poll(promptId, meta, jobId, t0, signal);

      const durationMs = Math.round(performance.now() - t0);
      logger.timeEnd(`render_${jobId}`, { jobId, promptId, mode: meta.mode });
      emit(JobState.COMPLETED, { jobId, results, durationMs });
      return { jobId, promptId, meta, results, durationMs };
    } catch (err) {
      if (err && err.name === 'AbortError') {
        emit(JobState.CANCELLED, { jobId });
        const e = new AppError(ErrorCode.RENDER_FAILED, { technical: 'cancelled by user', correlationId: jobId });
        e.cancelled = true;
        throw e;
      }
      const appErr = toAppError(err, ErrorCode.RENDER_FAILED, jobId);
      emit(JobState.FAILED, { jobId, error: appErr });
      throw appErr;
    } finally {
      abort = null;
    }
  }

  async function poll(promptId, meta, jobId, t0, signal) {
    const interval = CONFIG.POLL_INTERVAL_MS;
    // TIMEOUT chỉ tính từ lúc job THẬT SỰ chạy (không tính thời gian xếp hàng).
    // Trước đây tính từ t0 → khi ComfyUI bận job khác, job của khách còn đứng
    // queue đã bị client huỷ ở phút 4, trong khi backend sau đó vẫn render xong
    // → "backend có ảnh mà web chỉ hiện ảnh gốc".
    const timeout = CONFIG.RENDER_TIMEOUT_MS;
    const coldHint = CONFIG.COLD_START_HINT_MS;
    // Trần tuyệt đối kể cả chờ queue — chống treo vô hạn khi backend chết hẳn.
    const hardCap = Math.max(timeout * 3, 30 * 60 * 1000);
    let lastState = JobState.QUEUED;
    let runStart = null;   // mốc job bắt đầu CHẠY
    let lostSince = null;  // mốc mất dấu job (không trong queue, không history)
    // Cả getHistory() lẫn getQueue() lỗi liên tục (vd mất route/API chết hẳn)
    // trước đây bị nuốt hết bằng catch rỗng → vòng lặp cứ chạy tới hardCap
    // (30 phút) dù server rõ ràng không phản hồi gì suốt cả phút. Đếm số lần
    // lỗi LIÊN TIẾP của CẢ HAI, báo lỗi sớm nếu vượt ngưỡng thay vì im lặng.
    let consecutiveFails = 0;
    const maxConsecutiveFails = Math.max(5, Math.round(30000 / interval)); // ~30s

    while (true) {
      if (signal.aborted) throw new DOMException('aborted', 'AbortError');
      const elapsed = performance.now() - t0;
      if (elapsed > hardCap) {
        throw new AppError(ErrorCode.RENDER_TIMEOUT, { technical: `hard cap ${Math.round(elapsed)}ms`, correlationId: jobId });
      }

      let hist = null;
      let histFailed = false;
      try { hist = await getHistory(promptId, { correlationId: jobId }); } catch (_) { histFailed = true; }
      const pData = hist && hist[promptId];

      if (pData && pData.outputs && Object.keys(pData.outputs).length) {
        emit(JobState.POST_PROCESSING, { jobId });
        return await extractResults(pData.outputs, meta);
      }

      // Job đã completed mà outputs rỗng = toàn bộ graph bị ComfyUI cache
      // (execution_cached). Không bao giờ có ảnh → báo lỗi ngay thay vì treo
      // đến timeout. (Phòng hờ — filename_prefix theo job đã chặn ca này.)
      if (pData && pData.status && pData.status.completed) {
        throw new AppError(ErrorCode.RENDER_FAILED, {
          technical: 'job completed nhưng outputs rỗng (execution_cached?)', correlationId: jobId,
        });
      }

      // Chưa có output → phân biệt QUEUED / RUNNING / cold-start (THẬT, không bịa %).
      let state = JobState.RUNNING;
      const queue = await getQueue({ correlationId: jobId });

      // getHistory() lỗi VÀ getQueue() null trong CÙNG 1 tick = không lấy
      // được thông tin gì cả (khác với "job không trong queue" — đó là phản
      // hồi hợp lệ, chỉ là rỗng). Đếm dồn; server câm lặng liên tục ~30s thì
      // báo lỗi ngay, đừng chờ tới hardCap.
      if (histFailed && !queue) {
        consecutiveFails++;
        if (consecutiveFails >= maxConsecutiveFails) {
          throw new AppError(ErrorCode.AI_SERVICE_UNAVAILABLE, {
            technical: `getHistory/getQueue lỗi liên tục ${consecutiveFails} lần (~${Math.round(consecutiveFails * interval / 1000)}s)`,
            correlationId: jobId,
          });
        }
      } else {
        consecutiveFails = 0;
      }

      if (queue) {
        const running = (queue.queue_running || []).some((e) => e && e[1] === promptId);
        const pending = (queue.queue_pending || []).some((e) => e && e[1] === promptId);
        if (pending && !running) {
          state = JobState.QUEUED;   // còn xếp hàng → KHÔNG tính vào timeout
          lostSince = null;
        } else if (running) {
          state = JobState.RUNNING;
          if (runStart == null) runStart = performance.now();
          lostSince = null;
        } else if (pData) {
          // Có history nhưng chưa có outputs (đang ghi file) → coi như chạy đoạn cuối.
          state = JobState.RUNNING;
          if (runStart == null) runStart = performance.now();
          lostSince = null;
        } else {
          // Không trong queue + chưa có history → có thể vừa xong (history chưa kịp
          // ghi). Cho grace 30s trước khi kết luận job biến mất.
          if (lostSince == null) lostSince = performance.now();
          if (performance.now() - lostSince > 30000) {
            throw new AppError(ErrorCode.RENDER_FAILED, {
              technical: 'job không còn trong queue mà không có output', correlationId: jobId,
            });
          }
        }
      }

      // Timeout THẬT: chỉ đếm thời gian job đang chạy trên GPU.
      if (runStart != null && performance.now() - runStart > timeout) {
        throw new AppError(ErrorCode.RENDER_TIMEOUT, {
          technical: `poll timeout ${Math.round(performance.now() - runStart)}ms (tính từ lúc chạy)`, correlationId: jobId,
        });
      }

      // Cold-start: chạy đã lâu mà chưa ra ảnh → thông điệp trung thực.
      if (state === JobState.RUNNING && runStart != null && (performance.now() - runStart) > coldHint) {
        state = JobState.WAITING_FOR_MODEL;
      }

      if (state !== lastState) { emit(state, { jobId, elapsedMs: Math.round(elapsed) }); lastState = state; }
      else emit(state, { jobId, elapsedMs: Math.round(elapsed) });

      await sleep(interval, signal);
    }
  }

  async function extractResults(outputs, meta) {
    const out = { day: null, night: null };
    const pick = (nodeId) => {
      const node = nodeId && outputs[nodeId];
      if (node && node.images && node.images.length) return node.images[0];
      return null;
    };
    let dayImg = pick(meta.daySaveNode);
    let nightImg = pick(meta.nightSaveNode);
    // fallback: nếu không khớp node id, lấy theo thứ tự xuất hiện
    if (!dayImg && !nightImg) {
      const firstWithImages = Object.values(outputs).find((n) => n.images && n.images.length);
      if (firstWithImages) dayImg = firstWithImages.images[0];
    }

    if (dayImg) out.day = await describeOutput(dayImg, meta);
    if (nightImg) out.night = await describeOutput(nightImg, meta);
    if (!out.day && !out.night) {
      throw new AppError(ErrorCode.RENDER_FAILED, { technical: 'history có outputs nhưng không có ảnh' });
    }
    return out;
  }

  async function describeOutput(img, meta) {
    const url = viewUrl(img);
    let width = null; let height = null; let ratioCheck = null;
    try {
      const dims = await measure(url);
      width = dims.w; height = dims.h;
      if (meta.geometry && meta.geometry.originalAspectRatio) {
        ratioCheck = validateOutputRatio(meta.geometry.originalAspectRatio, width, height, CONFIG);
        if (!ratioCheck.ok) {
          logger.warn('output_ratio_invalid', {
            origRatio: meta.geometry.originalAspectRatio, outW: width, outH: height,
            ratioError: ratioCheck.ratioError,
          });
        }
      }
    } catch (_) { /* không đo được dims → vẫn trả url */ }
    return { url, filename: img.filename, width, height, ratioCheck };
  }

  function measure(url) {
    return new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve({ w: im.naturalWidth, h: im.naturalHeight });
      im.onerror = () => reject(new Error('measure failed'));
      im.src = url;
    });
  }

  function cancel() { if (abort) abort.abort(); }

  return { run, cancel, JobState };
}

export default { createRenderJob, JobState };
