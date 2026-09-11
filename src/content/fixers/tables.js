import {
  skipNode, isFixed, markFixed, htmlSnippet, getSelector, textOf,
} from '../dom-utils.js';

function isLayoutTable(table) {
  if (table.getAttribute('role') === 'presentation') return true;
  // Single-row tables are layout; tables already nested in a cell are layout.
  const rows = table.querySelectorAll('tr');
  if (rows.length <= 1) return true;
  if (table.closest('td, th')) return true;
  return false;
}

function looksHeaderLike(cell) {
  const text = textOf(cell);
  if (!text || text.length > 40) return false;
  if (/^[\d\s,.$£€¥%()/-]+$/.test(text)) return false; // numeric-only
  let cs;
  try { cs = getComputedStyle(cell); } catch { return false; }
  if (parseFloat(cs.fontWeight) >= 700) return true;
  if ((cs.textTransform || '') === 'uppercase') return true;
  return false;
}

const captionSource = (table) => {
  const prev = table.previousElementSibling;
  if (prev && /^h[1-6]$/i.test(prev.tagName) && textOf(prev)) return { text: textOf(prev), source: 'preceding heading' };
  const aria = table.getAttribute('aria-label');
  if (aria && aria.trim()) return { text: aria.trim(), source: 'aria-label' };
  return null;
};

export const tdHasHeader = {
  ruleId: 'td-has-header',
  title: 'Data tables must have header cells',
  impact: 'serious',
  wcag: '1.3.1',
  scope: 'node',
  selector: 'table',
  match(node) {
    if (!(node instanceof HTMLTableElement)) return false;
    if (skipNode(node)) return false;
    if (isFixed(node)) return false;
    if (isLayoutTable(node)) return false;
    if (node.querySelector('th, thead')) return false;
    return node.querySelector('tr') !== null;
  },
  fix(node) {
    const before = htmlSnippet(node);
    markFixed(node, 'td-has-header');
    const rows = node.rows;
    if (!rows.length) return { before, after: before, source: 'table has no rows; nothing to fix' };
    const cells = Array.from(rows[0].cells);
    if (cells.length === 0) return { before, after: before, source: 'first row has no cells' };

    const headerLike = cells.some(looksHeaderLike);
    let source;
    if (headerLike) {
      for (const cell of cells) {
        cell.setAttribute('scope', 'col');
        cell.setAttribute('role', 'columnheader');
      }
      source = 'first row treated as header column (scope="col", role="columnheader")';
    } else {
      // Cells don't look like headers — infer a header row and flag manual review.
      for (const cell of cells) cell.setAttribute('role', 'columnheader');
      source = 'header row inferred — review manually';
    }

    const cap = captionSource(node);
    if (cap && !node.querySelector('caption')) {
      const caption = node.ownerDocument.createElement('caption');
      caption.textContent = cap.text.slice(0, 120);
      node.prepend(caption);
      source += `; caption from ${cap.source}`;
    }

    return {
      before,
      after: htmlSnippet(node),
      source,
    };
  },
};

export const thHasDataCells = {
  ruleId: 'th-has-data-cells',
  title: 'Header cells must have data cells they describe',
  impact: 'serious',
  wcag: '1.3.1',
  scope: 'node',
  selector: 'table',
  match(node) {
    if (!(node instanceof HTMLTableElement)) return false;
    if (skipNode(node)) return false;
    if (isFixed(node)) return false;
    if (isLayoutTable(node)) return false;
    if (!node.querySelector('th')) return false;
    if (node.querySelector('td')) return false;
    return true;
  },
  fix(node, ctx) {
    // A table with header cells but no data cells at all. Inventing data rows
    // would alter page content — flag for manual review and leave the DOM alone.
    const before = htmlSnippet(node);
    ctx.log(`[th-has-data-cells] header-only table ${getSelector(node)} — no safe DOM fix`);
    return {
      unfixed: true,
      selector: getSelector(node),
      before,
      reason: 'header cells exist but table has no data cells; adding rows would change content',
    };
  },
};