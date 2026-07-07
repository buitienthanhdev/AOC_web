/* ============================================================
   wizard.js — Bộ điều khiển wizard DÙNG CHUNG (1 nguồn duy nhất)
   Thay cho 3 bản goToStep/updateProgress trùng lặp ở app.js,
   classify-app.js và inline recolor.html.
   Lái trên DOM tĩnh: .wz-panel#wzPanel{N}, .wz-step-item[data-step],
   #progressBar. Điều hướng đi qua wizard-store.
   ============================================================ */

'use strict';

import { store } from './state/wizard-store.js?v=20260707115237';
import { logger } from './utils/logger.js?v=20260707115237';

/**
 * @param {{onEnter?:(step:number, prevStep:number)=>void, guards?:Object}} opts
 *   guards[step] = () => true|string  (string = lý do chặn, hiển thị toast)
 */
export function initWizard(opts = {}) {
  const guards = opts.guards || {};
  const panels = [...document.querySelectorAll('.wz-panel')];
  const stepItems = [...document.querySelectorAll('.wz-step-item')];
  const total = stepItems.length || panels.length || 6;
  const progressBar = document.getElementById('progressBar');

  function render(step) {
    panels.forEach((p) => {
      const n = parseInt((p.id || '').replace('wzPanel', ''), 10);
      const on = n === step;
      p.classList.toggle('active', on);
      p.classList.toggle('d-none', !on);   // Bootstrap: ẩn/hiện bằng d-none thay vì chỉ CSS display
    });
    stepItems.forEach((s) => {
      const n = parseInt(s.dataset.step, 10);
      s.classList.toggle('active', n === step);
      s.classList.toggle('done', n < step);
    });
    if (progressBar) progressBar.style.width = `${Math.round((step / total) * 100)}%`;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Bind nút data-goto / data-next / data-back
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-goto],[data-next],[data-back]');
    if (!el) return;
    e.preventDefault();
    const cur = store.get().step;
    let target = null;
    if (el.hasAttribute('data-goto')) target = parseInt(el.getAttribute('data-goto'), 10);
    else if (el.hasAttribute('data-next')) target = cur + 1;
    else if (el.hasAttribute('data-back')) target = cur - 1;
    if (target != null) go(target);
  });

  function go(step) {
    step = Math.max(1, Math.min(total, step));
    const cur = store.get().step;
    // TIẾN (kể cả NHẢY nhiều bước): kiểm tra guard của TỪNG bước từ cur → step-1.
    // Nếu bước nào chưa đủ điều kiện → dừng đúng tại đó + báo lý do. Lùi: tự do.
    if (step > cur) {
      for (let s = cur; s < step; s++) {
        const g = guards[s];
        if (typeof g !== 'function') continue;
        const verdict = g();
        if (verdict !== true) {
          logger.warn('wizard_guard_block', { from: cur, to: step, blockedAt: s, reason: verdict });
          if (window.toastManager && typeof verdict === 'string') window.toastManager.warning(verdict, '');
          // Nhảy tới bước đang vướng (nếu chưa ở đó) để user xử lý / kích hoạt onEnter của bước đó.
          if (s !== cur) store.goToStep(s);
          return false;
        }
      }
    }
    store.goToStep(step);
    return true;
  }

  // Nhảy bước nhanh: bấm (hoặc Enter/Space) vào ô bước trên stepper.
  stepItems.forEach((item) => {
    const n = parseInt(item.dataset.step, 10);
    if (!n) return;
    item.classList.add('wz-clickable');
    item.setAttribute('role', 'button');
    item.setAttribute('tabindex', '0');
    const lbl = (item.querySelector('.wz-step-label')?.textContent || '').trim();
    item.title = lbl ? `Bấm để tới bước ${n}: ${lbl}` : `Tới bước ${n}`;
    item.addEventListener('click', () => go(n));
    item.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(n); }
    });
  });

  let prevStep = store.get().step;
  const unsub = store.subscribe((s) => {
    if (s.step !== prevStep) {
      // Cập nhật prevStep TRƯỚC khi gọi onEnter: nếu onEnter có store.set()
      // đồng bộ (vd generateSchemes set palettes), subscriber tái kích hoạt
      // ngay trong lúc onEnter đang chạy — prevStep cũ làm điều kiện trên
      // vẫn đúng → onEnter gọi lại chính nó đệ quy vô hạn (đã gây
      // "Maximum call stack size exceeded" khi vào bước Chọn màu).
      const from = prevStep;
      prevStep = s.step;
      render(s.step);
      if (opts.onEnter) {
        try { opts.onEnter(s.step, from); }
        catch (err) { logger.error('wizard_onEnter_error', { technical: err.message }); }
      }
    }
  });

  render(store.get().step);
  return { go, render, destroy: () => unsub() };
}

export default { initWizard };
