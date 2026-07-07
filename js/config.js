/* ============================================================
   PAINT & MORE — Central Configuration (single source of truth)
   ------------------------------------------------------------
   KHÔNG dùng magic number ở bất kỳ module nào khác. Mọi timeout,
   polling interval, retry policy, upload size, palette count,
   output options, API URL, node id workflow đều nằm ở đây.

   Runtime override: đặt window.__APP_CONFIG__ = {...} TRƯỚC khi
   nạp module (ví dụ qua <script> nội tuyến hoặc config.json đã
   inject) để override mà không sửa file này — phù hợp deploy
   Apache static.
   ============================================================ */

'use strict';

function isLocalHost() {
  const h = (typeof location !== 'undefined' && location.hostname) || '';
  return h === 'localhost' || h === '127.0.0.1' || h === '';
}

const DEFAULTS = {
  // ── API endpoints ──────────────────────────────────────────
  // Ưu tiên relative path qua reverse-proxy. ComfyUI đi qua PHP proxy /api.
  COMFYUI_BASE_URL: '/api',
  // Classification API: local gọi thẳng 8190; production qua reverse-proxy
  // same-origin /clf (Apache → localhost:8190) để KHÔNG phơi backend ra internet.
  // (03/07/2026: đổi 8189→8190 — tiến trình cũ trên 8189 kẹt cứng, chạy elevated
  //  không kill được từ phiên thường; instance mới chạy 8190.)
  CLASSIFICATION_API_BASE_URL: isLocalHost()
    ? 'http://localhost:8190/api/v1'
    : '/clf/api/v1',

  // ── Upload / image ─────────────────────────────────────────
  MAX_UPLOAD_BYTES: 50 * 1024 * 1024,            // 50 MB — đồng bộ index/recolor/.htaccess
  // Chấp nhận MỌI định dạng ảnh (xem utils/validation.js validateUpload) —
  // không giới hạn whitelist mime. KHÔNG resize/nén phía client — ảnh khách
  // tải/dán lên đi THẲNG vào AI nguyên byte gốc (services/image-service.js).

  // ── Polling / render ───────────────────────────────────────
  POLL_INTERVAL_MS: 2000,
  // TÍNH TỪ LÚC JOB CHẠY trên GPU (chờ queue KHÔNG tính — xem poll trong
  // job-state-machine). Đo thực tế: render ấm ~1 phút, nhưng khi phải nạp lại
  // model Flux (cold/VRAM thrash) mất tới ~7 phút → 4 phút cũ làm client bỏ
  // cuộc trong khi backend vẫn ra ảnh ("phối xong mà web chỉ hiện ảnh gốc").
  RENDER_TIMEOUT_MS: 10 * 60 * 1000,             // 10 phút
  COLD_START_HINT_MS: 25 * 1000,                 // quá mốc này mà chưa có output → gợi ý cold-start
  REQUEST_TIMEOUT_MS: 30 * 1000,

  // ── Retry policy (chỉ cho transient errors) ────────────────
  MAX_RETRIES: 3,
  RETRY_BASE_DELAY_MS: 800,
  RETRY_MAX_DELAY_MS: 8000,
  RETRY_JITTER_RATIO: 0.3,                        // ±30% jitter

  // ── Palette ────────────────────────────────────────────────
  MAX_PALETTE_OPTIONS: 8,                         // 6–9; KHÔNG vô hạn
  RECENT_COLORS_MAX: 12,

  // ── Classification gate ────────────────────────────────────
  CONFIDENCE_CLEAR: 0.45,                         // ≥ → status clear (khớp backend)
  CONFIDENCE_THRESHOLD: 0.25,                     // < → chặn mềm (ảnh có vẻ không phải công trình)

  // ── Geometry (ratio-safe) ──────────────────────────────────
  ASPECT_RATIO_TOLERANCE: 0.01,                  // ≤ 1% lệch tỉ lệ
  MODEL_TARGET_MP: 1.0,                           // model sweet-spot ~1 megapixel
  MODEL_DIM_MULTIPLE: 16,                          // dims bội số 16 (an toàn VAE)
  MODEL_MIN_DIM: 512,
  MODEL_MAX_DIM: 1536,

  // ── History ────────────────────────────────────────────────
  MAX_HISTORY_ITEMS: 30,

  // ── Workflow node map (centralized — KHÔNG rải node id trong components) ──
  // Khớp data/paint-recolor-gemma-qwen.json (Gemma 4 prompt-refine + Qwen-Image-
  // Edit-2511 + LoRA). Workflow chạy nguyên bản như export; script chỉ điền:
  //   • ảnh nguồn (loadImage)
  //   • prompt màu đơn giản dạng "inpaint the <bề mặt> to <hex>" (recolorPrompt)
  WORKFLOW: {
    TEMPLATE_URL: 'data/paint-recolor-gemma-qwen.json',
    VERSION: 'paint-recolor-gemma-qwen',
    NODES: {
      loadImage:     '34',  // LoadImage — ảnh khách upload
      recolorPrompt: '35',  // PrimitiveStringMultiline — "Element Colors / Instruction"
      daySave:       '43',  // SaveImage ngày
      nightSave:     '66',  // SaveImage đêm
    },
    // Workflow chạy y nguyên: KHÔNG xoá node, KHÔNG đụng cfg/seed/step.
    // Script chỉ điền ảnh (loadImage) + prompt màu (recolorPrompt) và ĐỌC save nodes.
  },

  // ── Feature flags ──────────────────────────────────────────
  FLAGS: {
    ENABLE_CLASSIFICATION_GATE: true,   // classifier gọn (clasify/classify_server.py) trên :8189
    ENABLE_NIGHT_RENDER: true,          // BOTH/NIGHT → giữ nhánh đêm của workflow
  },
};

// ── Deep-merge override an toàn (không mutate DEFAULTS) ───────
function deepMerge(base, override) {
  if (!override || typeof override !== 'object') return base;
  const out = Array.isArray(base) ? base.slice() : Object.assign({}, base);
  for (const k of Object.keys(override)) {
    const bv = base ? base[k] : undefined;
    const ov = override[k];
    if (ov && typeof ov === 'object' && !Array.isArray(ov) && bv && typeof bv === 'object') {
      out[k] = deepMerge(bv, ov);
    } else {
      out[k] = ov;
    }
  }
  return out;
}

const runtimeOverride = (typeof window !== 'undefined' && window.__APP_CONFIG__) || {};
export const CONFIG = Object.freeze(deepMerge(DEFAULTS, runtimeOverride));

// Tiện ích đọc flag
export function flag(name) {
  return !!(CONFIG.FLAGS && CONFIG.FLAGS[name]);
}

export default CONFIG;
