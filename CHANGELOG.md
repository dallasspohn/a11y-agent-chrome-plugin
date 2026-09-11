# Changelog

## 0.1.0

First release.

- Core fixers: `html-has-lang`, `image-alt`, `color-contrast`, `label`, `select-name`, `link-name`, `heading-order`, `td-has-header`, `th-has-data-cells`, `click-events-have-key-events`, `video-autoplay`.
- Bonus fixers: `focus-visible` (outline CSS), `document-title`, `frame-title`, `duplicate-id`.
- Two-phase timing: streaming `MutationObserver` at `document_start` + `DOMContentLoaded` axe-core validation pass.
- Popup: fix summary, per-rule before/after, Revert all, Copy JSON, Disable on this site.
- Options: per-rule toggles, host allowlist/blocklist, AI alt toggle, contrast target.
- Badge shows live fix count per tab (green = all fixed, orange = unfixed remain, gray = disabled).
- `test:all` script: build, unit tests, Playwright headless e2e.
- `compare-scan`: diff the extension's report against the a11y-agent CLI scan output.
