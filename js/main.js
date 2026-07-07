/* ============================================================
   main.js — Orchestrator (canonical app shell)
   Nối store + wizard + classification gate + palette + manual edit
   + render (day/night, ratio-safe, progress thật) + download + history.
   Thay cho app.js + classify-app.js (đã deprecate).
   ============================================================ */

'use strict';

import { CONFIG } from './config.js?v=20260707115237';
import { store, STEPS } from './state/wizard-store.js?v=20260707115237';
import { initWizard } from './wizard.js?v=20260707115237';
import { logger } from './utils/logger.js?v=20260707115237';
import { makeThumbDataUrl } from './utils/image-thumb.js?v=20260707115237';

import { classify, health as classifyHealth } from './api/classification.js?v=20260707115237';
import { evaluate as gateEvaluate, GateDecision, canProceed } from './services/classification-gate.js?v=20260707115237';
import { generate as generatePalettes, DOMINANT_FAMILIES } from './services/palette-service.js?v=20260707115237';
import { nearest, nameFor } from './data/km-catalog.js?v=20260707115237';
import { SURFACE_BY_KEY } from './data/surfaces.js?v=20260707115237';
import { productForZone, productForSurface, primerProduct, CONCERNS, matchConcernsFromText, productsForConcerns } from './data/paint-products.js?v=20260707115237';
import { isValidHex } from './utils/validation.js?v=20260707115237';
import { extractDominantColors } from './services/reference-palette.js?v=20260707115237';
import { normalize as normalizeImage, revoke as revokeImage } from './services/image-service.js?v=20260707115237';
import { createRenderJob, JobState } from './services/job-state-machine.js?v=20260707115237';
import * as download from './services/download-service.js?v=20260707115237';
import { AppError, ErrorCode, toAppError } from './services/error-service.js?v=20260707115237';
import { SAMPLES as GALLERY_SAMPLES } from './data/gallery.js?v=20260707115237';

import { mountColorEditor } from './components/color-editor.js?v=20260707115237';
import { mountComboEditor } from './components/combo-editor.js?v=20260707115237';
import { mountKmPicker } from './components/km-picker.js?v=20260707115237';
import { mountHistoryPanel, addHistory } from './components/history-panel.js?v=20260707115237';
import { mountProgressPanel } from './components/progress-panel.js?v=20260707115237';
import { mountResultActions } from './components/result-actions.js?v=20260707115237';
import { mountImageViewer } from './components/image-viewer.js?v=20260707115237';
import { renderGate as renderGateComponent, renderClassifyError as renderClassifyErrorComponent } from './components/gate-result.js?v=20260707115237';
import { mountEyedropper } from './components/eyedropper.js?v=20260707115237';

const $ = (id) => document.getElementById(id);
const toast = () => window.toastManager || { success() { }, error() { }, warning() { }, info() { }, loading() { }, close() { } };

let WORKFLOW_TEMPLATE = null;
let currentJob = null;
const ui = {};

// Bảng màu lần trước của khách (theo IP, lưu server). Dùng để đề xuất lại.
let lastPref = null;
const PREF_API = 'php/pref_api.php';

async function loadPref() {
  try {
    const res = await fetch(CONFIG.API.PREF_URL || PREF_API, { method: 'GET', cache: 'no-cache' });
    const data = await res.json();
    if (data && data.ok && data.pref && data.pref.colors) lastPref = data.pref;
  } catch (_) { /* không có pref / lỗi mạng → bỏ qua, không chặn app */ }
}

async function savePref() {
  try {
    const c = store.get().colors || {};
    const pick = (z) => (c[z] && c[z].hex) ? { hex: c[z].hex, name: c[z].name || '' } : null;
    const colors = { walls: pick('walls'), trims: pick('trims'), accent: pick('accent') };
    if (!colors.walls && !colors.trims && !colors.accent) return; // Không có màu để lưu
    await fetch(CONFIG.API.PREF_URL || PREF_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ palette_name: currentPaletteName(), colors, full: historyColors() }),
    });
  } catch (_) { /* không chặn luồng chính nếu lưu pref lỗi */ }
}

// Dựng 1 "phương án lần trước" từ pref đã lưu (khớp shape palette để chọn được).
function lastPalette() {
  if (!lastPref || !lastPref.colors) return null;
  const c = lastPref.colors;
  if (!c.walls && !c.trims && !c.accent) return null;
  const fb = c.walls || c.trims || c.accent;
  const mk = (x) => ({ hex: (x || fb).hex, name: (x || fb).name || (x || fb).hex });
  return {
    id: '__last', __last: true,
    name: 'Bảng màu lần trước',
    mood: 'Gợi ý từ lần bạn dùng trước',
    main_wall: mk(c.walls), trim: mk(c.trims), accent: mk(c.accent),
  };
}

// ── Status pill ────────────────────────────────────────────────
function setStatus(text, cls) {
  if ($('statusText')) $('statusText').textContent = text;
  if ($('statusDot')) $('statusDot').className = 'status-dot' + (cls ? ' ' + cls : '');
}

// ── Init ───────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  // Tải bảng màu lần trước của khách (theo IP) — chạy nền, không chặn.
  loadPref();

  // workflow template
  try {
    const res = await fetch(CONFIG.WORKFLOW.TEMPLATE_URL, { cache: 'no-cache' });
    WORKFLOW_TEMPLATE = await res.json();
    logger.event('template_loaded', { url: CONFIG.WORKFLOW.TEMPLATE_URL });
  } catch (e) {
    logger.error('template_load_failed', { technical: e.message });
    toast().error('Không tải được cấu hình workflow. Hãy kiểm tra file workflow.', 'Lỗi');
  }

  mountComponents();
  wireUpload();
  wireStyle();
  wirePreference();
  wireMiniAccordion();
  wirePalette();
  wireReferencePalette();
  wireRenderMode();
  wireViewer();
  wireHistory();
  wirePanelToggle();
  wirePaintEstimate();
  renderSampleGallery();
  wireTooltips();

  ui.wizard = initWizard({
    guards: {
      [STEPS.UPLOAD]: () => store.get().upload.file ? true : 'Vui lòng tải ảnh trước.',
      [STEPS.CLASSIFY]: () => {
        const s = store.get();
        if (s.classifySkipped || !CONFIG.FLAGS.ENABLE_CLASSIFICATION_GATE) return true;
        // Nhận diện lỗi: nút "Tiếp theo" đã được bật → cho qua như bỏ qua thủ công
        // (trước đây guard chặn im lặng với thông báo "vui lòng đợi" gây hiểu lầm).
        if (s.classifyError) { store.set({ classifySkipped: true }); return true; }
        if (!s.gate) return 'Đang nhận diện ảnh — vui lòng đợi.';
        if (s.gate.decision === GateDecision.BLOCK) return 'Ảnh có vẻ không phải công trình. Hãy đổi ảnh hoặc bấm "Vẫn tiếp tục".';
        if (s.gate.decision === GateDecision.CONFIRM) return 'Hãy xác nhận tiếp tục ở phần cảnh báo phía trên.';
        return true;
      },
      // Step 3 = chỉ chọn màu yêu/ghét + tông (có mặc định) → luôn cho qua.
      [STEPS.PALETTE]: () => true,
      // Step 4 = phải có phương án màu (AI chọn palette HOẶC tự phối combo thủ công).
      [STEPS.SCHEME]: () => store.get().selectedPaletteId || store.get().colors.walls.source === 'manual'
        ? true : 'Hãy chọn một phương án màu (AI) hoặc tự phối màu ở tab "Tự Phối Màu".',
    },
    onEnter: (step, prev) => onEnterStep(step, prev),
  });
  // onEnter của wizard chỉ chạy khi ĐỔI bước — ở lần tải trang đầu tiên step
  // giữ nguyên mặc định nên không tự chạy. Gọi tay 1 lần để nút Soi màu bị
  // disable đúng ngay từ đầu (chưa có ảnh) thay vì chỉ đúng sau lần đổi bước
  // đầu tiên của khách.
  onEnterStep(store.get().step, null);

  setStatus('Sẵn sàng');
  logger.event('app_ready');

  // Banner chào mừng bên phải, tự tắt sau 5s (thay cho khối wz-intro cũ).
  setTimeout(() => {
    try {
      toast().info('Công cụ phối màu được phát triển bởi P&M từ các bảng màu hàng trăm năm sang trọng của nước Mỹ.',
        'Paint & More', 5000);
    } catch (_) { }
  }, 600);
});

function mountComponents() {
  ui.kmPicker = mountKmPicker($('kmPickerMount'), {
    store,
    onPick: (zone, color) => {
      store.update('colors', { [zone]: { hex: color.hex, name: color.name, code: color.code, source: 'manual', enabled: true } });
      toast().success(`${color.name}`, 'Đã chọn màu', 1200);
    },
  });
  ui.colorEditor = mountColorEditor($('colorEditorMount'), { store, kmPicker: ui.kmPicker });
  ui.colorEditorResult = mountColorEditor($('colorEditorResultMount'), { store, kmPicker: ui.kmPicker, onChange: () => { } });
  ui.comboEditor = mountComboEditor($('comboEditorMount'), { store, kmPicker: ui.kmPicker });
  ui.progress = mountProgressPanel($('progressMount'), { onCancel: cancelRender });
  ui.history = mountHistoryPanel($('historyMount'), { onRestore: restoreFromHistory, onReuseCombo: reuseHistoryCombo });
  ui.resultActions = mountResultActions($('resultActionsMount'), { onAction: onResultAction });
  ui.viewer = mountImageViewer($('cmpStage'), {});
  ui.eyedropper = mountEyedropper({ stageSelector: '#cmpStage', toggleBtn: $('eyedropperBtn'), toastFn: toast, store });
}

