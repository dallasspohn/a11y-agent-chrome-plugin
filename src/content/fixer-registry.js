import { getSelector, skipNode } from './dom-utils.js';
import { htmlHasLang } from './fixers/html-has-lang.js';
import { imageAlt } from './fixers/image-alt.js';
import { colorContrast } from './fixers/color-contrast.js';
import { label } from './fixers/label.js';
import { linkName } from './fixers/link-name.js';
import { headingOrder } from './fixers/heading-order.js';
import { tdHasHeader, thHasDataCells } from './fixers/tables.js';
import { clickEventsHaveKeyEvents } from './fixers/click-events-have-key-events.js';
import { videoAutoplay } from './fixers/video-autoplay.js';
import { focusVisible } from './fixers/focus-visible.js';
import { documentTitle } from './fixers/document-title.js';
import { frameTitle } from './fixers/frame-title.js';
import { duplicateId } from './fixers/duplicate-id.js';

export const FIXERS = [
  htmlHasLang,
  imageAlt,
  colorContrast,
  label,
  linkName,
  headingOrder,
  tdHasHeader,
  thHasDataCells,
  clickEventsHaveKeyEvents,
  videoAutoplay,
];

export const BONUS_FIXERS = [
  focusVisible,
  documentTitle,
  frameTitle,
  duplicateId,
];

export const ALL_FIXERS = [...FIXERS, ...BONUS_FIXERS];

export function isEnabled(fixer, options) {
  return options?.rules?.[fixer.ruleId] !== false;
}

/**
 * Run the enabled fixers over `root` (an Element/document). `pass` is
 * 'stream' (MutationObserver subtrees) or 'full' (DOMContentLoaded / rerun).
 * Returns { fixes, unfixed, skipped } where fixes are finished report entries.
 * Every fixer is wrapped in try/catch — a fixer must never break the page.
 */
export function runAll(root, options, { pass = 'full', hooks = {}, log } = {}) {
  const fixes = [];
  const unfixed = [];
  let skipped = 0;
  const warn = (msg) => (log ? log(msg) : console.warn('[a11y-autofix]', msg));

  const ctx = {
    options,
    log: warn,
    requestAiAlt: hooks.requestAiAlt || null,
    surroundingTextFor: hooks.surroundingTextFor || (() => ''),
  };

  const query = (selector) => {
    try {
      if (root && root.nodeType === 9) return Array.from(root.querySelectorAll(selector));
      const found = Array.from(root.querySelectorAll(selector));
      // querySelectorAll only ever returns descendants, but on a streaming pass
      // the node the parser just added IS the violating element -- an <img> has
      // no descendant <img> to find. Without this the whole pre-paint repair
      // path is dead code and every fix slips to DOMContentLoaded.
      if (root.matches?.(selector)) found.unshift(root);
      return found;
    } catch (e) {
      warn(`querySelectorAll(${selector}) failed: ${e.message}`);
      return [];
    }
  };

  for (const fixer of ALL_FIXERS) {
    if (!isEnabled(fixer, options)) continue;
    if (pass === 'stream' && fixer.streamSafe === false) continue;
    try {
      if (fixer.scope === 'document') {
        const results = fixer.fix(root, ctx) || [];
        if (!Array.isArray(results)) continue;
        for (const r of results) {
          if (!r) continue;
          if (r.unfixed) unfixed.push({ ruleId: fixer.ruleId, selector: r.selector, reason: r.reason });
          else fixes.push({ ruleId: fixer.ruleId, impact: fixer.impact, wcag: fixer.wcag, ...r });
        }
        continue;
      }
      for (const el of query(fixer.selector)) {
        let matched = false;
        try {
          matched = fixer.match(el, ctx);
        } catch (e) {
          warn(`match(${fixer.ruleId}) failed: ${e.message}`);
        }
        if (!matched) continue;
        if (skipNode(el)) { skipped += 1; continue; }
        const res = fixer.fix(el, ctx);
        if (!res) continue;
        if (res.unfixed) unfixed.push({ ruleId: fixer.ruleId, selector: res.selector || getSelector(el), reason: res.reason });
        else fixes.push({
          ruleId: fixer.ruleId,
          impact: fixer.impact,
          wcag: fixer.wcag,
          selector: res.selector || getSelector(el),
          before: res.before,
          after: res.after,
          source: res.source || '',
        });
      }
    } catch (e) {
      warn(`fixer ${fixer.ruleId} threw: ${e?.stack || e?.message || e}`);
    }
  }

  return { fixes, unfixed, skipped };
}