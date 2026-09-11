# AGENTS.md — `a11y-autofix`

Chromium MV3 extension that auto-repairs WCAG violations in page DOM as early as possible (parse time), with no API key and no network calls. Companion to the CLI scanner at `dallasspohn/a11y-agent`.

**Current state:** Repo is empty — this file is the spec to build from. No code, no `package.json`, no test fixtures yet.

## Reference repo (read before writing code)

The a11y-agent repo is already cloned at `/home/dspohn/dev/1-workspace/a11y-agent` — use that local path, don't re-clone. It is the ground truth:

- `samples/bad-page.html` — fixture with 9+ intentional violations. Primary test page. There is also `good-page.html` and `web-page.html`. Copy the fixture verbatim into `test/fixtures/` when it changes.
- `src/scan.js` — CLI pipeline (Playwright → axe-core → Claude). Its `--json` output is the interchange format: violations are raw axe-core objects with `id`, `impact` (`critical|serious|moderate|minor`), `help`, and `node.target` (CSS selector array). Impact palette is that same 4-level chalk scheme. JSON goes to stdout, status/debug to stderr.
- axe-core version in this extension's `vendor/axe.min.js` must match the CLI's major version — currently **v4.x** (`@axe-core/playwright ^4.10.0` in a11y-agent's package.json).
- Compare `node src/scan.js --file samples/bad-page.html --json` against the extension's "found" list — they must match.

## Non-negotiable principles

1. **Repair, never remove.** May add attrs, wrap, inject CSS, change computed colors. Never delete content, hide elements, change form values, or alter user text.
2. **Deterministic first, AI optional.** Zero-network fixes by default; Claude alt-text is a gated optional toggle.
3. **Idempotent.** Every touched node gets `data-a11y-fixed="<rule-id>"` and is skipped on later passes. Second run must change nothing.
4. **Reversible.** Store originals in `data-a11y-orig-<attr>`; popup "revert" undoes all fixes on the page. RTL text is not to be flipped.
5. **Fail silently on the page, loudly in the log.** Wrap every fixer in try/catch; never break the host page.
6. **Don't fight the page.** Skip `contenteditable` regions, foreign/cross-origin iframe contents, elements inside `<template>`, and anything `aria-hidden="true"`.

## Architecture

`manifest.json` perms: `["storage", "activeTab", "scripting"]`, `host_permissions: ["<all_urls>"]`, one content script at `document_start`, `all_frames: true`. Do NOT add `tabs`, `webRequest`, or `history`.

```
src/content/early.js         document_start: focus-ring CSS + MutationObserver
src/content/fixers/          one file per rule, export { ruleId, match(node), fix(node) }
src/content/contrast-math.js WCAG luminance/contrast helpers (pure, unit-testable)
src/content/fixer-registry.js imports all fixers, exposes runAll(root)
src/content/report.js        collects {ruleId, selector, before, after, timestamp}
src/background/service-worker.js  badge, storage, optional Claude proxy
src/{popup,options}/...      popup must itself pass axe with zero violations
vendor/axe.min.js            bundled axe-core v4.x
test/fixtures/bad-page.html  copied verbatim from a11y-agent/samples
```

### Timing model (what "before render" means)

Chromium cannot rewrite pre-parse HTML (no response-body rewriting). So:

1. `document_start`: inject `<style id="a11y-autofix-css">` (focus-ring rule) and a `MutationObserver` on `document.documentElement` with `{childList:true, subtree:true, attributes:true, attributeFilter:['alt','aria-label','lang','autoplay','onclick','style','class']}`.
2. Observer callback: run fixers synchronously per added node/subtree so fixes land before that node's first paint.
3. `DOMContentLoaded`: full pass, then bundled axe-core to catch what streaming missed; map violations to fixers by `ruleId`.
4. **Post-fix validation**: run axe-core a second time; anything still failing → report as "unfixed".
5. Ongoing: keep observer live for SPA routes, debounce full reruns to ≤1 per 500 ms, disconnect observer during own mutations and reconnect after (own edits must not retrigger).

## The nine fixers (exact behaviors)

Each maps to an axe rule id and records HTML `before`/`after` snippets in the report. `data-a11y-fixed` set on every touched node.

1. **`html-has-lang`**: `<html>` missing/empty `lang`. Set to `<meta http-equiv="content-language">` → `navigator.language` → `"en"`. Log which source.
2. **`image-alt`**: `<img>` with no `alt` (leave `alt=""` alone — valid decorative). Also `<input type="image">`, `<svg>` with no accessible name. Deterministic priority: `title` → `aria-label` → `figcaption` → cleaned filename (`/img/hero-mountain_02.jpg` → `"hero mountain 02"`, only if a 3+ letter alphabetic word and not a hash/UUID) → placeholder string (default `"Image: missing description"`, configurable). Decorative images (inside `<a>` with text, ≤1px, spacer gif) get `alt="" role="presentation"`. AI mode: send `{src, surroundingText, pageTitle}` to SW → Claude → ≤125 char desc, applied *after* deterministic fix, never for `data:` URIs, never the image bytes.
3. **`color-contrast`**: effective contrast < 4.5:1 (3:1 for large text ≥24px, or ≥18.66px bold). Resolve background by walking ancestors to first non-transparent `background-color`; assume white at `<html>`; **skip and log** elements with background-image/gradient. Only change foreground: convert to HSL, step lightness toward the pole farther from background luminance in 2% increments until threshold. Preserve hue/saturation. Inline style with `!important`, store original in `data-a11y-orig-color`. Never change `<a>` link colors (must stay distinguishable). All math in `contrast-math.js` (sRGB linearization, `0.2126R+0.7152G+0.0722B`, `(L1+0.05)/(L2+0.05)`).
4. **`label`**: `<input>` (except hidden/submit/button/reset/image), `<select>`, `<textarea>` with no label-for/wrapping label/aria-label/aria-labelledby. Derive: `placeholder` → `title` → `name` (humanize `first_name` → `"First name"`) → nearest preceding text in the form group → `"Unlabeled <type> field"`. Apply as `aria-label` — never inject a visible `<label>` (changes layout).
5. **`link-name`**: `<a href>`/`<button>` with empty accessible name. Derive: `title` → child img alt → svg title → icon-class lookup table (~50 common icons: `fa-twitter`→`"Twitter"`, `icon-search`→`"Search"`, `bi-envelope`→`"Email"`) → href hostname for external → `"Unlabeled link"/"Unlabeled button"`. Apply as `aria-label`.
6. **`heading-order`**: heading more than one level above previous, or zero `<h1>`. Never change the tag (breaks site CSS). Set `role="heading"` + `aria-level` (corrected, or `1` for the first heading when no `<h1>` exists).
7. **`td-has-header`/`th-has-data-cells`**: data tables with no `<th>`/`<thead>`, excluding `role="presentation"` and layout tables (single row or nested in a cell). If first-row cells look like headers (short text, not numeric-only, visually distinct), set `scope="col"` + `role="columnheader"`; else add `role="columnheader"` and log "header row inferred — review manually." Add `<caption>` from a preceding heading/aria-label only when obviously associated.
8. **`click-events-have-key-events`**: non-interactive elements (`div/span/li/img/p`…) with `onclick` or `cursor:pointer` and no `tabindex`/`role`, not inside a native interactive element. Add `role="button"` + `tabindex="0"` + keydown listener (Enter/Space → `.click()`), plus `aria-label` (rule-5 derivation) if no text. Limitation to document: `addEventListener` registrations are undetectable from a content script; attr + cursor heuristics are the practical signals.
9. **`video-autoplay`**: `video`/`audio` with `autoplay` lacking `controls`, or with `autoplay` lacking `muted`. Add `controls`; add `muted` if autoplay and not muted. Never remove `autoplay`. Add `aria-label="Video"/"Audio"` if no accessible name.

Bonus fixers (after the nine pass): `focus-visible` (inject `*:focus-visible { outline:3px solid #005fcc !important; outline-offset:2px !important; }` at document_start; skip if page already defines it — catch `SecurityError` on cross-origin stylesheets); `document-title` (empty title → first `<h1>` or hostname); `frame-title` (iframe title from src hostname); `duplicate-id` (append `-a11y-2`, `-a11y-3` only on 2nd+ occurrences, never the first).

## Report / popup / options / badge

- Report JSON must be a **superset of `scan.js --json`**: `{url, timestamp, summary:{found,fixed,unfixed,skipped}, fixes:[{ruleId,impact,wcag,selector,before,after,source}], unfixed:[{ruleId,selector,reason}]}`.
- Popup: total found/fixed/unfixed; collapsible list per rule with before→after, colored by impact (critical=red, serious=orange, moderate=yellow, minor=gray); buttons Revert all / Re-run / Copy JSON / Disable on this site. Popup must pass axe with zero violations.
- Options: master + per-rule toggles (all nine + bonuses, default on), host allowlist/blocklist, AI-alt toggle + Anthropic API key (**`storage.local` only, never `sync`**) with plain-language data-sharing note, placeholder-alt field, contrast target AA 4.5 / AAA 7.
- Badge shows fix count for active tab; green when all fixed, orange when unfixed remain, gray when disabled on site.

## Testing

- Unit tests (Vitest or Node built-in runner): `contrast-math.js` (verify `#777` on `#fff` = 4.48:1 fails, `#767676` on `#fff` = 4.54:1 passes), filename-to-alt cleanup, `name` humanizing, icon lookup.
- Playwright test `test/extension.spec.js`: `chromium.launchPersistentContext(userDataDir, {args:['--disable-extensions-except=<path>','--load-extension=<path>']})`; open `test/fixtures/bad-page.html`; wait for `document.documentElement.dataset.a11yAutofixDone === "true"` (attribute set when post-fix validation completes); then axe via `@axe-core/playwright`, assert **zero violations** for all nine rule ids.
- Idempotency: run fixer twice on bad-page; second run's report must have `fixed: 0`.
- Regression: manually verify a news site, a form-heavy site, and a SPA — no visible breakage/layout change, plausible badge count. Record findings in README.
- Commit after each numbered step so the demo path (`load unpacked → open bad-page.html → badge shows 9+`) is never broken mid-refactor.

## Deliverables / scope

- Loadable via `chrome://extensions` → Load unpacked; README (install, per-rule behavior + limitations, honest timing model, AI alt-text data flow, test + CLI comparison instructions); passing tests; `CHANGELOG.md` with single `0.1.0` entry listing the nine core rules.
- Out of scope: layout changes / injecting visible elements (only exception: focus-ring CSS), cross-origin iframes, rewriting page text, phoning home, Firefox support.