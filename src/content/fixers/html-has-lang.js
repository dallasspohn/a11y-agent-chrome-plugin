import { isFixed, markFixed, htmlSnippet, getSelector } from '../dom-utils.js';

export const htmlHasLang = {
  ruleId: 'html-has-lang',
  title: 'Page must have a lang attribute',
  impact: 'moderate',
  wcag: '3.1.1',
  scope: 'document',
  streamSafe: false,
  fix(root) {
    const doc = root.ownerDocument || root;
    const html = doc.documentElement;
    if (!html) return [];
    const current = html.getAttribute('lang');
    if (current && current.trim()) return [];
    if (isFixed(html)) return [];

    let source = '';
    let sourceLabel = '';
    const httpMeta = doc.querySelector('meta[http-equiv="content-language"]');
    if (httpMeta) {
      const value = (httpMeta.getAttribute('content') || '').trim();
      if (value) {
        source = value.split(',')[0].trim();
        sourceLabel = 'content-language meta';
      }
    }
    if (!source) {
      const langMeta = doc.querySelector('meta[name="language"], meta[itemprop="inLanguage"]');
      const value = langMeta?.getAttribute?.('content') || '';
      if (value && value.trim()) {
        source = value.trim();
        sourceLabel = 'language meta';
      }
    }
    if (!source) {
      source = (typeof navigator !== 'undefined' && navigator.language) || 'en';
      sourceLabel = navigator.language ? 'navigator.language' : "default 'en'";
    }

    const before = htmlSnippet(html);
    html.setAttribute('lang', source);
    markFixed(html, 'html-has-lang');
    return [{
      selector: getSelector(html),
      before,
      after: htmlSnippet(html),
      source: `lang set from ${sourceLabel}`,
    }];
  },
};