/* ============================================================
   components/color-editor.js — Chỉnh màu thủ công ĐẦY ĐỦ đối tượng
   3 vùng cố định (tường/viền/cửa) LUÔN hiện, KHÔNG tắt được. Cộng thêm
   MỌI bề mặt mở rộng (mái, sàn…) và đối tượng tự thêm ở "Tự Phối Màu"
   đã được gán màu — khách chọn bao nhiêu đối tượng ở bước 3 thì bước 4
   hiện đủ bấy nhiêu, không chỉ 3 vùng cố định.
   Mỗi dòng: swatch · nút mở bộ chọn màu Kelly-Moore (km-picker, có swatch
   thật — KHÔNG còn ô nhập HEX tay/color picker trình duyệt) · reset/xoá ·
   undo thay đổi gần nhất. Đọc/ghi qua wizard-store.
   ============================================================ */

'use strict';

import { isValidHex, normalizeHex } from '../utils/validation.js?v=20260707115237';
import { nameFor, all as kmAll } from '../data/km-catalog.js?v=20260707115237';
import { SURFACE_BY_KEY } from '../data/surfaces.js?v=20260707115237';

// Tra code KM từ 1 HEX (khớp chính xác) để hiện lại trên nút khi refresh.
function kmCodeForHex(hex) {
  const h = (normalizeHex(hex) || '').toLowerCase();
  if (!h) return '';
  const found = kmAll().find((c) => c.hex.toLowerCase() === h);
  return found ? found.code : '';
}

const BASE_ZONES = [
  { key: 'walls', kind: 'color', zone: 'walls', label: 'Màu tường chính', hint: 'Mảng sơn lớn — AI xử lý tốt nhất.' },
  { key: 'trims', kind: 'color', zone: 'trims', label: 'Viền / cột / phào chỉ', hint: 'Đường nét, gờ chỉ.' },
  {
    key: 'accent', kind: 'color', zone: 'accent', label: 'Điểm nhấn / cửa-cổng',
    hint: 'Luôn được phối màu. Lưu ý: cửa sắt, kim loại, hoa văn có thể kém ổn định.',
  },
];

const AI_WARNING = 'AI tô tốt nhất các mảng sơn lớn (tường, cột, viền). '
  + 'Chi tiết nhỏ, kim loại, kính, cửa sắt có thể kém chính xác.';

/**
 * @param {HTMLElement} root
 * @param {{store, onChange?:Function}} ctx
 * @returns {{destroy:Function, refresh:Function}}
 */