// ── Step entry hooks ───────────────────────────────────────────
function onEnterStep(step, prev) {
  if (step === STEPS.CLASSIFY) maybeClassify();
  if (step === STEPS.PALETTE) renderPreferenceGrids();
  if (step === STEPS.SCHEME) {
    prepareSchemeStep();   // chỉ render list ĐÃ có; sinh mới = bấm "Tạo phương án màu"
    updateAccordionSummaries();
    // Quay lại bước 3 mà đã có phương án/tự phối rồi → mở thẳng mục 3 để
    // xem/sửa tiếp; chưa có gì → bắt đầu lại từ mục 1 (yêu/ghét).
    const s = store.get();
    const hasScheme = !!s.selectedPaletteId || s.colors.walls.source === 'manual' || (s.palettes || []).length > 0;
    openAccordionSection(hasScheme ? 'scheme' : 'prefs');
  }
  // thumbnail hiện ở mọi bước sau upload
  const thumb = $('uploadThumb');
  if (thumb) { if (step === STEPS.UPLOAD || !store.get().upload.file) hide(thumb); else show(thumb, 'flex'); }

  // Nút Soi màu nằm trong result-toolbar (chỉ hiện ở bước Kết quả) — vẫn
  // disable phòng khi vào bước Kết quả nhưng render lỗi/chưa có ảnh, tắt
  // luôn chế độ đang bật nếu ảnh vừa bị xoá.
  const eyeBtn = $('eyedropperBtn');
  if (eyeBtn) {
    const hasImage = !!store.get().upload.file;
    eyeBtn.disabled = !hasImage;
    eyeBtn.classList.toggle('disabled', !hasImage);
    eyeBtn.title = hasImage
      ? 'Soi màu trên ảnh — trỏ chuột để xem mã HEX và mã KM gần nhất'
      : 'Tải ảnh lên trước để dùng công cụ soi màu';
    if (!hasImage && ui.eyedropper) ui.eyedropper.setActive(false);
  }

  // Toolbar (Ngày/Đêm, Không khí, tải ảnh nổi bật) — CHỈ có ý nghĩa khi đã có
  // ảnh kết quả. Ẩn ở mọi bước khác để không nổi 1 thanh trống/thừa (vd bước 2
  // chỉ có dòng resultStatus, không có gì để bấm). Hiện lại khi vào bước Kết
  // quả (đã render xong) để dùng Ngày/Đêm + slider ấm/mát + nút tải nhanh.
  const toolbar = document.querySelector('.result-toolbar');
  if (toolbar) {
    const atResult = step === STEPS.RESULT;
    toolbar.classList.toggle('d-none', !atResult);
    toolbar.classList.toggle('d-flex', atResult);
  }

  // (#4) Nút tải nổi bật trên toolbar — chỉ hiện ở bước Kết quả khi đã có ảnh.
  const dlTop = $('dlTop');
  if (dlTop) { if (step === STEPS.RESULT && store.get().results.day) show(dlTop, 'inline-flex'); else hide(dlTop); }

  // Cập nhật dòng trạng thái (resultStatus) theo từng bước
  const statusEl = $('resultStatus');
  if (statusEl) {
    switch (step) {
      case STEPS.UPLOAD:
        statusEl.textContent = 'Tải ảnh công trình để bắt đầu nhận diện và phối màu.';
        break;
      case STEPS.CLASSIFY:
        const s = store.get();
        if (s.gate) {
          statusEl.textContent = s.gate.decision === 'allow'
            ? 'Nhận diện kiến trúc thành công. Bấm "Tiếp theo" để chọn màu.'
            : 'Phát hiện cảnh báo nhận diện. Hãy kiểm tra và xác nhận ở cột trái.';
        } else {
          statusEl.textContent = 'Đang kiểm tra ảnh và nhận diện kiến trúc...';
        }
        break;
      case STEPS.PALETTE:
        statusEl.textContent = 'Chọn màu yêu thích / không thích và độ sáng tổng thể.';
        break;
      case STEPS.SCHEME:
        statusEl.textContent = 'Để AI tạo phương án màu, hoặc tự phối combo theo ý bạn.';
        break;
      case STEPS.EDIT:
        statusEl.textContent = 'Tinh chỉnh chi tiết màu sắc của tường, viền và điểm nhấn.';
        break;
      case STEPS.RENDER_MODE:
        statusEl.textContent = 'Kiểm tra các đối tượng đã chọn màu, sau đó bấm "Phối màu ngay".';
        break;
      case STEPS.RESULT:
        statusEl.textContent = 'Phối màu AI hoàn tất! Bạn có thể tải xuống hoặc thử lại phương án khác.';
        break;
      default:
        break;
    }
  }
}

// ── STEP 1: Upload ─────────────────────────────────────────────
function wireUpload() {
  const zone = $('uploadZone'); const input = $('fileInput');
  zone.addEventListener('click', () => input.click());
  input.addEventListener('change', (e) => handleFile(e.target.files[0]));
  zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', (e) => { e.preventDefault(); zone.classList.remove('drag-over'); handleFile(e.dataTransfer.files[0]); });
  $('removeBtn').addEventListener('click', removeImage);

  // Mới vào web (chưa có ảnh) → khung placeholder bên phải cũng nhận được
  // kéo-thả trực tiếp, không bắt buộc phải kéo đúng vào ô nhỏ bên trái.
  const placeholder = $('placeholder');
  if (placeholder) {
    placeholder.addEventListener('dragover', (e) => { e.preventDefault(); placeholder.classList.add('drag-over'); });
    placeholder.addEventListener('dragleave', (e) => { if (!placeholder.contains(e.relatedTarget)) placeholder.classList.remove('drag-over'); });
    placeholder.addEventListener('drop', (e) => {
      e.preventDefault();
      placeholder.classList.remove('drag-over');
      handleFile(e.dataTransfer.files[0]);
    });
  }

  // Dán ảnh bằng Ctrl+V (clipboard chứa hình) — chỉ khi đang ở bước Tải ảnh.
  document.addEventListener('paste', (e) => {
    if (store.get().step !== STEPS.UPLOAD) return;
    const items = (e.clipboardData && e.clipboardData.items) || [];
    for (const it of items) {
      if (it.type && it.type.startsWith('image/')) {
        const blob = it.getAsFile();
        if (blob) { e.preventDefault(); handleFile(blob); break; }
      }
    }
  });
}

// Bootstrap dùng class d-none để ẩn/hiện (không phải style.display) — 2 helper
// nhỏ để không phải lặp lại classList.toggle('d-none', ...) khắp nơi.
function show(el, display) { if (!el) return; el.classList.remove('d-none'); if (display) el.style.display = display; else el.style.removeProperty('display'); }
function hide(el) { if (!el) return; el.classList.add('d-none'); el.style.removeProperty('display'); }

async function handleFile(file) {
  if (!file) return;
  const errEl = $('uploadError'); errEl.textContent = '';
  const tid = toast().loading('Đang xử lý ảnh…');
  try {
    // Đang render ảnh CŨ dở dang mà khách đã tải ảnh khác → huỷ ngay, không
    // để kết quả trả về muộn ghi đè lên state của ảnh mới (xem renderToken).
    if (currentJob) { cancelRender(); renderToken++; }

    // reset phần liên quan ảnh (giữ sở thích) khi thay ảnh mới
    const prev = store.get().upload;
    if (prev.objectUrl) revokeImage(prev.objectUrl);
    store.resetForNewImage();

    const norm = await normalizeImage(file);
    store.update('upload', { file: norm.file, dataUrl: norm.dataUrl, objectUrl: norm.objectUrl, geometry: norm.geometry });

    $('previewImg').src = norm.objectUrl;
    show($('previewBox'));
    hide($('uploadZone'));
    $('btnNext1').disabled = false;
    if ($('thumbImg')) $('thumbImg').src = norm.objectUrl;
    if ($('thumbMeta')) $('thumbMeta').textContent = `${norm.geometry.originalWidth}×${norm.geometry.originalHeight}`;

    // Xem trước lớn ở panel phải (chưa có kết quả → after = chính ảnh gốc).
    ui.viewer.setImages({ before: norm.objectUrl, day: { url: norm.objectUrl }, night: null });
    hide($('placeholder'));
    show($('viewerArea'), 'flex');
    hide($('dnToggle'));
    $('resultStatus').textContent = 'Đang nhận diện ảnh…';

    toast().close(tid);
    toast().success('Đã tải ảnh', '', 1200);
    // HEIC/HEIF vẫn được chấp nhận (không chặn) nhưng cảnh báo nhẹ vì nhiều
    // trình duyệt desktop không xem trước được — tránh khách tưởng app lỗi.
    if (norm.warning) toast().warning(norm.warning, '', 5000);

    // Tự động sang bước nhận diện — giảm thao tác (auto-advance).
    store.goToStep(STEPS.CLASSIFY);
  } catch (err) {
    toast().close(tid);
    const e = toAppError(err, ErrorCode.INVALID_IMAGE);
    errEl.textContent = e.userMessage;
    toast().error(e.userMessage, e.title);
  }
}

function removeImage() {
  const prev = store.get().upload;
  if (prev.objectUrl) revokeImage(prev.objectUrl);
  store.resetForNewImage();
  $('previewImg').removeAttribute('src'); hide($('previewBox'));
  show($('uploadZone'));
  $('btnNext1').disabled = true;
  $('uploadError').textContent = '';
  show($('placeholder'), 'flex'); hide($('viewerArea'));
  hide($('dnToggle')); hide($('dlTop'));
  if ($('moodCtl')) { hide($('moodCtl')); resetMood(); }
  if ($('styleBlock')) hide($('styleBlock'));
  if ($('uploadThumb')) hide($('uploadThumb'));
}

