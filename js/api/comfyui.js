/* ============================================================
   api/comfyui.js — ComfyUI client + workflow filler
   • Chạy ĐÚNG workflow data/paint-recolor-gemma-qwen.json (Gemma 4 refine +
     Qwen-Image-Edit-2511) với mọi node khác CỦA CHÍNH NÓ.
   • Script CHỈ điền 2 input: ảnh nguồn (loadImage) + prompt màu đầy đủ theo
     mẫu đoạn văn "Repaint ALL <bề mặt> surfaces to <hex>, including…"
     (recolorPrompt) — mỗi đối tượng khách tự thêm/chọn ở tab "Tự Phối Màu"
     (comboEditorMount) → thêm 1 đoạn tương ứng nối tiếp phía dưới.
   • KHÔNG xoá/thêm node, KHÔNG đụng seed/step/cfg.
   ============================================================ */

'use strict';

import { CONFIG } from '../config.js?v=20260707115237';
import { request } from './client.js?v=20260707115237';
import { validateRenderColors } from '../utils/color-prompt.js?v=20260707115237';
import { SURFACES } from '../data/surfaces.js?v=20260707115237';
import { AppError, ErrorCode } from '../services/error-service.js?v=20260707115237';
import { RenderMode } from '../state/wizard-store.js?v=20260707115237';
import { logger } from '../utils/logger.js?v=20260707115237';

const NODES = CONFIG.WORKFLOW.NODES;
function base() { return CONFIG.COMFYUI_BASE_URL.replace(/\/$/, ''); }

// ── Typed graph helpers ────────────────────────────────────────
function requireNode(graph, id, builderCtx = '') {
  if (!graph[id] || !graph[id].inputs) {
    throw new AppError(ErrorCode.RENDER_FAILED, {
      technical: `Workflow malformed: missing node ${id} (${builderCtx})`,
    });
  }
  return graph[id];
}
function setInput(graph, id, name, value) {
  const node = requireNode(graph, id, `set ${name}`);
  node.inputs[name] = value;
}

