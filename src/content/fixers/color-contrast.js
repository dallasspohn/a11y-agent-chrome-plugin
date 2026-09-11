import {
  skipNode, isFixed, setInlineCssProp, markFixed, htmlSnippet,
  hasDirectText, visuallyRendered, contrastTargetFor,
} from '../dom-utils.js';
import { parseColor, contrastRatio, raiseContrast, cssRgb } from '../contrast-math.js';

const SKIP_SELECTOR = [
  'img', 'svg', 'picture', 'canvas', 'video', 'audio', 'input', 'textarea',
  'select', 'option', 'optgroup', 'script', 'style', 'noscript', 'template',
  'br', 'hr', 'iframe', 'object', 'embed', 'math', 'area',
].join(', ');

/** Resolve an element's effective background color walking up the tree. */
export function resolveBackground(el) {
  let node = el;
  while (node && node.nodeType === Node.ELEMENT_NODE) {
    let cs;
    try { cs = getComputedStyle(node); } catch { return null; }
    const bgImage = cs.backgroundImage;
    if (bgImage && bgImage !== 'none') {
      return { skip: true, reason: `${node.tagName.toLowerCase()} has background-image/gradient` };
    }
    const bg = parseColor(cs.backgroundColor);
    if (bg) return { bg };
    if (node === node.ownerDocument.documentElement) break;
    node = node.parentElement;
  }
  // Assume white at the document root.
  return { bg: { r: 255, g: 255, b: 255 } };
}

export const colorContrast = {
  ruleId: 'color-contrast',
  title: 'Text must have sufficient color contrast',
  impact: 'serious',
  wcag: '1.4.3',
  scope: 'node',
  selector: '*',
  streamSafe: true,
  match(node) {
    if (skipNode(node)) return false;
    if (isFixed(node)) return false;
    if (!(node instanceof HTMLElement)) return false;
    if (node.matches(SKIP_SELECTOR)) return false;
    if (node.matches('a, [role="link"]')) return false; // link color must stay distinguishable
    if (!hasDirectText(node)) return false;
    if (!visuallyRendered(node)) return false;
    const bg = resolveBackground(node);
    if (!bg || bg.skip || !bg.bg) return false;
    const fg = parseColor(getComputedStyle(node).color);
    if (!fg) return false;
    // Candidate check only: fix() re-checks against the size-specific target
    // (3:1 for large text), so a generous 4.5:1 gate is safe and correct.
    return contrastRatio(fg, bg.bg) < 4.5;
  },
  fix(node, ctx) {
    const before = htmlSnippet(node);
    const cs = getComputedStyle(node);
    const fg = parseColor(cs.color);
    if (!fg) return null;
    const bg = resolveBackground(node);
    if (!bg || bg.skip || !bg.bg) return null;

    const targetBase = contrastTargetFor(cs);
    const target = ctx.options?.contrastTarget === 'AAA' ? (targetBase === 3 ? 4.5 : 7) : targetBase;
    const ratio = contrastRatio(fg, bg.bg);
    if (ratio >= target) return null;

    const adjusted = raiseContrast(fg, bg.bg, target);
    if (cssRgb(adjusted) === cs.color) return null;

    setInlineCssProp(node, 'color', cssRgb(adjusted), true);
    markFixed(node, 'color-contrast');
    const after = htmlSnippet(node);
    const newRatio = contrastRatio(adjusted, bg.bg);
    return {
      before,
      after,
      source: `${ratio.toFixed(2)}:1 → ${newRatio.toFixed(2)}:1 (target ${target}:1)`,
    };
  },
};