// ── STEP 2: Classify + gate ────────────────────────────────────
async function maybeClassify() {
  const s = store.get();
  if (s.classification || s.classifySkipped) { renderGate(); return; }
  if (!s.upload.file) return;

  // Nhận diện qua FastAPI đã gỡ — tự bỏ qua bước này, vào thẳng chọn màu.
  if (!CONFIG.FLAGS.ENABLE_CLASSIFICATION_GATE) {
    store.set({ classifySkipped: true });
    hide($('classifyLoading'));
    hide($('gateResult'));
    setStatus('Sẵn sàng', 'done');
    $('btnNext2').disabled = false;
    showStyleBlock(true);
    return;
  }

  show($('classifyLoading'));
  hide($('gateResult'));
  setStatus('Đang nhận diện…', 'running');
  $('btnNext2').disabled = true;

  try {
    // Health check 4s trước: server chết thì báo lỗi + nút bỏ qua trong vài giây,
    // thay vì bắt người dùng nhìn spinner ~2 phút (30s timeout × 4 lần thử).
    const alive = await classifyHealth();
    const classification = alive.ok
      ? await classify(s.upload.file)
      : await classify(s.upload.file, { retries: 0, timeoutMs: 8000 });
    const gate = gateEvaluate(classification, CONFIG);
    store.set({ classification, gate, classifyError: null });
    setStatus(`${gate.classification ? gate.classification.styleLabel : ''} (${gate.confidencePct}%)`, 'done');
    renderGate();
  } catch (err) {
    const e = toAppError(err, ErrorCode.CLASSIFICATION_FAILED);
    store.set({ classifyError: e }); // KHÔNG reset wizard, KHÔNG về bước 1
    setStatus('Lỗi nhận diện', 'error');
    renderClassifyErrorUI(e);
  } finally {
    hide($('classifyLoading'));
  }
}

function renderGate() {
  const s = store.get();
  const gate = s.gate;
  if (!gate) return;
  const mountEl = $('gateResult');
  show(mountEl);

  renderGateComponent(mountEl, { gate, store });

  const allow = canProceed(gate);
  $('btnNext2').disabled = !allow;
  hide($('btnSkipClassify'));
  showStyleBlock(allow); // (#1,#2) hiện thẻ phong cách + nút tô màu tự động khi ảnh hợp lệ

  const statusEl = $('resultStatus');
  if (statusEl) {
    statusEl.textContent = gate.decision === 'allow'
      ? 'Nhận diện kiến trúc thành công. Bấm "Tiếp theo" để chọn màu.'
      : 'Phát hiện cảnh báo nhận diện. Hãy kiểm tra và xác nhận ở cột trái.';
  }
}

function renderClassifyErrorUI(e) {
  const mountEl = $('gateResult');
  show(mountEl);
  renderClassifyErrorComponent(mountEl, {
    error: e,
    store,
    onRetry: () => { store.set({ classification: null, gate: null, classifyError: null }); maybeClassify(); },
  });
  $('btnNext2').disabled = false;

  const statusEl = $('resultStatus');
  if (statusEl) {
    statusEl.textContent = 'Lỗi nhận diện kiến trúc. Bạn có thể bỏ qua để phối màu thủ công.';
  }
}

// ── STEP 2: Style cards + Auto-color ───────────────────────────
function wireStyle() {
  const grid = $('styleGrid');
  if (grid) grid.addEventListener('click', (e) => {
    const card = e.target.closest('.style-card'); if (!card) return;
    store.set({ style: card.dataset.style });
    renderStyleCards();
    // Nhóm phong cách quyết định HƯỚNG combo (4 nhóm × kiến trúc nhận diện) —
    // đã có danh sách thì sinh lại ngay cho khớp nhóm vừa chọn.
    if ((store.get().palettes || []).length) generateSchemes();
  });
  const auto = $('btnAutoColor');
  if (auto) auto.addEventListener('click', autoColor);
}

function renderStyleCards() {
  const sel = store.get().style;
  document.querySelectorAll('#styleGrid .style-card').forEach((c) => {
    c.classList.toggle('selected', c.dataset.style === sel);
  });
}

function showStyleBlock(visible) {
  const block = $('styleBlock');
  if (block) { if (visible) show(block); else hide(block); }
  if (visible) renderStyleCards();
}

// (#2) Tô màu tự động: AI tự chọn phương án, điền màu, dừng ở bước "Phối màu ngay".
function autoColor() {
  generateSchemes();
  const palettes = store.get().palettes || [];
  if (!palettes.length) { toast().warning('Chưa tạo được phương án tự động. Hãy thử chọn phong cách khác.', ''); return; }
  applyPalette(palettes[0]);
  toast().success('Đã chọn phương án màu tự động — kiểm tra rồi bấm "Phối màu ngay".', '', 2200);
  store.goToStep(STEPS.RENDER_MODE);
}

// ── STEP 3: Preference + palette ───────────────────────────────
function wirePreference() {
  // tone presets
  document.querySelectorAll('#tonePresets .cp-tone-btn').forEach((b) => {
    b.addEventListener('click', () => {
      document.querySelectorAll('#tonePresets .cp-tone-btn').forEach((x) => x.classList.toggle('active', x === b));
      const [mn, mx] = b.dataset.tone.split(',').map(Number);
      store.update('preference', { toneMin: mn, toneMax: mx });
      refreshSchemes();
      updateAccordionSummaries();
    });
  });
  // nút xác nhận sở thích → mới sinh phương án
  const apply = $('btnPrefApply');
  if (apply) apply.addEventListener('click', applyPreferences);
}

// ── Mini-accordion Bước 3 (kiểu Nippon Paint): "yêu/ghét" → "độ sáng" →
// "phương án màu", mỗi lúc chỉ mở 1 mục, mục đã qua thu gọn thành 1 dòng
// tóm tắt — đỡ dàn trải, khách không bị rối vì thấy hết mọi thứ cùng lúc.
// Bấm lại tiêu đề 1 mục đã thu gọn để mở ra sửa (KHÔNG mất dữ liệu đã chọn).
const ACC_ORDER = ['prefs', 'tone', 'scheme'];

function wireMiniAccordion() {
  const acc = $('prefAccordion'); if (!acc) return;
  acc.addEventListener('click', (e) => {
    const next = e.target.closest('.mini-acc-next[data-next]');
    if (next) { openAccordionSection(next.dataset.next); return; }
    const head = e.target.closest('[data-role="head"]');
    if (head) {
      const sec = head.closest('.mini-acc-section');
      if (sec) openAccordionSection(sec.dataset.sec);
    }
  });
}

