/* ============================================================
   theme.js — Giao diện Sáng/Tối bằng nút BÓNG ĐÈN trong header.
   • Bóng đèn SÁNG (vàng, có quầng) = giao diện sáng.
   • Bóng đèn TẮT (xám) = giao diện tối.
   • Mới vào web: MẶC ĐỊNH sáng. Lựa chọn lưu localStorage.
   • Áp bằng <html data-theme="light|dark">; CSS override token.
   Classic script — gắn window.theme.
   ============================================================ */
(function () {
  'use strict';

  var KEY = 'aoc_theme';
  // Giao diện SÁNG → mặt trời; giao diện TỐI → mặt trăng.
  var SUN =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<circle cx="12" cy="12" r="4"/>' +
      '<path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>' +
    '</svg>';
  var MOON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/>' +
    '</svg>';

  function t(vi, en) { return (window.i18n && window.i18n.getLang && window.i18n.getLang() === 'en') ? en : vi; }

  function current() { return document.documentElement.getAttribute('data-bs-theme') === 'dark' ? 'dark' : 'light'; }

  function apply(theme) {
    var dark = theme === 'dark';
    document.documentElement.setAttribute('data-bs-theme', dark ? 'dark' : 'light');
    var btn = document.getElementById('themeBtn');
    if (btn) {
      btn.innerHTML = dark ? MOON : SUN;   // hiện icon theo giao diện hiện tại
      btn.classList.toggle('is-dark', dark);
      btn.setAttribute('aria-pressed', dark ? 'true' : 'false');
      // bóng đèn đang bật (sáng) → bấm để chuyển tối, và ngược lại
      btn.title = dark ? t('Bật giao diện sáng', 'Switch to light mode')
                       : t('Tắt đèn — giao diện tối', 'Switch to dark mode');
    }
  }

  function set(theme) {
    try { localStorage.setItem(KEY, theme); } catch (e) {}
    apply(theme);
  }

  function stored() {
    try { var s = localStorage.getItem(KEY); if (s === 'dark' || s === 'light') return s; } catch (e) {}
    return 'light'; // mặc định SÁNG
  }

  function build() {
    if (document.getElementById('themeBtn')) return;
    var header = document.querySelector('.header');
    if (!header) return;
    // Bootstrap navbar: nhóm nút bên phải nằm trong .ms-auto, KHÔNG phải con
    // trực tiếp của .header nữa — chèn vào đúng nhóm đó để nút theme cùng hàng.
    var group = header.querySelector('.ms-auto') || header;
    var btn = document.createElement('button');
    btn.id = 'themeBtn';
    btn.type = 'button';
    btn.className = 'theme-bulb';
    btn.setAttribute('data-no-i18n', '');
    btn.setAttribute('aria-label', 'Light/Dark');
    btn.innerHTML = SUN;
    btn.addEventListener('click', function () { set(current() === 'dark' ? 'light' : 'dark'); });
    // đặt trước switch ngôn ngữ / nút hướng dẫn / lịch sử nếu có
    var ref = document.getElementById('langSwitch')
           || document.getElementById('tourHelpBtn')
           || document.getElementById('historyBtn');
    if (ref && ref.parentNode === group) group.insertBefore(btn, ref);
    else group.appendChild(btn);
  }

  function init() {
    build();
    apply(stored());
    // cập nhật lại title khi đổi ngôn ngữ
    window.addEventListener('i18n:change', function () { apply(current()); });
  }

  if (document.body) init();
  else document.addEventListener('DOMContentLoaded', init);

  window.theme = { set: set, get: current, toggle: function () { set(current() === 'dark' ? 'light' : 'dark'); } };
})();
