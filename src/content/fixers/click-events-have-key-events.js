import {
  skipNode, isFixed, setAttr, markFixed, htmlSnippet, getSelector,
  textOf, iconNameFor, firstAriaLabel, FIXED_ATTR,
} from '../dom-utils.js';

// Native interactive elements — never add click/key handling to these.
const INTERACTIVE = new Set([
  'a', 'button', 'input', 'select', 'textarea', 'label', 'summary', 'details',
  'option', 'optgroup', 'audio', 'video', 'iframe', 'object', 'embed',
  'area', 'datalist', 'menuitem', 'meter', 'progress',
]);

const keyHandlers = new WeakMap();

function handleKey(event) {
  const el = event.currentTarget;
  const key = event.key;
  if (key !== 'Enter' && key !== ' ') return;
  event.preventDefault();
  el.click();
}

function registerKeyHandler(el) {
  if (keyHandlers.has(el)) return;
  const listener = handleKey;
  keyHandlers.set(el, listener);
  el.addEventListener('keydown', listener);
}

function releaseKeyHandler(el) {
  const listener = keyHandlers.get(el);
  if (listener) {
    el.removeEventListener('keydown', listener);
    keyHandlers.delete(el);
  }
}

export const clickEventsHaveKeyEvents = {
  ruleId: 'click-events-have-key-events',
  title: 'Clickable elements must be keyboard operable',
  impact: 'serious',
  wcag: '2.1.1',
  scope: 'node',
  selector: '[onclick], [onmouseup], [onmousedown]',
  match(node) {
    if (!(node instanceof HTMLElement)) return false;
    if (skipNode(node)) return false;
    if (isFixed(node)) return false;
    const tag = node.tagName.toLowerCase();
    if (INTERACTIVE.has(tag)) return false;
    if (node.hasAttribute('tabindex') || node.hasAttribute('role')) return false;
    if (node.getAttribute('contenteditable') === 'true') return false;

    const hasHandler = node.hasAttribute('onclick') || node.hasAttribute('onmousedown') || node.hasAttribute('onmouseup');
    let pointer = false;
    try { pointer = getComputedStyle(node).cursor === 'pointer'; } catch { /* off-DOM nodes */ }
    if (!hasHandler && !pointer) return false;
    if (node.closest('a[href], button, input, select, textarea, summary')) return false;
    return true;
  },
  fix(node) {
    const before = htmlSnippet(node);
    setAttr(node, 'role', 'button');
    setAttr(node, 'tabindex', '0');
    registerKeyHandler(node);

    let source = 'role="button" + tabindex="0" + keydown (Enter/Space)';
    if (!textOf(node) && !firstAriaLabel(node)) {
      const icon = iconNameFor(node);
      setAttr(node, 'aria-label', icon || 'Unlabeled button');
      if (icon) source += '; aria-label from icon class';
      else source += '; aria-label placeholder';
    }
    markFixed(node, 'click-events-have-key-events');
    return { before, after: htmlSnippet(node), source };
  },
};

export function releaseAllKeyHandlers(root) {
  (root || document).querySelectorAll(`[${FIXED_ATTR}]`).forEach(releaseKeyHandler);
}