function openAccordionSection(key) {
  const acc = $('prefAccordion'); if (!acc) return;
  const idx = ACC_ORDER.indexOf(key); if (idx < 0) return;
  acc.querySelectorAll('.mini-acc-section').forEach((sec) => {
    const i = ACC_ORDER.indexOf(sec.dataset.sec);
    const open = i === idx;
    sec.classList.toggle('is-open', open);
    sec.classList.toggle('is-done', i < idx);
    const head = sec.querySelector('[data-role="head"]');
    const body = sec.querySelector('[data-role="body"]');
    if (head) head.setAttribute('aria-expanded', String(open));
    if (body) body.classList.toggle('d-none', !open);
  });
  const openedSec = acc.querySelector(`.mini-acc-section[data-sec="${key}"]`);
  if (openedSec) openedSec.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/** Dòng tóm tắt hiện trong tiêu đề khi 1 mục đã thu gọn. */
function updateAccordionSummaries() {
  const s = store.get();
  const setSummary = (sec, text) => {
    const el = document.querySelector(`.mini-acc-section[data-sec="${sec}"] [data-role="summary"]`);
    if (el) el.textContent = text || '';
  };

  const parts = [];
  if (s.preference.love) parts.push(`Yêu ${s.preference.love.name}`);
  if (s.preference.hate) parts.push(`Ghét ${s.preference.hate.name}`);
  setSummary('prefs', parts.join(' · ') || 'Bỏ qua (không bắt buộc)');

  const toneBtn = document.querySelector('#tonePresets .cp-tone-btn.active');
  setSummary('tone', toneBtn ? toneBtn.textContent.trim() : '');

  const palettes = s.palettes || [];
  if (s.selectedPaletteId) {
    const p = palettes.find((x) => x.id === s.selectedPaletteId);
    setSummary('scheme', p ? `${p.main_wall.name} · ${p.trim.name} · ${p.accent.name}` : 'Đã chọn 1 phương án');
  } else if (s.colors.walls.source === 'manual') {
    setSummary('scheme', 'Tự phối màu thủ công');
  } else if (palettes.length) {
    setSummary('scheme', `${palettes.length} phương án gợi ý`);
  } else {
    setSummary('scheme', '');
  }
}

// Sau khi GỘP bước: sở thích (yêu/ghét/tông) và phương án AI ở CÙNG panel 3.
// Đổi sở thích KHÔNG tự tạo lại danh sách nữa (khách đang chọn dở mà list nhảy
// liên tục rất rối) — chỉ đánh dấu "chờ xác nhận" và làm nổi nút "Tạo phương án
// màu"; bấm nút mới sinh phương án theo sở thích đã chốt.
function refreshSchemes() {
  const btn = $('btnPrefApply');
  if (btn) btn.classList.add('pref-apply-attn');
}

/** Bấm "Tạo phương án màu" — chốt sở thích, sinh danh sách, cuộn tới kết quả. */
function applyPreferences() {
  const btn = $('btnPrefApply');
  if (btn) btn.classList.remove('pref-apply-attn');
  generateSchemes();
  updateAccordionSummaries();
}

/** Vào bước Chọn màu: chỉ render lại danh sách ĐÃ có; chưa có thì hiện
 *  hướng dẫn — KHÔNG tự sinh khi khách chưa bấm xác nhận. */
function prepareSchemeStep() {
  const list = store.get().palettes || [];
  if (list.length) { renderPaletteGrid(list); renderCompareTray(); }
  else renderPaletteEmptyState();
}

function renderPaletteEmptyState() {
  const grid = $('paletteGrid'); if (!grid) return;
  grid.innerHTML = `<div class="col"><div class="palette-empty">
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M12 22a10 10 0 1 1 0-20 8 8 0 0 1 0 16h-1.5a1.5 1.5 0 0 0-1 2.6A2 2 0 0 1 12 22z" />
        <circle cx="7.5" cy="10.5" r="1.2" fill="currentColor" /><circle cx="12" cy="7.5" r="1.2" fill="currentColor" /><circle cx="16.5" cy="10.5" r="1.2" fill="currentColor" />
      </svg>
      <b class="pe-none">Chưa có phương án nào</b>
      <span>Chọn nhóm màu yêu / không thích và độ sáng ở trên, rồi bấm "Tạo phương án màu".</span>
    </div></div>`;
  const tray = $('compareTray');
  if (tray) { hide(tray); tray.innerHTML = ''; }
}

function renderPreferenceGrids() {
  const make = (mountId, role) => {
    const grid = $(mountId); if (!grid) return;
    const sel = store.get().preference[role];
    grid.innerHTML = DOMINANT_FAMILIES.map((f) => `
      <button class="cp-family ${sel && sel.key === f.key ? 'selected-' + role : ''}" data-key="${f.key}">
        <span class="cp-family-swatch" style="background:${f.hex};${f.bucket === 'trang' ? 'border:1px solid #d1d5db' : ''}"></span>
        <span class="cp-family-label">${f.vi}</span>
      </button>`).join('');
    grid.onclick = (e) => {
      const btn = e.target.closest('.cp-family'); if (!btn) return;
      const fam = DOMINANT_FAMILIES.find((x) => x.key === btn.dataset.key);
      // key = swatch được chọn (duy nhất); bucket = nhóm chủ đạo để lọc palette.
      const pick = { bucket: fam.bucket, key: fam.key, hex: fam.hex, name: fam.vi };
      const other = role === 'love' ? 'hate' : 'love';
      const patch = { [role]: pick };
      if (store.get().preference[other] && store.get().preference[other].key === fam.key) patch[other] = null;
      store.update('preference', patch);
      renderPreferenceGrids();
      refreshSchemes();
      updateAccordionSummaries();
    };
  };
  make('loveGrid', 'love');
  make('hateGrid', 'hate');
}

function wirePalette() {
  // Tab trình duyệt: AI Tạo Phương Án ↔ Tự Phối Màu
  // #paletteTabs CHÍNH LÀ .ptabs-bar (Bootstrap <ul class="nav nav-tabs">),
  // .ptab-panel nằm trong .ptabs-body kế bên (anh em, không phải con của #paletteTabs).
  const tabs = document.querySelector('#paletteTabs');
  const tabsBody = document.querySelector('.ptabs-body');
  if (tabs) {
    tabs.addEventListener('click', (e) => {
      const tab = e.target.closest('.ptab'); if (!tab) return;
      const key = tab.dataset.tab;
      tabs.querySelectorAll('.ptab').forEach((t) => {
        const on = t === tab;
        t.classList.toggle('active', on);
        t.setAttribute('aria-selected', String(on));
      });
      (tabsBody || document).querySelectorAll('.ptab-panel').forEach((p) => {
        const on = p.dataset.panel === key;
        p.classList.toggle('active', on);
        p.classList.toggle('d-none', !on);
      });
      // Bấm tab AI → hiện lại danh sách đã có (KHÔNG tự sinh mới — sinh bằng
      // nút "Tạo phương án màu" để khách chủ động chốt sở thích trước).
      if (key === 'ai') prepareSchemeStep();
    });
  }

  $('paletteGrid').addEventListener('click', (e) => {
    const pin = e.target.closest('.pc-pin');
    if (pin) { e.stopPropagation(); toggleCompare(pin.dataset.pin); return; }
    const card = e.target.closest('.palette-card'); if (!card) return;
    selectPalette(card.dataset.id);
  });

  const surprise = $('surpriseBtn');
  if (surprise) surprise.addEventListener('click', surpriseMe);

  const tray = $('compareTray');
  if (tray) tray.addEventListener('click', (e) => {
    const use = e.target.closest('.ct-use'); if (!use) return;
    selectPalette(use.dataset.use);
  });
}

// ── Gợi ý màu từ ảnh tham khảo (khách upload ảnh nhà mẫu họ thích) ──
const REF_ZONE_LABEL = { walls: 'Tường', trims: 'Viền', accent: 'Cửa' };

function wireReferencePalette() {
  const input = $('refPaletteInput');
  const result = $('refPaletteResult');
  if (!input || !result) return;

  input.addEventListener('change', async () => {
    const file = input.files && input.files[0];
    if (!file) return;
    result.classList.remove('d-none');
    result.innerHTML = `<div class="small text-body-secondary">Đang phân tích màu…</div>`;
    let colors;
    try {
      colors = await extractDominantColors(file, { count: 6 });
    } catch (err) {
      result.innerHTML = `<div class="small text-danger">${escapeHtml(err.message || 'Không đọc được ảnh.')}</div>`;
      return;
    }
    if (!colors.length) {
      result.innerHTML = `<div class="small text-body-secondary">Không tìm được màu nổi bật trong ảnh này — thử ảnh khác rõ màu hơn.</div>`;
      return;
    }
    result.innerHTML = `
      <div class="small text-body-secondary mb-1">Bấm vùng muốn áp cho từng màu:</div>
      <div class="d-flex flex-column gap-1 ref-palette-rows">
        ${colors.map((c, i) => {
          const km = nearest(c.hex);
          const label = km ? `${km.name}${km.code ? ` · KM ${km.code}` : ''}` : c.hex.toUpperCase();
          return `<div class="d-flex align-items-center gap-2 ref-palette-row" data-hex="${c.hex}">
            <span class="rounded ref-palette-sw" style="width:22px;height:22px;flex-shrink:0;background:${c.hex}"></span>
            <span class="small flex-grow-1 text-truncate ref-palette-name" title="${escapeHtml(label)}">${escapeHtml(label)}</span>
            <div class="btn-group btn-group-sm ref-palette-zones" role="group">
              ${Object.keys(REF_ZONE_LABEL).map((z) => `<button type="button" class="btn btn-outline-secondary" data-zone="${z}" data-idx="${i}">${REF_ZONE_LABEL[z]}</button>`).join('')}
            </div>
          </div>`;
        }).join('')}
      </div>`;

    result.querySelectorAll('.ref-palette-zones').forEach((grp) => {
      grp.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-zone]'); if (!btn) return;
        const row = btn.closest('.ref-palette-row');
        const hex = row.dataset.hex;
        const zone = btn.dataset.zone;
        store.update('colors', { [zone]: { hex, name: nameFor(hex), source: 'manual', enabled: true } });
        store.addRecentColor(hex);
        toast().success(`${nameFor(hex)} → ${REF_ZONE_LABEL[zone]}`, 'Đã áp dụng màu từ ảnh', 1800);
      });
    });
  });
}

// ── So sánh nhiều phương án: ghim tối đa 3 rồi xem cạnh nhau ─────
const COMPARE_MAX = 3;
const COMPARE_LABELS = ['A', 'B', 'C'];
let _compareIds = [];

function toggleCompare(id) {
  const i = _compareIds.indexOf(id);
  if (i >= 0) _compareIds.splice(i, 1);
  else { if (_compareIds.length >= COMPARE_MAX) _compareIds.shift(); _compareIds.push(id); }  // giữ tối đa 3 (FIFO)
  document.querySelectorAll('.palette-card').forEach((c) =>
    c.classList.toggle('pc-pinned', _compareIds.includes(c.dataset.id)));
  renderCompareTray();
}

function renderCompareTray() {
  const tray = $('compareTray'); if (!tray) return;
  const list = store.get().palettes || [];
  const picks = _compareIds.map((id) => list.find((p) => p.id === id)).filter(Boolean);
  if (picks.length < 2) { hide(tray); tray.innerHTML = ''; return; }
  const cardHtml = (p, i) => `
    <div class="card p-2 ct-card">
      <span class="badge text-bg-secondary ct-label">${COMPARE_LABELS[i]}</span>
      <div class="d-flex rounded overflow-hidden ct-bar" style="height:28px"><span style="flex:2;background:${p.main_wall.hex}"></span><span style="flex:1;background:${p.trim.hex}"></span><span style="flex:1;background:${p.accent.hex}"></span></div>
      <div class="fw-semibold small mt-1 ct-name">${p.name}</div>
      <div class="text-body-secondary ct-mood" style="font-size:.7rem">${p.mood}</div>
      <button class="btn btn-brand btn-sm w-100 mt-1 ct-use" data-use="${p.id}" type="button">Dùng phương án này →</button>
    </div>`;
  show(tray);
  const cols = picks.length >= 3 ? 3 : 2;
  tray.innerHTML = `<div class="fw-semibold small mb-2 ct-title">So sánh ${picks.length} phương án</div>
    <div class="row row-cols-${cols} g-2 align-items-stretch ct-grid">
      ${picks.map((p, i) => `<div class="col">${cardHtml(p, i)}</div>`).join('')}
    </div>
    <div class="text-body-secondary small mt-2 ct-hint">Ghim thêm để so sánh (tối đa ${COMPARE_MAX}) — ghim cái mới nhất sẽ thay cái cũ nhất.</div>`;
}

/**
 * "Bất ngờ cho tôi" — chọn NGẪU NHIÊN 1 phương án trong nhóm điểm cao nhất.
 * Palettes đã sắp theo score giảm dần nên lấy random trong top-N vẫn đẹp &
 * hợp color-science (màu KM thật), chỉ khác nhau đủ để gây tò mò.
 */
