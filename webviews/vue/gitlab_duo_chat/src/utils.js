import { marked } from 'marked';
import markedBidi from 'marked-bidi';
import DOMPurify from 'dompurify';

marked.use(markedBidi());

const defaultConfig = {
  // Safely allow SVG <use> tags
  ADD_TAGS: ['use', 'gl-emoji', 'copy-code'],
  // Prevent possible XSS attacks with data-* attributes used by @rails/ujs
  // See https://gitlab.com/gitlab-org/gitlab-ui/-/issues/1421
  FORBID_ATTR: [
    'data-remote',
    'data-url',
    'data-type',
    'data-method',
    'data-disable-with',
    'data-disabled',
    'data-disable',
    'data-turbo',
  ],
  FORBID_TAGS: ['style', 'mstyle', 'form'],
  ALLOW_UNKNOWN_PROTOCOLS: true,
};

export const markdownConfig = {
  // allowedTags from GitLab's inline HTML guidelines
  // https://docs.gitlab.com/ee/user/markdown.html#inline-html
  ALLOWED_TAGS: [
    'a',
    'abbr',
    'b',
    'blockquote',
    'br',
    'code',
    'dd',
    'del',
    'div',
    'dl',
    'dt',
    'em',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'hr',
    'i',
    'img',
    'ins',
    'kbd',
    'li',
    'ol',
    'p',
    'pre',
    'q',
    'rp',
    'rt',
    'ruby',
    's',
    'samp',
    'span',
    'strike',
    'strong',
    'sub',
    'summary',
    'sup',
    'table',
    'tbody',
    'td',
    'tfoot',
    'th',
    'thead',
    'tr',
    'tt',
    'ul',
    'var',
  ],
  ALLOWED_ATTR: ['class', 'style', 'href', 'src', 'dir'],
  ALLOW_DATA_ATTR: false,
};

export const renderMarkdown = rawMarkdown =>
  DOMPurify.sanitize(marked(rawMarkdown), { ...defaultConfig, ...markdownConfig });
