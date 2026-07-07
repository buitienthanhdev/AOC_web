/* ============================================================
   TOAST NOTIFICATION SYSTEM
   ============================================================ */

class ToastManager {
  constructor() {
    this.container = null;
    this.toasts = new Map();
    this.init();
  }

  init() {
    this.container = document.getElementById("toastWrap");
    if (!this.container) {
      this.container = document.createElement("div");
      this.container.id = "toastWrap";
      this.container.className = "toast-wrap";
      document.body.appendChild(this.container);
    }
    this.addStyles();
  }

  addStyles() {
    if (document.getElementById("toast-styles")) return;

    const style = document.createElement("style");
    style.id = "toast-styles";
    style.textContent = `
      .toast-wrap {
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 9999;
        display: flex;
        flex-direction: column;
        gap: 10px;
        max-width: 400px;
        pointer-events: none;
      }

      .toast {
        display: flex;
        align-items: center;
        gap: 12px;
        background: white;
        border-radius: 8px;
        padding: 14px 18px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        border-left: 4px solid #0B5C42;
        font-size: 13px;
        font-weight: 500;
        color: #333;
        pointer-events: auto;
        animation: slideInRight 0.3s ease;
      }

      .toast.success {
        border-left-color: #10b981;
      }

      .toast.success .toast-icon {
        color: #10b981;
      }

      .toast.error {
        border-left-color: #ef4444;
      }

      .toast.error .toast-icon {
        color: #ef4444;
      }

      .toast.warning {
        border-left-color: #f59e0b;
      }

      .toast.warning .toast-icon {
        color: #f59e0b;
      }

      .toast.info {
        border-left-color: #3b82f6;
      }

      .toast.info .toast-icon {
        color: #3b82f6;
      }

      .toast-icon {
        flex-shrink: 0;
        font-size: 18px;
        line-height: 1;
      }

      .toast-content {
        flex: 1;
      }

      .toast-title {
        font-weight: 600;
        margin-bottom: 2px;
      }

      .toast-message {
        font-size: 12px;
        opacity: 0.8;
      }

      .toast-close {
        flex-shrink: 0;
        background: none;
        border: none;
        cursor: pointer;
        color: #999;
        font-size: 18px;
        padding: 0;
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: color 0.2s;
      }

      .toast-close:hover {
        color: #333;
      }

      .toast.hide {
        animation: slideOutRight 0.3s ease forwards;
      }

      @keyframes slideInRight {
        from { transform: translateX(110%); opacity: 0; }
        to   { transform: translateX(0);    opacity: 1; }
      }

      @keyframes slideOutRight {
        from { transform: translateX(0);    opacity: 1; }
        to   { transform: translateX(110%); opacity: 0; }
      }

      @media (max-width: 480px) {
        .toast-wrap {
          left: 10px;
          right: 10px;
          max-width: 100%;
        }

        .toast {
          width: 100%;
        }
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * Show toast notification
   * @param {string} message - Toast message
   * @param {string} type - Type: success, error, warning, info
   * @param {number} duration - Duration in ms (0 = no auto-close)
   * @param {string} title - Optional title
   */
  show(message, type = "info", duration = 5000, title = null) {
    const id = String(Date.now());
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.id = `toast-${id}`;

    let icon = "ℹ️";
    if (type === "success") icon = "✓";
    else if (type === "error") icon = "✕";
    else if (type === "warning") icon = "⚠";

    toast.innerHTML = `
      <div class="toast-icon">${icon}</div>
      <div class="toast-content">
        ${title ? `<div class="toast-title">${title}</div>` : ""}
        <div class="${title ? "toast-message" : ""}">${message}</div>
      </div>
      <button class="toast-close" onclick="toastManager.close('${id}')">✕</button>
    `;

    this.container.style.display = "flex";
    this.container.appendChild(toast);
    this.toasts.set(id, toast);

    if (duration > 0) {
      setTimeout(() => this.close(id), duration);
    }

    return id;
  }

  /**
   * Close toast by ID
   */
  close(id) {
    const toast = this.toasts.get(id);
    if (!toast) return;

    toast.classList.add("hide");
    setTimeout(() => {
      toast.remove();
      this.toasts.delete(id);
      if (this.toasts.size === 0) {
        this.container.style.display = "none";
      }
    }, 300);
  }

  /**
   * Shortcuts
   */
  success(message, title = "Success", duration = 5000) {
    return this.show(message, "success", duration, title);
  }

  error(message, title = "Error", duration = 5000) {
    return this.show(message, "error", duration, title);
  }

  warning(message, title = "Warning", duration = 5000) {
    return this.show(message, "warning", duration, title);
  }

  info(message, title = "Info", duration = 5000) {
    return this.show(message, "info", duration, title);
  }

  /**
   * Loading toast (no auto-close)
   */
  loading(message, title = "Loading") {
    return this.show(message, "info", 0, title);
  }

  /**
   * Close all toasts
   */
  closeAll() {
    const ids = Array.from(this.toasts.keys());
    ids.forEach((id) => this.close(id));
  }
}

// Create global instance + expose lên window (classic script: const KHÔNG tự
// gắn vào window → phải gán tay, nếu không mọi toast().* thành no-op).
const toastManager = new ToastManager();
window.toastManager = toastManager;
