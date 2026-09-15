const $ = (id) => document.getElementById(id);

const IMPACT_LABEL = {
  critical: ['Critical', 'var(--critical)'],
  serious: ['Serious', 'var(--serious)'],
  moderate: ['Moderate', 'var(--moderate)'],
  minor: ['Minor', 'var(--minor)'],
};

let current = { report: null, host: '', options: null, status: 'no-tab' };

// Anything other than 'ok' means the counts below are unknown, not zero.
const STATUS_TEXT = {
  'no-tab': 'No active tab to scan.',
  disabled: 'a11y-autofix is turned off. Enable it in Options.',
  'disabled-host': (host) => `a11y-autofix is disabled on ${host}.`,
  scanning: 'Scan in progress…',
  'no-content-script': 'a11y-autofix did not run on this page. Reload the page; if it still does not run, confirm the extension is enabled and has access to this URL.',
};

async function fetchState() {
  try {
    current = await chrome.runtime.sendMessage({ type: 'GET_REPORT' });
  } catch {
    current = { report: null, host: '', options: null, status: 'no-content-script' };
  }
  current.host ||= 'current page';
  current.status ||= 'no-content-script';
}

// Whether the popup's own host sits in the blocklist, for the toggle label.
function hostIsBlocked() {
  const { options, host } = current;
  if (!options || !host || host === 'current page') return false;
  const h = host.toLowerCase();
  return (options.blockedHosts || []).some((b) => {
    const entry = String(b).toLowerCase();
    return h === entry || h.endsWith('.' + entry);
  });
}

function render() {
  const { report, host, status } = current;
  $('host').textContent = host;
  const scanned = status === 'ok';
  const summary = report?.summary;
  const found = summary?.found ?? 0;
  const fixed = summary?.fixed ?? 0;
  const unfixed = summary?.unfixed ?? 0;
  // Dashes, not zeros: no scan reached this page, so there is nothing to count.
  $('found').textContent = scanned ? String(found) : '–';
  $('fixed').textContent = scanned ? String(fixed) : '–';
  $('unfixed').textContent = scanned ? String(unfixed) : '–';

  const list = $('fix-list');
  list.replaceChildren();
  const fixes = report?.fixes || [];
  $('empty').hidden = fixes.length > 0;
  $('fix-list').hidden = fixes.length === 0;

  const byRule = new Map();
  for (const fix of fixes) {
    if (!byRule.has(fix.ruleId)) byRule.set(fix.ruleId, []);
    byRule.get(fix.ruleId).push(fix);
  }

  for (const [ruleId, items] of byRule) {
    const li = document.createElement('li');
    li.className = 'fix-item';
    const impacts = items.map((i) => i.impact).filter(Boolean);
    const impactColors = impacts.map((i) => `color:${(IMPACT_LABEL[i] || IMPACT_LABEL.minor)[1]}`);
    const impactLabel = impacts.length
      ? IMPACT_LABEL[impacts[0]]?.[0] || 'Minor'
      : '—';
    li.innerHTML = `
      <details>
        <summary><span class="rule-id">${escapeHtml(ruleId)}</span>
        <span style="${impactColors.join('')}" aria-hidden="true"> (${escapeHtml(impactLabel)})</span></summary>
        <div class="meta">${items.length} fix${items.length === 1 ? '' : 'es'} · WCAG ${items.map((i) => i.wcag).filter(Boolean).join(', ') || '—'}</div>
        ${items.map(itemHtml).join('')}
      </details>`;
    list.append(li);
  }

  if (!scanned) {
    const text = STATUS_TEXT[status] || STATUS_TEXT['no-content-script'];
    $('status').textContent = typeof text === 'function' ? text(host) : text;
  } else if (found === 0 && fixes.length === 0) {
    $('status').textContent = 'No a11y violations found on this page.';
  } else if (unfixed > 0) {
    $('status').textContent = `${unfixed} violation${unfixed === 1 ? '' : 's'} could not be auto-fixed.`;
  } else {
    $('status').textContent = 'All detected violations were fixed.';
  }

  $('empty').textContent = scanned
    ? 'No fixes have been applied yet.'
    : 'No report for this page.';

  const blocked = hostIsBlocked();
  $('disable').textContent = blocked ? 'Enable on this site' : 'Disable on this site';
  $('disable').disabled = !host || host === 'current page';
}

function itemHtml(fix) {
  const before = escapeHtml(fix.before || '');
  const after = escapeHtml(fix.after || '');
  return `
    <p class="meta">${escapeHtml(fix.selector || '')} — ${escapeHtml(fix.source || '')}</p>
    <pre>${before}</pre>
    <p class="arrow" aria-hidden="true">↓</p>
    <pre>${after}</pre>`;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

function wire() {
  $('revert').addEventListener('click', async () => {
    $('status').textContent = 'Reverting fixes…';
    await chrome.runtime.sendMessage({ type: 'REVERT' });
    await fetchState();
    render();
    // A revert sends an empty report, which render() would otherwise describe
    // as "No a11y violations found" — the opposite of what just happened.
    $('status').textContent = 'Fixes reverted. The page is back to its original state.';
  });

  $('rerun').addEventListener('click', async () => {
    $('status').textContent = 'Re-running scan…';
    await chrome.runtime.sendMessage({ type: 'RERUN' });
    setTimeout(async () => {
      await fetchState();
      render();
    }, 1500);
  });

  $('copy').addEventListener('click', async () => {
    const json = JSON.stringify(current.report || { fixes: [], unfixed: [], summary: { found: 0, fixed: 0, unfixed: 0, skipped: 0 } }, null, 2);
    try {
      await navigator.clipboard.writeText(json);
      $('status').textContent = 'Report JSON copied.';
    } catch {
      $('status').textContent = 'Could not copy report.';
    }
  });

  $('disable').addEventListener('click', async () => {
    const host = current.host;
    if (!host || host === 'current page') {
      $('status').textContent = 'No page to disable on.';
      return;
    }
    const options = current.options || {};
    const turningOff = !hostIsBlocked();
    const blocked = new Set(options.blockedHosts || []);
    if (turningOff) blocked.add(host);
    // Drop the exact host and any parent-domain entry that matches it.
    else for (const b of [...blocked]) {
      const entry = String(b).toLowerCase();
      if (host.toLowerCase() === entry || host.toLowerCase().endsWith('.' + entry)) blocked.delete(b);
    }
    await chrome.runtime.sendMessage({ type: 'SAVE_OPTIONS', options: { ...options, blockedHosts: [...blocked] } });
    await fetchState();
    render();
    $('status').textContent = turningOff
      ? `Disabled on ${host}.`
      : `Enabled on ${host}. Reload the page to scan it.`;
  });

  $('options').addEventListener('click', () => chrome.runtime.openOptionsPage());
}

fetchState().then(() => { render(); wire(); });