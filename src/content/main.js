import { ALL_FIXERS, runAll, isEnabled } from './fixer-registry.js';
import { buildReport, sendReport, sendDisabledHost } from './report.js';
import { normalizeOptions, STORAGE_KEY, hostBlocked } from './options.js';
import { getSelector } from './dom-utils.js';
import { releaseAllKeyHandlers } from './fixers/click-events-have-key-events.js';

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'];
const DONE_ATTR = 'data-a11y-autofix-done';
const OBSERVER_OPTS = {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ['alt', 'aria-label', 'aria-labelledby', 'lang', 'autoplay', 'onclick', 'style', 'class', 'id', 'title', 'tabindex', 'role', 'aria-hidden'],
};
const RERUN_LIMIT_MS = 500;

const fixerById = new Map();
for (const f of ALL_FIXERS) {
  fixerById.set(f.ruleId, f);
  for (const alias of f.aliases || []) fixerById.set(alias, f);
}

let options = null;
let enabled = true;
let observer = null;
let applying = false;
let done = false;
// Set by "Revert all", cleared by "Re-run". Without it the observer treats the
// revert's own attribute changes as page activity and immediately re-fixes
// everything, so the page never visibly returns to its unrepaired state.
let suspended = false;
let state = { fixes: [], unfixedList: [], fixed: 0, unfixed: 0, skipped: 0 };
let lastRerunAt = 0;
let rerunTimer = null;

let topChrome = true;
try {
  if (window.top && window.top !== window) {
    // eslint-disable-next-line no-unused-expressions
    window.top.location.href;
  }
} catch { topChrome = false; } // cross-origin frame: don't fight content we can't see

const warn = (...args) => console.warn('[a11y-autofix]', ...args);

function accumulate(res) {
  state.fixes.push(...res.fixes);
  state.unfixedList.push(...res.unfixed);
  state.fixed += res.fixes.length;
  state.unfixed += res.unfixed.length;
  state.skipped += res.skipped;
  return res;
}

function runPass(root, pass) {
  if (pass === 'stream' && !topChrome) return { fixes: [], unfixed: [], skipped: 0 };
  applying = true;
  observer?.disconnect();
  try {
    const res = runAll(root || (document.documentElement || document), options, {
      pass,
      hooks: {
        requestAiAlt: aiAltEnabled ? requestAiAlt : null,
        surroundingTextFor,
      },
      log: warn,
    });
    return res;
  } catch (e) {
    warn('pass failed:', e);
    return { fixes: [], unfixed: [], skipped: 0 };
  } finally {
    applying = false;
    if (document.documentElement) observer?.observe(document.documentElement, OBSERVER_OPTS);
  }
}

const observerCallback = (records) => {
  if (applying || !enabled || suspended) return;
  if (done) {
    scheduleRerun();
    return;
  }
  let total = { fixes: [], unfixed: [], skipped: 0 };
  for (const record of records) {
    for (const node of record.addedNodes) {
      if (node.nodeType !== 1) continue;
      const res = runPass(node, 'stream');
      total.fixes.push(...res.fixes);
      total.unfixed.push(...res.unfixed);
      total.skipped += res.skipped;
    }
    if (record.type === 'attributes' && record.target.nodeType === 1) {
      const res = runPass(record.target, 'stream');
      total.fixes.push(...res.fixes);
      total.unfixed.push(...res.unfixed);
      total.skipped += res.skipped;
    }
  }
  accumulate(total);
};

function setupObserver() {
  if (!document.documentElement || observer) return;
  observer = new MutationObserver(observerCallback);
  observer.observe(document.documentElement, OBSERVER_OPTS);
}

function scheduleRerun() {
  const now = Date.now();
  if (now - lastRerunAt < RERUN_LIMIT_MS) {
    if (rerunTimer) return;
    rerunTimer = setTimeout(handleRerun, RERUN_LIMIT_MS - (now - lastRerunAt));
    return;
  }
  handleRerun();
}

function handleRerun() {
  rerunTimer = null;
  lastRerunAt = Date.now();
  if (!enabled || applying || suspended) return;
  const res = runPass(document.documentElement, 'full');
  accumulate(res);
  if (res.fixes.length) sendCurrentReport();
}

function markDone() {
  if (document.documentElement && document.documentElement.getAttribute(DONE_ATTR) !== 'true') {
    document.documentElement.setAttribute(DONE_ATTR, 'true');
  }
  done = true;
}

