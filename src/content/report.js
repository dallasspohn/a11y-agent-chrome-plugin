export function buildReport({ fixes, unfixed, skipped, found, url }) {
  return {
    url: url || (typeof location !== 'undefined' ? location.href : ''),
    timestamp: new Date().toISOString(),
    summary: {
      found: found ?? fixes.length + unfixed.length,
      fixed: fixes.length,
      unfixed: unfixed.length,
      skipped,
    },
    fixes,
    unfixed,
  };
}

export function sendReport(report) {
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      const p = chrome.runtime.sendMessage({ type: 'A11Y_REPORT', report });
      if (p && typeof p.catch === 'function') p.catch(() => {});
    }
  } catch { /* frame torn down */ }
}

export function sendDisabledHost() {
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      const p = chrome.runtime.sendMessage({ type: 'A11Y_DISABLED' });
      if (p && typeof p.catch === 'function') p.catch(() => {});
    }
  } catch { /* ignore */ }
}