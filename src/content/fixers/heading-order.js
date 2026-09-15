import {
  skipNode, isFixed, markFixed, htmlSnippet, getSelector, setAttr,
} from '../dom-utils.js';

function levelOf(el) {
  const attr = el.getAttribute('aria-level');
  const fromAttr = attr ? parseInt(attr, 10) : NaN;
  if (Number.isInteger(fromAttr) && fromAttr > 0) return fromAttr;
  const m = /^H([1-6])$/.exec(el.tagName);
  return m ? Number(m[1]) : NaN;
}

export const headingOrder = {
  ruleId: 'heading-order',
  title: 'Heading levels must increase by one',
  impact: 'moderate',
  wcag: '1.3.1',
  scope: 'document',
  streamSafe: false,
  fix(root) {
    const doc = root.ownerDocument || root;
    const headings = Array.from(doc.querySelectorAll('h1, h2, h3, h4, h5, h6, [role="heading"]'))
      .filter((h) => !skipNode(h) && h instanceof HTMLElement);
    if (headings.length === 0) return [];

    const entries = [];
    let prev = 0;

    for (const el of headings) {
      const level = levelOf(el);
      const expected = prev === 0 ? 1 : prev + 1;

      if (level > expected) {
        const before = htmlSnippet(el);
        markFixed(el, 'heading-order');
        if (el.getAttribute('role') !== 'heading') setAttr(el, 'role', 'heading');
        const corrected = prev === 0 ? 1 : expected;
        setAttr(el, 'aria-level', String(corrected));
        entries.push({
          selector: getSelector(el),
          before,
          after: htmlSnippet(el),
          source: prev === 0 ? 'missing h1; first heading → aria-level 1' : `h${level} → aria-level ${corrected}`,
        });
        prev = corrected;
      } else {
        prev = level;
      }
    }
    return entries;
  },
};