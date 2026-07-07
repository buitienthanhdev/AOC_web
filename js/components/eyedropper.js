/* ============================================================
   components/eyedropper.js — Soi màu (HEX checker) + ghim pin trên ảnh
   Bật/tắt qua nút header. Khi bật: di chuột trên ảnh trong #cmpStage
   hiện tooltip theo con trỏ với swatch + mã HEX tại điểm đó, cùng mã
   Kelly-Moore GẦN NHẤT (km-catalog.nearest).
   Click vào ảnh → GHIM 1 PIN tại điểm đó (giữ nguyên vị trí bất kể
   zoom/pan/resize sau này, vì lưu theo tỉ lệ 0..1 trên ảnh gốc chứ
   không phải toạ độ màn hình). Click vào pin đã ghim → popover thông
   tin đầy đủ + nút "Sử dụng màu" → mở popup chọn vùng (tường/viền/cửa/
   mái…) → ghi màu vào store giống combo-editor.
   Tắt eyedropper (bấm lại nút header) → xoá toàn bộ pin đã ghim.
   Đọc pixel qua canvas ẩn từ chính <img> đang hiển thị dưới con trỏ
   (before nếu bên trái thanh so sánh, sau nếu bên phải), map toạ độ
   theo object-fit:contain + transform zoom/pan hiện tại của cmp-img.
   ============================================================ */

'use strict';

import { nearest } from '../data/km-catalog.js?v=20260707115237';

/** Ma trận transform CSS "matrix(a,b,c,d,e,f)" → {scale, tx, ty} (không xoay/skew ở đây). */
function readTransform(el) {
  const st = getComputedStyle(el).transform;
  if (!st || st === 'none') return { scale: 1, tx: 0, ty: 0 };
  const m = st.match(/^matrix\(([^)]+)\)$/);
  if (!m) return { scale: 1, tx: 0, ty: 0 };
  const p = m[1].split(',').map(Number);
  return { scale: p[0], tx: p[4], ty: p[5] };
}

/** Khung "contain" của ảnh trong stage TRƯỚC khi áp transform zoom. */
function fitBox(img, stageRect) {
  const boxW = stageRect.width, boxH = stageRect.height;
  const ir = img.naturalWidth / img.naturalHeight;
  const br = boxW / boxH;
  if (ir > br) return { fitW: boxW, fitH: boxW / ir, fitX: 0, fitY: (boxH - boxW / ir) / 2 };
  return { fitH: boxH, fitW: boxH * ir, fitX: (boxW - boxH * ir) / 2, fitY: 0 };
}

/** Toạ độ pixel gốc (naturalWidth/Height) của ảnh tại 1 điểm client (clientX/Y). Trả thêm fx/fy (0..1). */
function pixelAt(img, stageRect, clientX, clientY) {
  if (!img || !img.naturalWidth) return null;
  const { scale, tx, ty } = readTransform(img);
  const { fitW, fitH, fitX, fitY } = fitBox(img, stageRect);

  // Điểm chuột trong hệ toạ độ stage (0,0 = góc trên-trái khung ảnh).
  const px = clientX - stageRect.left;
  const py = clientY - stageRect.top;

  // Bỏ transform zoom/pan (áp dụng quanh tâm stage — transform-origin:center).
  const cx = stageRect.width / 2, cy = stageRect.height / 2;
  const ux = cx + (px - cx - tx) / scale;
  const uy = cy + (py - cy - ty) / scale;

  // Điểm trong khung "contain" chưa zoom → tỉ lệ 0..1 trên ảnh gốc.
  const fx = (ux - fitX) / fitW;
  const fy = (uy - fitY) / fitH;
  if (fx < 0 || fx > 1 || fy < 0 || fy > 1) return null;

  return {
    fx, fy,
    x: Math.min(img.naturalWidth - 1, Math.max(0, Math.round(fx * img.naturalWidth))),
    y: Math.min(img.naturalHeight - 1, Math.max(0, Math.round(fy * img.naturalHeight))),
  };
}

