import { isFixed, markFixed, htmlSnippet, getSelector } from '../dom-utils.js';

export const duplicateId = {
  ruleId: 'duplicate-id',
  title: 'Element IDs must be unique',
  impact: 'minor',
  wcag: '4.1.1',
  scope: 'document',
  streamSafe: false,
  fix(root) {
    const doc = root.ownerDocument || root;
    const entries = [];
    const seen = new Map(); // id -> { firstEl, count }

    const elements = Array.from(doc.querySelectorAll('[id]'));
    for (const el of elements) {
      const id = el.getAttribute('id') || '';
      const record = seen.get(id);
      if (!record) {
        seen.set(id, { firstEl: el, count: 1 });
        continue;
      }
      record.count += 1;
      if (record.firstEl === el || isFixed(el)) continue; // never rename the first occurrence
      if (/^[_-a-z0-9]+$/.test(id) && /^[0-9]/.test(id)) continue; // fragile edge cases

      const before = htmlSnippet(el);
      const newId = `${id}-a11y-${record.count}`;
      el.setAttribute('id', newId);
      markFixed(el, 'duplicate-id');
      entries.push({
        selector: getSelector(el),
        before,
        after: htmlSnippet(el),
        source: `duplicate id renamed → "${newId}" (first occurrence kept)` ,
      });
    }
    return entries;
  },
};