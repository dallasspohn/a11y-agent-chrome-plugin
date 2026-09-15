import { normalizeOptions, STORAGE_KEY, hostBlocked, DEFAULT_OPTIONS } from '../content/options.js';

const reports = new Map(); // tabId -> { frames: Map<frameId, report>, combined: report }

/* MV3 evicts this service worker after ~30s idle. `reports` alone therefore
 * lost every report on eviction, and the popup rendered a false 0/0/0 on a
 * page that had in fact been repaired. The Map is now a cache in front of
 * chrome.storage.session, which survives eviction and clears with the browser. */
const SESSION_KEY = 'a11yReports';
let hydrating = null;

// storage.session holds JSON, so the per-frame Map serializes as entry pairs.
function serializeReports() {
  const out = {};
  for (const [tabId, entry] of reports) {
    out[tabId] = { frames: [...entry.frames], combined: entry.combined || null };
  }
  return out;
}

function hydrate() {
  hydrating ||= (async () => {
    try {
      const stored = await chrome.storage.session.get(SESSION_KEY);
      for (const [tabId, entry] of Object.entries(stored[SESSION_KEY] || {})) {
        // A report received since wake-up is newer than anything on disk.
        if (reports.has(Number(tabId))) continue;
        reports.set(Number(tabId), {
          frames: new Map(entry.frames || []),
          combined: entry.combined || null,
        });
      }
    } catch (e) {
      console.warn('[a11y-autofix] session storage unavailable:', e.message);
    }
  })();
  return hydrating;
}

async function persistReports() {
  try {
    await chrome.storage.session.set({ [SESSION_KEY]: serializeReports() });
  } catch { /* session storage unavailable; in-memory cache still serves this wake */ }
}

const BADGE_ORANGE = '#c2410c';
const BADGE_GREEN = '#16a34a';
const BADGE_GRAY = '#6b7280';

function combineFrameReports(tabId) {
  const entry = reports.get(tabId);
  if (!entry) return null;
  const frames = Array.from(entry.frames.values());
  if (frames.length === 0) return null;
  const fixes = frames.flatMap((r) => r.fixes || []);
  const unfixed = frames.flatMap((r) => r.unfixed || []);
  const skipped = frames.reduce((n, r) => n + (r.summary?.skipped || 0), 0);
  const combined = {
    url: frames[0].url || '',
    timestamp: new Date().toISOString(),
    summary: {
      found: fixes.length + unfixed.length,
      fixed: fixes.length,
      unfixed: unfixed.length,
      skipped,
    },
    fixes,
    unfixed,
  };
  entry.combined = combined;
  return combined;
}

function setBadge(tabId, report, status) {
  const fixed = report?.summary?.fixed || 0;
  const unfixed = report?.summary?.unfixed || 0;
  if (status === 'disabled') {
    chrome.action.setBadgeText({ tabId, text: '' });
    chrome.action.setBadgeBackgroundColor({ tabId, color: BADGE_GRAY });
    chrome.action.setTitle({ tabId, title: 'a11y-autofix: disabled on this site' });
    return;
  }
  if (fixed === 0 && unfixed === 0) {
    chrome.action.setBadgeText({ tabId, text: '' });
    return;
  }
  chrome.action.setBadgeText({ tabId, text: String(fixed) });
  chrome.action.setBadgeBackgroundColor({ tabId, color: unfixed > 0 ? BADGE_ORANGE : BADGE_GREEN });
  chrome.action.setTitle({ tabId, title: `a11y-autofix: ${fixed} fixed, ${unfixed} unfixed` });
}

async function currentTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
  } catch { return null; }
}

async function getOptions() {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  return normalizeOptions(stored[STORAGE_KEY]);
}

/* Tells the popup why a report is missing. Without this, "the content script
 * ran and the page is clean" and "the content script never ran" both arrived
 * as report:null and rendered identically as 0/0/0. */
