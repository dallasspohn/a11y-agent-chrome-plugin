import {
  skipNode, isFixed, setAttr, markFixed, htmlSnippet, textOf,
} from '../dom-utils.js';

export const frameTitle = {
  ruleId: 'frame-title',
  title: 'Frames and iframes must have titles',
  impact: 'serious',
  wcag: '2.4.1',
  scope: 'node',
  selector: 'iframe[src], frame[src]',
  match(node) {
    if (!(node instanceof HTMLIFrameElement) && !(node instanceof HTMLFrameElement)) return false;
    if (skipNode(node)) return false;
    if (isFixed(node)) return false;
    if (node.getAttribute('title')?.trim()) return false;
    if (node.getAttribute('aria-label')?.trim()) return false;
    if (node.hasAttribute('aria-labelledby')) return false;
    return true;
  },
  fix(node) {
    const before = htmlSnippet(node);
    let name = '';
    try {
      const url = new URL(node.getAttribute('src'), location.href);
      name = url.hostname.replace(/^www\./, '') || url.pathname.replace(/^\/+/, '') || '';
    } catch { /* relative files */ }
    if (!name) name = 'Embedded content';
    name = name.slice(0, 80);

    setAttr(node, 'title', name);
    markFixed(node, 'frame-title');
    return {
      before,
      after: htmlSnippet(node),
      source: `title from src ${name}`,
    };
  },
};