function surpriseMe() {
  let list = store.get().palettes || [];
  if (!list.length) { generateSchemes(); list = store.get().palettes || []; }
  const pool = list.filter((p) => !p.__last);            // bỏ "Lần trước", lấy combo AI thật
  const top = pool.slice(0, Math.min(40, pool.length));  // 40 phương án điểm cao nhất
  if (!top.length) { toast().warning('Chưa có phương án để chọn — hãy nới dải tông hoặc đổi màu yêu/ghét.', ''); return; }
  const pick = top[Math.floor(Math.random() * top.length)];

  applyPalette(pick);
  document.querySelectorAll('.palette-card').forEach((c) => c.classList.toggle('selected', c.dataset.id === pick.id));
  const card = document.querySelector(`.palette-card[data-id="${(window.CSS && CSS.escape) ? CSS.escape(pick.id) : pick.id}"]`);
  if (card) {
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.classList.remove('pc-surprise'); void card.offsetWidth; card.classList.add('pc-surprise');
    setTimeout(() => card.classList.remove('pc-surprise'), 1000);
  }
  toast().success(`${pick.main_wall.name} · ${pick.trim.name} · ${pick.accent.name}`, '✨ Phối màu bất ngờ', 2400);
  logger.event('surprise_me', { id: pick.id, score: pick.score, pool: top.length });
  setTimeout(() => store.goToStep(STEPS.EDIT), 950);
}

/** Sinh MỚI danh sách phương án màu từ sở thích hiện tại rồi render. */
function generateSchemes() {
  const s = store.get();
  const palettes = generatePalettes({
    classification: s.gate ? s.gate.classification : null,
    style: s.style,
    love: s.preference.love, hate: s.preference.hate,
    toneMin: s.preference.toneMin, toneMax: s.preference.toneMax,
  });
  // Đề xuất lại bảng màu lần trước (theo IP) — đặt LÊN ĐẦU danh sách.
  const prev = lastPalette();
  const finalPalettes = prev ? [prev, ...palettes] : palettes;
  store.set({ palettes: finalPalettes });
  _compareIds = [];            // danh sách mới → bỏ ghim so sánh cũ
  renderPaletteGrid(finalPalettes);
  renderCompareTray();
  if (!palettes.length && !prev) toast().warning('Không tìm được phương án phù hợp. Hãy nới dải tông hoặc đổi màu yêu/ghét.', '');
}

// Render THEO LÔ để tránh lag: đổ ~48 card/lần, còn lại qua nút "Xem thêm".
// (Danh sách có thể tới vài nghìn combo — render hết 1 lần sẽ đơ trình duyệt.)
const PALETTE_PAGE = 48;
let _paletteList = [];
let _paletteRendered = 0;

// Mỗi kiểu hoà sắc 1 màu badge riêng — giúp mắt phân biệt nhanh giữa hàng
// chục thẻ mà không cần đọc chữ, đỡ cảm giác "combo nào cũng y chang".
const HARMONY_CLASS = {
  'Bổ túc': 'pc-harmony-complement',
  'Tương phản': 'pc-harmony-contrast',
  'Tương đồng': 'pc-harmony-analogous',
  'Đơn sắc': 'pc-harmony-mono',
  'Trung tính': 'pc-harmony-neutral',
};

function paletteCardHtml(p, sel) {
  const harmonyClass = HARMONY_CLASS[p.harmony] || 'pc-harmony-neutral';
  return `
    <div class="col">
    <div class="card p-2 position-relative palette-card ${harmonyClass}${p.id === sel ? ' selected' : ''}${p.__last ? ' pc-last' : ''}${_compareIds.includes(p.id) ? ' pc-pinned' : ''}" data-id="${p.id}" style="--pc-accent:${p.accent.hex}">
      <button class="btn btn-sm btn-light position-absolute top-0 end-0 m-1 pc-pin" data-pin="${p.id}" type="button" title="Ghim để so sánh" aria-label="Ghim để so sánh">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 7h10M7 7l3-3M7 7l3 3"/><path d="M17 17H7M17 17l-3 3M17 17l-3-3"/></svg>
      </button>
      <div class="pc-head">
        <span class="fw-semibold small d-block text-truncate pc-name">${p.name}${p.__last ? ' <span class="badge text-bg-secondary pc-last-badge">Lần trước</span>' : ''}</span>
        <span class="text-body-secondary d-flex align-items-center gap-1 pc-desc">${p.harmony ? `<span class="badge rounded-pill pc-harmony-badge">${p.harmony}</span>` : ''}<span class="text-truncate">${p.mood}</span></span>
      </div>
      <div class="d-flex rounded overflow-hidden my-2 pc-bar">
        <span style="flex:2;background:${p.main_wall.hex}"></span>
        <span style="flex:1;background:${p.trim.hex}"></span>
        <span style="flex:1;background:${p.accent.hex}"></span>
      </div>
      <div class="d-flex flex-column gap-1 pc-legend">
        <span class="d-flex align-items-center gap-1 small pc-leg"><i class="rounded-circle flex-shrink-0 d-inline-block" style="width:10px;height:10px;background:${p.main_wall.hex}"></i><b>Tường</b><span class="text-truncate">${p.main_wall.name}</span></span>
        <span class="d-flex align-items-center gap-1 small pc-leg"><i class="rounded-circle flex-shrink-0 d-inline-block" style="width:10px;height:10px;background:${p.trim.hex}"></i><b>Viền</b><span class="text-truncate">${p.trim.name}</span></span>
        <span class="d-flex align-items-center gap-1 small pc-leg"><i class="rounded-circle flex-shrink-0 d-inline-block" style="width:10px;height:10px;background:${p.accent.hex}"></i><b>Cửa</b><span class="text-truncate">${p.accent.name}</span></span>
      </div>
    </div>
    </div>`;
}

function appendPaletteBatch() {
  const grid = $('paletteGrid');
  const sel = store.get().selectedPaletteId;
  const existing = grid.querySelector('.palette-more');
  if (existing) (existing.closest('.col-12') || existing).remove();
  const next = _paletteList.slice(_paletteRendered, _paletteRendered + PALETTE_PAGE);
  grid.insertAdjacentHTML('beforeend', next.map((p) => paletteCardHtml(p, sel)).join(''));
  _paletteRendered += next.length;
  const remain = _paletteList.length - _paletteRendered;
  if (remain > 0) {
    const wrap = document.createElement('div');
    wrap.className = 'col-12';
    const btn = document.createElement('button');
    btn.className = 'btn btn-outline-secondary w-100 palette-more';
    btn.type = 'button';
    btn.textContent = `Xem thêm ${remain} phương án`;
    btn.addEventListener('click', appendPaletteBatch);
    wrap.appendChild(btn);
    grid.appendChild(wrap);
  }
}

function renderPaletteGrid(palettes) {
  const grid = $('paletteGrid');
  _paletteList = palettes || [];
  _paletteRendered = 0;
  if (!_paletteList.length) {
    grid.innerHTML = '<div class="col-12 text-body-secondary small text-center py-3 palette-empty">Không tìm được phương án phù hợp. Hãy nới dải tông hoặc đổi màu yêu/ghét.</div>';
    return;
  }
  grid.innerHTML = '';
  appendPaletteBatch();
}

// Áp 1 phương án màu vào store (KHÔNG điều hướng). Dùng chung cho chọn tay + tự động.
function applyPalette(p) {
  if (!p) return;
  store.set({
    selectedPaletteId: p.id,
    colors: {
      walls: { hex: p.main_wall.hex, name: p.main_wall.name, source: 'palette', paletteDefault: p.main_wall.hex },
      trims: { hex: p.trim.hex, name: p.trim.name, source: 'palette', paletteDefault: p.trim.hex },
      accent: { hex: p.accent.hex, name: p.accent.name, source: 'palette', paletteDefault: p.accent.hex, enabled: true },
    },
  });
}

function selectPalette(id) {
  const p = (store.get().palettes || []).find((x) => x.id === id);
  if (!p) return;
  document.querySelectorAll('.palette-card').forEach((c) => c.classList.toggle('selected', c.dataset.id === id));
  applyPalette(p);
  setTimeout(() => store.goToStep(STEPS.EDIT), 300);
}

// ── STEP 6: Phối màu ───────────────────────────────────────────
// Luôn tạo cả ngày + đêm — khách không chọn chế độ (renderMode cố định BOTH).
function wireRenderMode() {
  $('runBtn').addEventListener('click', () => runRender());
}

// Liệt kê TẤT CẢ đối tượng đã được chọn màu (tường/viền/cửa + bề mặt + tuỳ chỉnh).
function collectSelectedColors() {
  const s = store.get();
  const out = [];
  const valid = (c) => c && c.hex && c.enabled !== false;

  const base = [['walls', 'Tường'], ['trims', 'Viền'], ['accent', 'Cửa']];
  base.forEach(([key, label]) => { if (valid(s.colors[key])) out.push({ label, hex: s.colors[key].hex, name: s.colors[key].name, code: s.colors[key].code }); });

  Object.keys(s.surfaces || {}).forEach((key) => {
    const c = s.surfaces[key];
    if (valid(c)) out.push({ label: (SURFACE_BY_KEY[key] && SURFACE_BY_KEY[key].label) || key, hex: c.hex, name: c.name, code: c.code });
  });

  (s.customZones || []).forEach((z) => {
    if (z && z.hex && z.label && z.label.trim()) out.push({ label: z.label.trim(), hex: z.hex, name: z.name, code: z.code });
  });

  return out;
}