async function reportStatus(tab, entry, options, host) {
  if (!tab) return 'no-tab';
  if (!options.enabled) return 'disabled';
  if (hostBlocked(options, host)) return 'disabled-host';
  if (entry?.combined) return 'ok';
  try {
    // The content script only registers its listener once it is enabled and
    // booted, so a reply means a scan is under way rather than absent.
    await chrome.tabs.sendMessage(tab.id, { type: 'A11Y_PING' });
    return 'scanning';
  } catch {
    return 'no-content-script';
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    await hydrate();
    const tabId = sender.tab?.id;
    switch (msg.type) {
      case 'A11Y_REPORT': {
        if (tabId == null) return;
        const entry = reports.get(tabId) || { frames: new Map(), combined: null };
        entry.frames.set(sender.frameId ?? 0, msg.report);
        reports.set(tabId, entry);
        setBadge(tabId, combineFrameReports(tabId));
        await persistReports();
        break;
      }
      case 'A11Y_DISABLED': {
        if (tabId == null) return;
        setBadge(tabId, null, 'disabled');
        break;
      }
      case 'AI_ALT': {
        if (!sender.tab) return;
        const options = await getOptions();
        if (!options.aiAlt?.enabled || !options.aiAlt.anthropicKey) {
          sendResponse({ error: 'AI alt-text disabled or no API key' });
          return;
        }
        try {
          const text = await askAnthropic(options.aiAlt, msg.payload);
          sendResponse({ text });
        } catch (e) {
          sendResponse({ error: e.message });
        }
        break;
      }
      case 'GET_REPORT': {
        const active = await currentTab();
        const entry = active ? reports.get(active.id) : null;
        const options = await getOptions();
        const host = active?.url ? new URL(active.url).hostname : '';
        sendResponse({
          report: entry?.combined || null,
          tabId: active?.id,
          host,
          options,
          status: await reportStatus(active, entry, options, host),
        });
        break;
      }
      case 'GET_OPTIONS': {
        sendResponse(await getOptions());
        break;
      }
      case 'SAVE_OPTIONS': {
        const options = normalizeOptions(msg.options);
        await chrome.storage.local.set({ [STORAGE_KEY]: options });
        const active = await currentTab();
        if (active?.id != null) {
          chrome.tabs
            .sendMessage(active.id, { type: 'A11Y_OPTIONS_CHANGED' })
            .catch(() => { /* no content script on this page */ });
          // Re-evaluate badge for the current tab immediately.
          const entry = reports.get(active.id);
          const disabledNow = !options.enabled || hostBlocked(options, (active.url ? new URL(active.url).hostname : ''));
          setBadge(active.id, entry?.combined || null, disabledNow ? 'disabled' : undefined);
        }
        sendResponse({ saved: true });
        break;
      }
      case 'REVERT': {
        const active = await currentTab();
        if (active?.id == null) { sendResponse({ status: 'no-tab' }); return; }
        try {
          const resp = await chrome.tabs.sendMessage(active.id, { type: 'A11Y_REVERT' });
          sendResponse({ status: resp?.status || 'reverted' });
        } catch {
          sendResponse({ status: 'no-content-script' });
        }
        break;
      }
      case 'RERUN': {
        const active = await currentTab();
        if (active?.id == null) { sendResponse({ status: 'no-tab' }); return; }
        try {
          const resp = await chrome.tabs.sendMessage(active.id, { type: 'A11Y_RERUN' });
          setTimeout(() => {
            const entry = reports.get(active.id);
            if (entry) setBadge(active.id, combineFrameReports(active.id));
          }, 1200);
          sendResponse({ status: resp?.status || 'reran' });
        } catch {
          sendResponse({ status: 'no-content-script' });
        }
        break;
      }
      default:
        sendResponse({ status: 'unknown' });
    }
  })();
  return true; // async sendResponse
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  await hydrate();
  const entry = reports.get(tabId);
  setBadge(tabId, entry?.combined || null);
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  await hydrate();
  reports.delete(tabId);
  await persistReports();
});

chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.local.get(STORAGE_KEY);
  if (!existing[STORAGE_KEY]) {
    await chrome.storage.local.set({ [STORAGE_KEY]: normalizeOptions(DEFAULT_OPTIONS) });
  }
});

async function askAnthropic(config, payload) {
  const body = {
    model: config.model || 'claude-3-5-sonnet-latest',
    max_tokens: 200,
    temperature: 0.2,
    system: 'You generate concise, accurate image alt text for an accessibility fixer. Respond with ONLY the alt text, 125 characters or fewer, no quotes, no prefixes.',
    messages: [{ role: 'user', content: `Write alt text (≤125 chars) for the image with src "${payload.src}". Nearby page text: "${payload.surroundingText}". Page title: "${payload.pageTitle}".` }],
  };
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': config.anthropicKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    throw new Error(`Anthropic API ${resp.status}`);
  }
  const data = await resp.json();
  const text = data?.content?.[0]?.text || '';
  return text.trim().slice(0, 125);
}