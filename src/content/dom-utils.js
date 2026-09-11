// DOM helpers shared by the fixers. Pure-ish (only operate on passed nodes),
// kept free of any chrome.* APIs so they are testable in Node with a stub DOM.

export const FIXED_ATTR = 'data-a11y-fixed';
const ORIG_PREFIX = 'data-a11y-orig-';
const DOC_RE = /^document$/i;
const DAYS = /^__|^_|^-|-$/;

export function cssEscape(s) {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    try { return CSS.escape(s); } catch { /* fall through */ }
  }
  return String(s).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
}

/** True when the node should be left alone entirely. */
export function skipNode(el) {
  if (!(el instanceof Node)) return true;
  if (el.getAttribute?.('aria-hidden') === 'true') return true;
  if (el.closest?.('[contenteditable="true"], [contenteditable="plaintext-only"], template')) return true;
  // aria-hidden on an ancestor absconds this node's subtree from the a11y tree.
  const hiddenAncestor = el.closest?.('[aria-hidden="true"]');
  return Boolean(hiddenAncestor);
}

export function isFixed(el) {
  return el?.getAttribute?.(FIXED_ATTR) != null;
}

export function markFixed(el, ruleId) {
  el.setAttribute(FIXED_ATTR, ruleId);
}

/**
 * Remember the element's current `attr` value so "revert all" can restore it.
 * Returns the previous value (or null when unset).
 */
export function stashOriginal(el, attr) {
  const was = el.getAttribute(attr);
  const key = ORIG_PREFIX + attr
    .replace(/-(.)/g, (_, c) => c.toUpperCase());
  if (el.getAttribute(key) === null) {
    el.setAttribute(key, was === null ? '' : was);
  }
  return was;
}

export function setAttr(el, attr, value) {
  stashOriginal(el, attr);
  el.setAttribute(attr, value);
}

export function setInlineCssProp(el, prop, value, important = true) {
  const full = `${prop}: ${value}${important ? ' !important' : ''};`;
  const now = el.getAttribute('style') || '';
  stashOriginal(el, 'style');
  if (!now.includes(full)) {
    let style = now.replace(new RegExp(`${prop}\\s*:[^;]*;?`, 'g'), '');
    if (style && !style.endsWith(';')) style += ';';
    el.setAttribute('style', `${style}${full}`);
  }
}

/** Stable-ish CSS selector for reports. Guaranteed unique in practice. */
export function getSelector(node) {
  if (!node) return '';
  if (node.nodeType === Node.DOCUMENT_NODE) return 'html';
  if (node.nodeType === Node.DOCUMENT_TYPE_NODE) return 'html';
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return getSelector(node.parentElement) + ' > ' + String(node.nodeName).toLowerCase();
  }
  const el = node;
  const parts = [];
  let current = el;
  while (current && current !== current.ownerDocument?.documentElement?.parentNode) {
    if (current.nodeType !== Node.ELEMENT_NODE) { current = current.parentElement; continue; }
    if (current === current.ownerDocument?.documentElement) { parts.unshift('html'); break; }
    let piece = current.tagName.toLowerCase();
    const id = current.getAttribute('id');
    const cls = Array.from(current.classList || []).slice(0, 3).map(c => '.' + cssEscape(c)).join('');
    if (current.classList?.length) piece += cls;
    else if (id) piece += '#' + cssEscape(id);
    else if (current.parentElement) {
      const sib = current.parentElement.children;
      let index = 1;
      for (let i = 0; i < sib.length; i++) {
        if (sib[i] === current) break;
        if (sib[i].tagName === current.tagName) index++;
      }
      if (index > 1) piece += `:nth-of-type(${index})`;
    }
    parts.unshift(piece);
    if (id) break;
    current = current.parentElement;
  }
  return parts.join(' > ');
}

/** Short HTML snippet (before/after) for the report. */
export function htmlSnippet(el) {
  let html = '';
  try {
    html = el.outerHTML || el.nodeValue || '';
  } catch { return ''; }
  const one = html.replace(/\s+/g, ' ').trim();
  return one.length > 240 ? one.slice(0, 240) + '…' : one;
}

