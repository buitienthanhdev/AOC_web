/* ============================================================
   components/history-panel.js — Nhật ký phối màu (logs)
   Lưu: thumbnail, thời gian, palette, mode, trạng thái (kể cả LỖI),
   danh sách màu (tên + mã KM + hex), loại công trình, phong cách,
   thời lượng. UI: tìm kiếm, đếm, badge trạng thái, swatch màu,
   mở lại / xoá từng mục, xuất JSON. Song ngữ qua window.i18n.
   ============================================================ */

'use strict';

import { CONFIG } from '../config.js?v=20260707115237';
import { logger } from '../utils/logger.js?v=20260707115237';
import { makeThumbDataUrl } from '../utils/image-thumb.js?v=20260707115237';

const KEY = 'paint_history_v1';

function read() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (_) { return []; }
}
// setItem có thể ném QuotaExceededError (thumbnail data-URL vẫn có thể dày
// lên nếu tích luỹ đủ lâu) — trước đây bắt lỗi RỖNG, nghĩa là cả mục vừa
// thêm lẫn 29 mục cũ đều biến mất không dấu vết, không ai biết. Thử trước
// bằng cách cắt bớt danh sách rồi mới chịu bỏ cuộc + log rõ ràng.
function write(list) {
  const trimmed = list.slice(0, CONFIG.MAX_HISTORY_ITEMS);
  try { localStorage.setItem(KEY, JSON.stringify(trimmed)); return; } catch (_) { /* thử cắt bớt bên dưới */ }
  for (const keep of [10, 5, 1]) {
    try { localStorage.setItem(KEY, JSON.stringify(trimmed.slice(0, keep))); logger.warn('history_write_trimmed', { keep }); return; }
    catch (_) { /* vẫn đầy, thử cắt tiếp */ }
  }
  logger.error('history_write_failed', { technical: 'localStorage quota exceeded kể cả khi chỉ còn 1 mục' });
}

export function addHistory(entry) {
  const list = read();
  list.unshift(Object.assign({ id: Date.now(), ts: new Date().toISOString() }, entry));
  write(list);
  logger.event('history_add', { status: entry.status, mode: entry.renderMode });
  return list;
}

export function removeHistory(id) {
  const list = read().filter((it) => String(it.id) !== String(id));
  write(list);
  return list;
}

// Dịch ngắn gọn theo ngôn ngữ hiện tại (DICT của i18n).
function t(s) { return (window.i18n && window.i18n.t) ? window.i18n.t(s) : s; }
function lang() { return (window.i18n && window.i18n.getLang && window.i18n.getLang() === 'en') ? 'en' : 'vi'; }

