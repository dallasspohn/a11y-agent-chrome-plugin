const $ = (id) => document.getElementById(id);
const RULES = [
  ['html-has-lang', 'html-has-lang', 'Page language'],
  ['image-alt', 'image-alt', 'Image alt text'],
  ['color-contrast', 'color-contrast', 'Color contrast'],
  ['label', 'label', 'Form field labels'],
  ['link-name', 'link-name', 'Link and button names'],
  ['heading-order', 'heading-order', 'Heading order'],
  ['td-has-header', 'td-has-header', 'Table headers'],
  ['th-has-data-cells', 'th-has-data-cells', 'Table data cells'],
  ['click-events-have-key-events', 'click-events-have-key-events', 'Keyboard operability'],
  ['video-autoplay', 'video-autoplay', 'Autoplay media'],
  ['focus-visible', 'focus-visible', 'Focus visibility'],
  ['document-title', 'document-title', 'Document title'],
  ['frame-title', 'frame-title', 'Frame titles'],
  ['duplicate-id', 'duplicate-id', 'Duplicate IDs'],
];

(async function init() {
  const options = await chrome.storage.local.get('a11yOptions').then((s) => s.a11yOptions || {});

  $('enabled').checked = options.enabled !== false;
  $('allowed-hosts').value = (options.allowedHosts || []).join('\n');
  $('blocked-hosts').value = (options.blockedHosts || []).join('\n');
  $('ai-enabled').checked = options.aiAlt?.enabled === true;
  $('anthropic-key').value = options.aiAlt?.anthropicKey || '';
  $('ai-model').value = options.aiAlt?.model || 'claude-3-5-sonnet-latest';
  $('placeholder-alt').value = typeof options.placeholderAlt === 'string' ? options.placeholderAlt : 'Image: missing description';
  const contrast = options.contrastTarget === 'AAA' ? 'AAA' : 'AA';
  document.querySelector(`input[name="contrast"][value="${contrast}"]`).checked = true;

  const rules = options.rules || {};
  const fieldset = $('rule-toggles');
  for (const [ruleId, , label] of RULES) {
    const wrap = document.createElement('label');
    wrap.className = 'row switch';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.name = `rule-${ruleId}`;
    input.id = `rule-${ruleId}`;
    input.checked = rules[ruleId] !== false;
    const span = document.createElement('span');
    span.textContent = label;
    wrap.append(input, span);
    fieldset.append(wrap);
  }

  $('options-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const rulesOut = {};
    for (const [ruleId] of RULES) {
      rulesOut[ruleId] = $(`rule-${ruleId}`).checked;
    }
    const next = {
      enabled: $('enabled').checked,
      allowedHosts: hostsFrom($('allowed-hosts').value),
      blockedHosts: hostsFrom($('blocked-hosts').value),
      rules: rulesOut,
      aiAlt: {
        enabled: $('ai-enabled').checked,
        anthropicKey: $('anthropic-key').value.trim(),
        model: $('ai-model').value.trim() || 'claude-3-5-sonnet-latest',
      },
      placeholderAlt: $('placeholder-alt').value.trim() || 'Image: missing description',
      contrastTarget: document.querySelector('input[name="contrast"]:checked').value,
    };
    await chrome.runtime.sendMessage({ type: 'SAVE_OPTIONS', options: next });
    const status = $('save-status');
    status.textContent = 'Saved.';
    setTimeout(() => { status.textContent = ''; }, 2500);
  });
})();

function hostsFrom(text) {
  return Array.from(new Set(
    text.split('\n').map((s) => s.trim().toLowerCase()).filter(Boolean),
  ));
}