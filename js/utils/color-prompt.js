/* ============================================================
   color-prompt.js — Color validation helpers (HEX = source of truth)
   Pure functions, no DOM. validateRenderColors() dùng bởi api/comfyui.js.
   ============================================================ */

'use strict';

import { hexToRgb, normalizeHex } from './validation.js?v=20260707115237';

export function hexToHsl(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return { h, s: s * 100, l: l * 100 };
}

/** Hue family label for prompt disambiguation. */
export function hueFamily(hsl) {
  if (!hsl) return 'neutral';
  if (hsl.s < 8) return hsl.l >= 90 ? 'white' : (hsl.l <= 10 ? 'black' : 'neutral gray');
  const { h } = hsl;
  if (h < 15 || h >= 345) return 'red';
  if (h < 38) return 'orange';
  if (h < 66) return 'yellow / gold';
  if (h < 155) return 'green';
  if (h < 195) return 'teal / cyan';
  if (h < 255) return 'blue';
  if (h < 300) return 'purple / lavender';
  return 'pink / magenta';
}

/** Colors the model must NOT substitute for the target hue family. */
export function forbiddenSubstitutes(hsl) {
  if (!hsl || hsl.s < 8) return 'do not shift to warm beige or cool blue-gray unless target says so';
  const { h } = hsl;
  if (h >= 100 && h < 195) return 'blue, navy, teal, cyan, gray-blue';
  if (h >= 195 && h < 255) return 'green, red, orange, purple';
  if (h >= 255 && h < 300) return 'blue, green, pink, gray';
  if (h < 15 || h >= 345) return 'orange, brown, pink, blue, green';
  if (h < 66) return 'green, blue, red, gray';
  return 'opposite hue family, gray-down, or beautified palette shift';
}

/**
 * One surface paint target line for the AI prompt.
 * @param {{hex?: string}} colorObj
 * @returns {string|null}
 */
export function buildSurfaceColorSpec(colorObj) {
  const hex = normalizeHex(colorObj && colorObj.hex);
  if (!hex) return null;
  const rgb = hexToRgb(hex);
  const hsl = hexToHsl(hex);
  if (!rgb || !hsl) return null;
  const family = hueFamily(hsl);
  const forbidden = forbiddenSubstitutes(hsl);
  return (
    `MANDATORY PAINT TARGET — hex ${hex}, RGB(${rgb.r}, ${rgb.g}, ${rgb.b}), `
    + `HSL(${Math.round(hsl.h)}°, ${Math.round(hsl.s)}%, ${Math.round(hsl.l)}%). `
    + `Hue family: ${family}. `
    + `Match this exact hue; only brightness may vary with lighting and texture. `
    + `FORBIDDEN substitutes: ${forbidden}. `
    + `Numeric hex/RGB/HSL are authoritative — ignore aesthetic rebalancing.`
  );
}

/** Validate all three zones before render. */
export function validateRenderColors(colors) {
  const missing = [];
  if (!buildSurfaceColorSpec(colors && colors.walls)) missing.push('walls');
  if (!buildSurfaceColorSpec(colors && colors.trims)) missing.push('trims');
  // Cửa LUÔN được phối màu → luôn bắt buộc có màu hợp lệ.
  if (!buildSurfaceColorSpec(colors && colors.accent)) missing.push('accent');
  return missing;
}

export default {
  hexToHsl, hueFamily, forbiddenSubstitutes, buildSurfaceColorSpec, validateRenderColors,
};