// Độ sáng tương đối (0–255) để chọn ring/contrast cho swatch sáng.
function hexLuma(hex) {
  const h = String(hex || '').replace('#', '');
  if (h.length < 6) return 255;
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

// ── Render ─────────────────────────────────────────────────────
// renderToken: chống race khi khách tải ảnh MỚI (resetForNewImage) trong lúc
// 1 lượt render CŨ vẫn đang chờ ComfyUI trả lời — không có token này, kết quả
// trả về muộn của ảnh cũ sẽ ghi đè lên state/kết quả của ảnh mới.
let renderToken = 0;
async function runRender() {
  const s = store.get();
  if (!s.upload.dataUrl) { toast().warning('Vui lòng tải ảnh trước', ''); return; }
  if (!WORKFLOW_TEMPLATE) { toast().warning('Workflow chưa tải xong', ''); return; }
  if (currentJob) { toast().warning('Đang có 1 lượt phối màu chạy dở — vui lòng đợi xong hoặc bấm huỷ.', ''); return; }

  const myToken = ++renderToken;
  const mode = s.renderMode; // luôn BOTH — khách không chọn

  $('runBtn').disabled = true;
  ui.progress.reset();
  setStatus('Đang phối màu…', 'running');

  currentJob = createRenderJob({
    onStage: (p) => {
      ui.progress.update(p);
      if (p.stage) $('resultStatus').textContent = p.stage;
    },
  });

  try {
    const out = await currentJob.run({
      template: WORKFLOW_TEMPLATE,
      dataUrl: s.upload.dataUrl,
      imageName: (s.upload.file && s.upload.file.name) || 'image.jpg',
      colors: s.colors,
      geometry: s.upload.geometry,
      projectType: s.projectType,
      surfaces: s.surfaces,
      customZones: s.customZones,
      mode,
    });
    // Ảnh đã bị thay bằng ảnh khác (resetForNewImage) trong lúc chờ ComfyUI
    // → kết quả này thuộc về ảnh CŨ, không được ghi đè lên state của ảnh mới.
    if (myToken !== renderToken) return;
    store.set({ results: out.results, renderMode: mode });
    showResults(out.results, out.meta);
    setStatus('Hoàn tất', 'done');
    toast().success('Phối màu hoàn tất!', '');
    await saveHistory(out);
    store.goToStep(STEPS.RESULT);
  } catch (err) {
    if (myToken !== renderToken) return;
    const e = err instanceof AppError ? err : toAppError(err, ErrorCode.RENDER_FAILED);
    if (e.cancelled) { setStatus('Đã huỷ', ''); toast().info('Đã huỷ phối màu', ''); }
    else {
      setStatus(e.title, 'error');
      ui.progress.update({ state: JobState.FAILED, error: e, stage: e.title, stageIndex: 0, totalStages: 1 });
      // Luôn kèm gợi ý hành động cụ thể (e.action từ error-service, vd "Chọn
      // ảnh khác"/"Thử lại") thay vì chỉ thêm câu gợi ý khi retryable=true —
      // trước đây lỗi không-retry (vd INVALID_IMAGE) hiện message nhưng
      // không nói rõ bước tiếp theo nên làm gì.
      const hint = e.retryable ? ' Bạn có thể bấm "Phối màu" để thử lại.' : (e.action ? ` Gợi ý: ${e.action}.` : '');
      toast().error(e.userMessage + hint, e.title);
      try { await saveHistoryFailed(e); } catch (_) { }
    }
  } finally {
    if (myToken === renderToken) { $('runBtn').disabled = false; currentJob = null; }
  }
}

function cancelRender() { if (currentJob) currentJob.cancel(); }

function showResults(results, meta) {
  show($('viewerArea'), 'flex');
  hide($('placeholder'));
  const before = store.get().upload.objectUrl || store.get().upload.dataUrl;
  ui.viewer.setImages({ before, day: results.day, night: results.night });
  if (results.night) show($('dnToggle'), 'flex'); else hide($('dnToggle'));
  show($('moodCtl'), 'inline-flex');
  resetMood();
  setView(results.night && !results.day ? 'night' : 'day');
  renderResultCodes();
}

// Item 14 — dải mã màu sơn (KM) ngay dưới ảnh kết quả.
function renderResultCodes() {
  const mount = $('resultCodes');
  if (!mount) return;
  const items = collectSelectedColors();
  if (!items.length) { mount.innerHTML = ''; return; }
  mount.innerHTML = `<span class="rc-title">Mã màu sơn đã dùng</span>`
    + items.map((it) => {
      // Ưu tiên tên/mã KM ĐÃ LƯU khi chọn màu (đúng tuyệt đối) — chỉ suy ra
      // bằng nearest() khi thiếu (vd màu tự nhập hex không qua km-picker).
      // Trước đây luôn gọi nearest() nên đôi khi trả về mã KM khác (2 màu
      // hex gần giống nhau) dù đã chọn đúng mã lúc đầu.
      const km = (it.name || it.code) ? it : (nearest(it.hex) || {});
      const hex = it.hex.toUpperCase();
      const light = hexLuma(it.hex) > 225 ? ' is-light' : '';
      const name = km.name ? `${km.name}${km.code ? ` · KM ${km.code}` : ''}` : hex;
      // it.label có thể đến từ tên đối tượng tự gõ ở "Tự Phối Màu" (input tự
      // do) → PHẢI escape, không được ghép thẳng vào innerHTML.
      return `<span class="rc-item">
        <span class="rc-sw${light}" style="background:${it.hex}"></span>
        <span class="rc-text"><b>${escapeHtml(it.label)}</b><span>${escapeHtml(name)}</span></span>
        <span class="rc-hex">${hex}</span>
      </span>`;
    }).join('');
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

// ── Viewer day/night toggle ────────────────────────────────────
function wireViewer() {
  $('dnDay').addEventListener('click', () => setView('day'));
  $('dnNight').addEventListener('click', () => setView('night'));
  $('dlTop').addEventListener('click', () => safeDl(() => download.downloadSummary(buildSummaryData(store.get()))));

  // "Không khí theo mùa" — bấm 1 trong 4 mùa để phủ tông ánh sáng lên ảnh kết
  // quả (chỉ là lớp phủ CSS, KHÔNG render lại). Áp lên .cmp-after (đã clip)
  // nên chỉ tô lên phần "Sau", so sánh trực tiếp với ảnh gốc bên trái.
  document.querySelectorAll('#moodCtl .mood-season-btn').forEach((btn) => {
    btn.addEventListener('click', () => applyMood(btn.dataset.season));
  });
  const reset = $('moodReset');
  if (reset) reset.addEventListener('click', () => applyMood(null));
}

// Mỗi mùa: màu phủ (tint) + độ đậm overlay + filter ánh sáng riêng —
// KHÔNG chỉ đổi màu mà còn đổi "chất" ánh sáng (tương phản/độ bão hoà) cho
// đúng cảm giác từng mùa thay vì chỉ 1 trục ấm/mát như trước.
const SEASON_PRESETS = {
  // Xuân: nắng dịu, hồng phấn nhẹ, bão hoà thấp — trong trẻo.
  spring: { tint: '#FFB6D9', opacity: 0.16, filter: 'brightness(1.04) contrast(0.98) saturate(1.05)' },
  // Hạ: nắng gắt vàng nóng, tương phản cao, bão hoà mạnh.
  summer: { tint: '#FFC93D', opacity: 0.22, filter: 'brightness(1.08) contrast(1.12) saturate(1.18)' },
  // Thu: ánh sáng cam/vàng hoài niệm, hơi giảm bão hoà lam-lục.
  autumn: { tint: '#E07A3F', opacity: 0.26, filter: 'brightness(0.98) contrast(1.06) saturate(0.92) sepia(0.12)' },
  // Đông: ánh sáng xanh lam lạnh, dịu, giảm tương phản nhẹ như sương mù.
  winter: { tint: '#8FB8E0', opacity: 0.24, filter: 'brightness(0.97) contrast(0.94) saturate(0.85)' },
};

function applyMood(season) {
  const after = document.querySelector('#cmpStage .cmp-after');
  if (!after) return;
  let tint = after.querySelector('.mood-tint');
  if (!tint) { tint = document.createElement('div'); tint.className = 'mood-tint'; after.appendChild(tint); }

  const preset = SEASON_PRESETS[season] || null;
  tint.style.background = preset ? preset.tint : '';
  tint.style.opacity = preset ? preset.opacity.toFixed(3) : '0';
  after.style.filter = preset ? preset.filter : '';

  const ctl = $('moodCtl');
  if (ctl) ctl.classList.toggle('is-active', !!preset);
  document.querySelectorAll('#moodCtl .mood-season-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.season === season);
  });
}

function resetMood() { applyMood(null); }
function setView(mode) {
  store.set({ viewMode: mode });
  const hasDay = !!store.get().results.day; const hasNight = !!store.get().results.night;
  const m = (mode === 'night' && hasNight) ? 'night' : (hasDay ? 'day' : (hasNight ? 'night' : 'day'));
  ui.viewer.setView(m);
  $('dnDay').classList.toggle('active', m !== 'night');
  $('dnNight').classList.toggle('active', m === 'night');
}

// ── Result actions ─────────────────────────────────────────────
function onResultAction(action) {
  const s = store.get();
  switch (action) {
    case 'try-palette': store.goToStep(STEPS.SCHEME); break;
    case 'edit-colors': store.goToStep(STEPS.EDIT); break;
    case 'dl-summary': safeDl(() => download.downloadSummary(buildSummaryData(s))); break;
    case 'share': shareResultLink(s); break;
    case 'estimate': {
      // Nút nổi pe-open-btn bị ẩn cứng từ đợt redesign — mở modal trực tiếp.
      const el = $('paintEstimateModal');
      if (el && typeof bootstrap !== 'undefined') bootstrap.Modal.getOrCreateInstance(el).show();
      break;
    }
    default: break;
  }
}

// Gom dữ liệu cho ảnh tổng hợp: ngày + đêm + bảng màu MỌI bề mặt đã sơn
// (tường/viền/cửa + bề mặt mở rộng + đối tượng tuỳ chỉnh) với tên + mã KM gần nhất.
function buildSummaryData(s) {
  const colors = collectSelectedColors().map((it) => {
    const n = nearest(it.hex) || {};
    return { label: it.label, hex: it.hex, name: n.name || it.hex, code: n.code || '' };
  });
  return {
    original: s.upload.dataUrl || s.upload.objectUrl,
    day: s.results.day,
    night: s.results.night,
    colors,
  };
}
// Chia sẻ = tạo LINK công khai (php/share_api.php) trỏ về /share.php?id=…
// hiện đầy đủ ảnh ngày/đêm + bảng màu — KHÔNG phải tải ảnh về máy.
async function shareResultLink(s) {
  const day = s.results.day && s.results.day.url;
  const night = s.results.night && s.results.night.url;
  if (!day && !night) { toast().warning('Chưa có ảnh kết quả để chia sẻ.', ''); return; }
  try {
    const res = await fetch('php/share_api.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        palette_name: currentPaletteName(),
        style_label: (s.gate && s.gate.classification && s.gate.classification.styleLabel) || '',
        colors: historyColors(),
        day_url: day || '',
        night_url: night || '',
      }),
    });
    const out = await res.json();
    if (!out.ok || !out.url) throw new Error(out.error || 'Tạo link thất bại');
    // Ưu tiên share sheet hệ điều hành (mobile); fallback copy clipboard.
    if (navigator.share) {
      try { await navigator.share({ title: 'Phối màu nhà bằng AI — Paint & More', url: out.url }); return; }
      catch (_) { /* khách bấm huỷ share sheet → rơi xuống copy */ }
    }
    await navigator.clipboard.writeText(out.url);
    toast().success('Đã copy link chia sẻ — gửi cho người thân là xem được ngay.', out.url, 5000);
  } catch (err) {
    toast().error((err && err.message) || 'Không tạo được link chia sẻ.', 'Chia sẻ thất bại');
  }
}

