/* ============================================================
   components/combo-editor.js — "Tự phối màu" (Tab 2 của Step 3)
   Danh sách đối tượng dạng mini ce-zone: Tường · Viền · Cửa · Trần · Sàn…
   • MẶC ĐỊNH RỖNG MÀU (chỉ hiện nhãn) — chờ user chọn.
   • Nút "+ Thêm đối tượng" → tạo dòng tuỳ chỉnh (Cột, Lan can…) có ô nhập tên.
   • SINGLE SOURCE OF TRUTH — ghi thẳng vào store:
       kind 'color'   → store.colors[zone]  (tường/viền/cửa; 'default' = coi như rỗng)
       kind 'surface' → store.surfaces[skey] (trần/sàn… theo data/surfaces.js)
       kind 'custom'  → store.customZones[]  (đối tượng user tự thêm)
   ============================================================ */

'use strict';

import { isValidHex, normalizeHex } from '../utils/validation.js?v=20260707115237';
import { nameFor, all as kmAll } from '../data/km-catalog.js?v=20260707115237';

// Tra code KM từ 1 HEX (khớp chính xác) để hiện lại trên nút khi refresh.
function kmCodeForHex(hex) {
  const h = (normalizeHex(hex) || '').toLowerCase();
  if (!h) return '';
  const found = kmAll().find((c) => c.hex.toLowerCase() === h);
  return found ? found.code : '';
}

// Dòng cố định mặc định. Các surface map sang khoá trong data/surfaces.js.
const BASE_ROWS = [
  { id: 'walls',   label: 'Tường',    kind: 'color',   zone: 'walls' },
  { id: 'trims',   label: 'Viền',     kind: 'color',   zone: 'trims' },
  { id: 'accent',  label: 'Cửa',      kind: 'color',   zone: 'accent' },
  { id: 'roof',    label: 'Mái',      kind: 'surface', skey: 'roof' },
  { id: 'ceiling', label: 'Trần',     kind: 'surface', skey: 'ceiling' },
  { id: 'floor',   label: 'Sàn',      kind: 'surface', skey: 'floor' },
  { id: 'gate',    label: 'Cổng',     kind: 'surface', skey: 'gate' },
  { id: 'fence',   label: 'Hàng rào', kind: 'surface', skey: 'fence' },
  { id: 'stairs',  label: 'Cầu thang',kind: 'surface', skey: 'stairs' },
];

