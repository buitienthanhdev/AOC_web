/* ============================================================
   error-service.js — User-facing error model
   Map lỗi kỹ thuật → error code → {message VN, action, retryable}.
   Chi tiết kỹ thuật chỉ để console/diagnostics, KHÔNG ném thẳng
   ra UI ("Prompt failed: 500", "Không có prompt_id"...).
   ============================================================ */

'use strict';

import { logger } from '../utils/logger.js?v=20260707115237';

export const ErrorCode = Object.freeze({
  AI_SERVICE_UNAVAILABLE: 'AI_SERVICE_UNAVAILABLE',
  AI_WARMING_UP: 'AI_WARMING_UP',
  INVALID_IMAGE: 'INVALID_IMAGE',
  CLASSIFICATION_UNCERTAIN: 'CLASSIFICATION_UNCERTAIN',
  CLASSIFICATION_FAILED: 'CLASSIFICATION_FAILED',
  RENDER_FAILED: 'RENDER_FAILED',
  RENDER_TIMEOUT: 'RENDER_TIMEOUT',
  OUTPUT_RATIO_INVALID: 'OUTPUT_RATIO_INVALID',
  DOWNLOAD_FAILED: 'DOWNLOAD_FAILED',
  NETWORK_OFFLINE: 'NETWORK_OFFLINE',
  UNKNOWN: 'UNKNOWN',
});

// title/message tiếng Việt + action + có nên cho retry không.
const CATALOG = {
  [ErrorCode.AI_SERVICE_UNAVAILABLE]: {
    title: 'Không kết nối được AI',
    message: 'Dịch vụ AI hiện chưa sẵn sàng. Vui lòng kiểm tra ComfyUI đang chạy rồi thử lại.',
    action: 'Thử lại', retryable: true,
  },
  [ErrorCode.AI_WARMING_UP]: {
    title: 'AI đang khởi động',
    message: 'AI đang nạp model lần đầu (có thể mất 1–2 phút). Vui lòng chờ trong giây lát.',
    action: 'Tiếp tục chờ', retryable: true,
  },
  [ErrorCode.INVALID_IMAGE]: {
    title: 'Ảnh không hợp lệ',
    message: 'Không đọc được file này (không phải ảnh, quá lớn, hoặc trình duyệt chưa hỗ trợ xem trước định dạng này). Hãy thử chọn ảnh khác hoặc lưu lại dưới dạng JPG/PNG rồi tải lên.',
    action: 'Chọn ảnh khác', retryable: false,
  },
  [ErrorCode.CLASSIFICATION_UNCERTAIN]: {
    title: 'Chưa chắc đây là công trình',
    message: 'AI chưa chắc đây là ảnh mặt tiền công trình. Bạn có muốn tiếp tục phối màu không?',
    action: 'Tiếp tục', retryable: false,
  },
  [ErrorCode.CLASSIFICATION_FAILED]: {
    title: 'Phân loại thất bại',
    message: 'Không phân loại được kiến trúc. Bạn có thể thử lại hoặc bỏ qua bước này để phối màu thủ công.',
    action: 'Thử lại', retryable: true,
  },
  [ErrorCode.RENDER_FAILED]: {
    title: 'Phối màu thất bại',
    message: 'AI không hoàn tất phối màu. Vui lòng thử lại; nếu vẫn lỗi, hãy thử ảnh hoặc màu khác.',
    action: 'Thử lại', retryable: true,
  },
  [ErrorCode.RENDER_TIMEOUT]: {
    title: 'Quá thời gian xử lý',
    message: 'AI xử lý lâu hơn bình thường và đã hết thời gian chờ. Có thể do model đang khởi động — vui lòng thử lại.',
    action: 'Thử lại', retryable: true,
  },
  [ErrorCode.OUTPUT_RATIO_INVALID]: {
    title: 'Tỉ lệ ảnh ra không đúng',
    message: 'Ảnh kết quả bị lệch tỉ lệ so với ảnh gốc. Hãy thử tạo lại; nếu lặp lại, báo cho quản trị viên.',
    action: 'Tạo lại', retryable: true,
  },
  [ErrorCode.DOWNLOAD_FAILED]: {
    title: 'Tải ảnh thất bại',
    message: 'Không tải được ảnh kết quả. Vui lòng thử lại.',
    action: 'Thử lại', retryable: true,
  },
  [ErrorCode.NETWORK_OFFLINE]: {
    title: 'Mất kết nối mạng',
    message: 'Trình duyệt đang ngoại tuyến. Hãy kiểm tra kết nối mạng rồi thử lại.',
    action: 'Thử lại', retryable: true,
  },
  [ErrorCode.UNKNOWN]: {
    title: 'Đã xảy ra lỗi',
    message: 'Có lỗi không xác định. Vui lòng thử lại.',
    action: 'Thử lại', retryable: true,
  },
};