async function safeDl(fn) {
  try { await fn(); toast().success('Đã tải ảnh', '', 1500); }
  catch (err) { const e = toAppError(err, ErrorCode.DOWNLOAD_FAILED); toast().error(e.userMessage, e.title); }
}

// ── "Gốc" — thư viện ảnh khách đã phối (Item 13) ────────────────
function renderSampleGallery() {
  const mount = $('sampleGallery');
  if (!mount) return;
  const list = Array.isArray(GALLERY_SAMPLES) ? GALLERY_SAMPLES.filter((s) => s && s.img) : [];
  if (!list.length) { mount.innerHTML = ''; return; }   // rỗng → CSS :empty ẩn
  mount.innerHTML = `<div class="sg-title">Khách đã phối với P&amp;M</div>
    <div class="sg-grid">` + list.map((s) => `
      <figure class="sg-card">
        <img src="${s.img}" alt="Ảnh phối bởi ${s.by || 'khách hàng'}" loading="lazy">
        <figcaption><b>${s.by || ''}</b>${s.note ? `<span>${s.note}</span>` : ''}</figcaption>
      </figure>`).join('') + `</div>`;
}

// ── Dự toán sơn (Item 12) ───────────────────────────────────────
const PAINT_UNIT_PRICE = 72000; // VND / m2 (goi tieu chuan)
const PAINT_AREA_MAX = 100000; // m2 - chan so phi thuc te (vd go/dan nham)
function wirePaintEstimate() {
  const wall = $('peWall'), floor = $('peFloor'), total = $('peTotal');
  if (!wall || !floor || !total) return;
  const fmt = (n) => new Intl.NumberFormat('vi-VN').format(Math.round(n)) + ' ₫';
  // Chặn âm/quá lớn NGAY TRÊN INPUT (không chỉ ở tổng) để khách thấy số đã
  // tự sửa, không tưởng app tính sai khi thấy input âm nhưng tổng vẫn dương.
  const clampInput = (el) => {
    const n = parseFloat(el.value);
    if (Number.isFinite(n)) {
      const clamped = Math.min(PAINT_AREA_MAX, Math.max(0, n));
      if (clamped !== n) el.value = clamped;
    }
  };
  const calc = () => {
    clampInput(wall); clampInput(floor);
    const a = (parseFloat(wall.value) || 0) + (parseFloat(floor.value) || 0);
    total.textContent = fmt(a * PAINT_UNIT_PRICE);
  };
  wall.addEventListener('input', calc);
  floor.addEventListener('input', calc);

  // Popup: giờ là Bootstrap Modal thật (data-bs-toggle/data-bs-dismiss trong HTML
  // tự lo mở/đóng/backdrop/Esc). Chỉ còn việc focus + aria-expanded trên nút mở.
  const modalEl = $('paintEstimateModal'), openBtn = $('peOpenBtn');
  if (!modalEl || !openBtn) return;
  // Ngoại thất / Nội thất — quyết định gợi ý 365 hay 247 cho tường/viền/cửa.
  const typeGroup = $('peProjectType');
  if (typeGroup) typeGroup.addEventListener('change', (e) => {
    const v = e.target && e.target.value;
    if (v === 'interior' || v === 'exterior') {
      store.set({ projectType: v });
      renderPaintProducts();
    }
  });

  modalEl.addEventListener('shown.bs.modal', () => {
    openBtn.setAttribute('aria-expanded', 'true'); wall.focus();
    // Đồng bộ radio theo store trước khi render (mở lại giữ lựa chọn cũ).
    const cur = store.get().projectType === 'interior' ? 'peTypeInt' : 'peTypeExt';
    const radio = $(cur);
    if (radio) radio.checked = true;
    renderPaintProducts();
    renderConcernList();
    renderConcernProducts();
  });
  modalEl.addEventListener('hidden.bs.modal', () => { openBtn.setAttribute('aria-expanded', 'false'); });

  wireConcernPicker();
}

const ZONE_LABEL = { walls: 'Tường', trims: 'Viền', accent: 'Cửa' };

// Gợi ý sản phẩm Paint&More THẬT theo đúng vùng khách đã chọn màu (combo
// hiện tại + bề mặt mở rộng), thay vì 1 mức giá chung chung cho mọi nhà.
function renderPaintProducts() {
  const mount = $('peProducts');
  if (!mount) return;
  const s = store.get();
  const rows = [];
  Object.keys(ZONE_LABEL).forEach((zone) => {
    const c = s.colors[zone] || {};
    if (c.source === 'default' || !isValidHex(c.hex)) return;
    const p = productForZone(zone, s.projectType);
    if (p) rows.push({ label: ZONE_LABEL[zone], hex: c.hex, product: p });
  });
  Object.entries(s.surfaces || {}).forEach(([skey, c]) => {
    if (!c || !isValidHex(c.hex)) return;
    const def = SURFACE_BY_KEY[skey];
    const p = productForSurface(skey);
    if (p) rows.push({ label: def ? def.label : skey, hex: c.hex, product: p });
  });

  if (!rows.length) {
    mount.innerHTML = `<div class="small text-body-secondary pe-products-empty">Chọn màu cho tường/viền/cửa hoặc bề mặt ở bước 3 để xem gợi ý sản phẩm phù hợp.</div>`;
    return;
  }

  // Gom theo sản phẩm để không lặp lại cùng 1 dòng sản phẩm nhiều lần.
  const byProduct = new Map();
  rows.forEach((r) => {
    if (!byProduct.has(r.product.key)) byProduct.set(r.product.key, { product: r.product, zones: [] });
    byProduct.get(r.product.key).zones.push(r);
  });
  const primer = primerProduct();

  const rowHtml = ({ product, zones }) => `
    <div class="d-flex align-items-start gap-2 pe-product-row">
      <div class="d-flex pe-product-sw" style="width:8px">${zones.map((z) => `<span style="flex:1;background:${z.hex}" title="${escapeHtml(z.label)}"></span>`).join('')}</div>
      <div class="flex-grow-1">
        <a href="${product.url}" target="_blank" rel="noopener" class="fw-semibold small pe-product-name">${escapeHtml(product.name)}</a>
        <div class="text-body-secondary small pe-product-tagline">${escapeHtml(product.tagline)}</div>
        <div class="small pe-product-zones"><b>Dùng cho:</b> ${zones.map((z) => escapeHtml(z.label)).join(', ')}</div>
      </div>
    </div>`;

  mount.innerHTML = `
    <div class="small fw-semibold mb-1 pe-products-title">Sản phẩm Paint&amp;More gợi ý</div>
    <div class="d-flex flex-column gap-2 pe-products-list">
      ${[...byProduct.values()].map(rowHtml).join('')}
      ${primer ? `<div class="small text-body-secondary pe-primer-hint"><b>+ Khuyên dùng lót</b> <a href="${primer.url}" target="_blank" rel="noopener">${escapeHtml(primer.name)}</a> <b>trước khi sơn màu.</b></div>` : ''}
    </div>
    <div class="small text-body-secondary mt-2 pe-products-contact"><b>Giá &amp; định mức phủ chính xác: liên hệ Paint&amp;More</b> <a href="tel:0909143900">0909 143 900</a> <b>để được báo giá.</b></div>`;
}

// ── Tư vấn theo VẤN ĐỀ khách muốn giải quyết (chịu lực, hút ẩm, chống
// thấm, sàn ô tô, vùng biển…) — độc lập với màu đã chọn, dùng data thật
// từ data/paint-products.js. Chọn tick thủ công HOẶC gõ mô tả tự do rồi
// bấm "Tìm sản phẩm" để dò từ khoá (không gọi AI/server, tự dò trên máy).
const _selectedConcerns = new Set();

