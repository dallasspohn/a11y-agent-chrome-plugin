// Pure WCAG color math — no DOM access, unit-testable in Node.
// sRGB linearization, relative luminance, contrast ratio, and HSL-lightness
// stepping used by the color-contrast fixer.

export const NAMED_COLORS = {
  black: [0, 0, 0], silver: [192, 192, 192], gray: [128, 128, 128], grey: [128, 128, 128],
  white: [255, 255, 255], maroon: [128, 0, 0], red: [255, 0, 0], purple: [128, 0, 128],
  fuchsia: [255, 0, 255], magenta: [255, 0, 255], green: [0, 128, 0], lime: [0, 255, 0],
  olive: [128, 128, 0], yellow: [255, 255, 0], navy: [0, 0, 128], blue: [0, 0, 255],
  teal: [0, 128, 128], aqua: [0, 255, 255], cyan: [0, 255, 255], orange: [255, 165, 0],
  brown: [165, 42, 42], crimson: [220, 20, 60], darkgray: [169, 169, 169],
  darkgrey: [169, 169, 169], darkgreen: [0, 100, 0], darkblue: [0, 0, 139],
  darkRed: [139, 0, 0], darkred: [139, 0, 0], gold: [255, 215, 0], indigo: [75, 0, 130],
  khaki: [240, 230, 140], lightgray: [211, 211, 211], lightgrey: [211, 211, 211],
  lightgreen: [144, 238, 144], lightblue: [173, 216, 230], pink: [255, 192, 203],
  plum: [221, 160, 221], salmon: [250, 128, 114], sienna: [160, 82, 45],
  tan: [210, 180, 140], turquoise: [64, 224, 208], violet: [238, 130, 238],
};

function clamp01(n) {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

export const CHANNEL = { RED: 0, GREEN: 1, BLUE: 2 };

/**
 * Parse a CSS color string into an opaque {r,g,b} (0-255) or null when it
 * cannot be resolved (gradients, color(), currentColor, transparent, unknown).
 */
export function parseColor(str) {
  if (typeof str !== 'string') return null;
  let s = str.trim().toLowerCase();
  if (!s || s === 'transparent' || s === 'currentcolor') return null;
  if (s.startsWith('#')) {
    const hex = s.slice(1);
    if (/^[0-9a-f]{3}$/.test(hex)) return hexToRgb(hex.split('').map((c) => c + c).join(''));
    if (/^[0-9a-f]{6}$/.test(hex)) return hexToRgb(hex);
    if (/^[0-9a-f]{4}$/.test(hex)) return blendAlpha(hexToRgb(hex.slice(0, 3)), 0xffffffff, parseInt(hex.slice(3, 4) + hex.slice(3, 4), 16));
    if (/^[0-9a-f]{8}$/.test(hex)) return blendAlpha(hexToRgb(hex.slice(0, 6)), 0xffffffff, parseInt(hex.slice(6, 8), 16));
    return null;
  }
  if (s.startsWith('rgb')) {
    const parts = s.match(/-?\d+(?:\.\d+)?/g);
    if (!parts) return null;
    const [r, g, b, a] = parts.map(Number);
    const alpha = a === undefined ? 1 : a;
    if (alpha === 0) return null;
    // rgba() color is alpha-blended over white for a solid approximation.
    if (alpha < 1) return { r: Math.round(r * alpha + 255 * (1 - alpha)), g: Math.round(g * alpha + 255 * (1 - alpha)), b: Math.round(b * alpha + 255 * (1 - alpha)) };
    return { r, g, b };
  }
  if (NAMED_COLORS[s]) {
    const [r, g, b] = NAMED_COLORS[s];
    return { r, g, b };
  }
  return null; // gradient(), color(srgb ...), hsl(), etc.
}

function hexToRgb(hex) {
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  };
}

function blendAlpha(fg, bgRgb, alpha) {
  const mix = (f, b) => Math.round(b + (f - b) * (alpha / 255));
  return { r: mix(fg.r, (bgRgb >> 16) & 0xff), g: mix(fg.g, (bgRgb >> 8) & 0xff), b: mix(fg.b, bgRgb & 0xff) };
}

/** Convert a 0-255 sRGB channel to its linear (0-1) value. */
export function srgbToLinear(c) {
  const n = c / 255;
  return n <= 0.04045 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4);
}

/** WCAG relative luminance for an {r,g,b} 0-255 color. */
export function relativeLuminance({ r, g, b }) {
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

/** WCAG contrast ratio between two {r,g,b} colors (always >= 1). */
export function contrastRatio(a, b) {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

/** Parse a "#ffffff" color string and return its {r,g,b}. Convenience for tests. */
export function hexToRgbObj(hex) {
  return hexToRgb(hex.replace('#', '').slice(0, 6));
}

export function rgbToHsl({ r, g, b }) {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;
  return { h, s, l };
}

export function hslToRgb({ h, s, l }) {
  if (s === 0) {
    const v = Math.round(l * 255);
    return { r: v, g: v, b: v };
  }
  const hue2rgb = (p, q, t) => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return {
    r: Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    g: Math.round(hue2rgb(p, q, h) * 255),
    b: Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  };
}

/**
 * Adjust `fg` until its contrast against `bg` meets `target`. Preserves hue and
 * saturation of the foreground; steps lightness toward the pole farther from
 * the background luminance first (2% increments), falling back to the nearer
 * pole when the favored direction can't reach the target (near-mid backgrounds).
 * Returns the adjusted {r,g,b}.
 */
export function raiseContrast(fg, bg, target) {
  const hsl = rgbToHsl(fg);
  const bgLum = relativeLuminance(bg);
  const directions = bgLum < 0.5 ? [1, -1] : [-1, 1]; // farther pole first, then nearer

  for (const dir of directions) {
    for (let step = 1; step <= 60; step++) {
      const l = clamp01(hsl.l + dir * 0.02 * step);
      const candidate = hslToRgb({ h: hsl.h, s: hsl.s, l });
      if (contrastRatio(candidate, bg) >= target) return candidate;
      if ((dir === 1 && l >= 1) || (dir === -1 && l <= 0)) break;
    }
  }
  // Degenerate background: pick the pole with better contrast.
  const white = { r: 255, g: 255, b: 255 };
  const black = { r: 0, g: 0, b: 0 };
  return contrastRatio(white, bg) >= contrastRatio(black, bg) ? white : black;
}

export function cssRgb({ r, g, b }) {
  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
}