/** Ngược lại của pixelAt(): từ tỉ lệ 0..1 trên ảnh gốc → toạ độ hiển thị hiện tại trong stage (px, từ góc trên-trái stage). */
function displayPosFor(img, stageRect, fx, fy) {
  const { scale, tx, ty } = readTransform(img);
  const { fitW, fitH, fitX, fitY } = fitBox(img, stageRect);
  const ux = fitX + fx * fitW;
  const uy = fitY + fy * fitH;
  const cx = stageRect.width / 2, cy = stageRect.height / 2;
  const px = cx + (ux - cx) * scale + tx;
  const py = cy + (uy - cy) * scale + ty;
  return { left: px, top: py };
}

function rgbToHex(r, g, b) {
  const c = (n) => n.toString(16).padStart(2, '0');
  return ('#' + c(r) + c(g) + c(b)).toLowerCase();
}

// Vùng để chọn khi "Sử dụng màu" — khớp BASE_ROWS của combo-editor.js
// (giữ 2 danh sách đồng bộ thủ công vì mỗi bên có UI/khuôn khổ riêng).
const APPLY_ZONES = [
  { id: 'walls', label: 'Tường', kind: 'color', zone: 'walls' },
  { id: 'trims', label: 'Viền', kind: 'color', zone: 'trims' },
  { id: 'accent', label: 'Cửa', kind: 'color', zone: 'accent' },
  { id: 'roof', label: 'Mái', kind: 'surface', skey: 'roof' },
  { id: 'ceiling', label: 'Trần', kind: 'surface', skey: 'ceiling' },
  { id: 'floor', label: 'Sàn', kind: 'surface', skey: 'floor' },
  { id: 'gate', label: 'Cổng', kind: 'surface', skey: 'gate' },
  { id: 'fence', label: 'Hàng rào', kind: 'surface', skey: 'fence' },
  { id: 'stairs', label: 'Cầu thang', kind: 'surface', skey: 'stairs' },
];

