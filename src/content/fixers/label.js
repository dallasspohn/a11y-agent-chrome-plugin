import {
  skipNode, isFixed, setAttr, markFixed, htmlSnippet, getSelector,
  cssEscape, humanizeName, findPrecedingText,
} from '../dom-utils.js';

const SKIP_TYPES = new Set(['hidden', 'submit', 'button', 'reset', 'image', 'file']);

export const label = {
  ruleId: 'label',
  // axe ≥4.4 reports unnamed <select> elements under its own rule id.
  aliases: ['select-name'],
  title: 'Form fields must have labels',
  impact: 'serious',
  wcag: '4.1.2',
  scope: 'node',
  selector: 'input, select, textarea',
  match(node) {
    if (!(node instanceof HTMLElement)) return false;
    if (skipNode(node)) return false;
    if (isFixed(node)) return false;
    const type = (node.getAttribute('type') || 'text').toLowerCase();
    if (SKIP_TYPES.has(type)) return false;
    if (node.hasAttribute('aria-label') || node.hasAttribute('aria-labelledby')) return false;
    if (node.getAttribute('title')?.trim()) return false;
    if (node.id && node.ownerDocument.querySelector(`label[for="${cssEscape(node.id)}"]`)) return false;
    if (node.closest('label')) return false;
    return true;
  },
  fix(node) {
    const before = htmlSnippet(node);
    let name = null;
    let source = '';

    const placeholder = node.getAttribute('placeholder');
    const title = node.getAttribute('title');
    const fieldName = node.getAttribute('name');

    if (placeholder && placeholder.trim()) { name = placeholder.trim(); source = 'placeholder'; }
    else if (title && title.trim()) { name = title.trim(); source = 'title'; }
    else if (fieldName && humanizeName(fieldName)) { name = humanizeName(fieldName); source = `name → "${name}"`; }
    else {
      const preceding = findPrecedingText(node);
      if (preceding) { name = preceding; source = 'preceding text'; }
    }
    if (!name) { name = `Unlabeled ${node.tagName.toLowerCase()} field`; source = 'generic placeholder'; }
    if (name.length > 120) name = name.slice(0, 120);

    setAttr(node, 'aria-label', name);
    markFixed(node, 'label');
    return { before, after: htmlSnippet(node), source };
  },
};