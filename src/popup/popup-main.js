const $ = (id) => document.getElementById(id);

const IMPACT_LABEL = {
  critical: ['Critical', 'var(--critical)'],
  serious: ['Serious', 'var(--serious)'],
  moderate: ['Moderate', 'var(--moderate)'],
  minor: ['Minor', 'var(--minor)'],
};

let current = { report: null, host: '', options: null };

async function fetchState() {
  try {
    current = await chrome.runtime.sendMessage({ type: 'GET_REPORT' });
  } catch {
    current = { report: null, host: '', options: null };
  }
  current.host ||= 'current page';
}

function render() {
  const { report, host } = current;
  $('host').textContent = host;
  const summary = report?.summary;
  const found = summary?.found ?? 0;
  const fixed = summary?.fixed ?? 0;
  const unfixed = summary?.unfixed ?? 0;
  $('found').textContent = String(found);
  $('fixed').textContent = String(fixed);
  $('unfixed').textContent = String(unfixed);

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

  if (found === 0 && fixes.length === 0) {
    $('status').textContent = 'No a11y violations found on this page.';
  } else if (unfixed > 0) {
    $('status').textContent = `${unfixed} violation${unfixed === 1 ? '' : 's'} could not be auto-fixed.`;
  } else {
    $('status').textContent = 'All detected violations were fixed.';
  }
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
    const blocked = new Set(options.blockedHosts || []);
    blocked.add(host);
    await chrome.runtime.sendMessage({ type: 'SAVE_OPTIONS', options: { ...options, blockedHosts: [...blocked] } });
    $('status').textContent = `Disabled on ${host}.`;
    $('disable').disabled = true;
  });

  $('options').addEventListener('click', () => chrome.runtime.openOptionsPage());
}

fetchState().then(() => { render(); wire(); });