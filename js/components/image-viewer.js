/* ============================================================
   components/image-viewer.js — Viewer so sánh Trước/Sau + Zoom
   • Before/After: thanh trượt (clip-path) — TRÁI = ảnh gốc, PHẢI = kết quả.
   • Day/Night: đổi nguồn lớp "Sau" (palette KHÔNG đổi, chỉ swap ảnh).
   • Zoom: lăn chuột (theo con trỏ), double-click, pinch 2 ngón, nút +/−/reset,
     kéo để pan khi đã phóng to. Ảnh full-res → zoom không giảm chất lượng.
   Tự dựng DOM trong root (#cmpStage). KHÔNG phụ thuộc thư viện ngoài.
   ============================================================ */

'use strict';

const SVG = (p) => `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
const ICON = {
  plus: SVG('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/><path d="M11 8v6"/><path d="M8 11h6"/>'),
  minus: SVG('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/><path d="M8 11h6"/>'),
  reset: SVG('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>'),
};

const MIN_SCALE = 1;
const MAX_SCALE = 6;

export function mountImageViewer(root, opts = {}) {
  root.classList.add('cmp-stage');
  root.innerHTML = `
    <div class="cmp-layer cmp-before"><img class="cmp-img" alt="Ảnh gốc" draggable="false" crossorigin="anonymous"></div>
    <div class="cmp-layer cmp-after">
      <img class="cmp-img cmp-day" alt="Kết quả ban ngày" draggable="false" crossorigin="anonymous">
      <img class="cmp-img cmp-night is-hidden" alt="Kết quả ban đêm" draggable="false" crossorigin="anonymous">
    </div>
    <span class="cmp-tag cmp-tag-before">TRƯỚC</span>
    <span class="cmp-tag cmp-tag-after">SAU</span>
    <div class="cmp-handle"><span class="cmp-handle-line"></span><span class="cmp-handle-grip">⟷</span></div>
    <div class="cmp-ratio" id="cmpRatio"></div>
    <div class="cmp-tools">
      <button class="cmp-tool" data-z="in"  title="Phóng to" type="button">${ICON.plus}</button>
      <span class="cmp-zoom-pct" title="Mức phóng đại">100%</span>
      <button class="cmp-tool" data-z="out" title="Thu nhỏ" type="button">${ICON.minus}</button>
      <button class="cmp-tool" data-z="reset" title="Về mặc định" type="button">${ICON.reset}</button>
    </div>`;

  const beforeImg = root.querySelector('.cmp-before .cmp-img');
  const afterLayer = root.querySelector('.cmp-after');
  const afterDay = root.querySelector('.cmp-after .cmp-day');
  const afterNight = root.querySelector('.cmp-after .cmp-night');
  const handle = root.querySelector('.cmp-handle');
  const ratioEl = root.querySelector('#cmpRatio');
  const zoomPctEl = root.querySelector('.cmp-zoom-pct');

  const data = { before: null, day: null, night: null, view: 'day' };
  let pos = 50;                 // % vị trí thanh trượt
  let scale = 1, tx = 0, ty = 0;

  // Cache kích thước stage — tránh getBoundingClientRect() mỗi lần di chuột.
  let rect = null;
  function refreshRect() { rect = root.getBoundingClientRect(); }
  function getRect() { if (!rect || !rect.width) refreshRect(); return rect; }

  // ── rAF coalescing: gộp mọi cập nhật vào 1 lần ghi DOM mỗi khung hình ──
  let raf = 0, needT = false, needC = false;
  function flush() {
    raf = 0;
    if (needT) {
      const t = `translate(${tx}px, ${ty}px) scale(${scale})`;
      beforeImg.style.transform = t;
      afterDay.style.transform = t;
      afterNight.style.transform = t;
      root.classList.toggle('is-zoomed', scale > 1);
      if (zoomPctEl) zoomPctEl.textContent = `${Math.round(scale * 100)}%`;
      needT = false;
    }
    if (needC) {
      afterLayer.style.clipPath = `inset(0 0 0 ${pos}%)`;
      handle.style.left = pos + '%';
      needC = false;
    }
  }
  function schedule() { if (!raf) raf = requestAnimationFrame(flush); }
  function applyTransform() { needT = true; schedule(); }
  function applyClip() { needC = true; schedule(); }

  function clampPan() {
    const r = getRect();
    const maxX = (scale - 1) * r.width / 2;
    const maxY = (scale - 1) * r.height / 2;
    tx = Math.max(-maxX, Math.min(maxX, tx));
    ty = Math.max(-maxY, Math.min(maxY, ty));
  }

  // ── Zoom quanh 1 điểm (ox,oy tính từ TÂM stage) ──
  function zoomAt(ox, oy, nextScale) {
    nextScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, nextScale));
    if (nextScale === scale) return;
    if (nextScale === 1) { scale = 1; tx = 0; ty = 0; }
    else {
      tx = ox - (ox - tx) * (nextScale / scale);
      ty = oy - (oy - ty) * (nextScale / scale);
      scale = nextScale;
      clampPan();
    }
    applyTransform();
  }

  // ── Wheel zoom theo con trỏ ──
  root.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = getRect();
    const ox = e.clientX - r.left - r.width / 2;
    const oy = e.clientY - r.top - r.height / 2;
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    zoomAt(ox, oy, scale * factor);
  }, { passive: false });

  // ── Double-click toggle ──
  root.addEventListener('dblclick', (e) => {
    const r = getRect();
    const ox = e.clientX - r.left - r.width / 2;
    const oy = e.clientY - r.top - r.height / 2;
    zoomAt(ox, oy, scale > 1 ? 1 : 2.5);
  });

  // ── Nút zoom ──
  root.querySelector('.cmp-tools').addEventListener('click', (e) => {
    const btn = e.target.closest('.cmp-tool'); if (!btn) return;
    if (btn.dataset.z === 'in') zoomAt(0, 0, scale * 1.4);
    else if (btn.dataset.z === 'out') zoomAt(0, 0, scale / 1.4);
    else { scale = 1; tx = 0; ty = 0; pos = 50; applyTransform(); applyClip(); }
  });

  // ── Pointer: kéo handle (slide) / kéo nền (pan) / pinch (zoom) ──
  const pointers = new Map();
  let mode = null;             // 'slide' | 'pan'
  let panStart = null;         // {x,y,tx,ty}
  let pinch = null;            // {dist, scale}

  function setPosFromClientX(clientX) {
    const r = getRect();
    pos = Math.max(0, Math.min(100, ((clientX - r.left) / r.width) * 100));
    applyClip();
  }

  root.addEventListener('pointerdown', (e) => {
    refreshRect(); // làm mới 1 lần khi bắt đầu thao tác
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    root.setPointerCapture(e.pointerId);

    if (pointers.size === 2) {
      const pts = [...pointers.values()];
      pinch = { dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y), scale };
      mode = null; panStart = null;
      return;
    }
    if (e.target.closest('.cmp-tool') || e.target.closest('.cmp-tools')) return;

    if (e.target.closest('.cmp-handle')) {
      mode = 'slide';
    } else if (scale > 1) {
      mode = 'pan';
      panStart = { x: e.clientX, y: e.clientY, tx, ty };
    } else {
      // chưa zoom: cho phép kéo bất kỳ đâu để trượt so sánh
      mode = 'slide';
      setPosFromClientX(e.clientX);
    }
  });

  root.addEventListener('pointermove', (e) => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pinch && pointers.size >= 2) {
      const pts = [...pointers.values()];
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      zoomAt(0, 0, pinch.scale * (d / pinch.dist));
      return;
    }
    if (mode === 'slide') { setPosFromClientX(e.clientX); }
    else if (mode === 'pan' && panStart) {
      tx = panStart.tx + (e.clientX - panStart.x);
      ty = panStart.ty + (e.clientY - panStart.y);
      clampPan(); applyTransform();
    }
  });

  function endPointer(e) {
    pointers.delete(e.pointerId);
    try { root.releasePointerCapture(e.pointerId); } catch (_) {}
    if (pointers.size < 2) pinch = null;
    if (pointers.size === 0) { mode = null; panStart = null; }
  }
  root.addEventListener('pointerup', endPointer);
  root.addEventListener('pointercancel', endPointer);

  // ── Ratio badge ──
  function setRatio(r) {
    if (!r || (!r.ratioCheck && !r.width)) { ratioEl.textContent = ''; ratioEl.className = 'cmp-ratio'; return; }
    if (r.ratioCheck) {
      ratioEl.textContent = r.ratioCheck.ok ? `Tỉ lệ chuẩn · ${r.width}×${r.height}` : `Tỉ lệ lệch ${(r.ratioCheck.ratioError * 100).toFixed(1)}%`;
      ratioEl.className = 'cmp-ratio ' + (r.ratioCheck.ok ? 'ok' : 'warn');
    } else { ratioEl.textContent = `${r.width || '?'}×${r.height || '?'}`; ratioEl.className = 'cmp-ratio'; }
  }

  // ── API ──
  function setImages({ before, day, night } = {}) {
    data.before = before || null;
    data.day = day || null;
    data.night = night || null;
    if (before) beforeImg.src = before;
    // Nạp SẴN cả 2 ảnh vào DOM → switch ngày/đêm chỉ ẩn/hiện, KHÔNG tải lại.
    if (day && day.url) afterDay.src = day.url;
    if (night && night.url) afterNight.src = night.url;
    setView(day ? 'day' : (night ? 'night' : data.view));
    refreshRect(); // viewer vừa hiện → cập nhật kích thước
    reset();
  }
  function setView(mode2) {
    const useNight = mode2 === 'night' && data.night && data.night.url;
    data.view = useNight ? 'night' : 'day';
    afterDay.classList.toggle('is-hidden', useNight);
    afterNight.classList.toggle('is-hidden', !useNight);
    const r = useNight ? data.night : data.day;
    if (r) setRatio(r);
  }
  function reset() { scale = 1; tx = 0; ty = 0; pos = 50; applyTransform(); applyClip(); }

  const onResize = () => refreshRect();
  window.addEventListener('resize', onResize);

  applyClip(); applyTransform();
  return {
    setImages, setView, reset,
    destroy() { window.removeEventListener('resize', onResize); if (raf) cancelAnimationFrame(raf); root.innerHTML = ''; },
  };
}

export default { mountImageViewer };
