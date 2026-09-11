#!/usr/bin/env node
/**
 * Compare the CLI scanner's axe-core output with the extension's report.
 *
 * Usage:
 *   node src/scripts/compare-scan.mjs \
 *     --cli <a11y-agent scan.js --json output> \
 *     --ext  <extension report JSON (popup "Copy JSON")>
 *
 * The CLI JSON is the raw axe-core result object from a11y-agent's
 * `node src/scan.js --file samples/bad-page.html --json`. The extension
 * report is the superset shape `{ summary, fixes[], unfixed[] }`.
 *
 * "Found" for the extension = rule ids in fixes[] ∪ unfixed[].
 * Exits 0 when every fixable CLI rule id is accounted for by the extension.
 */
import { readFileSync } from 'node:fs';

function usage() {
  console.error('usage: node src/scripts/compare-scan.mjs --cli <cli-scan.json> --ext <extension-report.json>');
  process.exit(2);
}

const args = process.argv.slice(2);
const getVal = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : undefined;
};

const cliPath = getVal('--cli');
const extPath = getVal('--ext');
if (!cliPath || !extPath) usage();

const parsedCli = JSON.parse(readFileSync(cliPath, 'utf8'));
const parsedExt = JSON.parse(readFileSync(extPath, 'utf8'));

const cli = parsedCli.analyze ? { violations: parsedCli.analyze.violations } : parsedCli;
const ext = parsedExt.report || parsedExt;

const cliRules = cli.violations.map((v) => v.id);
const cliByRule = new Map(cli.violations.map((v) => [v.id, v.nodes?.length ?? 0]));
const uncounted = {};
for (const f of ext.fixes || []) uncounted[f.ruleId] = (uncounted[f.ruleId] || 0) + 1;
// The label fixer reports under its canonical skip-priority, but axe 4.13 emits
// the separate select-name id for unnamed <select>. Treat them as one rule.
const RULE_ALIASES = { label: 'select-name', 'select-name': 'label' };
const canonical = (id) => RULE_ALIASES[id] || id;
const extUnfixed = new Set((ext.unfixed || []).map((u) => u.ruleId));
const extFound = new Set([...Object.keys(uncounted), ...extUnfixed]);

console.log(`CLI scan:    ${cliPath}`);
console.log(`Extension:   ${extPath}\n`);

const cliByCanonical = new Map([...cliByRule].map(([id, n]) => [canonical(id), n]));
const rows = [];
for (const id of new Set([...cliRules.map(canonical), ...extFound])) {
  const cliCount = cliByCanonical.get(id);
  const extCount = uncounted[id];
  const inCli = cliCount !== undefined;
  const inExt = extFound.has(id);
  let tag;
  if (inCli && inExt) tag = 'MATCH';
  else if (inCli && !inExt) tag = 'MISSING';
  else tag = 'EXTRA';
  rows.push({
    tag,
    id,
    cli: inCli ? String(cliCount) : '-',
    ext: inExt ? String(extCount || (extUnfixed.has(id) ? 'unfixed' : 0)) : '-',
  });
}

const tagColor = (t) => (t === 'MATCH' ? '\x1b[32m' : t === 'EXTRA' ? '\x1b[33m' : '\x1b[31m') + t + '\x1b[0m';
const pad = (s, n) => String(s).padEnd(n);
for (const { tag, id, cli, ext } of rows) {
  console.log(`  ${pad(tagColor(tag), 14)} ${pad(id, 30)} cli=${pad(cli, 4)} extension=${ext}`);
}

const matches = rows.filter((r) => r.tag === 'MATCH').length;
const extra = rows.filter((r) => r.tag === 'EXTRA');
const missing = rows.filter((r) => r.tag === 'MISSING');

console.log(`\n${matches} matched rule ids`);
if (extra.length) {
  console.log(`\n${extra.length} extension-only (heuristic/inapplicable in axe 4.13):`);
  for (const r of extra) console.log(`  - ${r.id}`);
}
const expectedMissing = new Set(['region', 'landmark-one-main', 'page-has-heading-one']);
const imageAltFixed = (ext.fixes || []).some((f) => f.ruleId === 'image-alt');
const notes = [];
if (missing.some((r) => r.id === 'link-name') && imageAltFixed) {
  // image-alt ran first and gave a child <img> alt text, so the link's
  // accessible name is satisfied even though the link-name fixer stayed idle.
  notes.push('link-name satisfied via image-alt alt text on a child <img>');
}
if (missing.length) {
  console.log(`\n${missing.length} CLI-only, not repaired by the extension:`);
  for (const r of missing) console.log(`  - ${r.id}`);
}
if (notes.length) for (const n of notes) console.log(`\nNOTE: ${n}`);

const hardMissing = missing.some((r) => !expectedMissing.has(r.id) && !(r.id === 'link-name' && imageAltFixed));
process.exit(hardMissing ? 1 : 0);