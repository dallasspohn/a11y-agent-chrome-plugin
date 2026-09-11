import {
  skipNode, isFixed, setAttr, markFixed, htmlSnippet, getSelector,
  cleanedFilename, textOf,
} from '../dom-utils.js';

function svgAccessibleName(el) {
  const direct = el.getAttribute('aria-label');
  if (direct && direct.trim()) return direct;
  const labelledby = el.getAttribute('aria-labelledby');
  if (labelledby) {
    const ref = el.ownerDocument?.getElementById(labelledby.split(/\s+/)[0]);
    if (ref?.textContent.trim()) return ref.textContent.trim();
  }
  const title = el.querySelector('title');
  if (title?.textContent.trim()) return title.textContent.trim();
  const desc = el.querySelector('desc');
  if (desc?.textContent.trim()) return desc.textContent.trim();
  return null;
}

function isDecorative(el) {
  const tag = el.tagName.toLowerCase();
  if (tag !== 'img') return false;
  // Inside a link with accessible text -> the image is decorative chrome.
  const link = el.closest('a[href]');
  if (link && link.getAttribute('aria-label') === null) {
    const text = Array.from(link.childNodes)
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent.trim())
      .join('');
    const otherImgs = Array.from(link.querySelectorAll('img')).filter((i) => i !== el && i.getAttribute('alt')?.trim());
    if (text.trim() || otherImgs.length > 0) return true;
  }
  // Decoratively tiny images.
  const w = parseFloat(el.getAttribute('width')) || 0;
  const h = parseFloat(el.getAttribute('height')) || 0;
  if (w > 0 && h > 0 && w <= 1 && h <= 1) return true;
  const src = (el.getAttribute('src') || '').toLowerCase();
  if (/spacer|shim|pixel|blank|clear|transparent/.test(src) && /\.(gif|png)$/.test(src)) return true;
  return false;
}

function figcaptionFor(el) {
  let parent = el.parentElement;
  for (let depth = 0; parent && depth < 4; parent = parent.parentElement, depth++) {
    const caption = parent.querySelector(':scope > figcaption');
    if (caption && textOf(caption)) return textOf(caption);
  }
  return null;
}

function fileNameFrom(el) {
  const src = el.getAttribute('src') || el.getAttribute('href') || '';
  if (/^data:/i.test(src)) return null;
  return cleanedFilename(src);
}

export const imageAlt = {
  ruleId: 'image-alt',
  title: 'Images must have alternate text',
  impact: 'serious',
  wcag: '1.1.1',
  scope: 'node',
  selector: 'img, input[type="image"], svg',
  match(node) {
    if (skipNode(node)) return false;
    if (isFixed(node)) return false;
    if (node.tagName === 'SVG' || node.matches('svg')) {
      return !svgAccessibleName(node);
    }
    // alt="" is a valid decorative choice; any alt satisfies the rule.
    if (node.hasAttribute('alt')) return false;
    // title / aria-label / aria-labelledby / role=presentation also name it.
    if (node.hasAttribute('aria-label') || node.hasAttribute('aria-labelledby')) return false;
    if (node.getAttribute('role') === 'presentation') return false;
    if (node.getAttribute('title')?.trim()) return false;
    return true;
  },
  fix(node, ctx) {
    const before = htmlSnippet(node);
    if (isDecorative(node)) {
      setAttr(node, 'alt', '');
      node.setAttribute('role', 'presentation');
      markFixed(node, 'image-alt');
      return { before, after: htmlSnippet(node), source: 'decorative image marked presentation' };
    }

    let name = null;
    let source = '';
    const caption = figcaptionFor(node);
    const fileName = fileNameFrom(node);
    const placeholder = ctx.options?.placeholderAlt || 'Image: missing description';

    if (caption) { name = caption; source = 'figcaption'; }
    else if (fileName) { name = fileName; source = 'cleaned filename'; }
    else { name = placeholder; source = `placeholder (${placeholder})`; }

    setAttr(node, 'alt', name);
    markFixed(node, 'image-alt');

    // Optional AI description: fire-and-forget, applied after the deterministic
    // fix, never for data: URIs, never sending image bytes.
    if (ctx.options?.aiAlt?.enabled && ctx.requestAiAlt) {
      const src = node.getAttribute('src') || '';
      if (!/^data:/i.test(src) && node.tagName.toLowerCase() === 'img') {
        ctx.requestAiAlt({
          node,
          src,
          surroundingText: ctx.surroundingTextFor?.(node) || '',
          pageTitle: (typeof document !== 'undefined' && document.title) || '',
        }).catch?.(() => {});
      }
    }

    return { before, after: htmlSnippet(node), source };
  },
};