function renderConcernList() {
  const mount = $('peConcernList');
  if (!mount) return;
  mount.innerHTML = CONCERNS.map((c) => `
    <button type="button" class="btn btn-sm ${_selectedConcerns.has(c.key) ? 'btn-brand' : 'btn-outline-secondary'} pe-concern-pill" data-concern="${c.key}">${escapeHtml(c.label)}</button>
  `).join('');
}

function wireConcernPicker() {
  const list = $('peConcernList');
  if (list) list.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-concern]'); if (!btn) return;
    const key = btn.dataset.concern;
    if (_selectedConcerns.has(key)) _selectedConcerns.delete(key); else _selectedConcerns.add(key);
    renderConcernList();
    renderConcernProducts();
  });

  const input = $('peConcernText'), findBtn = $('peConcernFind');
  const runMatch = () => {
    const text = (input && input.value) || '';
    const matched = matchConcernsFromText(text);
    if (!matched.length) {
      toast().warning('Chưa nhận diện được vấn đề nào trong mô tả — thử chọn thủ công ở trên hoặc mô tả rõ hơn.', '');
      return;
    }
    matched.forEach((k) => _selectedConcerns.add(k));
    renderConcernList();
    renderConcernProducts();
    const labels = matched.map((k) => (CONCERNS.find((c) => c.key === k) || {}).label).filter(Boolean).join(', ');
    toast().success(labels, 'Đã tìm thấy vấn đề phù hợp', 2400);
  };
  if (findBtn) findBtn.addEventListener('click', runMatch);
  if (input) input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); runMatch(); } });
}

function renderConcernProducts() {
  const mount = $('peConcernProducts');
  if (!mount) return;
  const picks = productsForConcerns([..._selectedConcerns]);
  if (!picks.length) {
    mount.innerHTML = `<div class="small text-body-secondary">Chọn 1 vấn đề ở trên (hoặc mô tả nhu cầu) để xem dòng sơn chuyên dụng phù hợp.</div>`;
    return;
  }
  mount.innerHTML = `
    <div class="d-flex flex-column gap-2 pe-products-list">
      ${picks.map(({ product, concern }) => `
        <div class="d-flex align-items-start gap-2 pe-product-row">
          <div class="flex-grow-1">
            <a href="${product.url}" target="_blank" rel="noopener" class="fw-semibold small pe-product-name">${escapeHtml(product.name)}</a>
            <div class="text-body-secondary small pe-product-tagline">${escapeHtml(product.tagline)}</div>
            <div class="small pe-product-zones"><b>Giải quyết:</b> ${escapeHtml(concern.label)}</div>
          </div>
        </div>`).join('')}
    </div>`;
}

// ── Tooltip (Bootstrap) — bật cho MỌI phần tử có [title], kể cả những
// cái xuất hiện động sau này (mood/dn-toggle chỉ hiện sau khi có
// kết quả). MutationObserver quét lại mỗi khi có node mới được thêm.
function wireTooltips() {
  if (typeof bootstrap === 'undefined' || !bootstrap.Tooltip) return;
  const activate = (root) => {
    root.querySelectorAll('[title]:not([data-bs-toggle])').forEach((el) => {
      el.setAttribute('data-bs-toggle', 'tooltip');
      el.setAttribute('data-bs-placement', el.dataset.bsPlacement || 'bottom');
      // CHỈ 'hover' — nếu kèm 'focus', bấm nút xong focus còn nằm lại làm
      // tooltip treo lơ lửng (đã gặp với nút Sáng/Tối + panel Lịch sử).
      const tt = new bootstrap.Tooltip(el, { trigger: 'hover' });
      el.addEventListener('click', () => { try { tt.hide(); } catch (_) { } });
    });
  };
  activate(document.body);
  // Debounce nhẹ: palette-grid/gate-result re-render nhiều node cùng lúc →
  // gộp lại quét 1 lần thay vì mỗi addedNode 1 lần (tránh dội hiệu năng).
  let pending = false;
  const mo = new MutationObserver(() => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => { activate(document.body); pending = false; });
  });
  mo.observe(document.body, { childList: true, subtree: true });
}

// ── Menu nổi dạng overlay (Item 8) ──────────────────────────────
// Thu gọn / mở rộng bảng điều khiển kiểu sidebar (như GPT/Gemini/Claude):
// nút chevron trên panel để thu gọn (panel trượt về 0, ảnh chiếm hết chỗ),
// nút chevron nổi bên trái để mở lại. Ghi nhớ trạng thái theo localStorage.
function wirePanelToggle() {
  const body = document.body;
  const btn = $('panelToggle');
  const KEY = 'aoc_panel_collapsed';
  const set = (on) => {
    body.classList.toggle('panel-collapsed', on);
    try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (_) { }
  };
  try { if (localStorage.getItem(KEY) === '1') body.classList.add('panel-collapsed'); } catch (_) { }
  if (btn) btn.addEventListener('click', () => set(!body.classList.contains('panel-collapsed')));
}

// ── History ────────────────────────────────────────────────────
function wireHistory() {
  $('historyBtn').addEventListener('click', () => ui.history.open());
  const home = $('btnHome');
  if (home) home.addEventListener('click', () => {
    if (store.get().upload.file && !confirm('Bắt đầu ảnh mới? Ảnh và phối màu hiện tại sẽ được xoá.')) return;
    store.resetAll();
    store.goToStep(STEPS.UPLOAD);
  });
}
function historyColors() {
  return collectSelectedColors().map((it) => {
    const n = nearest(it.hex) || {};
    return { label: it.label, hex: it.hex, name: n.name || it.hex, code: n.code || '' };
  });
}
function currentPaletteName() {
  const s = store.get();
  return s.selectedPaletteId ? ((s.palettes.find((p) => p.id === s.selectedPaletteId) || {}).name || 'Tuỳ chỉnh') : 'Tuỳ chỉnh';
}
async function saveHistory(out) {
  const s = store.get();
  const fullUrl = (out.results.day && out.results.day.url) || (out.results.night && out.results.night.url) || s.upload.objectUrl;
  const thumb = await makeThumbDataUrl(fullUrl);
  addHistory({
    thumb, paletteName: currentPaletteName(),
    renderMode: out.meta.mode, status: 'COMPLETED',
    durationMs: out.durationMs || null,
    projectType: s.projectType || null,
    styleLabel: (s.gate && s.gate.classification && s.gate.classification.styleLabel) || null,
    colors: historyColors(),
    results: { day: out.results.day && out.results.day.url, night: out.results.night && out.results.night.url },
  });
  savePref(); // ghi nhớ bảng màu theo IP để lần sau đề xuất lại
}
// Ghi lại cả lần phối màu LỖI để có nhật ký đầy đủ (không có ảnh kết quả).
async function saveHistoryFailed(err) {
  const s = store.get();
  const thumb = await makeThumbDataUrl(s.upload.objectUrl || '');
  addHistory({
    thumb,
    paletteName: currentPaletteName(),
    renderMode: s.renderMode || 'both', status: 'FAILED',
    projectType: s.projectType || null,
    styleLabel: (s.gate && s.gate.classification && s.gate.classification.styleLabel) || null,
    colors: historyColors(),
    error: { title: err && err.title, message: err && err.userMessage, code: err && err.code },
    results: null,
  });
}
// "Dùng lại combo này" — KHÁC với "Mở lại": không đụng tới ảnh/kết quả cũ,
// chỉ nạp lại đúng 3 màu Tường/Viền/Cửa của mục lịch sử vào ảnh HIỆN TẠI
// (ảnh mới khách vừa tải lên), rồi nhảy thẳng tới bước 4 để khách bấm
// "Phối màu ngay" luôn — không cần tự chọn lại từng màu.
function reuseHistoryCombo(it) {
  if (!store.get().upload.file) { toast().warning('Vui lòng tải ảnh lên trước khi dùng lại combo màu này.', ''); return; }
  const map = { 'Tường': 'walls', 'Viền': 'trims', 'Cửa': 'accent' };
  const patch = {};
  (it.colors || []).forEach((c) => {
    const zone = map[c.label];
    if (zone && c.hex) patch[zone] = { hex: c.hex, name: c.name || c.hex, code: c.code || '', source: 'manual', enabled: true };
  });
  if (!Object.keys(patch).length) { toast().warning('Mục này không có đủ màu Tường/Viền/Cửa để dùng lại.', ''); return; }
  store.update('colors', patch);
  Object.values(patch).forEach((c) => store.addRecentColor(c.hex));
  store.goToStep(STEPS.EDIT);
  toast().success('Đã nạp lại bảng màu cũ — kiểm tra rồi bấm "Phối màu ngay".', '', 2400);
}
function restoreFromHistory(it) {
  if (!it.results) return;
  // "Mở lại" phải nạp ĐÚNG bộ màu đã tạo ra kết quả này — nếu chỉ set ảnh mà
  // giữ nguyên store.colors hiện tại (của lần phối gần nhất khác), bảng mã
  // màu/color-editor bước 5 sẽ hiện SAI (màu của lần phối trước, không khớp
  // ảnh đang xem).
  const map = { 'Tường': 'walls', 'Viền': 'trims', 'Cửa': 'accent' };
  const colorPatch = {};
  (it.colors || []).forEach((c) => {
    const zone = map[c.label];
    if (zone && c.hex) colorPatch[zone] = { hex: c.hex, name: c.name || c.hex, code: c.code || '', source: 'manual', enabled: true };
  });
  if (Object.keys(colorPatch).length) store.update('colors', colorPatch);
  const results = {
    day: it.results.day ? { url: it.results.day } : null,
    night: it.results.night ? { url: it.results.night } : null,
  };
  store.set({ results });
  showResults(results, {});
  store.goToStep(STEPS.RESULT);
  toast().info('Đã mở lại kết quả từ lịch sử', '', 1500);
}
