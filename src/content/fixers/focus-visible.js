import { markFixed } from '../dom-utils.js';

const CSS_RULE = '*:focus-visible { outline: 3px solid #005fcc !important; outline-offset: 2px !important; }';

function pageDefinesFocusVisible(doc) {
  const checkRules = (rules) => {
    for (const rule of rules) {
      try {
        if (rule.selectorText && rule.selectorText.includes(':focus-visible')) return true;
      } catch { /* group/media rules */ }
      if (rule.cssRules) {
        for (const nested of rule.cssRules) {
          try {
            if (nested.selectorText && nested.selectorText.includes(':focus-visible')) return true;
          } catch { /* continue */ }
        }
      }
    }
    return false;
  };

  for (const sheet of Array.from(doc.styleSheets || [])) {
    let rules;
    try { rules = sheet.cssRules || []; } catch { continue; } // cross-origin sheet: SecurityError
    if (checkRules(Array.from(rules))) return true;
  }
  return false;
}

export const focusVisible = {
  ruleId: 'focus-visible',
  title: 'Keyboard focus must be visible',
  impact: 'moderate',
  wcag: '2.4.7',
  scope: 'document',
  streamSafe: true,
  fix(root) {
    const doc = root.ownerDocument || root;
    if (doc.getElementById('a11y-autofix-css')) return [];
    if (pageDefinesFocusVisible(doc)) return [];

    const style = doc.createElement('style');
    style.id = 'a11y-autofix-css';
    style.textContent = CSS_RULE;
    (doc.head || doc.documentElement).appendChild(style);
    markFixed(style, 'focus-visible');
    return [{
      selector: 'style#a11y-autofix-css',
      before: '',
      after: style.outerHTML,
      source: 'injected :focus-visible outline (AA 2.4.7)',
    }];
  },
};