/* ============================================================
   tour.js — Hướng dẫn sử dụng từng bước (guided tour)
   • Spotlight làm nổi phần tử + tooltip giải thích chi tiết.
   • Tiếp / Quay lại / Bỏ qua, bộ đếm "i/N".
   • Song ngữ: đọc window.i18n.getLang(); render lại khi đổi ngôn ngữ.
   • Tự mở lần đầu (localStorage), nút "?" trong header để mở lại.
   Classic script — chạy sau i18n.js, gắn window.tour.
   ============================================================ */
(function () {
  'use strict';

  // Mỗi bước: target = selector (null = giữa màn hình), vi/en = {title, body}
  var STEPS = [
    {
      target: null,
      vi: { title: 'Chào mừng đến với AOC', body: 'Công cụ phối màu công trình bằng AI. Chỉ với vài bước, bạn tải ảnh lên và xem ngôi nhà được sơn màu mới. Hãy xem qua hướng dẫn nhanh này — bạn có thể bấm “Bỏ qua” bất cứ lúc nào.' },
      en: { title: 'Welcome to AOC', body: 'An AI tool for coloring buildings. In just a few steps, you upload a photo and see your house repainted. Take this quick tour — you can hit “Skip” anytime.' }
    },
    {
      target: '.wz-progress',
      vi: { title: 'Thanh tiến trình 5 bước', body: 'Toàn bộ quy trình gồm 5 bước, hiển thị ở đây. Bước đang làm được tô đậm; bạn có thể bấm vào một bước đã qua để quay lại.' },
      en: { title: '5-step progress bar', body: 'The whole flow has 5 steps shown here. The current step is highlighted; you can click a completed step to go back.' }
    },
    {
      target: '.wz-step-item[data-step="1"]',
      vi: { title: 'Bước 1 — Tải ảnh', body: 'Tải ảnh ngoại thất ngôi nhà: kéo & thả vào khung, bấm để chọn file, hoặc dán bằng Ctrl + V. Hỗ trợ JPG/PNG/WEBP, tối đa 50 MB. Ảnh càng rõ mặt tiền, kết quả càng tốt.' },
      en: { title: 'Step 1 — Upload', body: 'Upload an exterior photo of the house: drag & drop, click to choose a file, or paste with Ctrl + V. Supports JPG/PNG/WEBP, up to 50 MB. A clear facade gives the best result.' }
    },
    {
      target: '.wz-step-item[data-step="2"]',
      vi: { title: 'Bước 2 — Nhận diện', body: 'AI tự kiểm tra ảnh có phải công trình và nhận diện vùng có thể sơn. Bạn chọn một phong cách (Hiện đại, Tối giản, Cổ điển, Sang trọng) hoặc bấm “Tô màu tự động” để AI tự quyết.' },
      en: { title: 'Step 2 — Detect', body: 'AI checks whether the photo is a building and detects paintable areas. Choose a style (Modern, Minimalist, Classic, Luxury) or click “Auto color” to let AI decide.' }
    },
    {
      target: '.wz-step-item[data-step="3"]',
      vi: { title: 'Bước 3 — Chọn màu', body: 'Chọn nhóm màu yêu thích/không thích và độ sáng tổng thể, rồi chọn một phương án 3 màu (Tường · Viền · Cửa) AI gợi ý — hoặc sang tab “Tự Phối Màu” để tự chọn từng đối tượng. Có nút “Bất ngờ cho tôi” và so sánh A/B.' },
      en: { title: 'Step 3 — Colors', body: 'Pick liked/disliked color groups and overall brightness, then choose an AI-suggested 3-color combo (Walls · Trim · Doors) — or switch to “Custom Colors” to set each element. Try “Surprise me” and A/B compare.' }
    },
    {
      target: '.wz-step-item[data-step="4"]',
      vi: { title: 'Bước 4 — Tinh chỉnh & phối màu', body: 'Tinh chỉnh chi tiết màu tường, viền, điểm nhấn nếu cần (nhập HEX hoặc chọn bảng màu Kelly-Moore), rồi bấm “Phối màu ngay”. Hệ thống tự tạo cả ảnh ban ngày và ban đêm; lần đầu có thể mất 1–2 phút.' },
      en: { title: 'Step 4 — Refine & apply', body: 'Fine-tune wall, trim, and accent colors if needed (enter HEX or pick from the Kelly-Moore palette), then click “Apply now”. The system generates both day and night images; the first run may take 1–2 minutes.' }
    },
    {
      target: '.wz-step-item[data-step="5"]',
      vi: { title: 'Bước 5 — Kết quả', body: 'Kéo thanh giữa để so sánh trước/sau, lăn chuột hoặc double-click để phóng to, chuyển Ban ngày/Ban đêm, kéo “Không khí” đổi tông ấm/mát, rồi tải ảnh kèm bảng mã màu. Xong!' },
      en: { title: 'Step 5 — Result', body: 'Drag the middle slider to compare before/after, scroll or double-click to zoom, switch Day/Night, drag “Ambience” for warm/cool tone, then download the image with its color codes. Done!' }
    }
  ];

  var UI = {
    vi: { next: 'Tiếp →', back: '← Quay lại', skip: 'Bỏ qua', done: 'Xong', help: 'Hướng dẫn' },
    en: { next: 'Next →', back: '← Back', skip: 'Skip', done: 'Done', help: 'Guide' }
  };

  var SEEN_KEY = 'aoc_tour_seen';
  var idx = 0;
  var active = false;
  var root = null, dim = null, spot = null, card = null;

  function lang() { return (window.i18n && window.i18n.getLang && window.i18n.getLang() === 'en') ? 'en' : 'vi'; }
  function ui() { return UI[lang()]; }

  function build() {
    if (root) return;
    root = document.createElement('div');
    root.className = 'tour-root';
    root.id = 'tourRoot';
    root.setAttribute('data-no-i18n', '');
    root.innerHTML =
      '<div class="tour-dim" data-role="dim"></div>' +
      '<div class="tour-spot" data-role="spot"></div>' +
      '<div class="tour-card" data-role="card" role="dialog" aria-modal="true">' +
        '<div class="tour-counter" data-role="counter"></div>' +
        '<div class="tour-title" data-role="title"></div>' +
        '<div class="tour-body" data-role="body"></div>' +
        '<div class="tour-actions">' +
          '<button type="button" class="tour-btn tour-skip" data-role="skip"></button>' +
          '<div class="tour-actions-right">' +
            '<button type="button" class="tour-btn tour-back" data-role="back"></button>' +
            '<button type="button" class="tour-btn tour-next" data-role="next"></button>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(root);
    dim = root.querySelector('[data-role="dim"]');
    spot = root.querySelector('[data-role="spot"]');
    card = root.querySelector('[data-role="card"]');

    root.querySelector('[data-role="skip"]').addEventListener('click', end);
    root.querySelector('[data-role="back"]').addEventListener('click', function () { go(idx - 1); });
    root.querySelector('[data-role="next"]').addEventListener('click', function () {
      if (idx >= STEPS.length - 1) end(); else go(idx + 1);
    });
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('i18n:change', function () { if (active) render(); });
    document.addEventListener('keydown', onKey);
  }

  function onKey(e) {
    if (!active) return;
    if (e.key === 'Escape') end();
    else if (e.key === 'ArrowRight') { if (idx >= STEPS.length - 1) end(); else go(idx + 1); }
    else if (e.key === 'ArrowLeft') go(idx - 1);
  }

  function go(i) {
    idx = Math.max(0, Math.min(STEPS.length - 1, i));
    render();
  }

  function render() {
    var step = STEPS[idx];
    var L = lang();
    var t = step[L] || step.vi;
    var u = ui();

    root.querySelector('[data-role="counter"]').textContent = (idx + 1) + ' / ' + STEPS.length;
    root.querySelector('[data-role="title"]').textContent = t.title;
    root.querySelector('[data-role="body"]').textContent = t.body;
    root.querySelector('[data-role="skip"]').textContent = u.skip;
    var backBtn = root.querySelector('[data-role="back"]');
    backBtn.textContent = u.back;
    backBtn.style.visibility = idx === 0 ? 'hidden' : 'visible';
    root.querySelector('[data-role="next"]').textContent = (idx >= STEPS.length - 1) ? u.done : u.next;

    reposition();
  }

  function reposition() {
    if (!active) return;
    var step = STEPS[idx];
    var el = step.target ? document.querySelector(step.target) : null;
    var rect = el ? el.getBoundingClientRect() : null;
    var pad = 8;

    if (rect && rect.width && rect.height) {
      // làm phần tử nổi lên trên lớp tối (box-shadow của spot tạo dim)
      spot.style.display = 'block';
      dim.style.display = 'none';
      spot.style.top = (rect.top - pad) + 'px';
      spot.style.left = (rect.left - pad) + 'px';
      spot.style.width = (rect.width + pad * 2) + 'px';
      spot.style.height = (rect.height + pad * 2) + 'px';
      placeCard(rect);
    } else {
      // không có target → tối toàn màn, card ở giữa
      spot.style.display = 'none';
      dim.style.display = 'block';
      card.style.top = '50%';
      card.style.left = '50%';
      card.style.transform = 'translate(-50%, -50%)';
    }
  }

  function placeCard(rect) {
    card.style.transform = 'none';
    var cw = card.offsetWidth || 320;
    var ch = card.offsetHeight || 180;
    var gap = 16;
    var vw = window.innerWidth, vh = window.innerHeight;
    var top, left;

    var below = rect.bottom + gap;
    var above = rect.top - gap - ch;
    if (below + ch <= vh) top = below;          // ưu tiên đặt dưới
    else if (above >= 0) top = above;            // không đủ thì đặt trên
    else top = Math.max(gap, vh - ch - gap);     // cuối cùng kẹp trong màn

    // canh ngang theo tâm target, kẹp trong viewport
    left = rect.left + rect.width / 2 - cw / 2;
    left = Math.max(gap, Math.min(left, vw - cw - gap));
    card.style.top = Math.round(top) + 'px';
    card.style.left = Math.round(left) + 'px';
  }

  function start(fromIdx) {
    build();
    active = true;
    idx = fromIdx || 0;
    root.classList.add('show');
    document.body.style.overflow = 'hidden';
    render();
  }

  function end() {
    active = false;
    if (root) root.classList.remove('show');
    document.body.style.overflow = '';
    try { localStorage.setItem(SEEN_KEY, '1'); } catch (e) {}
  }

  function buildHelpButton() {
    if (document.getElementById('tourHelpBtn')) return;
    var header = document.querySelector('.header');
    if (!header) return;
    var btn = document.createElement('button');
    btn.id = 'tourHelpBtn';
    btn.type = 'button';
    btn.className = 'tour-help-btn';
    btn.setAttribute('data-no-i18n', '');
    btn.setAttribute('aria-label', 'Guide');
    btn.innerHTML =
      '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9.2 9.2a2.8 2.8 0 0 1 5.4 1c0 1.8-2.6 2.3-2.6 3.8"/><line x1="12" y1="17.5" x2="12" y2="17.5"/></svg>' +
      '<span data-role="help-label"></span>';
    btn.addEventListener('click', function () { start(0); });
    var group = header.querySelector('.ms-auto') || header;
    var ref = document.getElementById('langSwitch') || document.getElementById('historyBtn');
    if (ref && ref.parentNode === group) group.insertBefore(btn, ref);
    else group.appendChild(btn);
    syncHelpLabel();
    window.addEventListener('i18n:change', syncHelpLabel);
  }
  function syncHelpLabel() {
    var btn = document.getElementById('tourHelpBtn');
    if (!btn) return;
    var span = btn.querySelector('[data-role="help-label"]');
    if (span) span.textContent = ui().help;
    // Nút chỉ còn icon (không hiện chữ) — title là cách DUY NHẤT khách biết
    // chức năng khi hover/ấn giữ. Đặt tay ở đây vì btn có data-no-i18n (tự
    // quản lý song ngữ, không qua DICT).
    btn.title = ui().help;
  }

  function init() {
    buildHelpButton();
    // Tự mở lần đầu (sau khi giao diện ổn định)
    var seen = false;
    try { seen = localStorage.getItem(SEEN_KEY) === '1'; } catch (e) {}
    if (!seen) setTimeout(function () { start(0); }, 700);
  }

  if (document.body) init();
  else document.addEventListener('DOMContentLoaded', init);

  window.tour = { start: function () { start(0); }, end: end };
})();
