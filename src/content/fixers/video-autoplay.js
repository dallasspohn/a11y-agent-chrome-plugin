import {
  skipNode, isFixed, setAttr, markFixed, htmlSnippet, firstAriaLabel,
} from '../dom-utils.js';

function accessibleName(video) {
  return firstAriaLabel(video) || (video.getAttribute('title')?.trim() || null);
}

export const videoAutoplay = {
  ruleId: 'video-autoplay',
  title: 'Autoplaying media must have controls or be muted',
  impact: 'critical',
  wcag: '1.4.2',
  scope: 'node',
  selector: 'video, audio',
  match(node) {
    if (!(node instanceof HTMLMediaElement)) return false;
    if (skipNode(node)) return false;
    if (isFixed(node)) return false;
    if (!node.hasAttribute('autoplay')) return false;
    if (!node.hasAttribute('controls')) return true;
    if (node.tagName.toLowerCase() === 'video' && !node.hasAttribute('muted')) return true;
    return false;
  },
  fix(node) {
    const before = htmlSnippet(node);
    let changes = [];
    if (!node.hasAttribute('controls')) {
      setAttr(node, 'controls', '');
      changes.push('controls');
    }
    if (node.tagName.toLowerCase() === 'video' && node.hasAttribute('autoplay') && !node.hasAttribute('muted')) {
      setAttr(node, 'muted', '');
      changes.push('muted (autoplay without sound)');
    }
    if (!accessibleName(node)) {
      setAttr(node, 'aria-label', node.tagName.toLowerCase() === 'video' ? 'Video' : 'Audio');
      changes.push('accessible name');
    }
    markFixed(node, 'video-autoplay');
    return {
      before,
      after: htmlSnippet(node),
      source: changes.join('; '),
    };
  },
};