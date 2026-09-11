import { describe, it, expect } from 'vitest';
import {
  hexToRgbObj, contrastRatio, relativeLuminance, raiseContrast, cssRgb,
  parseColor, srgbToLinear, rgbToHsl, hslToRgb,
} from '../../src/content/contrast-math.js';

const WHITE = hexToRgbObj('#ffffff');
const BLACK = hexToRgbObj('#000000');

describe('relativeLuminance', () => {
  it('computes WCAG linear luminance', () => {
    expect(relativeLuminance(WHITE)).toBeCloseTo(1, 5);
    expect(relativeLuminance(BLACK)).toBeCloseTo(0, 5);
    // Pure red: 0.2126
    expect(relativeLuminance({ r: 255, g: 0, b: 0 })).toBeCloseTo(0.2126, 4);
  });

  it('linearizes sRGB channels correctly', () => {
    expect(srgbToLinear(255)).toBeCloseTo(1, 5);
    expect(srgbToLinear(0)).toBeCloseTo(0, 5);
    expect(srgbToLinear(128)).toBeCloseTo(0.21586, 4);
  });
});

describe('contrastRatio', () => {
  it('returns 21:1 for black on white', () => {
    expect(contrastRatio(BLACK, WHITE)).toBeCloseTo(21, 1);
  });

  it('returns 1:1 for identical colors', () => {
    expect(contrastRatio(WHITE, WHITE)).toBeCloseTo(1, 5);
  });

  // Spec: #777 on #fff must FAIL 4.5:1 (4.48)
  it('#777 on #fff = 4.48:1 (fails AA)', () => {
    expect(contrastRatio(hexToRgbObj('#777777'), WHITE)).toBeCloseTo(4.48, 2);
  });

  // Spec: #767676 on #fff must PASS 4.5:1 (4.54)
  it('#767676 on #fff = 4.54:1 (passes AA)', () => {
    expect(contrastRatio(hexToRgbObj('#767676'), WHITE)).toBeCloseTo(4.54, 2);
  });
});

describe('raiseContrast', () => {
  it('darkens a light gray on white to meet 4.5:1', () => {
    const out = raiseContrast(hexToRgbObj('#aaaaaa'), WHITE, 4.5);
    expect(contrastRatio(out, WHITE)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(out, WHITE)).toBeLessThan(5.2);
  });

  it('lightens dark text on a dark background to meet 4.5:1', () => {
    const out = raiseContrast(hexToRgbObj('#222222'), hexToRgbObj('#111111'), 4.5);
    expect(contrastRatio(out, hexToRgbObj('#111111'))).toBeGreaterThanOrEqual(4.5);
  });

  it('reaches a pole when the background is mid-gray', () => {
    const out = raiseContrast(hexToRgbObj('#777777'), hexToRgbObj('#808080'), 4.5);
    expect(contrastRatio(out, hexToRgbObj('#808080'))).toBeGreaterThanOrEqual(4.5);
  });

  it('preserves hue and saturation', () => {
    const fg = hexToRgbObj('#3366cc');
    const out = raiseContrast(fg, WHITE, 4.5);
    const fgHsl = rgbToHsl(fg);
    const outHsl = rgbToHsl(out);
    expect(outHsl.h).toBeCloseTo(fgHsl.h, 4);
    expect(outHsl.s).toBeCloseTo(fgHsl.s, 3);
  });
});

describe('parseColor', () => {
  it('parses hex, short hex, rgb(), and named colors', () => {
    expect(parseColor('#ff6347')).toEqual({ r: 255, g: 99, b: 71 });
    expect(parseColor('#f63')).toEqual({ r: 255, g: 102, b: 51 });
    expect(parseColor('rgb(10, 20, 30)')).toEqual({ r: 10, g: 20, b: 30 });
    expect(parseColor('white')).toEqual({ r: 255, g: 255, b: 255 });
    expect(parseColor('rgba(255, 0, 0, 0.5)')).toEqual({ r: 255, g: 128, b: 128 });
  });

  it('rejects gradients, currentColor, transparent, and garbage', () => {
    expect(parseColor('linear-gradient(#fff, #000)')).toBeNull();
    expect(parseColor('currentColor')).toBeNull();
    expect(parseColor('transparent')).toBeNull();
    expect(parseColor('rgba(0,0,0,0)')).toBeNull();
    expect(parseColor('')).toBeNull();
  });
});

describe('rotate-through conversions', () => {
  it('rgb -> hsl -> rgb round trips', () => {
    for (const c of [
      { r: 51, g: 102, b: 204 },
      { r: 200, g: 30, b: 30 },
      { r: 20, g: 200, b: 150 },
      { r: 128, g: 128, b: 128 },
    ]) {
      const out = hslToRgb(rgbToHsl(c));
      for (const k of ['r', 'g', 'b']) expect(out[k]).toBeCloseTo(c[k], 0);
    }
  });

  it('formats css color strings', () => {
    expect(cssRgb({ r: 1.2, g: 2.3, b: 3.4 })).toBe('rgb(1, 2, 3)');
  });
});