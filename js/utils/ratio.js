/* ============================================================
   utils/ratio.js — Hình học ratio-safe
   Thay cho FluxKontextImageScale (center-crop về bucket → đổi tỉ lệ,
   mất rìa). Tính (W,H) hợp lệ với model mà GIỮ tỉ lệ gốc:
     • bội số MODEL_DIM_MULTIPLE (an toàn VAE)
     • ~MODEL_TARGET_MP megapixel (vùng tối ưu model)
     • sai số tỉ lệ ≤ ASPECT_RATIO_TOLERANCE (1%)
   Pure functions → test bằng số thật.
   ============================================================ */

'use strict';

import { CONFIG } from '../config.js?v=20260707115237';

export function aspectRatio(w, h) {
  return (h > 0) ? w / h : 0;
}

/**
 * Chọn (W,H) ratio-safe gần nhất cho model.
 * @returns {{width,height,aspectRatio,ratioError,megapixels}}
 */
export function computeModelDimensions(origW, origH, cfg = CONFIG) {
  const ratio = aspectRatio(origW, origH) || 1;
  const mult = cfg.MODEL_DIM_MULTIPLE || 16;
  const minDim = cfg.MODEL_MIN_DIM || 512;
  const maxDim = cfg.MODEL_MAX_DIM || 1536;
  const targetPixels = (cfg.MODEL_TARGET_MP || 1) * 1e6;
  const tol = cfg.ASPECT_RATIO_TOLERANCE ?? 0.01;

  const snap = (v) => Math.round(v / mult) * mult;
  const clamp = (v) => Math.min(maxDim, Math.max(minDim, v));

  const candidates = [];
  for (let h = minDim; h <= maxDim; h += mult) {
    let w = clamp(snap(h * ratio));
    const r = w / h;
    candidates.push({
      width: w, height: h,
      aspectRatio: r,
      ratioError: Math.abs(r - ratio) / ratio,
      megapixels: (w * h) / 1e6,
    });
  }
  // Cũng quét theo trục W để phủ ảnh rất ngang.
  for (let w = minDim; w <= maxDim; w += mult) {
    let h = clamp(snap(w / ratio));
    const r = w / h;
    candidates.push({
      width: w, height: h,
      aspectRatio: r,
      ratioError: Math.abs(r - ratio) / ratio,
      megapixels: (w * h) / 1e6,
    });
  }

  const inTol = candidates.filter((c) => c.ratioError <= tol);
  const pool = inTol.length ? inTol : candidates;
  pool.sort((a, b) => {
    // ưu tiên gần target megapixel; tie-break: ratioError nhỏ hơn
    const da = Math.abs(a.megapixels * 1e6 - targetPixels);
    const db = Math.abs(b.megapixels * 1e6 - targetPixels);
    if (da !== db) return da - db;
    return a.ratioError - b.ratioError;
  });
  const best = pool[0];
  return {
    width: best.width, height: best.height,
    aspectRatio: best.aspectRatio,
    ratioError: best.ratioError,
    megapixels: best.megapixels,
  };
}

/** Metadata hình học đi xuyên pipeline. */
export function buildGeometry(origW, origH, cfg = CONFIG) {
  const model = computeModelDimensions(origW, origH, cfg);
  return {
    originalWidth: origW,
    originalHeight: origH,
    originalAspectRatio: aspectRatio(origW, origH),
    modelInputWidth: model.width,
    modelInputHeight: model.height,
    modelAspectRatio: model.aspectRatio,
    plannedRatioError: model.ratioError,
    padding: null,
    crop: null,
    outputWidth: null,
    outputHeight: null,
    outputAspectRatio: null,
  };
}

/**
 * Validate tỉ lệ output so với gốc.
 * @returns {{ok, outputAspectRatio, ratioError, tolerance}}
 */
export function validateOutputRatio(originalAspectRatio, outW, outH, cfg = CONFIG) {
  const tol = cfg.ASPECT_RATIO_TOLERANCE ?? 0.01;
  const outRatio = aspectRatio(outW, outH);
  const ratioError = originalAspectRatio > 0
    ? Math.abs(outRatio - originalAspectRatio) / originalAspectRatio
    : 1;
  return { ok: ratioError <= tol, outputAspectRatio: outRatio, ratioError, tolerance: tol };
}

export default { aspectRatio, computeModelDimensions, buildGeometry, validateOutputRatio };
