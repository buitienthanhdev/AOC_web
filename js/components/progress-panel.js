/* ============================================================
   components/progress-panel.js — Popup tiến trình nhỏ (thân thiện)
   Vẫn phản ánh JobState THẬT từ job-state-machine — KHÔNG bịa %,
   KHÔNG bịa giai đoạn không có thật. Chỉ thêm hiệu ứng động (spinner,
   chấm "..." nhấp nháy, thanh tiến trình, tick hoàn tất) để user
   không thấy popup đứng yên/nhàm chán trong lúc chờ AI xử lý.
   ============================================================ */

'use strict';

import { JobState } from '../services/job-state-machine.js?v=20260707115237';

// Câu thân thiện theo từng trạng thái THẬT (không bịa tiến trình).
const MESSAGES = {
  [JobState.VALIDATING]:        'Đang khởi động AI',
  [JobState.UPLOADING]:         'AI đang đọc yêu cầu của bạn',
  [JobState.QUEUED]:            'AI đang phân tích ảnh',
  [JobState.WAITING_FOR_MODEL]: 'AI đang khởi động mô hình (lần đầu hơi lâu)',
  [JobState.RUNNING]:           'AI đang xử lý yêu cầu',
  [JobState.POST_PROCESSING]:   'AI đang đóng gói ảnh cho bạn',
  [JobState.COMPLETED]:         'Hoàn tất',
};

const CHECK_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline class="ai-pop-check-path" points="20 6 9 17 4 12"/></svg>';

export function mountProgressPanel(root, { onCancel } = {}) {
  root.classList.add('ai-pop-mount');
  root.innerHTML = `
    <div class="ai-pop" data-role="card" role="status" aria-live="polite">
      <div class="ai-pop-row">
        <span class="ai-pop-ico" data-role="ico"><span class="ai-pop-spinner"></span></span>
        <span class="ai-pop-msg" data-role="msg">
          <span data-role="msgText">Đang chuẩn bị</span><span class="ai-pop-dots" data-role="dots"></span>
        </span>
        <button class="ai-pop-cancel" data-role="cancel" type="button" title="Huỷ" aria-label="Huỷ" hidden>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      </div>
      <div class="ai-pop-track" data-role="track" hidden><div class="ai-pop-fill" data-role="fill"></div></div>
    </div>`;

  const card = root.querySelector('[data-role="card"]');
  const icoEl = root.querySelector('[data-role="ico"]');
  const msgTextEl = root.querySelector('[data-role="msgText"]');
  const dotsEl = root.querySelector('[data-role="dots"]');
  const trackEl = root.querySelector('[data-role="track"]');
  const fillEl = root.querySelector('[data-role="fill"]');
  const cancelBtn = root.querySelector('[data-role="cancel"]');

  let hideTimer = null;
  let dotsTimer = null;
  let dotsCount = 0;

  cancelBtn.addEventListener('click', () => { if (onCancel) onCancel(); });

  function show() {
    clearTimeout(hideTimer);
    root.classList.add('show');
    card.classList.add('show');
  }
  function hide() {
    clearTimeout(hideTimer);
    root.classList.remove('show');
    card.classList.remove('show');
  }

  function setActive(active) {
    if (active) show(); else hide();
    cancelBtn.hidden = !active;
  }

  function startDots() {
    clearInterval(dotsTimer);
    dotsCount = 0;
    dotsEl.textContent = '';
    dotsTimer = setInterval(() => {
      dotsCount = (dotsCount + 1) % 4;
      dotsEl.textContent = '.'.repeat(dotsCount);
    }, 450);
  }
  function stopDots() {
    clearInterval(dotsTimer);
    dotsEl.textContent = '';
  }

  function setSpinner() {
    icoEl.classList.remove('done', 'error');
    icoEl.innerHTML = '<span class="ai-pop-spinner"></span>';
  }
  function setDone() {
    icoEl.classList.remove('error');
    icoEl.classList.add('done');
    icoEl.innerHTML = CHECK_SVG;
  }
  function setError() {
    icoEl.classList.remove('done');
    icoEl.classList.add('error');
    icoEl.innerHTML = '!';
  }

  // Thanh tiến trình: fill theo bước hiện tại/(tổng số bước) THẬT do
  // job-state-machine báo — không bịa số bước, không bịa %.
  function setProgress(idx, total) {
    if (!total) { trackEl.hidden = true; return; }
    trackEl.hidden = false;
    const pct = Math.min(100, Math.round(((idx + 1) / total) * 100));
    fillEl.style.width = `${pct}%`;
  }
  function fillProgressFull() {
    trackEl.hidden = false;
    fillEl.style.width = '100%';
  }

  // Cập nhật từ payload onStage của job-state-machine.
  function update(p) {
    if (!p) return;

    if (p.state === JobState.COMPLETED) {
      card.classList.remove('is-error');
      stopDots();
      msgTextEl.textContent = MESSAGES[JobState.COMPLETED];
      setDone();
      fillProgressFull();
      cancelBtn.hidden = true;
      show();
      // hiệu ứng xong rồi tự ẩn
      hideTimer = setTimeout(hide, 1900);
      return;
    }

    if (p.state === JobState.FAILED) {
      card.classList.add('is-error');
      stopDots();
      msgTextEl.textContent = (p.error && p.error.userMessage) || 'Đã xảy ra lỗi.';
      setError();
      trackEl.hidden = true;
      cancelBtn.hidden = true;
      show();
      hideTimer = setTimeout(hide, 3500);
      return;
    }

    if (p.state === JobState.CANCELLED) {
      stopDots();
      hide();
      return;
    }

    // Các trạng thái đang chạy → câu thân thiện + spinner + chấm nhấp nháy.
    card.classList.remove('is-error');
    const msg = MESSAGES[p.state] || p.stage || 'Đang xử lý';
    if (msgTextEl.textContent !== msg) {
      msgTextEl.textContent = msg;
      card.classList.remove('bump'); void card.offsetWidth; card.classList.add('bump');
    }
    if (!dotsTimer) startDots();
    if (icoEl.classList.contains('done') || icoEl.classList.contains('error')) setSpinner();
    if (typeof p.stageIndex === 'number' && typeof p.totalStages === 'number') setProgress(p.stageIndex, p.totalStages);
    cancelBtn.hidden = false;
    show();
  }

  function reset() {
    clearTimeout(hideTimer);
    stopDots();
    card.classList.remove('is-error', 'bump');
    msgTextEl.textContent = 'Đang chuẩn bị';
    setSpinner();
    fillEl.style.width = '0%';
    trackEl.hidden = true;
    hide();
  }

  return {
    update, reset, setActive,
    destroy() {
      clearTimeout(hideTimer);
      clearInterval(dotsTimer);
      root.innerHTML = '';
      root.classList.remove('ai-pop-mount', 'show');
    },
  };
}

export default { mountProgressPanel };
