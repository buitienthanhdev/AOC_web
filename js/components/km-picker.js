/* ============================================================
   components/km-picker.js — Bộ chọn màu Kelly-Moore (modal)
   • Tìm theo tên/mã · lọc nhóm màu (theo hue khoa học, xem km-catalog.js)
     · nhập HEX trực tiếp · màu gần đây.
   • 3 CHẾ ĐỘ lọc (tab): Nhóm màu thường · Phong thuỷ theo Mệnh (màu bản
     mệnh — Kim=trắng/be/kem, Mộc=lục, Thuỷ=lam/chàm, Hoả=đỏ, Thổ=nâu/đen)
     · Gợi ý theo độ tuổi bé (0–2 / 2–4 / 4–6 tuổi — 4–6 tách thêm trai/gái).
     Mệnh do khách TỰ CHỌN (không tự tính từ năm sinh — xem data/fengshui.js).
   Dữ liệu qua data/km-catalog.js (adapter) + data/fengshui.js (quy tắc).
   ============================================================ */

'use strict';

import { CONFIG } from '../config.js?v=20260707115237';
import { search, families, nameFor } from '../data/km-catalog.js?v=20260707115237';
import { isValidHex, normalizeHex, contrastText } from '../utils/validation.js?v=20260707115237';
import { MENH_LIST, BABY_AGE_GROUPS, menhByKey, ageGroupByKey } from '../data/fengshui.js?v=20260707115237';

const MODES = [
  { key: 'family', icon: '🎨', label: 'Nhóm màu' },
  { key: 'menh', icon: '☯️', label: 'Phong thuỷ (Mệnh)' },
  { key: 'age', icon: '🧸', label: 'Màu cho bé' },
];

