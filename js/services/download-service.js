/* ============================================================
   services/download-service.js — 3 chế độ tải
   1. CLEAN: ảnh kết quả SẠCH, full-res, KHÔNG re-encode / ghép / watermark
            (tải thẳng bytes gốc từ ComfyUI).
   2. COMPARISON: so sánh trước/sau — chỉ khi chọn, KHÔNG hạ nguồn.
   3. SHARE: có watermark/branding — KHÔNG phải mặc định.
   Revoke objectURL đúng lúc (tránh leak).
   ============================================================ */

'use strict';

import { AppError, ErrorCode, toAppError } from './error-service.js?v=20260707115237';
import { logger } from '../utils/logger.js?v=20260707115237';

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // revoke sau khi trình duyệt kịp bắt đầu tải
  setTimeout(() => { try { URL.revokeObjectURL(url); } catch (_) {} }, 4000);
}

function loadImg(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('load failed: ' + src));
    img.src = src;
  });
}

/** (1) Ảnh sạch, full-res — tải thẳng bytes, KHÔNG xử lý lại. */
export async function downloadClean(result, filename = `paint_${Date.now()}.png`) {
  try {
    const res = await fetch(result.url, { mode: 'cors' });
    if (!res.ok) throw new AppError(ErrorCode.DOWNLOAD_FAILED, { technical: `view ${res.status}` });
    const blob = await res.blob();
    triggerDownload(blob, filename);
    logger.event('download', { mode: 'clean', bytes: blob.size, w: result.width, h: result.height });
  } catch (err) {
    throw toAppError(err, ErrorCode.DOWNLOAD_FAILED);
  }
}

/** (2) So sánh trước/sau — giữ ĐỘ PHÂN GIẢI kết quả, label nhẹ, KHÔNG banner quảng cáo. */
export async function downloadComparison(origSrc, result, filename = `paint_compare_${Date.now()}.jpg`, opts = {}) {
  try {
    const [orig, res] = await Promise.all([loadImg(origSrc), loadImg(result.url)]);
    // Chuẩn theo CHIỀU CAO của kết quả (không hạ nguồn).
    const H = res.naturalHeight;
    const ow = Math.round(orig.naturalWidth * (H / orig.naturalHeight));
    const gap = Math.max(2, Math.round(H * 0.004));
    const labelH = opts.label === false ? 0 : Math.max(28, Math.round(H * 0.05));

    const canvas = document.createElement('canvas');
    canvas.width = ow + gap + res.naturalWidth;
    canvas.height = H + labelH;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(orig, 0, labelH, ow, H);
    ctx.fillStyle = '#e5e7eb'; ctx.fillRect(ow, labelH, gap, H);
    ctx.drawImage(res, ow + gap, labelH, res.naturalWidth, H);

    if (labelH) {
      ctx.fillStyle = '#0B5C42';
      ctx.font = `600 ${Math.round(labelH * 0.5)}px -apple-system, Segoe UI, sans-serif`;
      ctx.textBaseline = 'middle';
      ctx.fillText('Trước', 12, labelH / 2);
      ctx.fillText('Sau', ow + gap + 12, labelH / 2);
    }
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.95));
    triggerDownload(blob, filename);
    logger.event('download', { mode: 'comparison', w: canvas.width, h: canvas.height });
  } catch (err) {
    throw toAppError(err, ErrorCode.DOWNLOAD_FAILED);
  }
}

