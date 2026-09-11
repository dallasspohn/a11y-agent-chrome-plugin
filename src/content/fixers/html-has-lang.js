import { isFixed, markFixed, htmlSnippet, getSelector } from '../dom-utils.js';

/* A screen reader chooses its voice and pronunciation rules from `lang` when it
 * starts reading, so a slightly-wrong value immediately beats a correct one
 *600ms later. This runs on the streaming pass and settles for
 * navigator.language when <head> has not parsed yet, marking the result
 * provisional; a later pass upgrades it if an authoritative meta shows up. */
const PROVISIONAL_ATTR = 'data-a11y-lang-provisional';

/** Reads an authoritative page-declared language, or null. */
function metaLanguage(doc) {
  const httpMeta = doc.querySelector('meta[http-equiv="content-language"]');
  const httpValue = (httpMeta?.getAttribute('content') || '').trim();
  if (httpValue) return { value: httpValue.split(',')[0].trim(), label: 'content-language meta' };

  const langMeta = doc.querySelector('meta[name="language"], meta[itemprop="inLanguage"]');
  const metaValue = (langMeta?.getAttribute?.('content') || '').trim();
  if (metaValue) return { value: metaValue, label: 'language meta' };

  return null;
}

export const htmlHasLang = {
  ruleId: 'html-has-lang',
  title: 'Page must have a lang attribute',
  impact: 'moderate',
  wcag: '3.1.1',
  scope: 'document',
  streamSafe: true,
  fix(root) {
    const doc = root.ownerDocument || root;
    const html = doc.documentElement;
    if (!html) return [];

    const current = (html.getAttribute('lang') || '').trim();
    const provisional = html.getAttribute(PROVISIONAL_ATTR) === 'true';
    const meta = metaLanguage(doc);

    if (provisional) {
      // We own this value. Upgrade it only when the page declares a real one.
      if (!meta || meta.value === current) return [];
      const before = htmlSnippet(html);
      html.setAttribute('lang', meta.value);
      html.removeAttribute(PROVISIONAL_ATTR);
      return [{
        selector: getSelector(html),
        before,
        after: htmlSnippet(html),
        source: `lang upgraded from ${current} to ${meta.value} (${meta.label})`,
      }];
    }

    // A lang the page set itself is authoritative; never touch it.
    if (current) return [];
    if (isFixed(html)) return [];

    const source = meta?.value || (typeof navigator !== 'undefined' && navigator.language) || 'en';
    let sourceLabel = meta?.label;
    if (!sourceLabel) sourceLabel = navigator.language ? 'navigator.language' : "default 'en'";

    const before = htmlSnippet(html);
    html.setAttribute('lang', source);
    // Guessed values stay open to refinement once <head> has parsed.
    if (!meta) html.setAttribute(PROVISIONAL_ATTR, 'true');
    markFixed(html, 'html-has-lang');
    return [{
      selector: getSelector(html),
      before,
      after: htmlSnippet(html),
      source: `lang set from ${sourceLabel}`,
    }];
  },
};
