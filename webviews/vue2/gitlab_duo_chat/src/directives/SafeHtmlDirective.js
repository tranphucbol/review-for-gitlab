// Copypaste from https://gitlab.com/gitlab-org/gitlab-ui/-/blob/main/src/directives/safe_html/safe_html.js
import DOMPurify from 'dompurify';

const forbiddenDataAttrs = [
  'data-remote',
  'data-url',
  'data-type',
  'data-method',
  'data-disable-with',
  'data-disabled',
  'data-disable',
  'data-turbo',
];

const DEFAULT_CONFIG = {
  RETURN_DOM_FRAGMENT: true,
  ALLOW_UNKNOWN_PROTOCOLS: true,
  FORBID_ATTR: [...forbiddenDataAttrs],
};

const transform = (el, binding) => {
  if (binding.oldValue !== binding.value) {
    const config = { ...DEFAULT_CONFIG, ...(binding.arg ?? {}) };

    // eslint-disable-next-line no-param-reassign
    el.textContent = '';
    el.appendChild(DOMPurify.sanitize(binding.value, config));
  }
};

export default transform;