export function mountKmPicker(root, { store, onPick } = {}) {
  let mode = 'family';
  let activeFamily = null;
  let activeMenh = null;
  let activeAge = null;
  let activeAgeVariant = null; // trai/gái — chỉ dùng khi activeAge === '4-6'
  let targetZone = null;
  let pickHandler = onPick; // có thể override theo từng lần open() (vd. combo-editor)

  // Bootstrap Modal thật: root là <div class="modal fade">, nội dung theo
  // đúng cấu trúc modal-dialog > modal-content. open()/close() dùng API
  // bootstrap.Modal thay vì tự toggle class 'open' như trước.
  root.classList.add('modal', 'fade', 'km-picker');
  root.setAttribute('tabindex', '-1');
  root.setAttribute('aria-hidden', 'true');
  root.innerHTML = `
    <div class="modal-dialog modal-dialog-scrollable modal-lg km-dialog">
      <div class="modal-content">
        <div class="modal-header km-head">
          <div class="km-head-text">
            <strong class="modal-title km-title">Chọn màu Kelly-Moore</strong>
            <div class="small km-subtitle">Theo tên/mã · phong thuỷ theo Mệnh · gợi ý màu cho phòng bé</div>
          </div>
          <button type="button" class="btn-close km-close" data-role="close" aria-label="Đóng"></button>
        </div>
        <div class="modal-body">
          <div class="d-flex flex-wrap gap-2 mb-2 km-controls">
            <input type="search" class="form-control flex-grow-1 km-search" data-role="search" placeholder="Tìm theo tên hoặc mã màu…" aria-label="Tìm màu">
            <div class="d-flex gap-1 km-direct">
              <input type="color" class="form-control form-control-color" data-role="direct-picker" aria-label="Bảng màu trực tiếp">
              <input type="text" class="form-control km-hex" data-role="direct-hex" maxlength="7" placeholder="#RRGGBB" aria-label="Nhập HEX" style="width:110px">
              <button class="btn btn-outline-secondary text-nowrap km-btn" data-role="direct-apply" type="button">Dùng HEX</button>
            </div>
          </div>

          <ul class="nav nav-pills mb-2 km-modes" data-role="modes" role="tablist">
            ${MODES.map((m) => `<li class="nav-item" role="presentation">
              <button class="nav-link km-mode${m.key === mode ? ' active' : ''}" data-mode="${m.key}" type="button" role="tab" aria-selected="${m.key === mode}">${m.icon} ${m.label}</button>
            </li>`).join('')}
          </ul>

          <div class="km-mode-panel" data-role="modePanel"></div>

          <div class="d-flex flex-wrap gap-1 mb-2 km-recent" data-role="recent"></div>
          <div class="row row-cols-auto g-1 km-grid" data-role="grid"></div>
        </div>
      </div>
    </div>
  `;

  const searchEl = root.querySelector('[data-role="search"]');
  const gridEl = root.querySelector('[data-role="grid"]');
  const modesEl = root.querySelector('[data-role="modes"]');
  const modePanelEl = root.querySelector('[data-role="modePanel"]');
  const recentEl = root.querySelector('[data-role="recent"]');
  const directHex = root.querySelector('[data-role="direct-hex"]');
  const directPicker = root.querySelector('[data-role="direct-picker"]');

  modesEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.km-mode'); if (!btn) return;
    mode = btn.dataset.mode;
    modesEl.querySelectorAll('.km-mode').forEach((b) => {
      const on = b === btn;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', String(on));
    });
    renderModePanel();
    renderGrid();
  });

  function renderModePanel() {
    if (mode === 'family') {
      modePanelEl.innerHTML = `<div class="d-flex flex-wrap gap-1 km-families" data-role="families">
        <button class="btn btn-sm btn-outline-secondary km-fam${!activeFamily ? ' active' : ''}" data-fam="" type="button">Tất cả</button>
        ${families().slice(0, 10).map((f) => `<button class="btn btn-sm btn-outline-secondary km-fam${activeFamily === f.key ? ' active' : ''}" data-fam="${f.key}" type="button">${f.label}</button>`).join('')}
      </div>`;
      modePanelEl.querySelector('[data-role="families"]').addEventListener('click', (e) => {
        const btn = e.target.closest('.km-fam'); if (!btn) return;
        activeFamily = btn.dataset.fam || null;
        modePanelEl.querySelectorAll('.km-fam').forEach((b) => b.classList.toggle('active', b === btn));
        renderGrid();
      });
      return;
    }

    if (mode === 'menh') {
      const active = menhByKey(activeMenh);
      modePanelEl.innerHTML = `
        <div class="small text-body-secondary mb-1 km-mode-hint">Chọn mệnh của bạn — gợi ý màu HỢP với bản mệnh.</div>
        <div class="d-flex flex-wrap gap-1 mb-1 km-menh-list" data-role="menhList">
          ${MENH_LIST.map((m) => `<button class="btn btn-sm btn-outline-secondary km-menh${activeMenh === m.key ? ' active' : ''}" data-menh="${m.key}" type="button">${m.icon} ${m.vi}</button>`).join('')}
        </div>
        ${active ? `<div class="small km-mode-active-hint"><b>Mệnh ${active.vi}</b> — ${escapeAttr(active.hint)}</div>` : ''}
      `;
      modePanelEl.querySelector('[data-role="menhList"]').addEventListener('click', (e) => {
        const btn = e.target.closest('.km-menh'); if (!btn) return;
        activeMenh = activeMenh === btn.dataset.menh ? null : btn.dataset.menh; // bấm lại = bỏ chọn
        renderModePanel();
        renderGrid();
      });
      return;
    }

    // mode === 'age' — riêng nhóm 4-6 tuổi có thêm bước chọn trai/gái vì
    // tính cách bắt đầu phân hoá theo giới ở tuổi này.
    const topActive = BABY_AGE_GROUPS.find((g) => g.key === activeAge);
    const activeG = ageGroupByKey(activeAgeVariant || activeAge);
    modePanelEl.innerHTML = `
      <div class="small text-body-secondary mb-1 km-mode-hint">Gợi ý màu tham khảo theo độ tuổi — không thay thế tư vấn thiết kế/y khoa chuyên sâu.</div>
      <div class="d-flex flex-wrap gap-1 mb-1 km-age-list" data-role="ageList">
        ${BABY_AGE_GROUPS.map((g) => `<button class="btn btn-sm btn-outline-secondary km-age${activeAge === g.key ? ' active' : ''}" data-age="${g.key}" type="button">${g.vi}</button>`).join('')}
      </div>
      ${topActive && topActive.variants ? `
        <div class="d-flex flex-wrap gap-1 mb-1 km-age-variant-list" data-role="ageVariantList">
          ${topActive.variants.map((v) => `<button class="btn btn-sm btn-outline-secondary km-age-variant${activeAgeVariant === v.key ? ' active' : ''}" data-age-variant="${v.key}" type="button">${v.vi}</button>`).join('')}
        </div>` : ''}
      ${activeG ? `<div class="small km-mode-active-hint">${escapeAttr(activeG.hint)}</div>` : ''}
    `;
    modePanelEl.querySelector('[data-role="ageList"]').addEventListener('click', (e) => {
      const btn = e.target.closest('.km-age'); if (!btn) return;
      const key = btn.dataset.age;
      activeAge = activeAge === key ? null : key; // bấm lại = bỏ chọn
      activeAgeVariant = null; // đổi nhóm tuổi → phải chọn lại trai/gái nếu là 4-6
      renderModePanel();
      renderGrid();
    });
    const variantList = modePanelEl.querySelector('[data-role="ageVariantList"]');
    if (variantList) {
      variantList.addEventListener('click', (e) => {
        const btn = e.target.closest('.km-age-variant'); if (!btn) return;
        activeAgeVariant = activeAgeVariant === btn.dataset.ageVariant ? null : btn.dataset.ageVariant;
        renderModePanel();
        renderGrid();
      });
    }
  }

  searchEl.addEventListener('input', debounce(renderGrid, 120));
  gridEl.addEventListener('click', (e) => {
    const cell = e.target.closest('.km-cell'); if (!cell) return;
    pick({ hex: cell.dataset.hex, name: cell.dataset.name, code: cell.dataset.code });
  });
  recentEl.addEventListener('click', (e) => {
    const cell = e.target.closest('.km-cell'); if (!cell) return;
    pick({ hex: cell.dataset.hex, name: nameFor(cell.dataset.hex), code: '' });
  });

  const applyDirect = () => {
    const hex = normalizeHex(directHex.value || directPicker.value);
    if (!hex || !isValidHex(hex)) { directHex.classList.add('invalid'); return; }
    directHex.classList.remove('invalid');
    pick({ hex, name: nameFor(hex), code: '' });
  };
  root.querySelector('[data-role="direct-apply"]').addEventListener('click', applyDirect);
  directHex.addEventListener('keydown', (e) => { if (e.key === 'Enter') applyDirect(); });
  directPicker.addEventListener('input', () => { directHex.value = directPicker.value; });

  // Bootstrap Modal tự lo backdrop + phím Esc; nút ✕ vẫn tự bắt để gọi close()
  // (thay vì data-bs-dismiss) vì close() còn phải đồng bộ trạng thái nội bộ.
  root.querySelector('[data-role="close"]').addEventListener('click', close);
  const bsModal = new bootstrap.Modal(root);
  root.addEventListener('hidden.bs.modal', () => { targetZone = null; });

  function renderGrid() {
    const q = searchEl.value;

    if (mode === 'menh' && !activeMenh) {
      gridEl.innerHTML = '<div class="col-12 text-body-secondary small text-center py-3 km-empty">Chọn 1 mệnh ở trên để xem màu hợp.</div>';
      return;
    }
    if (mode === 'age') {
      if (!activeAge) {
        gridEl.innerHTML = '<div class="col-12 text-body-secondary small text-center py-3 km-empty">Chọn 1 độ tuổi ở trên để xem gợi ý màu.</div>';
        return;
      }
      if (activeAge === '4-6' && !activeAgeVariant) {
        gridEl.innerHTML = '<div class="col-12 text-body-secondary small text-center py-3 km-empty">Chọn thêm bé trai / bé gái ở trên để xem gợi ý phù hợp.</div>';
        return;
      }
    }

    let list;
    if (mode === 'menh') {
      list = search(q, { predicate: menhByKey(activeMenh).match });
    } else if (mode === 'age') {
      list = search(q, { predicate: ageGroupByKey(activeAgeVariant || activeAge).match });
    } else {
      list = search(q, { family: activeFamily });
    }

    gridEl.innerHTML = list.map((c) => `<div class="col">${cell(c)}</div>`).join('') ||
      '<div class="col-12 text-body-secondary small text-center py-3 km-empty">Không tìm thấy màu phù hợp.</div>';
  }
  function renderRecent() {
    const recents = store.get().recentColors || [];
    recentEl.innerHTML = recents.length
      ? `<span class="small text-body-secondary align-self-center km-recent-label">Gần đây:</span>` + recents.map((hex) =>
        // <button> thay vì <span> — trước đây là span thuần nên không thể
        // Tab/kích hoạt bằng bàn phím dù có onclick delegate ở JS.
        `<button type="button" class="rounded km-cell km-cell-sm" data-hex="${hex}" aria-label="${escapeAttr(nameFor(hex))}" style="width:24px;height:24px;background:${hex};border:0;padding:0" title="${escapeAttr(nameFor(hex))}"></button>`).join('')
      : '';
  }
  function cell(c) {
    return `<button class="btn btn-sm km-cell" data-hex="${c.hex}" data-name="${escapeAttr(c.name)}" data-code="${c.code}" type="button"
      aria-label="${escapeAttr(c.name)}, mã ${c.code}"
      style="background:${c.hex};color:${contrastText(c.hex)};width:64px;height:44px" title="${escapeAttr(c.name)} (${c.code})">
      <span class="km-cell-code" style="font-size:.65rem">${c.code}</span></button>`;
  }

  function pick(color) {
    store.addRecentColor(color.hex);
    if (targetZone && pickHandler) pickHandler(targetZone, color);
    close();
  }

  // opts.onPick: override một lần cho lần open() này (vd. combo-editor ghi
  // thẳng vào 1 dòng ce-mini thay vì store.colors mặc định).
  function open(zone, opts = {}) {
    targetZone = zone || null;
    pickHandler = opts.onPick || onPick;
    renderModePanel();
    renderGrid(); renderRecent();
    bsModal.show();
    root.addEventListener('shown.bs.modal', () => searchEl.focus(), { once: true });
  }
  function close() { bsModal.hide(); }

  return {
    open, close,
    destroy() { bsModal.dispose(); root.innerHTML = ''; },
  };
}

function debounce(fn, ms) {
  let t; return function (...a) { clearTimeout(t); t = setTimeout(() => fn.apply(this, a), ms); };
}
function escapeAttr(s) {
  return String(s || '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

export default { mountKmPicker };
