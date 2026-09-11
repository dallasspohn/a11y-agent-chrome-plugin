import {
  skipNode, isFixed, setAttr, markFixed, htmlSnippet, getSelector,
  textOf, iconNameFor, firstAriaLabel,
} from '../dom-utils.js';

export const linkName = {
  ruleId: 'link-name',
  title: 'Links and buttons must have an accessible name',
  impact: 'critical',
  wcag: '2.4.4',
  scope: 'node',
  selector: 'a[href], button',
  match(node) {
    if (skipNode(node)) return false;
    if (isFixed(node)) return false;
    if (firstAriaLabel(node)) return false;
    if (textOf(node).trim()) return false;
    // A child image already alt-labeled names the link.
    const img = node.querySelector('img');
    if (img && img.getAttribute('alt')?.trim()) return false;
    const svgTitle = node.querySelector('svg title');
    if (svgTitle && svgTitle.textContent.trim()) return false;
    return true;
  },
  fix(node) {
    const before = htmlSnippet(node);
    let name = null;
    let source = '';

    const img = node.querySelector('img');
    if (img && img.getAttribute('alt')?.trim()) { name = img.getAttribute('alt').trim(); source = 'child img alt'; }
    else {
      const svgTitle = node.querySelector('svg title');
      if (svgTitle && svgTitle.textContent.trim()) { name = svgTitle.textContent.trim(); source = 'svg title'; }
    }
    if (!name) {
      const icon = iconNameFor(node);
      if (icon) { name = icon; source = 'icon class'; }
    }
    if (!name && node.tagName === 'A' && node.href) {
      try {
        const url = new URL(node.href, location.href);
        if (/^https?:$/.test(url.protocol)) {
          name = url.hostname.replace(/^www\./, '') || url.pathname.replace(/^\/+/, '').split('/')[0] || null;
          source = 'external hostname';
        }
      } catch { /* invalid href */ }
    }
    if (!name) {
      name = node.tagName === 'BUTTON' ? 'Unlabeled button' : 'Unlabeled link';
      source = 'generic placeholder';
    }
    if (name.length > 120) name = name.slice(0, 120);

    setAttr(node, 'aria-label', name);
    markFixed(node, 'link-name');
    return { before, after: htmlSnippet(node), source };
  },
};