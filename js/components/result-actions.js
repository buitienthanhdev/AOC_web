/* ============================================================
   components/result-actions.js — Tạo lại nhanh + tải xuống
   Sau khi render: thử palette khác / chỉnh màu rồi tạo lại —
   KHÔNG bắt upload lại, KHÔNG classify lại. (Luôn có sẵn cả ngày + đêm.)
   Menu tải: sạch full-res / so sánh / chia sẻ.
   ============================================================ */

'use strict';

// SVG line icons đơn sắc (thay emoji) — kế thừa màu currentColor.
const SVG = (p) => `<svg class="ra-ico" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
const ICONS = {
  swatch: SVG('<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>'),
  pencil: SVG('<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/>'),
  download: SVG('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/>'),
  share: SVG('<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.7 7.6-4.4"/><path d="m8.2 13.3 7.6 4.4"/>'),
  calc: SVG('<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 7h6M9 11h6M9 15h4"/>'),
};

export function mountResultActions(root, { onAction } = {}) {
  root.classList.add('result-actions', 'd-flex', 'flex-column', 'gap-2');
  root.innerHTML = `
    <div class="d-flex flex-column gap-1 ra-group">
      <span class="small fw-semibold text-body-secondary ra-title">Tạo lại</span>
      <button class="btn btn-outline-secondary btn-sm d-flex align-items-center gap-1 ra-btn" data-action="try-palette" type="button">${ICONS.swatch} Thử phương án khác</button>
      <button class="btn btn-outline-secondary btn-sm d-flex align-items-center gap-1 ra-btn" data-action="edit-colors" type="button">${ICONS.pencil} Chỉnh màu rồi tạo lại</button>
    </div>
    <div class="d-flex flex-column gap-1 ra-group">
      <span class="small fw-semibold text-body-secondary ra-title">Tải xuống</span>
      <button class="btn btn-brand d-flex align-items-center justify-content-center gap-1 ra-btn ra-primary ra-wide" data-action="dl-summary" type="button">${ICONS.download} Tải ảnh phối màu</button>
      <button class="btn btn-outline-secondary d-flex align-items-center justify-content-center gap-1 ra-btn ra-wide" data-action="share" type="button">${ICONS.share} Chia sẻ</button>
      <button class="btn btn-outline-secondary d-flex align-items-center justify-content-center gap-1 ra-btn ra-wide" data-action="estimate" type="button">${ICONS.calc} Dự toán sơn &amp; sản phẩm</button>
    </div>`;

  root.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]'); if (!btn) return;
    if (onAction) onAction(btn.dataset.action);
  });

  return { destroy() { root.innerHTML = ''; } };
}

export default { mountResultActions };
