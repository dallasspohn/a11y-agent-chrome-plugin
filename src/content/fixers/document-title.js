import { textOf } from '../dom-utils.js';

export const documentTitle = {
  ruleId: 'document-title',
  title: 'Page must have a title',
  impact: 'minor',
  wcag: '2.4.2',
  scope: 'document',
  streamSafe: false,
  fix(root) {
    const doc = root.ownerDocument || root;
    if ((doc.title || '').trim()) return [];

    let name = '';
    const h1 = doc.querySelector('h1, [role="heading"][aria-level="1"]');
    if (h1 && textOf(h1)) name = textOf(h1);
    else if (typeof location !== 'undefined' && location.hostname) name = location.hostname;
    else name = doc.title;
    if (!name) return [];

    const before = doc.title;
    doc.title = name.slice(0, 200);
    return [{
      selector: 'title',
      before,
      after: doc.title,
      source: `title from ${h1 ? 'first h1' : 'hostname'}`,
    }];
  },
};