/** (3) Chia sẻ MXH — watermark/branding tuỳ chọn (KHÔNG mặc định). */
export async function downloadShare(result, filename = `paint_share_${Date.now()}.jpg`, opts = {}) {
  try {
    const img = await loadImg(result.url);
    const W = img.naturalWidth; const H = img.naturalHeight;
    const barH = Math.max(36, Math.round(H * 0.06));
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H + barH;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, W, H);
    ctx.fillStyle = '#0A5C43'; ctx.fillRect(0, H, W, barH);
    ctx.fillStyle = '#ffffff';
    ctx.font = `700 ${Math.round(barH * 0.42)}px -apple-system, Segoe UI, sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.fillText(opts.brand || 'PAINT & MORE — AI Color Visualizer', 16, H + barH / 2);
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.95));
    triggerDownload(blob, filename);
    logger.event('download', { mode: 'share', w: canvas.width, h: canvas.height });
  } catch (err) {
    throw toAppError(err, ErrorCode.DOWNLOAD_FAILED);
  }
}

// ── Helpers cho ảnh tổng hợp ───────────────────────────────────
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function whiteSilhouette(img, w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d');
  x.drawImage(img, 0, 0, w, h);
  x.globalCompositeOperation = 'source-in';
  x.fillStyle = '#fff'; x.fillRect(0, 0, w, h);
  return c;
}
function drawRoundImage(ctx, img, x, y, w, h, r) {
  ctx.save(); roundRect(ctx, x, y, w, h, r); ctx.clip();
  ctx.drawImage(img, x, y, w, h); ctx.restore();
  ctx.save(); roundRect(ctx, x, y, w, h, r); ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(0,0,0,.12)'; ctx.stroke(); ctx.restore();
}
async function ensureFonts() {
  if (document.fonts && document.fonts.load) {
    try {
      await Promise.all([
        document.fonts.load('800 26px Montserrat'),
        document.fonts.load('700 14px Montserrat'),
        document.fonts.load('600 13px Montserrat'),
        document.fonts.load('500 13px Montserrat'),
      ]);
    } catch (_) {}
  }
}

/**
 * (DUY NHẤT) Ảnh tổng hợp branded: ngày + đêm + logo + tên công ty + bảng màu.
 * @param {{day, night, colors:Array<{label,hex,name,code,disabled}>, brand?, subtitle?, logoUrl?, title?}}
 */
export async function composeSummary(data) {
  const {
    original, day, night, colors = [],
    brand = 'PAINT & MORE', subtitle = 'Kelly-Moore Paints',
    logoUrl = 'image/logo-painmore.png', title = 'Phối màu công trình',
  } = data || {};
  {
    await ensureFonts();
    const dayImg = day && day.url ? await loadImg(day.url) : null;
    const nightImg = night && night.url ? await loadImg(night.url) : null;
    const origImg = original ? await loadImg(original) : null;
    if (!dayImg && !nightImg && !origImg) throw new AppError(ErrorCode.DOWNLOAD_FAILED, { technical: 'no images' });
    const logo = await loadImg(logoUrl).catch(() => null);

    const imgs = [];
    if (origImg) imgs.push({ im: origImg, label: 'Ảnh gốc' });
    if (dayImg) imgs.push({ im: dayImg, label: 'Phối màu ban ngày' });
    if (nightImg) imgs.push({ im: nightImg, label: 'Phối màu ban đêm' });

    const P = 40, gap = 28;
    let RH = 460;
    let widths = imgs.map((o) => RH * (o.im.naturalWidth / o.im.naturalHeight));
    let rowW = widths.reduce((a, b) => a + b, 0) + gap * (imgs.length - 1);
    const maxRowW = 1500;
    if (rowW > maxRowW) { const s = maxRowW / rowW; RH *= s; widths = widths.map((w) => w * s); rowW *= s; }

    const rows = colors.filter(Boolean);
    const rowH = 66, headerH = 116, labelH = 28, palTitleH = 40, disclaimerH = 45, footerH = 50;
    const contentW = Math.max(rowW, 680);
    const W = Math.ceil(contentW + P * 2);
    const H = Math.ceil(headerH + 24 + labelH + RH + 30 + palTitleH + rows.length * rowH + 14 + disclaimerH + footerH);

    const SCALE = 2; // hi-DPI cho chữ sắc nét
    const canvas = document.createElement('canvas');
    canvas.width = W * SCALE; canvas.height = H * SCALE;
    const ctx = canvas.getContext('2d');
    ctx.scale(SCALE, SCALE);
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);

    // ── Header ──
    ctx.fillStyle = '#0B5C42'; ctx.fillRect(0, 0, W, headerH);
    let lx = P;
    if (logo) {
      const lh = 44, lw = lh * (logo.naturalWidth / logo.naturalHeight);
      ctx.drawImage(whiteSilhouette(logo, lw, lh), lx, (headerH - lh) / 2, lw, lh);
      lx += lw + 16;
    }
    ctx.fillStyle = '#fff'; ctx.font = '800 24px Montserrat, sans-serif';
    ctx.fillText('PAINT & MORE · KELLY-MOORE PAINTS', lx, headerH / 2 - 2);
    ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.font = '600 13px Montserrat, sans-serif';
    ctx.fillText('Công cụ phối màu: AOC (AI for OneCoat Colormind)', lx, headerH / 2 + 20);

    ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.font = '500 13px Montserrat, sans-serif';
    ctx.fillText(`Kết quả phối màu AI · ${new Date().toLocaleDateString('vi-VN')}`, W - P, headerH / 2 + 8);
    ctx.textAlign = 'left';

    // ── Renders (gốc + ngày + đêm) ──
    let y = headerH + 24;
    let x = P + (contentW - rowW) / 2;
    ctx.textAlign = 'center';
    imgs.forEach((o, i) => {
      const w = widths[i];
      ctx.fillStyle = '#0B5C42'; ctx.font = '700 14px Montserrat, sans-serif';
      ctx.fillText(o.label, x + w / 2, y + 16);
      drawRoundImage(ctx, o.im, x, y + labelH, w, RH, 14);
      x += w + gap;
    });
    ctx.textAlign = 'left';
    y += labelH + RH + 30;

    // ── Bảng màu sử dụng ──
    ctx.fillStyle = '#141A16'; ctx.font = '800 17px Montserrat, sans-serif';
    ctx.fillText('Bảng màu sử dụng — Kelly-Moore', P, y + 18);
    y += palTitleH;
    rows.forEach((c) => {
      ctx.save(); roundRect(ctx, P, y, 48, 48, 9); ctx.fillStyle = c.hex; ctx.fill();
      ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(0,0,0,.14)'; ctx.stroke(); ctx.restore();
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#141A16'; ctx.font = '700 14px Montserrat, sans-serif';
      ctx.fillText(c.label, P + 62, y + 15);
      ctx.fillStyle = '#6B7B72'; ctx.font = '500 13px Montserrat, sans-serif';
      ctx.fillText((c.name || '') + (c.disabled ? ' — đã tắt' : ''), P + 62, y + 34);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#141A16'; ctx.font = "600 14px ui-monospace, 'SF Mono', monospace";
      ctx.fillText((c.hex || '').toUpperCase(), W - P, y + 15);
      if (c.code) { ctx.fillStyle = '#6B7B72'; ctx.font = '600 12px Montserrat, sans-serif'; ctx.fillText('Mã KM ' + c.code, W - P, y + 34); }
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      y += rowH;
    });

    // ── Disclaimer ──
    ctx.fillStyle = '#C53030';
    ctx.font = 'italic 12px Montserrat, sans-serif';
    ctx.fillText('* Kết quả phối màu có thể không chính xác so với thực tế, mong quý khách thông cảm', P, y + 10);
    ctx.fillText('  và mang kết quả ra đối chiếu với dịch vụ hỗ trợ khách hàng gần nhất.', P, y + 26);
    y += disclaimerH;

    // ── Footer ──
    ctx.fillStyle = '#0B5C42'; ctx.fillRect(0, H - footerH, W, footerH);
    ctx.fillStyle = '#fff'; ctx.font = '600 12px Montserrat, sans-serif'; ctx.textBaseline = 'middle';
    ctx.fillText(`${brand} — AI Color Visualizer`, P, H - footerH / 2);
    ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(255,255,255,.8)';
    ctx.fillText('kellymoore-usa.com', W - P, H - footerH / 2);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';

    return canvas;
  }
}

export async function downloadSummary(data, filename = `paint_tonghop_${Date.now()}.jpg`) {
  try {
    const canvas = await composeSummary(data);
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.95));
    triggerDownload(blob, filename);
    logger.event('download', { mode: 'summary', w: canvas.width, h: canvas.height });
  } catch (err) {
    throw toAppError(err, ErrorCode.DOWNLOAD_FAILED);
  }
}

export default { downloadSummary, composeSummary, downloadClean, downloadComparison, downloadShare };