/** Lỗi giàu thông tin, an toàn để hiển thị (UI dùng message/title/action). */
export class AppError extends Error {
  constructor(code, { technical = '', correlationId = null, cause = null } = {}) {
    const entry = CATALOG[code] || CATALOG[ErrorCode.UNKNOWN];
    super(entry.message);
    this.name = 'AppError';
    this.code = code;
    this.title = entry.title;
    this.userMessage = entry.message;
    this.action = entry.action;
    this.retryable = entry.retryable;
    this.technical = technical || (cause && cause.message) || '';
    this.correlationId = correlationId;
    this.cause = cause;
  }
}

export function isTransient(code) {
  return code === ErrorCode.AI_SERVICE_UNAVAILABLE
    || code === ErrorCode.AI_WARMING_UP
    || code === ErrorCode.RENDER_TIMEOUT
    || code === ErrorCode.NETWORK_OFFLINE;
}

/** Map HTTP status + ngữ cảnh → ErrorCode. */
export function codeFromHttp(status, context = 'render') {
  if (status === 0 || status == null) {
    return (typeof navigator !== 'undefined' && navigator.onLine === false)
      ? ErrorCode.NETWORK_OFFLINE
      : ErrorCode.AI_SERVICE_UNAVAILABLE;
  }
  if (status === 408 || status === 504) return ErrorCode.RENDER_TIMEOUT;
  if (status === 503) return ErrorCode.AI_WARMING_UP;
  if (status === 502) return ErrorCode.AI_SERVICE_UNAVAILABLE;
  if (status === 400 || status === 415 || status === 422) {
    return context === 'classify' ? ErrorCode.CLASSIFICATION_FAILED : ErrorCode.INVALID_IMAGE;
  }
  if (status >= 500) {
    return context === 'classify' ? ErrorCode.CLASSIFICATION_FAILED : ErrorCode.RENDER_FAILED;
  }
  return ErrorCode.UNKNOWN;
}

/** Chuẩn hoá mọi thứ ném ra thành AppError (an toàn hiển thị + log). */
export function toAppError(err, fallbackCode = ErrorCode.UNKNOWN, correlationId = null) {
  if (err instanceof AppError) {
    if (correlationId && !err.correlationId) err.correlationId = correlationId;
    return err;
  }
  let code = fallbackCode;
  if (err && err.name === 'AbortError') code = ErrorCode.RENDER_TIMEOUT;
  else if (typeof navigator !== 'undefined' && navigator.onLine === false) code = ErrorCode.NETWORK_OFFLINE;
  const appErr = new AppError(code, {
    technical: (err && (err.stack || err.message)) || String(err),
    correlationId,
    cause: err,
  });
  logger.error('app_error', {
    errorCode: appErr.code,
    technical: appErr.technical,
    correlationId,
  });
  return appErr;
}

export function describe(code) {
  return CATALOG[code] || CATALOG[ErrorCode.UNKNOWN];
}

export default { ErrorCode, AppError, toAppError, codeFromHttp, isTransient, describe };