/** True when the element has non-whitespace text directly inside it. */
export function hasDirectText(el) {
  for (const child of el.childNodes) {
    if (child.nodeType === Node.TEXT_NODE && child.textContent.trim()) return true;
  }
  return false;
}

export function textOf(el) {
  return (el.textContent || '').trim();
}

/** Visible in the a11y sense (display/visibility only — layout metrics are unreliable pre-paint). */
export function visuallyRendered(el) {
  const cs = getComputedStyle(el);
  return cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) !== 0;
}

/**
 * Clean a filename-ish src into alt text: strip query/hash, take the last path
 * segment, drop the extension, split on [-_.], keep 3+ letter alphabetic words
 * that are not hashes/UUIDs. Returns null when nothing usable.
 */
export function cleanedFilename(src) {
  if (!src || typeof src !== 'string') return null;
  const withoutQuery = src.split(/[?#]/)[0];
  let seg = decodeURIComponent(withoutQuery.split('/').pop() || '');
  if (!seg) return null;
  seg = seg.replace(/\.[a-z0-9]{1,5}$/i, '');
  const tokens = seg.split(/[-_.~+]+/).filter(Boolean);
  const words = tokens.filter((t) => /^[a-zA-Z]{3,}$/.test(t) && !/^[0-9a-f]{32}$/i.test(t) && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t));
  if (words.length === 0) return null;
  return words.map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
}

/** Humanize a form field name: first_name / firstName -> "First name". */
export function humanizeName(name) {
  if (!name || typeof name !== 'string') return null;
  let s = name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) return null;
  s = s.charAt(0).toUpperCase() + s.slice(1);
  return s;
}

/** Look up an icon-class accessible name for an element. */
export function iconNameFor(el) {
  const tokens = Array.from(el.classList || []);
  return iconName(tokens);
}

import { iconName } from './icon-map.js';

/**
 * The nearest text node(s) that visually precede an input/select/textarea and
 * plausibly label it. Walks previous siblings, then the parent's structure.
 */
export function findPrecedingText(el) {
  let node = el;
  while (node) {
    let sib = node.previousElementSibling;
    while (sib) {
      const text = textOf(sib);
      if (text && text.length <= 80 && !sib.matches('script, style, br')) return text;
      sib = sib.previousElementSibling;
    }
    // Search the parent's previous non-empty child elements one level up.
    const parent = node.parentElement;
    if (!parent || parent === document.body || parent === document.documentElement) break;
    node = parent;
  }
  return null;
}

/** Returns the first qualifying alt/name candidate in priority order. */
export function resolveTextSource(src) {
  return src && typeof src === 'string' && src.trim() ? src.trim().slice(0, 120) : null;
}

/** Safely read a node's accessible name candidates string. */
export function firstAriaLabel(el) {
  const direct = el.getAttribute?.('aria-label');
  if (direct && direct.trim()) return direct;
  const labelledby = el.getAttribute?.('aria-labelledby');
  if (labelledby) {
    const ids = labelledby.split(/\s+/);
    for (const id of ids) {
      const ref = el.ownerDocument?.getElementById(id);
      if (ref && textOf(ref)) return textOf(ref);
    }
  }
  if (el.title?.trim()) return el.title.trim();
  const nodeLabel = el.labels && Array.from(el.labels).map(textOf).find(Boolean);
  return nodeLabel || null;
}

const BLOCK_EL = /(^div$|^p$|^li$|^section$|^article$|^header$|^footer$|^aside$|^main$|^nav$|^table$|^td$)/i;

/** Large-text threshold (AA 3:1) vs normal 4.5:1. */
export function contrastTargetFor(cs) {
  const size = parseFloat(cs.fontSize) || 0;
  const weight = Number(cs.fontWeight) || 400;
  const large = size >= 24 || (size >= 18.66 && weight >= 700);
  return large ? 3 : 4.5;
}