function surroundingTextFor(el) {
  const parts = [];
  let n = el.previousElementSibling || el.parentElement;
  for (let i = 0; n && i < 4; n = n.previousElementSibling || n.parentElement, i++) {
    const t = (n.textContent || '').trim();
    if (t) parts.push(t.slice(0, 240));
    if (parts.length >= 2) break;
  }
  return parts.join(' ');
}

let aiAltEnabled = false;

async function requestAiAlt({ node, src, surroundingText, pageTitle }) {
  if (!aiAltEnabled) return;
  try {
    const resp = await chrome.runtime.sendMessage({
      type: 'AI_ALT',
      payload: { src, surroundingText, pageTitle },
    });
    if (resp && resp.text && resp.text.trim() && node.isConnected && !node.hasAttribute('data-a11y-fixed-ai')) {
      node.setAttribute('alt', resp.text.trim().slice(0, 125));
      node.setAttribute('data-a11y-fixed-ai', 'true');
    }
  } catch (e) {
    warn('AI alt-text failed:', e.message);
  }
}

function collectAxeViolations() {
  const axe = globalThis.axe || (typeof window !== 'undefined' ? window.axe : null);
  if (!axe || typeof axe.run !== 'function') {
    warn('axe-core not available in content world — skipping validation');
    return [];
  }
  return axe
    .run(document, { runOnly: { type: 'tag', values: AXE_TAGS }, resultTypes: ['violations'] })
    .then((res) => res.violations || [])
    .catch((e) => {
      warn('axe.run failed:', e.message);
      return [];
    });
}

function resolveAxeTarget(nodeInfo) {
  if (nodeInfo?.element) return nodeInfo.element;
  const targets = nodeInfo?.target || [];
  for (const sel of targets) {
    if (typeof sel !== 'string') continue;
    try {
      const el = document.querySelector(sel);
      if (el) return el;
    } catch { /* invalid selector */ }
  }
  return null;
}

async function runFullCheck({ silent = false, reset = false } = {}) {
  if (done && !silent) return;
  if (reset) state = { fixes: [], unfixedList: [], fixed: 0, unfixed: 0, skipped: 0 };
  done = false;

  // 1. Deterministic full pass (idempotent — nodes already fixed are skipped).
  accumulate(runPass(document.documentElement, 'full'));

  // 2. axe-core finds what streaming missed; fix those nodes by ruleId.
  const violations = await collectAxeViolations();
  
  for (const violation of violations) {
    const fixer = fixerById.get(violation.id);
    if (!fixer || !isEnabled(fixer, options)) continue;
    for (const nodeInfo of violation.nodes || []) {
      const el = resolveAxeTarget(nodeInfo);
      const alreadyFixed = el && typeof el.getAttribute === 'function' && el.getAttribute('data-a11y-fixed') !== null;
      if (!el || alreadyFixed) continue;
      try {
        if (fixer.scope === 'document') {
          const res = fixer.fix(document, { options, log: warn }) || [];
          for (const r of res) {
            if (!r) continue;
            if (r.unfixed) state.unfixed += 1;
            else { state.fixes.push({ ruleId: fixer.ruleId, impact: fixer.impact, wcag: fixer.wcag, ...r }); state.fixed += 1; }
          }
        } else if (fixer.match(el, { options, log: warn })) {
          const res = fixer.fix(el, { options, log: warn });
          if (res) {
            if (res.unfixed) state.unfixed += 1;
            else { state.fixes.push({ ruleId: fixer.ruleId, impact: fixer.impact, wcag: fixer.wcag, selector: el.selector || getSelector(el), before: res.before, after: res.after, source: res.source || '' }); state.fixed += 1; }
          }
        }
      } catch (e) {
        warn(`axe-patch ${fixer.ruleId} failed:`, e.message);
      }
    }
  }

  // 3. Post-fix validation: what still fails is "unfixed".
  const after = await collectAxeViolations();
  const unfixed = [];
  for (const violation of after) {
    if (!fixerById.has(violation.id)) continue;
    for (const nodeInfo of violation.nodes || []) {
      unfixed.push({
        ruleId: violation.id,
        selector: (nodeInfo.target || []).join(', '),
        reason: violation.help,
      });
    }
  }
  state.unfixed = unfixed.length;
  state.unfixedList = unfixed;

  markDone();
  sendCurrentReport();
}

function hostDisabled() {
  return !options.enabled || hostBlocked(options);
}

