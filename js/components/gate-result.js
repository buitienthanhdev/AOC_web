'use strict';

import { GateDecision } from '../services/classification-gate.js?v=20260707115237';
import { STEPS } from '../state/wizard-store.js?v=20260707115237';

const ICONS = { allow: '✓', warn: '⚠', confirm: '?', block: '✕', error: '✕' };
const SUBTITLES = {
    allow: 'AI đã phân tích thành công',
    warn: 'Kết quả có thể chưa chính xác',
    confirm: 'Cần xác nhận để tiếp tục',
    block: 'Vui lòng kiểm tra lại ảnh',
    error: 'Không thể kết nối dịch vụ AI',
};

function createEl(tag, className, children, setup) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (children) {
        if (typeof children === 'string') el.innerHTML = children;
        else if (Array.isArray(children)) children.forEach(c => c && el.appendChild(c));
        else if (children instanceof Node) el.appendChild(children);
    }
    if (setup) setup(el);
    return el;
}

function renderConfidenceBar(conf) {
    if (!conf) return null;
    const confPct = conf.confidencePct || 0;
    return createEl('div', 'gate-confidence', [
        createEl('div', 'gate-confidence-label', `Mức độ chắc chắn <span class="gate-confidence-value">${confPct}%</span>`),
        createEl('div', 'gate-bar-track', createEl('div', 'gate-bar-fill', null, (el) => el.style.width = `${confPct}%`)),
        // Trung thực về bản chất: đây là model phân loại ảnh (CNN) so khớp
        // TOÀN BỘ bức ảnh với hàng nghìn ảnh mẫu đã học — không phải AI suy
        // luận từng chi tiết (mái, cửa sổ, vật liệu...) rồi diễn giải lý do.
        // Không bịa ra "vì sao" khi model không thực sự tạo ra lý do đó.
        createEl('div', 'gate-confidence-note',
            'AI so khớp toàn bộ hình ảnh với hàng nghìn công trình đã học để ước tính phong cách gần nhất — không phân tích riêng từng chi tiết như mái, cửa sổ hay vật liệu.'),
    ]);
}

function renderFields(gate) {
    // Phong cách chính đã hiện riêng ở gate-primary-style — bỏ khỏi field list
    // chung để không lặp lại. Field "chắc chắn" cũng bỏ vì đã có gate-confidence-value.
    const filteredFields = (gate.fields || []).filter(f =>
        !f.label.includes('chắc chắn') && f.label !== 'Phong cách gợi ý');
    if (!filteredFields.length) return null;
    return createEl('div', 'gate-fields', filteredFields.map(f =>
        createEl('div', 'gate-field', `<span class="gate-field-label">${f.label}</span><strong class="gate-field-value">${f.value}</strong>`)
    ));
}

// Phong cách chính, nổi bật — tách khỏi field list chung để dễ đọc.
function renderPrimaryStyle(c) {
    if (!c || !c.styleLabel) return null;
    return createEl('div', 'gate-primary-style',
        `<span class="gate-primary-style-label">Phong cách kiến trúc</span><strong class="gate-primary-style-value">${c.styleLabel}</strong>`);
}

// Pha trộn phong cách: chỉ hiện khi có phong cách phụ VÀ có % thật để so sánh.
// Không bịa % khi backend cũ chỉ trả tên suông (confidencePct null) — ẩn hẳn
// mục này thay vì hiện % giả.
function renderSecondaryStyles(c) {
    const list = (c && c.secondary || []).filter((s) => s.styleLabel && s.confidencePct != null);
    if (!list.length) return null;
    return createEl('div', 'gate-secondary-styles', [
        createEl('div', 'gate-secondary-title', 'AI cân nhắc thêm giữa các phong cách sau'),
        createEl('ul', 'gate-secondary-list', list.map((s) =>
            createEl('li', 'gate-secondary-item',
                `<span class="gate-secondary-name">${s.styleLabel}</span><span class="gate-secondary-pct">${s.confidencePct}%</span>`)
        )),
    ]);
}

function renderActions(gate, store) {
    if (gate.decision === GateDecision.CONFIRM || gate.decision === GateDecision.BLOCK) {
        const btn = createEl('button', 'btn btn-brand btn-sm wz-btn wz-btn-next gate-proceed', 'Vẫn tiếp tục');
        btn.type = 'button';
        btn.onclick = () => {
            store.set({ gateOverride: true, gate: { ...gate, decision: GateDecision.WARN } });
            store.goToStep(STEPS.PALETTE);
        };
        return createEl('div', 'mt-2 gate-actions', [btn]);
    }
    return null;
}

function renderErrorActions(store, onRetry) {
    const retryBtn = createEl('button', 'btn btn-brand btn-sm wz-btn wz-btn-next', 'Thử lại');
    retryBtn.type = 'button';
    retryBtn.onclick = onRetry;

    const skipBtn = createEl('button', 'btn btn-outline-secondary btn-sm wz-btn wz-btn-ghost', 'Bỏ qua &amp; phối màu thủ công');
    skipBtn.type = 'button';
    skipBtn.onclick = () => {
        store.set({ classifySkipped: true });
        window.toastManager?.info('Đã bỏ qua nhận diện — bạn có thể phối màu thủ công.', '', 2000);
        store.goToStep(STEPS.PALETTE);
    };
    return createEl('div', 'd-flex gap-2 mt-2 gate-actions', [retryBtn, skipBtn]);
}

export function renderGate(mountEl, { gate, store }) {
    if (!mountEl || !gate) return;

    const decision = gate.decision;
    const icon = ICONS[decision] || '●';
    const subtitle = SUBTITLES[decision] || '';

    const displayMsg = decision === GateDecision.BLOCK
        ? 'Vui lòng tải lên ảnh ngoại thất của một ngôi nhà để sử dụng công cụ phối màu.'
        : gate.message;

    mountEl.className = `card gate-result gate-${decision}`;
    mountEl.innerHTML = ''; // Clear previous content

    mountEl.append(
        createEl('div', 'card-header d-flex align-items-center gap-2 gate-header', [
            createEl('div', 'gate-icon', icon),
            createEl('div', 'gate-header-text', [
                createEl('div', 'fw-semibold gate-title', gate.title),
                createEl('div', 'small text-body-secondary gate-subtitle', subtitle),
            ]),
        ]),
        createEl('div', 'card-body gate-body', [
            createEl('div', 'gate-msg', displayMsg),
            renderPrimaryStyle(gate.classification),
            renderConfidenceBar(gate.classification),
            renderSecondaryStyles(gate.classification),
            renderFields(gate),
            createEl('div', 'small text-body-secondary mt-2 gate-note', gate.note),
            renderActions(gate, store),
        ])
    );
}

export function renderClassifyError(mountEl, { error, store, onRetry }) {
    if (!mountEl || !error) return;

    mountEl.className = 'card gate-result gate-error';
    mountEl.innerHTML = ''; // Clear

    mountEl.append(
        createEl('div', 'card-header d-flex align-items-center gap-2 gate-header', [
            createEl('div', 'gate-icon', ICONS.error),
            createEl('div', 'gate-header-text', [
                createEl('div', 'fw-semibold gate-title', error.title),
                createEl('div', 'small text-body-secondary gate-subtitle', SUBTITLES.error),
            ]),
        ]),
        createEl('div', 'card-body gate-body', [
            createEl('div', 'gate-msg', error.userMessage),
            renderErrorActions(store, onRetry),
        ])
    );
}