export function mountColorEditor(root, { store, onChange, kmPicker } = {}) {
  const undoStacks = {};

  root.classList.add('color-editor');
  root.innerHTML = `
    <div class="alert alert-warning d-flex align-items-start gap-2 py-2 ce-warning" role="note"><svg class="ce-warn-ico flex-shrink-0" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.3 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.3a2 2 0 0 0-3.42 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg><span class="small">${AI_WARNING}</span></div>
    <div class="d-flex flex-column gap-2 ce-zones"></div>
  `;
  const zonesEl = root.querySelector('.ce-zones');

  // ── Bề mặt mở rộng + đối tượng tự thêm ĐÃ CÓ MÀU → hiện thêm dòng.
  // Rỗng màu (chưa chọn ở bước 3) thì KHÔNG hiện, tránh dàn trải vô ích.
  function extraZones() {
    const s = store.get();
    const out = [];
    Object.keys(s.surfaces || {}).forEach((skey) => {
      const c = s.surfaces[skey];
      if (!c || !isValidHex(c.hex)) return;
      const def = SURFACE_BY_KEY[skey];
      out.push({ key: `surface:${skey}`, kind: 'surface', skey, label: def ? def.label : skey, hint: def ? def.hint : '' });
    });
    (s.customZones || []).forEach((z) => {
      if (!z || !isValidHex(z.hex)) return;
      out.push({ key: `custom:${z.id}`, kind: 'custom', id: z.id, label: (z.label && z.label.trim()) || 'Đối tượng', hint: 'Đối tượng tự thêm.' });
    });
    return out;
  }

  function allZones() { return [...BASE_ZONES, ...extraZones()]; }

  function readColor(z) {
    const s = store.get();
    if (z.kind === 'color') return s.colors[z.zone] || {};
    if (z.kind === 'surface') return (s.surfaces || {})[z.skey] || {};
    return (s.customZones || []).find((x) => x.id === z.id) || {};
  }

  function writeColor(z, patch) {
    if (z.kind === 'color') {
      const cur = store.get().colors[z.zone] || {};
      store.update('colors', { [z.zone]: Object.assign({}, cur, patch) });
    } else if (z.kind === 'surface') {
      const cur = (store.get().surfaces || {})[z.skey] || {};
      store.update('surfaces', { [z.skey]: Object.assign({}, cur, patch) });
    } else {
      const list = (store.get().customZones || []).map((x) => (x.id === z.id ? Object.assign({}, x, patch) : x));
      store.set({ customZones: list });
    }
  }

  /** Bỏ màu (KHÔNG áp dụng cho 3 vùng cố định — luôn phải có màu). */
  function clearColor(z) {
    if (z.kind === 'surface') writeColor(z, { hex: null, enabled: false });
    else writeColor(z, { hex: null });
    if (onChange) onChange(z.key, null);
  }

  function zoneRowHtml(z) {
    const extra = z.kind !== 'color';
    return `
      <div class="card p-2 ce-zone" data-zone="${z.key}">
        <div class="d-flex justify-content-between align-items-center ce-zone-head">
          <span class="fw-semibold small ce-zone-label">${escapeHtml(z.label)}</span>
        </div>
        <div class="text-body-secondary ce-zone-hint" style="font-size:.72rem">${escapeHtml(z.hint || '')}</div>
        <div class="d-flex align-items-center gap-1 mt-1 ce-zone-controls">
          <span class="rounded ce-swatch" data-role="swatch" draggable="true" title="Kéo để đổi màu với đối tượng khác" style="width:28px;height:28px;flex-shrink:0"></span>
          <button type="button" class="btn btn-sm btn-outline-secondary ce-km-btn" data-role="picker" aria-label="${escapeHtml(z.label)} — chọn mã màu Kelly-Moore" title="Chọn mã màu Kelly-Moore — xem tất cả màu">
            <span class="ce-km-btn-dot" data-role="kmDot"></span><span class="ce-km-btn-text" data-role="kmText">Chọn mã KM…</span>
          </button>
          ${extra
            ? `<button type="button" class="btn btn-sm btn-outline-secondary ce-btn" data-role="clear" title="Bỏ màu đối tượng này" aria-label="Bỏ màu"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button>`
            : `<button type="button" class="btn btn-sm btn-outline-secondary ce-btn" data-role="reset" title="Về màu palette" aria-label="Về màu palette"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 2.64-6.36"/><path d="M3 3v6h6"/></svg></button>`}
          <button type="button" class="btn btn-sm btn-outline-secondary ce-btn" data-role="undo" title="Hoàn tác" aria-label="Hoàn tác" disabled><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-1"/></svg></button>
        </div>
        <div class="text-body-secondary mt-1 ce-zone-name" data-role="name" style="font-size:.72rem"></div>
      </div>`;
  }

  function bindZone(row, z) {
    if (!undoStacks[z.key]) undoStacks[z.key] = [];
    const picker = row.querySelector('[data-role="picker"]');
    const resetBtn = row.querySelector('[data-role="reset"]');
    const clearBtn = row.querySelector('[data-role="clear"]');
    const undoBtn = row.querySelector('[data-role="undo"]');

    const commit = (rawHex, { pushUndo = true } = {}) => {
      const hex = normalizeHex(rawHex);
      if (!hex) return;
      const cur = readColor(z);
      if (pushUndo && cur && cur.hex && cur.hex !== hex) {
        undoStacks[z.key].push(cur.hex);
        undoBtn.disabled = false;
      }
      const patch = z.kind === 'surface'
        ? { hex, name: nameFor(hex), enabled: true }
        : { hex, name: nameFor(hex), source: 'manual' };
      writeColor(z, patch);
      store.addRecentColor(hex);
      if (onChange) onChange(z.key, hex);
    };

    // Mở bộ chọn màu Kelly-Moore (modal km-picker) — bấm swatch HOẶC nút KM.
    const openPicker = () => { if (kmPicker) kmPicker.open(z.key, { onPick: (zone, color) => commit(color.hex) }); };
    const swatch = row.querySelector('[data-role="swatch"]');
    if (swatch) {
      swatch.style.cursor = 'pointer';
      swatch.title = 'Bấm để chọn màu · kéo để đổi màu với đối tượng khác';
      swatch.addEventListener('click', openPicker);
    }
    if (picker) picker.addEventListener('click', openPicker);

    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        const def = readColor(z);
        const palDefault = (def && def.paletteDefault) || def.hex;
        commit(palDefault);
      });
    }
    if (clearBtn) clearBtn.addEventListener('click', () => clearColor(z));
    undoBtn.addEventListener('click', () => {
      const prev = undoStacks[z.key].pop();
      if (prev) commit(prev, { pushUndo: false });
      undoBtn.disabled = undoStacks[z.key].length === 0;
    });
  }

  // ── Kéo-thả swatch để HOÁN ĐỔI màu giữa 2 đối tượng (mọi kind) ──
  function swapZones(aKey, bKey) {
    if (aKey === bKey) return;
    const za = allZones().find((z) => z.key === aKey);
    const zb = allZones().find((z) => z.key === bKey);
    if (!za || !zb) return;
    const ca = readColor(za), cb = readColor(zb);
    if (!ca.hex || !cb.hex) return;
    undoStacks[aKey] = undoStacks[aKey] || []; undoStacks[bKey] = undoStacks[bKey] || [];
    undoStacks[aKey].push(ca.hex); undoStacks[bKey].push(cb.hex);
    writeColor(za, { hex: cb.hex, name: cb.name || nameFor(cb.hex), source: 'manual', enabled: true });
    writeColor(zb, { hex: ca.hex, name: ca.name || nameFor(ca.hex), source: 'manual', enabled: true });
    store.addRecentColor(ca.hex); store.addRecentColor(cb.hex);
    [aKey, bKey].forEach((k) => {
      const ub = zonesEl.querySelector(`.ce-zone[data-zone="${CSS.escape(k)}"] [data-role="undo"]`);
      if (ub) ub.disabled = false;
    });
    if (onChange) { onChange(aKey, cb.hex); onChange(bKey, ca.hex); }
  }

  const zoneOf = (el) => { const r = el && el.closest('.ce-zone'); return r ? r.dataset.zone : null; };
  zonesEl.addEventListener('dragstart', (e) => {
    if (!e.target.classList || !e.target.classList.contains('ce-swatch')) return;
    const k = zoneOf(e.target);
    const z = k && allZones().find((x) => x.key === k);
    if (!z || !readColor(z).hex) { e.preventDefault(); return; }
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', k);
    e.target.closest('.ce-zone').classList.add('ce-dragging');
  });
  zonesEl.addEventListener('dragover', (e) => {
    const row = e.target.closest('.ce-zone'); if (!row) return;
    e.preventDefault(); e.dataTransfer.dropEffect = 'move';
    row.classList.add('ce-drop');
  });
  zonesEl.addEventListener('dragleave', (e) => {
    const row = e.target.closest('.ce-zone'); if (row) row.classList.remove('ce-drop');
  });
  zonesEl.addEventListener('drop', (e) => {
    const row = e.target.closest('.ce-zone'); if (!row) return;
    e.preventDefault();
    row.classList.remove('ce-drop');
    const src = e.dataTransfer.getData('text/plain');
    if (src) swapZones(src, row.dataset.zone);
  });
  zonesEl.addEventListener('dragend', () => {
    zonesEl.querySelectorAll('.ce-dragging,.ce-drop').forEach((el) => el.classList.remove('ce-dragging', 'ce-drop'));
  });

  // ── Kéo bằng CẢM ỨNG (Pointer Events) — HTML5 DnD không chạy trên mobile.
  // Giữ ~120ms HOẶC nhích ngón tay là bắt đầu kéo ngay (không phải đè lâu),
  // có "bóng ma" màu bay theo ngón tay, thả lên dòng khác để hoán đổi màu.
  let tDrag = null; // { srcKey, ghost, timer, started, x, y }
  const clearDrop = () => zonesEl.querySelectorAll('.ce-drop,.ce-dragging').forEach((el) => el.classList.remove('ce-drop', 'ce-dragging'));
  function tDragStart(sw) {
    if (!tDrag || tDrag.started) return;
    tDrag.started = true;
    sw.closest('.ce-zone').classList.add('ce-dragging');
    const g = document.createElement('div');
    g.className = 'ce-drag-ghost';
    g.style.background = sw.style.background;
    document.body.appendChild(g);
    tDrag.ghost = g;
    tDragMoveGhost(tDrag.x, tDrag.y);
    if (navigator.vibrate) navigator.vibrate(10);
  }
  function tDragMoveGhost(x, y) {
    if (!tDrag || !tDrag.ghost) return;
    tDrag.ghost.style.left = `${x}px`; tDrag.ghost.style.top = `${y}px`;
    const under = document.elementFromPoint(x, y);
    const row = under && under.closest && under.closest('.ce-zone');
    zonesEl.querySelectorAll('.ce-drop').forEach((el) => { if (el !== row) el.classList.remove('ce-drop'); });
    if (row && row.dataset.zone !== tDrag.srcKey) row.classList.add('ce-drop');
  }
  function tDragEnd(commitDrop) {
    if (!tDrag) return;
    clearTimeout(tDrag.timer);
    if (tDrag.ghost) {
      if (commitDrop) {
        tDrag.ghost.style.display = 'none';
        const under = document.elementFromPoint(tDrag.x, tDrag.y);
        const row = under && under.closest && under.closest('.ce-zone');
        if (row) swapZones(tDrag.srcKey, row.dataset.zone);
      }
      tDrag.ghost.remove();
    }
    clearDrop();
    tDrag = null;
  }
  zonesEl.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return; // chuột đã có HTML5 DnD
    const sw = e.target.closest && e.target.closest('.ce-swatch');
    if (!sw) return;
    const k = zoneOf(sw);
    const z = k && allZones().find((x) => x.key === k);
    if (!z || !readColor(z).hex) return;
    tDrag = { srcKey: k, ghost: null, started: false, x: e.clientX, y: e.clientY, timer: setTimeout(() => tDragStart(sw), 120) };
    zonesEl.addEventListener('pointermove', onTMove);
    const up = (ev) => {
      zonesEl.removeEventListener('pointermove', onTMove);
      window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
      if (tDrag) { tDrag.x = ev.clientX; tDrag.y = ev.clientY; }
      const started = tDrag && tDrag.started;
      tDragEnd(ev.type === 'pointerup');
      // Kéo rồi thì chặn click mở picker ngay sau đó
      if (started) sw.addEventListener('click', (ce) => { ce.stopPropagation(); ce.preventDefault(); }, { once: true, capture: true });
    };
    function onTMove(ev) {
      if (!tDrag) return;
      const dx = ev.clientX - tDrag.x, dy = ev.clientY - tDrag.y;
      tDrag.x = ev.clientX; tDrag.y = ev.clientY;
      if (!tDrag.started && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) { clearTimeout(tDrag.timer); tDragStart(sw); }
      if (tDrag.started) { ev.preventDefault(); tDragMoveGhost(ev.clientX, ev.clientY); }
    }
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  });
  // Chặn menu đè-lâu của trình duyệt trên swatch (iOS/Android)
  zonesEl.addEventListener('contextmenu', (e) => {
    if (e.target.closest && e.target.closest('.ce-swatch')) e.preventDefault();
  });

  let lastSig = '';
  function sigOf(zones) { return zones.map((z) => z.key).join('|'); }

  function buildList() {
    const zones = allZones();
    lastSig = sigOf(zones);
    zonesEl.innerHTML = zones.map(zoneRowHtml).join('');
    zones.forEach((z) => bindZone(zonesEl.querySelector(`.ce-zone[data-zone="${CSS.escape(z.key)}"]`), z));
    refresh();
  }

  function refresh() {
    const zones = allZones();
    if (sigOf(zones) !== lastSig) { buildList(); return; }
    zones.forEach((z) => {
      const row = zonesEl.querySelector(`.ce-zone[data-zone="${CSS.escape(z.key)}"]`);
      if (!row) return;
      const c = readColor(z);
      const hex = c.hex || '#ffffff';
      row.querySelector('[data-role="swatch"]').style.background = hex;
      const kmDot = row.querySelector('[data-role="kmDot"]');
      const kmText = row.querySelector('[data-role="kmText"]');
      if (kmDot) kmDot.style.background = isValidHex(hex) ? hex : '';
      if (kmText) kmText.textContent = isValidHex(hex) ? (kmCodeForHex(hex) || hex.toUpperCase()) : 'Chọn mã KM…';
      row.querySelector('[data-role="name"]').textContent = c.name || nameFor(hex);
    });
  }

  const unsub = store.subscribe((s, prev) => {
    if (s.colors !== prev.colors || s.surfaces !== prev.surfaces || s.customZones !== prev.customZones) refresh();
  });
  buildList();

  return {
    refresh,
    destroy() { unsub(); root.innerHTML = ''; root.classList.remove('color-editor'); },
  };
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export default { mountColorEditor };
