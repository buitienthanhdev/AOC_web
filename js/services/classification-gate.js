/* ============================================================
   classification-gate.js — Rule engine cho ảnh đầu vào
   Dùng ĐẦY ĐỦ response phân loại: classification_status, confidence,
   building_typology, era_language, secondary_influences.
   KHÔNG chỉ dựa vào style label.

   Giới hạn đã biết (xem REMEDIATION_PLAN §8.1): model chỉ có các lớp
   KIẾN TRÚC nên luôn xuất 1 style kể cả với logo/tranh. Vì vậy tín hiệu
   chặn chính là confidence + classification_status, kèm thông điệp
   trung thực để người dùng tự quyết.
   ============================================================ */

'use strict';

import { CONFIG } from '../config.js?v=20260707115237';
import { logger } from '../utils/logger.js?v=20260707115237';

export const GateDecision = Object.freeze({
  ALLOW: 'allow',     // cho tiếp bình thường
  WARN: 'warn',       // cho tiếp, kèm cảnh báo
  CONFIRM: 'confirm', // cần người dùng xác nhận mới tiếp
  BLOCK: 'block',     // chặn mềm — khuyên đổi ảnh
});

// Nhãn tiếng Việt cho status & một số typology/era phổ biến.
const STATUS_VI = { clear: 'Rõ ràng', hybrid: 'Pha trộn phong cách', uncertain: 'Chưa chắc chắn' };
const TYPOLOGY_VI = {
  villa: 'Biệt thự / nhà ở', townhouse: 'Nhà phố', shophouse: 'Nhà phố thương mại',
  bungalow: 'Nhà trệt', building: 'Toà nhà', civic: 'Công trình công cộng',
  institutional: 'Công trình thể chế', palace: 'Dinh thự', cathedral: 'Thánh đường',
  monument: 'Công trình tưởng niệm', museum: 'Bảo tàng', loft: 'Không gian loft',
};
const ERA_VI = {
  ancient: 'Cổ đại', medieval: 'Trung cổ', renaissance: 'Phục Hưng', baroque: 'Baroque',
  classical_revival: 'Phục cổ điển', early_modern: 'Cận hiện đại', modern: 'Hiện đại',
  contemporary: 'Đương đại', regional: 'Bản địa', unknown: 'Không xác định',
};

function styleVi(style) {
  return typeof style === 'string' ? style.replace(/_/g, ' ').replace(/\barchitecture\b/i, '').trim() : '';
}

/** Chuẩn hoá response API về một shape ổn định. */
export function normalizeClassification(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const confidence = typeof raw.confidence === 'number' ? raw.confidence : 0;
  return {
    classifyId: raw.classify_id || null,
    style: raw.architectural_style || '',
    styleLabel: styleVi(raw.architectural_style),
    confidence,
    confidencePct: Math.round(confidence * 100),
    status: (raw.classification_status || '').toLowerCase() || null,
    typology: raw.building_typology || null,
    era: raw.era_language || null,
    styleGroup: raw.style_group || null,
    dominantHex: raw.dominant_color_hex || null,
    dominantRgb: raw.dominant_color_rgb || null,
    // Mỗi phần tử: {style, confidence} (classify_server.py trả % thật cho từng
    // phong cách phụ). Hỗ trợ ngược chuỗi thô cũ (chỉ tên, không %) → confidence null.
    secondary: (Array.isArray(raw.secondary_influences) ? raw.secondary_influences : []).map((s) => {
      if (typeof s === 'string') return { style: s, styleLabel: styleVi(s), confidence: null, confidencePct: null };
      const conf = typeof s.confidence === 'number' ? s.confidence : null;
      return { style: s.style || '', styleLabel: styleVi(s.style), confidence: conf, confidencePct: conf != null ? Math.round(conf * 100) : null };
    }),
    raw,
  };
}

/**
 * Đánh giá ảnh đầu vào.
 * @returns {{decision, status, confidence, confidencePct, title, message,
 *           note, fields:Array<{label,value}>, classification}}
 */