function currentReport() {
  return buildReport({
    fixes: state.fixes,
    unfixed: state.unfixedList,
    skipped: state.skipped,
    found: state.fixed + state.unfixed,
    url: window.location.href,
  });
}

function sendCurrentReport() {
  sendReport(currentReport());
}

async function loadOptionsAndBoot() {
  let stored = {};
  try {
    stored = await chrome.storage.local.get(STORAGE_KEY);
  } catch (e) {
    warn('storage unavailable:', e.message);
  }
  options = normalizeOptions(stored[STORAGE_KEY]);
  aiAltEnabled = options.aiAlt?.enabled === true;
  enabled = options.enabled && topChrome && !hostDisabled();
}

async function boot() {
  await loadOptionsAndBoot();

  if (!enabled) {
    markDone();
    if (!topChrome) return;
    if (options.blockedHosts?.length || options.allowedHosts?.length) sendDisabledHost();
    return;
  }

  setupObserver();

  // Streaming pass for whatever already exists.
  accumulate(runPass(document.documentElement, 'stream'));

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    runFullCheck();
  } else {
    document.addEventListener('DOMContentLoaded', () => runFullCheck(), { once: true });
  }

  chrome.runtime.onMessage.addListener(onMessage);
}

function onMessage(msg, sender, sendResponse) {
  if (msg.type === 'A11Y_PING') {
    // Lets the popup tell "no scan has landed yet" from "no script here".
    sendResponse({ status: 'alive', done });
    return true;
  }
  if (msg.type === 'A11Y_REVERT') {
    revertAll();
    sendCurrentReport();
    sendResponse({ status: 'reverted' });
    return true;
  }
  if (msg.type === 'A11Y_RERUN') {
    suspended = false;
    runFullCheck({ silent: true, reset: true }).then(() => sendResponse({ status: 'reran' }));
    return true;
  }
  if (msg.type === 'A11Y_OPTIONS_CHANGED') {
    loadOptionsAndBoot().then(() => {
      if (enabled) {
        suspended = false;
        runFullCheck({ silent: true, reset: true });
      } else {
        revertAll();
        markDone();
        sendDisabledHost();
      }
      sendResponse({ status: 'ok' });
    });
    return true;
  }
  return false;
}

function revertAll() {
  // Stay suspended after this returns: the page must remain unrepaired until
  // the user explicitly re-runs. disconnect() also discards the records our
  // own attribute writes are about to queue.
  suspended = true;
  applying = true;
  observer?.disconnect();
  try {
    revertAllInner();
  } finally {
    applying = false;
    if (document.documentElement) observer?.observe(document.documentElement, OBSERVER_OPTS);
  }
}

function revertAllInner() {
  const fixed = Array.from(document.querySelectorAll('[data-a11y-fixed]'));
  for (const el of fixed) {
    for (const key of Object.keys(el.dataset)) {
      if (!key.startsWith('a11yOrig')) continue;
      const attr = key
        .replace(/^a11yOrig/, '')
        // Lowercase the leading capital first: expanding it with the rule
        // below produced "-style" instead of "style", so no attribute was
        // ever restored and "Revert all" silently did nothing.
        .replace(/^[A-Z]/, (c) => c.toLowerCase())
        .replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
      const orig = el.dataset[key];
      if (orig === '') el.removeAttribute(attr);
      else el.setAttribute(attr, orig);
      delete el.dataset[key];
    }
    el.removeAttribute('data-a11y-fixed');
    el.removeAttribute('data-a11y-fixed-ai');
  }
  releaseAllKeyHandlers(document);
  // The focus-visible fixer injects an element rather than an attribute, so
  // attribute restoration alone left the outline CSS applied — focus rings
  // survived "Revert all", and the fixer then skipped re-injecting on re-run
  // because its element was still in the document.
  document.getElementById('a11y-autofix-css')?.remove();
  // Same class of leftover: html-has-lang's "provisional" marker is our own
  // bookkeeping, and leaving it set made the fixer treat the reverted page as
  // already-owned and skip re-applying lang on re-run.
  document.documentElement?.removeAttribute('data-a11y-lang-provisional');
  state = { fixes: [], unfixedList: [], fixed: 0, unfixed: 0, skipped: 0 };
  done = false;
  // Re-send the pristine state so badge clears.
  const report = buildReport({ fixes: [], unfixed: [], skipped: 0, found: 0, url: window.location.href });
  sendReport(report);
}

boot().catch((e) => warn('boot failed:', e));