function normHex(hex) {
  if (!hex) return null;
  const h = String(hex).trim().replace(/^#/, '');
  return /^[0-9a-fA-F]{6}$/.test(h) ? ('#' + h.toUpperCase()) : null;
}

// Mẫu đoạn văn riêng cho các bề mặt khách hay chọn thêm (mái, sàn, nền, cầu
// thang, trần, cột…) — khớp văn phong workflow data/paint-recolor-gemma-qwen.json.
// key = alias chuẩn hoá (xem SURFACE_ALIASES); title = tên hiển thị trong prompt.
const SURFACE_TEMPLATES = {
  roof: { title: 'Roof', including: 'roof tiles, shingles, metal roofing, ridge caps, hips, valleys, dormers, gables, eaves, and all visible roof components' },
  floor: { title: 'Floor', including: 'tile, wood, concrete, stone, vinyl, laminate, epoxy, and all visible flooring surfaces' },
  ground: { title: 'Ground', including: 'paving, concrete, stone, brick, walkways, driveways, patios, courtyards, and all visible paved surfaces' },
  stairs: { title: 'Stairs', including: 'steps, risers, stringers, landings, stair skirting, and all visible stair components' },
  ceiling: { title: 'Ceiling', including: 'flat, vaulted, coffered, tray, and all visible ceiling surfaces' },
  columns: { title: 'Columns', including: 'shafts, capitals, bases, and all visible column surfaces' },
  railing: { title: 'Railing', including: 'handrails, balusters, guardrails, balcony railings, staircase railings, and all visible railing components' },
  cabinet: { title: 'Cabinetry', including: 'kitchen cabinets, wardrobes, vanity cabinets, cabinet doors, cabinet frames, drawers, and all visible cabinetry surfaces' },
  builtin: { title: 'Built-in Furniture', including: 'built-in wardrobes, built-in shelving, wall-mounted cabinetry, embedded storage units, and all visible built-in furniture surfaces' },
};
// Khớp key trong data/surfaces.js HOẶC nhãn tiếng Việt/Anh khách tự gõ (đối
// tượng tự thêm ở "Tự Phối Màu") về đúng alias mẫu ở trên.
const SURFACE_ALIASES = {
  roof: 'roof',
  floor: 'floor',
  ground: 'ground', 'nền': 'ground', 'san': 'ground', 'sân': 'ground', 'nen': 'ground',
  'hè': 'ground', he: 'ground', 'vỉa hè': 'ground', 'via he': 'ground', 'sân hè': 'ground',
  stairs: 'stairs', 'cầu thang': 'stairs', 'cau thang': 'stairs',
  ceiling: 'ceiling', 'trần': 'ceiling', 'tran': 'ceiling',
  columns: 'columns', 'cột': 'columns', 'cot': 'columns', 'trụ': 'columns', 'tru': 'columns',
  pillars: 'columns', pillar: 'columns', column: 'columns',
  railing: 'railing', 'lan can': 'railing', 'lan-can': 'railing', 'tay vịn': 'railing', 'tay vin': 'railing',
  guardrail: 'railing', handrail: 'railing', balustrade: 'railing',
  cabinet: 'cabinet', 'tủ': 'cabinet', 'tu': 'cabinet', 'tủ bếp': 'cabinet', 'tu bep': 'cabinet',
  wardrobe: 'cabinet', cabinetry: 'cabinet',
  builtin: 'builtin', 'nội thất âm tường': 'builtin', 'noi that am tuong': 'builtin',
  'tủ âm tường': 'builtin', 'tu am tuong': 'builtin', 'built-in furniture': 'builtin', 'built in furniture': 'builtin',
  millwork: 'builtin',
};

/** 1 đoạn "Repaint ALL … " cho 1 bề mặt/đối tượng — theo mẫu có sẵn nếu
 *  khớp alias, không thì dùng mẫu chung (vẫn đúng văn phong, chỉ thiếu danh
 *  sách "including" chi tiết). */
function surfaceBlock(aliasKey, displayLabel, hex) {
  const tpl = SURFACE_TEMPLATES[aliasKey];
  if (tpl) {
    const low = tpl.title.toLowerCase();
    return `${tpl.title}:\nRepaint ALL ${low} surfaces to ${hex}, including ${tpl.including}.\n\nDo not leave any matching ${low} surface unpainted.`;
  }
  const low = displayLabel.toLowerCase();
  return `${displayLabel}:\nRepaint ALL ${low} surfaces to ${hex}, including all visible ${low} surfaces.\n\nDo not leave any matching ${low} surface unpainted.`;
}

/**
 * Dựng prompt màu ĐẦY ĐỦ cho workflow data/paint-recolor-gemma-qwen.json —
 * node "35" (PrimitiveStringMultiline) nhận thẳng đoạn văn, Gemma tự refine.
 * Khối mặc định (Walls/Trim/Doors and Windows) LUÔN có mặt, giữ NGUYÊN văn
 * bản gốc của workflow; mỗi bề mặt mở rộng (mái, sàn…) hoặc đối tượng khách
 * tự thêm ở "Tự Phối Màu" (comboEditorMount) → nối thêm 1 đoạn tương ứng.
 */
function buildColorPrompt(colors, surfaces, customZones) {
  const wallsHex = normHex(colors && colors.walls && colors.walls.hex) || '#04346E';
  const trimsHex = normHex(colors && colors.trims && colors.trims.hex) || '#204A24';
  const accentHex = normHex(colors && colors.accent && colors.accent.hex) || '#E49E49';

  const blocks = [
    'Apply the following paint colors consistently to EVERY matching architectural surface throughout the entire image.\n\n'
    + `Walls:\nRepaint ALL wall surfaces to ${wallsHex}, including every interior or exterior painted wall.\n\n`
    + `Trim:\nRepaint ALL trim elements to ${trimsHex}, including moldings, casings, architraves, cornices, fascia, soffits, skirting boards, decorative trim, borders, and all painted architectural trim.\n\n`
    + `Doors and Windows:\nRepaint ALL doors and ALL windows to ${accentHex}, including every door type, every window type, door frames, window frames, sashes, mullions, transoms, shutters, casings, and all visible painted door or window components.\n\n`
    + 'Do not leave any matching surface unpainted.',
  ];

  // Bề mặt mở rộng (mái, sàn, cổng…) khách chọn thêm.
  SURFACES.forEach((def) => {
    const hex = normHex(surfaces && surfaces[def.key] && surfaces[def.key].hex);
    if (hex) blocks.push(surfaceBlock(SURFACE_ALIASES[def.key] || def.key, def.enLabel.split(' / ')[0], hex));
  });
  // Đối tượng khách tự đặt tên ở tab "Tự Phối Màu".
  (customZones || []).forEach((z) => {
    const label = z && z.label && z.label.trim();
    const hex = normHex(z && z.hex);
    if (!label || !hex) return;
    const alias = SURFACE_ALIASES[label.toLowerCase()] || label.toLowerCase();
    blocks.push(surfaceBlock(alias, label, hex));
  });

  return blocks.join('\n\n');
}

/**
 * Nạp workflow data/paint-recolor-gemma-qwen.json, điền ảnh + prompt màu,
 * sẵn sàng submit. CHỈ can thiệp node ảnh + node prompt; KHÔNG xoá/thêm node,
 * KHÔNG đụng cfg/seed/step.
 * @returns {{graph, meta}} meta={mode, daySaveNode, nightSaveNode, geometry}
 */
export function buildWorkflow(params) {
  const {
    template, imageName, colors, geometry, surfaces, customZones,
    mode = RenderMode.DAY, jobId = '',
  } = params;

  if (!template) {
    throw new AppError(ErrorCode.RENDER_FAILED, { technical: 'Workflow template chưa tải' });
  }
  const colorIssues = validateRenderColors(colors);
  if (colorIssues.length) {
    throw new AppError(ErrorCode.RENDER_FAILED, {
      technical: `Invalid render colors: ${colorIssues.join(', ')}`,
    });
  }

  const graph = JSON.parse(JSON.stringify(template));

  // Node được phép can thiệp: ảnh upload + prompt + (đọc) node kết quả.
  requireNode(graph, NODES.loadImage, 'loadImage');
  requireNode(graph, NODES.recolorPrompt, 'recolorPrompt');
  requireNode(graph, NODES.daySave, 'daySave');

  // ── Điền ảnh nguồn + prompt màu vào WORKFLOW (KHÔNG đụng cfg/seed/step) ──
  setInput(graph, NODES.loadImage, 'image', imageName);
  // Node "35" là PrimitiveStringMultiline → field "value".
  const promptNode = graph[NODES.recolorPrompt];
  const promptField = 'value' in promptNode.inputs ? 'value'
    : ('prompt' in promptNode.inputs ? 'prompt' : 'text');
  const recolored = buildColorPrompt(colors, surfaces, customZones);
  setInput(graph, NODES.recolorPrompt, promptField, recolored);

  // filename_prefix duy nhất theo job: cùng ảnh + cùng màu (seed cố định) tạo
  // prompt GIỐNG HỆT lần trước → ComfyUI cache toàn bộ graph, trả success với
  // outputs RỖNG (execution_cached) → client treo tới timeout 10 phút.
  // Đổi prefix chỉ bust cache node SaveImage: các node render vẫn dùng cache,
  // ảnh trả về tức thì và giống hệt — KHÔNG đụng seed/step/cfg.
  const stamp = (jobId || `j${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, '').slice(-24);
  for (const saveId of [NODES.daySave, NODES.nightSave]) {
    const node = saveId && graph[saveId];
    if (node && node.inputs && typeof node.inputs.filename_prefix === 'string') {
      node.inputs.filename_prefix = `${node.inputs.filename_prefix}-${stamp}`;
    }
  }

  logger.event('workflow_built', {
    mode, nodes: Object.keys(graph).length,
    colors: {
      walls: colors && colors.walls && colors.walls.hex,
      trims: colors && colors.trims && colors.trims.hex,
      accent: colors && colors.accent && colors.accent.hex,
    },
  });

  // Graph giữ NGUYÊN cấu trúc → luôn có cả nhánh ngày + đêm.
  return {
    graph,
    meta: {
      mode,
      daySaveNode: NODES.daySave, nightSaveNode: NODES.nightSave,
      geometry,
    },
  };
}

// ── ComfyUI HTTP API ───────────────────────────────────────────
export async function uploadImage(dataUrl, filename, opts = {}) {
  const comma = dataUrl.indexOf(',');
  // "data:image/png;base64" → lấy ĐÚNG mime thật của ảnh (không còn ép JPEG
  // ở image-service.js nữa — ảnh gốc có thể là PNG/WEBP, header phải khớp).
  const mime = (dataUrl.slice(5, comma).split(';')[0] || 'image/jpeg').trim();
  const b64 = dataUrl.slice(comma + 1);
  const binary = atob(b64);
  const buf = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i);
  const safeName = (filename || 'image.jpg').replace(/[^a-zA-Z0-9._-]/g, '_');
  await request(`${base()}/upload/image`, {
    method: 'POST',
    headers: { 'Content-Type': mime, 'X-Filename': safeName },
    body: buf,
    context: 'render',
    correlationId: opts.correlationId,
    retries: opts.retries,
  });
  return safeName;
}

export async function submitPrompt(graph, opts = {}) {
  const data = await request(`${base()}/prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: graph }),
    context: 'render',
    correlationId: opts.correlationId,
    retries: opts.retries ?? 0, // submit không retry mù (tránh nhân đôi job)
  });
  if (!data || !data.prompt_id) {
    throw new AppError(ErrorCode.RENDER_FAILED, { technical: 'Phản hồi /prompt thiếu prompt_id' });
  }
  return data.prompt_id;
}

export async function getHistory(promptId, opts = {}) {
  return request(`${base()}/history/${encodeURIComponent(promptId)}`, {
    method: 'GET', context: 'render', retries: 0, timeoutMs: 10000,
    correlationId: opts.correlationId,
  });
}

export async function getQueue(opts = {}) {
  try {
    return await request(`${base()}/queue`, { method: 'GET', context: 'render', retries: 0, timeoutMs: 6000, correlationId: opts.correlationId });
  } catch (_) { return null; }
}

export function viewUrl(img) {
  const qs = new URLSearchParams({
    filename: img.filename,
    subfolder: img.subfolder || '',
    type: img.type || 'output',
  });
  return `${base()}/view?${qs.toString()}`;
}

export default {
  buildWorkflow, uploadImage, submitPrompt, getHistory, getQueue, viewUrl,
};