function escapeAttr(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function mountComboEditor(root, { store, onChange, kmPicker } = {}) {
  root.classList.add('combo-editor');
  root.innerHTML = `
    <div class="text-body-secondary small mb-2 ce-mini-hint">Chọn màu cho từng đối tượng. Để trống = không đổi (mặc định).</div>
    <div class="ce-mini-list" data-role="list"></div>
    <button type="button" class="btn btn-outline-secondary btn-sm w-100 mt-2 d-flex align-items-center justify-content-center gap-1 ce-mini-add" data-role="add">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
      Thêm đối tượng…
    </button>
  `;
  const listEl = root.querySelector('[data-role="list"]');
  const addBtn = root.querySelector('[data-role="add"]');

  // ── Adapter đọc/ghi store theo từng kind ─────────────────────
  function rowDef(rid) {
    return BASE_ROWS.find((r) => r.id === rid) || { id: rid, kind: 'custom' };
  }
  function customZone(id) { return (store.get().customZones || []).find((z) => z.id === id); }

  function readHex(r) {
    const s = store.get();
    if (r.kind === 'color') {
      const c = s.colors[r.zone] || {};
      return (c.source !== 'default' && isValidHex(c.hex)) ? c.hex : null; // 'default' = coi như rỗng
    }
    if (r.kind === 'surface') {
      const c = (s.surfaces || {})[r.skey] || {};
      return isValidHex(c.hex) ? c.hex : null;
    }
    const cz = customZone(r.id);
    return (cz && isValidHex(cz.hex)) ? cz.hex : null;
  }

  function writeHex(r, hex) {
    if (r.kind === 'color') {
      const cur = store.get().colors[r.zone] || {};
      store.update('colors', { [r.zone]: Object.assign({}, cur, { hex, name: nameFor(hex), source: 'manual', enabled: true }) });
    } else if (r.kind === 'surface') {
      store.update('surfaces', { [r.skey]: { hex, name: nameFor(hex), enabled: true } });
    } else {
      patchCustom(r.id, { hex, name: nameFor(hex) });
    }
    store.addRecentColor(hex);
    if (onChange) onChange(r.id, hex);
  }

  function clearHex(r) {
    if (r.kind === 'color') {
      const cur = store.get().colors[r.zone] || {};
      store.update('colors', { [r.zone]: Object.assign({}, cur, { source: 'default' }) }); // về rỗng (giữ hex nền để render an toàn)
    } else if (r.kind === 'surface') {
      store.update('surfaces', { [r.skey]: { hex: null, name: '', enabled: false } });
    } else {
      patchCustom(r.id, { hex: null, name: '' });
    }
    if (onChange) onChange(r.id, null);
  }

  function patchCustom(id, patch) {
    const list = (store.get().customZones || []).map((z) => (z.id === id ? Object.assign({}, z, patch) : z));
    store.set({ customZones: list });
  }

  // ── Render ── thẻ gọn 2 dòng (để xếp lưới 2 cột trong panel hẹp):
  //   dòng 1: [nhãn] ................ [xoá dòng nếu là custom]
  //   dòng 2: [swatch] [nút mở km-picker] [bỏ màu]
  function rowHtml(r) {
    const custom = r.kind === 'custom';
    return `
      <div class="card p-1 ce-mini empty" data-rid="${r.id}">
        <div class="d-flex align-items-center gap-1 ce-mini-row1">
          ${custom
            ? `<input class="form-control form-control-sm ce-mini-name" data-role="label" value="${escapeAttr(r.label || '')}" placeholder="Tên đối tượng…" aria-label="Tên đối tượng">`
            : `<span class="small text-truncate ce-mini-label">${r.label}</span>`
          }
          ${custom ? `<button type="button" class="btn btn-sm btn-outline-danger ce-mini-del" data-role="del" title="Xoá dòng" aria-label="Xoá">&times;</button>` : ''}
        </div>
        <div class="d-flex align-items-center gap-1 mt-1 ce-mini-row2">
          <span class="rounded ce-swatch ce-swatch-mini" data-role="swatch" draggable="true" title="Kéo để đổi màu với đối tượng khác" style="width:22px;height:22px;flex-shrink:0"></span>
          <button type="button" class="btn btn-sm btn-outline-secondary ce-km-btn ce-picker-mini" data-role="km" aria-label="Chọn mã màu Kelly-Moore" title="Chọn mã màu Kelly-Moore — xem tất cả màu">
            <span class="ce-km-btn-dot" data-role="kmDot"></span><span class="ce-km-btn-text" data-role="kmText">Chọn mã KM…</span>
          </button>
          <button type="button" class="btn btn-sm btn-outline-secondary ce-btn ce-btn-mini" data-role="clear" title="Bỏ màu" aria-label="Bỏ màu">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        </div>
      </div>`;
  }

  function allRows() {
    const customRows = (store.get().customZones || []).map((z) => ({ id: z.id, label: z.label, kind: 'custom' }));
    return [...BASE_ROWS, ...customRows];
  }

  function buildList() {
    listEl.innerHTML = allRows().map(rowHtml).join('');
    refresh();
  }

  function refresh() {
    allRows().forEach((r) => {
      const row = listEl.querySelector(`.ce-mini[data-rid="${CSS.escape(r.id)}"]`);
      if (!row) return;
      const hex = readHex(r);
      const empty = !hex;
      row.classList.toggle('empty', empty);
      const swatch = row.querySelector('[data-role="swatch"]');
      const kmDot = row.querySelector('[data-role="kmDot"]');
      const kmText = row.querySelector('[data-role="kmText"]');
      if (empty) {
        swatch.style.background = '';
        if (kmDot) kmDot.style.background = '';
        if (kmText) kmText.textContent = 'Chọn mã KM…';
      } else {
        swatch.style.background = hex;
        const code = kmCodeForHex(hex); // '' nếu HEX thủ công không thuộc catalog
        if (kmDot) kmDot.style.background = hex;
        if (kmText) kmText.textContent = code || hex.toUpperCase();
      }
    });
  }

  // Số dòng (id set) thay đổi → rebuild; còn lại chỉ refresh giá trị.
  let lastIds = '';
  function idsSig() { return (store.get().customZones || []).map((z) => z.id).join('|'); }

  // ── Event delegation ─────────────────────────────────────────
  listEl.addEventListener('input', (e) => {
    const row = e.target.closest('.ce-mini'); if (!row) return;
    const role = e.target.dataset.role; const r = rowDef(row.dataset.rid);
    if (role === 'label') patchCustom(r.id, { label: e.target.value });
  });
  listEl.addEventListener('click', (e) => {
    const row = e.target.closest('.ce-mini'); if (!row) return;
    const r = rowDef(row.dataset.rid);
    // .closest('[data-role="x"]') theo TỪNG role cụ thể — không dùng
    // '[data-role]' chung chung, vì nút "km" có span con cũng mang
    // data-role riêng (kmDot/kmText) và sẽ bị closest() bắt trúng trước.
    if (e.target.closest('[data-role="clear"]')) clearHex(r);
    else if (e.target.closest('[data-role="del"]')) store.set({ customZones: (store.get().customZones || []).filter((z) => z.id !== r.id) });
    else if (e.target.closest('[data-role="km"]') && kmPicker) kmPicker.open(r.id, { onPick: (zone, color) => writeHex(r, color.hex) });
  });

  // ── Kéo-thả swatch để HOÁN ĐỔI màu giữa 2 đối tượng ──────────
  function swapRows(aId, bId) {
    if (aId === bId) return;
    const ra = rowDef(aId), rb = rowDef(bId);
    const ha = readHex(ra), hb = readHex(rb);
    if (!ha) return;               // chỉ kéo khi nguồn có màu
    writeHex(rb, ha);              // đích nhận màu nguồn
    if (hb) writeHex(ra, hb); else clearHex(ra); // nguồn nhận màu đích (hoặc rỗng → chuyển hẳn)
  }
  const ridOf = (el) => { const r = el && el.closest('.ce-mini'); return r ? r.dataset.rid : null; };
  listEl.addEventListener('dragstart', (e) => {
    if (!e.target.classList || !e.target.classList.contains('ce-swatch')) return;
    const rid = ridOf(e.target);
    if (!rid || !readHex(rowDef(rid))) { e.preventDefault(); return; } // rỗng màu → không kéo
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', rid);
    e.target.closest('.ce-mini').classList.add('ce-dragging');
  });
  listEl.addEventListener('dragover', (e) => {
    const row = e.target.closest('.ce-mini'); if (!row) return;
    e.preventDefault(); e.dataTransfer.dropEffect = 'move';
    row.classList.add('ce-drop');
  });
  listEl.addEventListener('dragleave', (e) => {
    const row = e.target.closest('.ce-mini'); if (row) row.classList.remove('ce-drop');
  });
  listEl.addEventListener('drop', (e) => {
    const row = e.target.closest('.ce-mini'); if (!row) return;
    e.preventDefault(); row.classList.remove('ce-drop');
    const src = e.dataTransfer.getData('text/plain');
    if (src) swapRows(src, row.dataset.rid);
  });
  listEl.addEventListener('dragend', () => {
    listEl.querySelectorAll('.ce-dragging,.ce-drop').forEach((el) => el.classList.remove('ce-dragging', 'ce-drop'));
  });

  addBtn.addEventListener('click', () => {
    const id = 'cz_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    store.set({ customZones: [...(store.get().customZones || []), { id, label: '', hex: null, name: '' }] });
  });

  const unsub = store.subscribe((s, prev) => {
    if (s.customZones !== prev.customZones && idsSig() !== lastIds) { lastIds = idsSig(); buildList(); return; }
    if (s.colors !== prev.colors || s.surfaces !== prev.surfaces || s.customZones !== prev.customZones) refresh();
  });

  lastIds = idsSig();
  buildList();

  return {
    refresh,
    destroy() { unsub(); root.innerHTML = ''; root.classList.remove('combo-editor'); },
  };
}

export default { mountComboEditor };