function fmtTime(ts) {
  const loc = lang() === 'en' ? 'en-US' : 'vi-VN';
  try { return new Date(ts).toLocaleString(loc, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch (_) { return new Date(ts).toLocaleString(); }
}
function modeLabel(m) { return t(m === 'both' ? 'Ngày + Đêm' : (m === 'night' ? 'Đêm' : 'Ngày')); }
function statusInfo(st) {
  if (st === 'FAILED') return { cls: 'fail', label: t('Lỗi') };
  if (st === 'COMPLETED') return { cls: 'ok', label: t('Hoàn tất') };
  return { cls: '', label: st || '' };
}

export function mountHistoryPanel(root, { onRestore, onReuseCombo } = {}) {
  // Bootstrap Offcanvas thật: root là <div> nhận class offcanvas offcanvas-end.
  root.classList.add('offcanvas', 'offcanvas-end', 'history-panel');
  root.setAttribute('tabindex', '-1');
  root.setAttribute('data-no-i18n', ''); // tự dịch bằng t(), tránh observer dịch chồng

  let bsOffcanvas = null;

  function shell() {
    root.innerHTML = `
    <div class="offcanvas-header hp-head">
      <h5 class="offcanvas-title">${t('Lịch sử phối màu')}</h5>
      <button class="btn-close hp-close" data-role="close" aria-label="${t('Đóng')}"></button>
    </div>
    <div class="offcanvas-body d-flex flex-column">
      <div class="d-flex flex-wrap gap-2 mb-2 hp-tools">
        <div class="input-group input-group-sm flex-grow-1 hp-search">
          <span class="input-group-text"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg></span>
          <input type="text" class="form-control" data-role="search" placeholder="${t('Tìm trong lịch sử…')}" aria-label="${t('Tìm trong lịch sử…')}">
        </div>
        <button class="btn btn-outline-secondary btn-sm hp-tool" data-role="export" title="${t('Xuất JSON')}" type="button">${t('Xuất JSON')}</button>
        <button class="btn btn-outline-danger btn-sm hp-tool hp-tool-danger" data-role="clear" title="${t('Xoá tất cả')}" type="button">${t('Xoá hết')}</button>
      </div>
      <div class="small text-body-secondary mb-2 hp-count" data-role="count"></div>
      <div class="d-flex flex-column gap-2 hp-list" data-role="list"></div>
    </div>`;
    if (bsOffcanvas) bsOffcanvas.dispose();
    bsOffcanvas = new bootstrap.Offcanvas(root);
    root.addEventListener('hidden.bs.offcanvas', () => { }, { once: false });
  }
  shell();

  let listEl = root.querySelector('[data-role="list"]');
  let countEl = root.querySelector('[data-role="count"]');
  let searchEl = root.querySelector('[data-role="search"]');
  let query = '';

  function matches(it, q) {
    if (!q) return true;
    const hay = [
      it.paletteName, it.styleLabel, it.projectType,
      ...(it.colors || []).map((c) => `${c.label} ${c.name} ${c.code}`),
    ].join(' ').toLowerCase();
    return hay.indexOf(q) >= 0;
  }

  // 3 vùng CỐ ĐỊNH (Tường/Viền/Cửa) — hiện lại y hệt bố cục .ce-zones của
  // color-editor.js (swatch tròn + tên/mã màu) nhưng CHỈ ĐỂ XEM: không nút
  // km-picker, không nút xoá/hoàn tác, không nút "Phối màu ngay". Mục đích:
  // khách lướt lịch sử thấy ngay bộ 3 màu đã dùng, rồi có thể bấm "Dùng lại
  // combo này" để nạp đúng 3 màu đó cho ảnh MỚI (xem reuseHistoryCombo ở main.js).
  const BASE_LABELS = ['Tường', 'Viền', 'Cửa'];
  function comboZonesHtml(colors) {
    const byLabel = new Map((colors || []).map((c) => [c.label, c]));
    const rows = BASE_LABELS.filter((l) => byLabel.has(l)).map((l) => {
      const c = byLabel.get(l);
      const desc = `${c.name || c.hex}${c.code ? ' · ' + c.code : ''}`;
      return `
        <div class="card p-2 ce-zone hp-combo-zone" data-zone-view="${escapeAttr(l)}">
          <div class="d-flex justify-content-between align-items-center ce-zone-head">
            <span class="fw-semibold small ce-zone-label">${escapeHtml(t(l))}</span>
          </div>
          <div class="d-flex align-items-center gap-1 mt-1 ce-zone-controls">
            <span class="rounded ce-swatch" role="img" aria-label="${escapeAttr(desc)}" style="width:24px;height:24px;flex-shrink:0;background:${escapeAttr(c.hex)}"></span>
            <span class="text-body-secondary small text-truncate">${escapeHtml(desc)}</span>
          </div>
        </div>`;
    }).join('');
    if (!rows) return '';
    return `<div class="d-flex flex-column gap-2 ce-zones hp-combo-zones">${rows}</div>`;
  }

  function swatches(colors) {
    if (!colors || !colors.length) return '';
    const max = 6;
    const dots = colors.slice(0, max).map((c) => {
      const desc = (c.label ? c.label + ': ' : '') + (c.name || c.hex) + (c.code ? ' · ' + c.code : '');
      // role="img" + aria-label — chỉ có title thì trình đọc màn hình không
      // chắc đọc được ý nghĩa của 1 <span> thuần trang trí.
      return `<span class="rounded-circle d-inline-block hp-sw" role="img" aria-label="${escapeAttr(desc)}" style="width:14px;height:14px;background:${escapeAttr(c.hex)}" title="${escapeAttr(desc)}"></span>`;
    }).join('');
    const more = colors.length > max ? `<span class="small hp-sw-more">+${colors.length - max}</span>` : '';
    return `<span class="d-flex align-items-center gap-1 hp-sws">${dots}${more}</span>`;
  }

  // Mục lịch sử LƯU TRƯỚC bản vá nén ảnh vẫn còn thumb là URL ảnh gốc/kết
  // quả đầy đủ (nặng, load lâu). Tự "chữa" ngầm: nén lại thành data URL nhỏ,
  // ghi đè vào localStorage + cập nhật đúng ô đang hiện — không re-render cả
  // danh sách (tránh giật/mất vị trí cuộn). Mục mới thêm sau này đã nén sẵn
  // (xem main.js saveHistory) nên bỏ qua ngay ở dòng đầu, không tốn công.
  function healLegacyThumbs(items) {
    items.forEach((it) => {
      if (!it.thumb || it.thumb.indexOf('data:') === 0) return;
      makeThumbDataUrl(it.thumb).then((small) => {
        if (!small) return;
        const stored = read();
        const idx = stored.findIndex((x) => String(x.id) === String(it.id));
        if (idx < 0) return;
        stored[idx] = Object.assign({}, stored[idx], { thumb: small });
        write(stored);
        const el = listEl.querySelector(`.hp-thumb[data-id="${CSS.escape(String(it.id))}"]`);
        if (el) el.style.backgroundImage = `url('${small}')`;
      });
    });
  }

  function render() {
    const all = read();
    const q = query.trim().toLowerCase();
    const list = all.filter((it) => matches(it, q));

    countEl.textContent = q
      ? `${list.length}/${all.length} ${t('mục')}`
      : `${all.length} ${t('mục')}`;

    if (!all.length) { listEl.innerHTML = `<div class="text-body-secondary small text-center py-3 hp-empty">${t('Chưa có lịch sử. Hãy phối màu một ảnh.')}</div>`; return; }
    if (!list.length) { listEl.innerHTML = `<div class="text-body-secondary small text-center py-3 hp-empty">${t('Không tìm thấy mục phù hợp.')}</div>`; return; }

    listEl.innerHTML = list.map((it) => {
      const st = statusInfo(it.status);
      const dur = it.durationMs ? ` · ${Math.round(it.durationMs / 1000)}s` : '';
      const canOpen = !!(it.results && (it.results.day || it.results.night));
      const sub = `${fmtTime(it.ts)} · ${modeLabel(it.renderMode)}${dur}`;
      const badgeCls = st.cls === 'ok' ? 'text-bg-success' : (st.cls === 'fail' ? 'text-bg-danger' : 'text-bg-secondary');
      const style = it.styleLabel ? `<span class="badge text-bg-secondary hp-tag">${escapeHtml(t(it.styleLabel))}</span>` : '';
      const comboHtml = comboZonesHtml(it.colors);
      return `<div class="card p-2 d-flex flex-row gap-2 hp-item ${canOpen ? '' : 'no-open'}" data-id="${escapeAttr(it.id)}">
        <span class="rounded bg-body-secondary flex-shrink-0 d-flex align-items-center justify-content-center hp-thumb" data-id="${escapeAttr(it.id)}" data-act="${canOpen ? 'open' : ''}" style="width:56px;height:56px;background-image:url('${escapeAttr(it.thumb || '')}');background-size:cover;background-position:center;cursor:${canOpen ? 'pointer' : 'default'}">
          ${it.thumb ? '' : '<span class="hp-thumb-x">⌧</span>'}
        </span>
        <div class="flex-grow-1 hp-meta" style="min-width:0">
          <div class="d-flex justify-content-between align-items-start hp-row1">
            <span class="fw-semibold small text-truncate hp-title">${escapeHtml(t(it.paletteName || 'Tuỳ chỉnh'))}</span>
            <span class="badge ${badgeCls} hp-badge">${st.label}</span>
          </div>
          <span class="text-body-secondary d-block hp-sub" style="font-size:.72rem">${escapeHtml(sub)}</span>
          ${swatches(it.colors)}
          ${comboHtml}
          <div class="d-flex align-items-center gap-2 mt-1 hp-actions">
            ${canOpen ? `<button class="btn btn-sm btn-link p-0 hp-act" data-act="open" type="button">${t('Mở lại')}</button>` : ''}
            ${comboHtml ? `<button class="btn btn-sm btn-link p-0 hp-act" data-act="reuse" type="button">${t('Dùng lại combo này')}</button>` : ''}
            <button class="btn btn-sm btn-link p-0 text-danger hp-act hp-act-del" data-act="del" type="button">${t('Xoá')}</button>
            ${style}
          </div>
        </div>
      </div>`;
    }).join('');

    healLegacyThumbs(list);
  }

  function exportJson() {
    const data = read();
    if (!data.length) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aoc-history-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  // Đổi ngôn ngữ → dựng lại shell + bind lại + render.
  // (Bootstrap Offcanvas dùng class 'show' khi mở, không phải 'open' cũ.)
  window.addEventListener('i18n:change', () => {
    const wasOpen = root.classList.contains('show');
    shell();
    listEl = root.querySelector('[data-role="list"]');
    countEl = root.querySelector('[data-role="count"]');
    searchEl = root.querySelector('[data-role="search"]');
    bind();
    if (wasOpen) { render(); bsOffcanvas.show(); }
  });

  // Re-bind handlers sau khi dựng lại shell.
  function bind() {
    listEl.addEventListener('click', (e) => {
      const item = e.target.closest('.hp-item'); if (!item) return;
      const id = item.dataset.id;
      const a = e.target.closest('[data-act]');
      const act = a ? a.dataset.act : '';
      if (act === 'del') { removeHistory(id); render(); return; }
      if (act === 'open') {
        const it = read().find((x) => String(x.id) === String(id));
        if (it && it.results && (it.results.day || it.results.night) && onRestore) { onRestore(it); close(); }
      }
      if (act === 'reuse') {
        const it = read().find((x) => String(x.id) === String(id));
        if (it && onReuseCombo) { onReuseCombo(it); close(); }
      }
    });
    searchEl.addEventListener('input', (e) => { query = e.target.value || ''; render(); });
    root.querySelector('[data-role="clear"]').addEventListener('click', () => {
      const msg = t('Bạn có chắc muốn xóa TẤT CẢ lịch sử? Hành động này không thể hoàn tác.');
      if (read().length && !window.confirm(msg)) return;
      write([]); render();
    });
    root.querySelector('[data-role="export"]').addEventListener('click', exportJson);
    root.querySelector('[data-role="close"]').addEventListener('click', close);
  }

  // Bootstrap Offcanvas tự lo backdrop + phím Esc.
  function open() { query = ''; if (searchEl) searchEl.value = ''; render(); bsOffcanvas.show(); }
  function close() { bsOffcanvas.hide(); }

  bind(); // gắn handler cho shell ban đầu

  return { open, close, render, addHistory, destroy() { bsOffcanvas.dispose(); root.innerHTML = ''; } };
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
}
function escapeAttr(s) { return escapeHtml(s).replace(/'/g, '&#39;'); }

export default { mountHistoryPanel, addHistory, removeHistory };
