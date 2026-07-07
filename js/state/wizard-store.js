/* ============================================================
   wizard-store.js — Single source of truth + pub/sub
   Thay cho các biến toàn cục rải rác (currentFile, selectedLoveColor,
   AppState, _selectedCombo...). Mọi module đọc/ghi qua store này.
   ============================================================ */

'use strict';

import { CONFIG } from '../config.js?v=20260707115237';
import { logger } from '../utils/logger.js?v=20260707115237';

// GỘP 7→5 BƯỚC (2026-07): nhiều key trỏ CÙNG 1 số bước → panel gộp lại nhưng
// mọi lời gọi goToStep(STEPS.X) cũ vẫn đúng. Bước hiển thị:
//   1 Tải ảnh · 2 Nhận diện · 3 Chọn màu (yêu/ghét+tông + phương án) ·
//   4 Tinh chỉnh & Phối (chỉnh màu + nút phối) · 5 Kết quả
export const STEPS = Object.freeze({
  UPLOAD: 1,       // B1 — Tải ảnh
  CLASSIFY: 2,     // B2 — Kiểm tra ảnh & nhận diện kiến trúc
  PALETTE: 3,      // B3 — Chọn màu yêu/ghét + tông  ┐ cùng 1 panel (wzPanel3)
  SCHEME: 3,       // B3 — Phương án màu (AI/tự phối) ┘
  EDIT: 4,         // B4 — Chỉnh màu chi tiết          ┐ cùng 1 panel (wzPanel4)
  RENDER_MODE: 4,  // B4 — Nút "Phối màu ngay"          ┘
  RESULT: 5,       // B5 — Xem kết quả & tải xuống
});

export const RenderMode = Object.freeze({
  DAY: 'day',
  NIGHT: 'night',
  BOTH: 'both',
});

function initialState() {
  return {
    step: STEPS.UPLOAD,
    maxStepReached: STEPS.UPLOAD,

    // Upload + geometry
    upload: {
      file: null,            // File đã chuẩn hoá (để classify + lấy tên)
      dataUrl: null,         // base64 để gửi ComfyUI + hiển thị
      objectUrl: null,       // objectURL preview (revoke khi thay)
      geometry: null,        // {originalWidth,originalHeight,originalAspectRatio,...}
    },

    // Classification + gate
    classification: null,    // ClassificationResult thô từ API
    gate: null,              // {decision, status, confidence, title, message, fields}
    classifyError: null,     // AppError nếu classify lỗi (KHÔNG reset wizard)
    classifySkipped: false,

    // Preference
    preference: { love: null, hate: null, toneMin: 70, toneMax: 100 },
    projectType: 'exterior', // exterior | interior
    style: null,             // phong cách chọn ở bước 2: modern|minimalist|classic|luxury

    // Palette
    palettes: [],            // mảng palette đã sinh
    selectedPaletteId: null,

    // Manual colors (3 zone)
    colors: {
      walls:  { hex: '#f5f5f5', name: '', source: 'default' },
      trims:  { hex: '#eeeeee', name: '', source: 'default' },
      accent: { hex: '#1a1a1a', name: '', source: 'default', enabled: true },
    },
    // Bề mặt mở rộng (mái, sàn, cổng…). Rỗng = không đổi màu. Khoá theo data/surfaces.js.
    surfaces: {},
    // Đối tượng tuỳ chỉnh do user tự thêm ở Tab "Tự phối màu": [{id,label,hex,name}].
    customZones: [],
    description: '',

    // Render
    renderMode: RenderMode.BOTH,  // luôn tạo cả ngày + đêm (khách không chọn)
    job: null,                    // {id, status, stage, error, startedAt}

    // Results
    results: {
      day:   null,  // {url, width, height, aspectRatio}
      night: null,
    },
    viewMode: RenderMode.DAY,

    recentColors: [],
  };
}

class WizardStore {
  constructor() {
    this._state = initialState();
    this._subs = new Set();
  }

  get() { return this._state; }

  /** Patch nông cấp 1; với nested object truyền cả object con đã merge. */
  set(patch, meta = {}) {
    const prev = this._state;
    this._state = Object.assign({}, prev, patch);
    this._emit(prev, meta);
  }

  /** Cập nhật 1 nhánh nested (vd update('colors', {walls:{...}})) — merge nông. */
  update(key, patch, meta = {}) {
    const prev = this._state;
    const cur = prev[key];
    const merged = (cur && typeof cur === 'object' && !Array.isArray(cur))
      ? Object.assign({}, cur, patch)
      : patch;
    this.set({ [key]: merged }, meta);
  }

  subscribe(fn) {
    this._subs.add(fn);
    return () => this._subs.delete(fn);
  }

  _emit(prev, meta) {
    for (const fn of this._subs) {
      try { fn(this._state, prev, meta); }
      catch (e) { logger.error('store_subscriber_error', { technical: e.message }); }
    }
  }

  // ── Tiện ích nghiệp vụ ──────────────────────────────────────
  goToStep(step) {
    const max = Math.max(this._state.maxStepReached, step);
    this.set({ step, maxStepReached: max }, { reason: 'navigate' });
    logger.event('wizard_step', { step });
  }

  addRecentColor(hex) {
    const list = [hex, ...this._state.recentColors.filter((c) => c !== hex)]
      .slice(0, CONFIG.RECENT_COLORS_MAX);
    this.set({ recentColors: list });
  }

  /** Reset CÓ CHỌN LỌC — chỉ phần liên quan ảnh; KHÔNG xoá toàn bộ khi 1 API lỗi. */
  resetForNewImage() {
    const s = this._state;
    if (s.upload.objectUrl) { try { URL.revokeObjectURL(s.upload.objectUrl); } catch (_) {} }
    const fresh = initialState();
    // giữ lại sở thích người dùng để đỡ phải chọn lại
    fresh.preference = s.preference;
    fresh.projectType = s.projectType;
    fresh.style = s.style;
    fresh.recentColors = s.recentColors;
    this._state = fresh;
    this._emit(s, { reason: 'reset_image' });
  }

  resetAll() {
    const prev = this._state;
    if (prev.upload.objectUrl) { try { URL.revokeObjectURL(prev.upload.objectUrl); } catch (_) {} }
    this._state = initialState();
    this._emit(prev, { reason: 'reset_all' });
  }
}

export const store = new WizardStore();
export default store;
