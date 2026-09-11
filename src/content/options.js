import { ALL_FIXERS } from './fixer-registry.js';

export const DEFAULT_OPTIONS = {
  enabled: true,
  allowedHosts: [],
  blockedHosts: [],
  rules: Object.create(null),
  aiAlt: { enabled: false, anthropicKey: '', model: 'claude-3-5-sonnet-latest' },
  placeholderAlt: 'Image: missing description',
  contrastTarget: 'AA', // 'AA' (4.5:1) | 'AAA' (7:1)
};

export const STORAGE_KEY = 'a11yOptions';

export function hostBlocked(options, hostname) {
  const host = String(hostname ?? (typeof location !== 'undefined' ? location.hostname : '')).toLowerCase();
  if ((options.blockedHosts || []).some((h) => host === String(h).toLowerCase() || host.endsWith('.' + String(h).toLowerCase()))) return true;
  const allowed = options.allowedHosts || [];
  if (allowed.length > 0 && !allowed.some((h) => host === String(h).toLowerCase() || host.endsWith('.' + String(h).toLowerCase()))) return true;
  return false;
}

export function normalizeOptions(raw) {
  const base = {
    ...DEFAULT_OPTIONS,
    rules: { ...(ALL_FIXERS.reduce((acc, f) => { acc[f.ruleId] = true; return acc; }, {})) },
  };
  const o = raw || {};
  const out = {
    ...base,
    ...(o.enabled === undefined ? {} : { enabled: Boolean(o.enabled) }),
    ...(o.allowedHosts ? { allowedHosts: Array.isArray(o.allowedHosts) ? o.allowedHosts : [] } : {}),
    ...(o.blockedHosts ? { blockedHosts: Array.isArray(o.blockedHosts) ? o.blockedHosts : [] } : {}),
    ...(o.aiAlt !== undefined ? { aiAlt: { ...base.aiAlt, enabled: Boolean(o.aiAlt.enabled), anthropicKey: o.aiAlt.anthropicKey || '', model: o.aiAlt.model || base.aiAlt.model } } : {}),
    ...(o.placeholderAlt !== undefined ? { placeholderAlt: String(o.placeholderAlt) } : {}),
    ...(o.contrastTarget === 'AAA' || o.contrastTarget === 'AA' ? { contrastTarget: o.contrastTarget } : {}),
  };
  if (o.rules && typeof o.rules === 'object') {
    for (const ruleId of Object.keys(base.rules)) {
      if (typeof o.rules[ruleId] === 'boolean') out.rules[ruleId] = o.rules[ruleId];
    }
  }
  return out;
}