export function evaluate(rawOrNorm, cfg = CONFIG) {
  const c = (rawOrNorm && rawOrNorm.style !== undefined) ? rawOrNorm : normalizeClassification(rawOrNorm);
  const AI_LIMIT_NOTE = '';

  if (!c) {
    return {
      decision: GateDecision.WARN, status: null, confidence: 0, confidencePct: 0,
      title: 'Không đọc được kết quả phân loại',
      message: 'Không nhận được kết quả phân loại rõ ràng. Bạn vẫn có thể tiếp tục phối màu thủ công.',
      note: AI_LIMIT_NOTE, fields: [], classification: null,
    };
  }

  const fields = [
    { label: 'Phong cách gợi ý', value: c.styleLabel || '—' },
    { label: 'Mức độ chắc chắn của AI', value: `${c.confidencePct}%` },
  ];
  if (c.typology) fields.push({ label: 'Loại công trình', value: TYPOLOGY_VI[c.typology] || c.typology });
  if (c.era) fields.push({ label: 'Thời kỳ / ngôn ngữ kiến trúc', value: ERA_VI[c.era] || c.era });
  if (c.status) fields.push({ label: 'Trạng thái nhận diện', value: STATUS_VI[c.status] || c.status });

  // Gate tắt → luôn cho qua (vẫn hiển thị field).
  if (!cfg.FLAGS || !cfg.FLAGS.ENABLE_CLASSIFICATION_GATE) {
    return _result(GateDecision.ALLOW, c, fields, AI_LIMIT_NOTE,
      'Đã nhận diện kiến trúc', `Phong cách gợi ý: ${c.styleLabel || '—'}.`);
  }

  const clearTh = cfg.CONFIDENCE_CLEAR ?? 0.45;
  const blockTh = cfg.CONFIDENCE_THRESHOLD ?? 0.25;

  let decision;
  let title;
  let message;

  // Tín hiệu chặn mạnh nhất: confidence rất thấp → nhiều khả năng KHÔNG phải công trình.
  if (c.confidence < blockTh) {
    decision = GateDecision.BLOCK;
    title = 'Ảnh có vẻ không phải công trình';
    message = 'Ảnh này có vẻ không phải ảnh công trình/mặt tiền. '
      + 'Hãy tải ảnh ngôi nhà, toà nhà hoặc không gian cần phối màu. '
      + 'Nếu bạn chắc đây là công trình, có thể bỏ qua cảnh báo để tiếp tục.';
  } else if (c.status === 'clear' || c.confidence >= clearTh) {
    decision = GateDecision.ALLOW;
    title = 'Đã nhận diện kiến trúc';
    message = `Phong cách gợi ý: ${c.styleLabel || '—'} (${c.confidencePct}% chắc chắn).`;
  } else if (c.status === 'hybrid') {
    decision = GateDecision.WARN;
    title = 'Ảnh pha trộn nhiều phong cách';
    message = 'Ảnh có thể chưa rõ hoặc pha trộn nhiều phong cách.';
  } else {
    // uncertain nhưng confidence ≥ ngưỡng chặn → cần xác nhận.
    decision = GateDecision.CONFIRM;
    title = 'AI chưa chắc về ảnh này';
    message = 'AI chưa chắc đây là ảnh mặt tiền công trình. Bạn muốn tiếp tục phối màu không?';
  }

  logger.event('classification_gate', {
    decision, status: c.status, confidence: c.confidence, typology: c.typology,
  });

  return _result(decision, c, fields, AI_LIMIT_NOTE, title, message);
}

function _result(decision, c, fields, note, title, message) {
  return {
    decision, status: c.status, confidence: c.confidence, confidencePct: c.confidencePct,
    title, message, note, fields, classification: c,
  };
}

/** Người dùng có được phép tiếp tục mà không cần thao tác đặc biệt? */
export function canProceed(gate) {
  return !!gate && (gate.decision === GateDecision.ALLOW || gate.decision === GateDecision.WARN);
}

export default { GateDecision, evaluate, normalizeClassification, canProceed };
