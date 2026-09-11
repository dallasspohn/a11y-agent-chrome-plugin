# a11y-autofix

Chromium MV3 extension that auto-repairs WCAG violations in the page DOM as early as possible — at parse time, with no API key required and no network calls. Companion to the CLI scanner at [`dallasspohn/a11y-agent`](https://github.com/dallasspohn/a11y-agent).

## Install (Load unpacked)

1. `npm run build` — bundles color/indexed content scripts into `dist/`.
2. Open `chrome://extensions`.
3. Enable **Developer mode**, click **Load unpacked**, and select the `dist/` directory.
4. Open `test/fixtures/bad-page.html` (or any page) and watch the badge populate.

## What it fixes

The extension maps axe-core rule ids to deterministic DOM patches. **Repair, never remove:** it only adds attributes, wraps/dereferences nothing visible, and never deletes content or changes user text. Color contrast changes the computed *foreground* color only. Every touched node is marked `data-a11y-fixed="<rule-id>"` and skipped on later passes; originals are kept in `data-a11y-orig-*` attributes so the popup's **Revert all** can undo everything.

| axe rule | Fix | Limitations |
| --- | --- | --- |
| `html-has-lang` | Sets `lang` from `content-language` meta → language meta → `navigator.language` → `en` | None known. |
| `image-alt` | `alt` derived in priority order: `title` → `aria-label` → `figcaption` → cleaned filename → configurable placeholder. Decorative images (spacers, purely cosmetic in links) get `alt="" role="presentation"`. | Never used for `data:` or large images; AI alt-text is opt-in and never uploads image bytes. |
| `color-contrast` | Computes WCAG luminance (`sRGB` linearized, `0.2126R+0.7152G+0.0722B`), steps foreground lightness in HSL by 2% toward the far pole until ≥ 4.5:1 (3:1 for large text). | Skips background-image/gradient elements; never alters link colors. |
| `label` | `aria-label` (never a visible `<label>`) from `placeholder` → `title` → humanized `name` → preceding form text → `"Unlabeled <type> field"`. | Doesn't inject layout; markup-only. |
| `link-name` | `aria-label` from `title` → child `img` alt → SVG `title` → icon-class table (~50 icons) → href hostname → fallback. | Element name must be resolvable without live-event heuristics. |
| `heading-order` | Sets `role="heading"` + corrected `aria-level` (never changes the tag, which would break site CSS). | — |
| `td-has-header` / `th-has-data-cells` | Adds `scope="col"` + `role="columnheader"` to a header-looking first row, or `role="columnheader"` and logs "header row inferred — review manually." Adds `<caption>` from an associated heading/aria-label. | Layout tables (`role="presentation"`, single-row, nested-in-cell) are skipped. |
| `click-events-have-key-events` | Non-interactive elements with `onclick`/`cursor:pointer` get `role="button"` + `tabindex="0"` + Enter/Space keydown that fires `.click()`. | `addEventListener`-only handlers are undetectable from a content script; this is an attr/cursor heuristic. |
| `video-autoplay` | Adds `controls`; adds `muted` when `autoplay` is present; adds `aria-label`. Never removes `autoplay`. | — |

Bonus fixers (after the core set): `focus-visible` (injects `*:focus-visible` outline; skipped if the page already defines one), `document-title`, `frame-title`, `duplicate-id` (only 2nd+ occurrences).

**Skipped entirely** (fail silently, never fight the page): `contenteditable` regions, cross-origin iframes, contents of `<template>`, and anything under `aria-hidden="true"`.

Every fixer is wrapped in `try/catch` — a failure logs loudly in the console but never breaks the host page.

## Honest timing model

Chromium cannot rewrite pre-parse HTML (no response-body rewriting), so "before first paint" is:

1. At `document_start`, the content script injects the focus-visible `<style>` and a `MutationObserver` (`childList` + targeted `attributes`) on `<html>`.
2. Added subtrees and relevant attribute changes are repaired **synchronously** in the observer callback, so fixes land before that node's first paint.
3. At `DOMContentLoaded`, a full deterministic pass runs, then bundled `axe-core` (v4.x — matches the CLI's major version) validates and patches any remaining violations by rule id.
4. A second axe run reports anything still failing as **unfixed** and sets `data-a11y-autofix-done="true"`.
5. The observer stays live for SPAs; full reruns are debounced to ≤ 1 per 500 ms, and the observer is disconnected during our own mutations so fixes don't retrigger.

## AI alt-text (optional)

Alt text is deterministic by default (zero network). If enabled in Options and an Anthropic API key is present, the *image description* is replaced by a Claude-generated one:

- The key is stored in **`chrome.storage.local` only** (never `sync`).
- Only `{ src, surrounding-text, page-title }` is sent to Anthropic — **never the image bytes**, never `data:` URIs.
- Applied only after the deterministic fix, capped at 125 chars, and marked `data-a11y-fixed-ai`.

## Popup / Options / Badge

- **Popup**: total found/fixed/unfixed, a collapsible per-rule list with `before → after`, buttons to Revert all, Re-run, Copy JSON, and Disable on this site. The popup itself passes axe with zero violations.
- **Options**: master + per-rule toggles, host allowlist/blocklist, AI-alt toggle + API key with a plain-language data-sharing note, placeholder alt text, contrast target (AA 4.5:1 / AAA 7:1).
- **Badge**: live fix count for the active tab — green when all fixed, orange when unfixed remain, gray when disabled on the site.

## Development

```bash
npm install
npm run build       # bundles src/ → dist/ (Load unpacked path)
npm test            # vitest unit tests only
npm run test:e2e    # Playwright headless e2e (loads dist/, bad-page + table fixtures)
npm run test:all    # build + unit + e2e
```

The e2e suite (`test/extension.spec.js`) launches a persistent Chromium context with the extension loaded (channel `chromium`, headless), serves the fixtures over HTTP (extensions don't run on `file://`), and asserts axe-core reports zero violations for the covered rule ids on the fixture after repair, plus DOM-level assertions for the heuristic rules axe 4.13 no longer ships (`click-events-have-key-events`, `video-autoplay`) and idempotency (a forced re-run reports `fixed: 0`).

Note: the fixtures are intentionally simple and barely styled; the `td-has-header` scenario is in `test/fixtures/table-page.html` because axe marks axiomatic tables in the plain `bad-page.html` fixture as inapplicable (its collapsed borders disqualify it as a "data table").

### Comparing against the CLI

```bash
# 1. Produce the CLI's axe-core JSON (stdout is pure JSON):
(cd ../a11y-agent && node src/scan.js --file samples/bad-page.html --json > /tmp/cli-scan.json)

# 2. Open bad-page.html in a browser with the extension, let it finish, and from the
#    popup click "Copy JSON" → save as /tmp/ext-report.json.
node src/scripts/compare-scan.mjs --cli /tmp/cli-scan.json --ext /tmp/ext-report.json
```

Known differences (by design):

- The extension **also** repairs `td-has-header` (plain tables axe marks inapplicable), `click-events-have-key-events` and `video-autoplay` (rules removed from axe 4.13) — reported as extension-only.
- `label` covers axe's `select-name` (see `RULE_ALIASES` in the script).
- CLI-only rules the extension intentionally does not repair: `landmark-one-main`, `page-has-heading-one`, `region`.
- `link-name` on the logo link is satisfied indirectly because `image-alt` runs first and names the child `<img>` (the compare tool prints a NOTE for this case).

## Roadmap / out of scope

No layout changes, no visible element injection (only the focus-visible CSS), no cross-origin iframe fixes, no page-text rewriting, no network calls by default, no Firefox support.