function escapeAttr(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

let uid = 0;

export function mountEyedropper({ stageSelector = '#cmpStage', toggleBtn, toastFn, store } = {}) {
  let active = false;
  let canvas = document.createElement('canvas');
  let ctx = canvas.getContext('2d', { willReadFrequently: true });
  let cachedSrc = null;
  let tooltip = null;
  let lastPick = null; // { hex, km }
  let pins = []; // { id, fx, fy, useAfter, hex, km }
  let overlay = null; // container các .color-pin, con của #cmpStage
  let raf = 0;
  let openPinId = null; // pin đang mở popover thông tin

  function ensureTooltip() {
    if (tooltip) return tooltip;
    tooltip = document.createElement('div');
    tooltip.className = 'eyedropper-tip';
    tooltip.innerHTML = `
      <span class="ed-tip-sw" data-role="sw"></span>
      <span class="ed-tip-text">
        <b data-role="hex">#------</b>
        <span data-role="km">Gần nhất: —</span>
      </span>`;
    document.body.appendChild(tooltip);
    return tooltip;
  }

  function ensureOverlay(stage) {
    if (overlay && overlay.parentNode === stage) return overlay;
    overlay = document.createElement('div');
    overlay.className = 'pin-overlay';
    stage.appendChild(overlay);
    return overlay;
  }

  function drawToCanvas(img) {
    if (cachedSrc === img.currentSrc && canvas.width === img.naturalWidth) return true;
    if (!img.naturalWidth) return false;
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    try {
      ctx.drawImage(img, 0, 0);
      cachedSrc = img.currentSrc;
      return true;
    } catch (e) {
      return false; // CORS/tainted canvas — không thể đọc pixel
    }
  }

  function pickImgAt(stage, clientX, clientY) {
    const rect = stage.getBoundingClientRect();
    const handle = stage.querySelector('.cmp-handle');
    const posPct = handle ? parseFloat(handle.style.left) || 50 : 50;
    const splitX = rect.left + rect.width * (posPct / 100);
    const useAfter = clientX >= splitX;
    const layer = stage.querySelector(useAfter ? '.cmp-after' : '.cmp-before');
    const img = layer && layer.querySelector('.cmp-img:not(.is-hidden)');
    return { img, rect, useAfter };
  }

  function imgForLayer(stage, useAfter) {
    const layer = stage.querySelector(useAfter ? '.cmp-after' : '.cmp-before');
    return layer && layer.querySelector('.cmp-img:not(.is-hidden)');
  }

  function updateTip(clientX, clientY, hex, kmLabel) {
    const tip = ensureTooltip();
    tip.querySelector('[data-role="sw"]').style.background = hex;
    tip.querySelector('[data-role="hex"]').textContent = hex.toUpperCase();
    tip.querySelector('[data-role="km"]').textContent = kmLabel;
    // Lệch khỏi con trỏ để không bị ngón tay/chuột che — kẹp trong viewport.
    const w = 170, h = 54;
    let left = clientX + 16, top = clientY + 16;
    if (left + w > window.innerWidth) left = clientX - w - 16;
    if (top + h > window.innerHeight) top = clientY - h - 16;
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
    tip.classList.add('is-visible');
  }

  function hideTip() { if (tooltip) tooltip.classList.remove('is-visible'); }

  function onMove(e) {
    const stage = document.querySelector(stageSelector);
    if (!stage) return;
    const { img, rect } = pickImgAt(stage, e.clientX, e.clientY);
    if (!img || !drawToCanvas(img)) { hideTip(); return; }
    const pt = pixelAt(img, rect, e.clientX, e.clientY);
    if (!pt) { hideTip(); return; }
    let data;
    try { data = ctx.getImageData(pt.x, pt.y, 1, 1).data; } catch (_) { hideTip(); return; }
    const hex = rgbToHex(data[0], data[1], data[2]);
    const km = nearest(hex);
    const kmLabel = km ? `Gần nhất: ${km.name}${km.code ? ` · KM ${km.code}` : ''}` : 'Gần nhất: —';
    lastPick = { hex, km };
    updateTip(e.clientX, e.clientY, hex, kmLabel);
  }

  function onClick(e) {
    const stage = document.querySelector(stageSelector);
    if (!stage || !lastPick) return;
    e.preventDefault(); e.stopPropagation();
    const { img, rect, useAfter } = pickImgAt(stage, e.clientX, e.clientY);
    const pt = img && pixelAt(img, rect, e.clientX, e.clientY);
    if (!pt) return;
    const id = 'pin' + (++uid);
    pins.push({ id, fx: pt.fx, fy: pt.fy, useAfter, hex: lastPick.hex, km: lastPick.km });
    renderPins();
    openPinId = id;
    renderPopover();
  }

  // ── Pins: render + reposition theo zoom/pan hiện tại ─────────
  function renderPins() {
    const stage = document.querySelector(stageSelector);
    if (!stage) return;
    const ov = ensureOverlay(stage);
    ov.innerHTML = pins.map((p) => `
      <button type="button" class="color-pin" data-pin="${p.id}" style="background:${p.hex}" title="${escapeAttr(p.hex.toUpperCase())}" aria-label="Điểm màu đã ghim ${escapeAttr(p.hex.toUpperCase())}"></button>
    `).join('');
    repositionPins();
  }

  function repositionPins() {
    const stage = document.querySelector(stageSelector);
    if (!stage || !overlay || !pins.length) return;
    const rect = stage.getBoundingClientRect();
    pins.forEach((p) => {
      const img = imgForLayer(stage, p.useAfter);
      const el = overlay.querySelector(`[data-pin="${p.id}"]`);
      if (!img || !el) return;
      const { left, top } = displayPosFor(img, rect, p.fx, p.fy);
      el.style.left = `${left}px`;
      el.style.top = `${top}px`;
    });
    if (openPinId) repositionPopover();
  }

  function loopReposition() {
    raf = 0;
    if (active && pins.length) {
      repositionPins();
      raf = requestAnimationFrame(loopReposition);
    }
  }
  function scheduleReposition() { if (!raf) raf = requestAnimationFrame(loopReposition); }

  function removePin(id) {
    pins = pins.filter((p) => p.id !== id);
    if (openPinId === id) closePopover();
    renderPins();
  }

  function clearPins() {
    pins = [];
    openPinId = null;
    closePopover();
    if (overlay) overlay.innerHTML = '';
  }

  // ── Popover thông tin pin (hover) + popup chọn vùng (click "Sử dụng màu") ──
  let popover = null;
  let zonePopup = null;

  function ensurePopover() {
    if (popover) return popover;
    popover = document.createElement('div');
    popover.className = 'pin-popover';
    popover.innerHTML = `
      <div class="pin-popover-sw" data-role="sw"></div>
      <div class="pin-popover-body">
        <b data-role="hex">#------</b>
        <span data-role="km" class="d-block small"></span>
      </div>
      <div class="pin-popover-actions">
        <button type="button" class="btn btn-sm btn-outline-secondary" data-role="del" title="Xoá pin">Xoá</button>
        <button type="button" class="btn btn-sm btn-success" data-role="use">Sử dụng màu</button>
      </div>`;
    document.body.appendChild(popover);
    popover.querySelector('[data-role="del"]').addEventListener('click', () => {
      if (openPinId) removePin(openPinId);
    });
    popover.querySelector('[data-role="use"]').addEventListener('click', () => {
      if (openPinId) openZonePopup(openPinId);
    });
    return popover;
  }

  function repositionPopover() {
    if (!popover || !openPinId) return;
    const stage = document.querySelector(stageSelector);
    const el = stage && overlay && overlay.querySelector(`[data-pin="${openPinId}"]`);
    if (!el) return;
    const r = el.getBoundingClientRect();
    const w = 220, h = 130;
    let left = r.left + r.width / 2 - w / 2;
    let top = r.top - h - 12;
    if (top < 8) top = r.bottom + 12;
    left = Math.max(8, Math.min(window.innerWidth - w - 8, left));
    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;
  }

  function renderPopover() {
    const p = pins.find((x) => x.id === openPinId);
    if (!p) return;
    const pop = ensurePopover();
    pop.querySelector('[data-role="sw"]').style.background = p.hex;
    pop.querySelector('[data-role="hex"]').textContent = p.hex.toUpperCase();
    pop.querySelector('[data-role="km"]').textContent = p.km ? `Gần nhất: ${p.km.name}${p.km.code ? ` · KM ${p.km.code}` : ''}` : 'Gần nhất: —';
    pop.classList.add('is-visible');
    repositionPopover();
  }

  function closePopover() {
    openPinId = null;
    if (popover) popover.classList.remove('is-visible');
  }

  function ensureZonePopup() {
    if (zonePopup) return zonePopup;
    zonePopup = document.createElement('div');
    zonePopup.className = 'pin-zone-popup';
    zonePopup.innerHTML = `
      <div class="pin-zone-popup-head">Áp dụng màu vào đâu?</div>
      <div class="pin-zone-popup-list" data-role="list">
        ${APPLY_ZONES.map((z) => `<button type="button" class="btn btn-sm btn-outline-secondary" data-zone="${z.id}">${z.label}</button>`).join('')}
      </div>
      <button type="button" class="btn btn-sm btn-link pin-zone-popup-cancel" data-role="cancel">Huỷ</button>`;
    document.body.appendChild(zonePopup);
    zonePopup.querySelector('[data-role="cancel"]').addEventListener('click', closeZonePopup);
    zonePopup.querySelector('[data-role="list"]').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-zone]'); if (!btn) return;
      applyPinToZone(zonePopupPinId, btn.dataset.zone);
      closeZonePopup();
    });
    return zonePopup;
  }

  let zonePopupPinId = null;
  function openZonePopup(pinId) {
    zonePopupPinId = pinId;
    const popup = ensureZonePopup();
    closePopover();
    const stage = document.querySelector(stageSelector);
    const el = stage && overlay && overlay.querySelector(`[data-pin="${pinId}"]`);
    if (el) {
      const r = el.getBoundingClientRect();
      const w = 240;
      let left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2));
      let top = Math.max(8, r.top - 12);
      popup.style.left = `${left}px`;
      popup.style.top = `${top}px`;
    }
    popup.classList.add('is-visible');
  }
  function closeZonePopup() {
    zonePopupPinId = null;
    if (zonePopup) zonePopup.classList.remove('is-visible');
  }

  function applyPinToZone(pinId, zoneId) {
    const p = pins.find((x) => x.id === pinId);
    const z = APPLY_ZONES.find((x) => x.id === zoneId);
    if (!p || !z || !store) return;
    const hex = p.hex;
    const name = p.km ? p.km.name : hex;
    if (z.kind === 'color') {
      const cur = store.get().colors[z.zone] || {};
      store.update('colors', { [z.zone]: Object.assign({}, cur, { hex, name, source: 'manual', enabled: true }) });
    } else {
      store.update('surfaces', { [z.skey]: { hex, name, enabled: true } });
    }
    store.addRecentColor(hex);
    if (toastFn) toastFn().success(`${name} → ${z.label}`, 'Đã áp dụng màu', 1800);
  }

  function setActive(next) {
    active = next;
    const stage = document.querySelector(stageSelector);
    if (toggleBtn) {
      toggleBtn.classList.toggle('active', active);
      toggleBtn.setAttribute('aria-pressed', String(active));
    }
    if (stage) stage.classList.toggle('is-eyedropper', active);
    if (!active) { hideTip(); clearPins(); closeZonePopup(); }
    else scheduleReposition();
  }

  function toggle() { setActive(!active); }

  // Không chặn các điều khiển sẵn có của viewer (nút zoom, thanh kéo so
  // sánh) — nếu không, bật eyedropper sẽ vô tình khoá luôn zoom/slide vì
  // stopPropagation() ở onClick chặn mất listener click gốc trên .cmp-tools.
  const isViewerControl = (target) => target.closest('.cmp-tools') || target.closest('.cmp-handle');

  document.addEventListener('mousemove', (e) => {
    if (!active) return;
    const stage = document.querySelector(stageSelector);
    if (!stage || !stage.contains(e.target) || isViewerControl(e.target) || e.target.closest('.color-pin')) { hideTip(); return; }
    onMove(e);
  });
  document.addEventListener('click', (e) => {
    if (!active) return;
    if (e.target.closest('.pin-popover') || e.target.closest('.pin-zone-popup')) return;
    const pinBtn = e.target.closest('.color-pin');
    if (pinBtn) {
      e.preventDefault(); e.stopPropagation();
      openPinId = pinBtn.dataset.pin;
      renderPopover();
      return;
    }
    const stage = document.querySelector(stageSelector);
    if (!stage || !stage.contains(e.target) || isViewerControl(e.target)) { closePopover(); closeZonePopup(); return; }
    onClick(e);
  }, true);
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (zonePopup && zonePopup.classList.contains('is-visible')) closeZonePopup();
    else if (openPinId) closePopover();
    else if (active) setActive(false);
  });
  // Zoom/pan/resize không phát sự kiện riêng từ viewer — theo dõi qua các
  // tương tác gây ra thay đổi transform để cập nhật lại vị trí pin ngay,
  // thay vì chỉ dựa vào vòng lặp rAF (mượt hơn khi kéo/lăn chuột nhanh).
  document.addEventListener('wheel', () => { if (active) scheduleReposition(); }, { passive: true });
  document.addEventListener('pointermove', () => { if (active && pins.length) scheduleReposition(); });
  window.addEventListener('resize', () => { if (active) scheduleReposition(); });

  if (toggleBtn) toggleBtn.addEventListener('click', toggle);

  return {
    get active() { return active; },
    setActive,
    toggle,
    destroy() {
      if (tooltip) tooltip.remove();
      if (popover) popover.remove();
      if (zonePopup) zonePopup.remove();
      if (overlay) overlay.remove();
      if (raf) cancelAnimationFrame(raf);
      if (toggleBtn) toggleBtn.removeEventListener('click', toggle);
    },
  };
}

export default { mountEyedropper };
