/*
 * Fork-only: links Jira issue keys in rendered HTML. The host sends the
 * configuration (`{ issueUrlPrefix, pattern }`, built from `gitlab.jira.*`);
 * this module never builds a URL from anything else.
 */
/* global WeakRef */
import { shallowRef } from 'vue';

const LINK_CLASS = 'gl-jira-link';
// Weak references to every root `linkJiraKeys` has seen, relinked on a config change.
const roots = new Set();
const SKIPPED_ELEMENTS = new Set(['A', 'CODE', 'PRE', 'KBD', 'SCRIPT', 'STYLE', 'TEXTAREA']);

const toConfig = config => {
  if (!config || typeof config.issueUrlPrefix !== 'string' || typeof config.pattern !== 'string') {
    return undefined;
  }
  try {
    return {
      issueUrlPrefix: config.issueUrlPrefix,
      pattern: config.pattern,
      regExp: new RegExp(config.pattern, 'g'),
    };
  } catch {
    return undefined;
  }
};

/** The current configuration, reactive so that `JiraText` re-renders when it changes. */
export const jiraLinkConfig = shallowRef(undefined);

export const splitJiraKeys = (text, config = jiraLinkConfig.value) => {
  if (!config || !text) return [{ text }];
  const parts = [];
  const regExp = new RegExp(config.regExp.source, 'g');
  let cursor = 0;
  for (let match = regExp.exec(text); match; match = regExp.exec(text)) {
    const [, key] = match;
    const start = match.index + match[0].indexOf(key);
    if (start > cursor) parts.push({ text: text.slice(cursor, start) });
    parts.push({ key, href: `${config.issueUrlPrefix}${key}` });
    cursor = start + key.length;
    if (match[0] === '') regExp.lastIndex += 1;
  }
  if (cursor < text.length || parts.length === 0) parts.push({ text: text.slice(cursor) });
  return parts;
};

const createLink = ({ key, href }) => {
  const link = document.createElement('a');
  link.href = href;
  link.title = `Open ${key} in Jira`;
  link.className = LINK_CLASS;
  link.textContent = key;
  return link;
};

const textNodesOutsideSkippedElements = root => {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ALL, {
    acceptNode(node) {
      if (node.nodeType === Node.TEXT_NODE) return NodeFilter.FILTER_ACCEPT;
      return SKIPPED_ELEMENTS.has(node.nodeName.toUpperCase())
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_SKIP;
    },
  });
  const nodes = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) nodes.push(node);
  return nodes;
};

/**
 * Links the Jira keys in the text of `root`, except inside links, code and
 * preformatted text. `root` is remembered and relinked when the configuration changes.
 */
export const linkJiraKeys = root => {
  if (![...roots].some(ref => ref.deref() === root)) {
    roots.forEach(ref => !ref.deref() && roots.delete(ref));
    roots.add(new WeakRef(root));
  }
  const config = jiraLinkConfig.value;
  if (!config) return;
  textNodesOutsideSkippedElements(root).forEach(node => {
    const parts = splitJiraKeys(node.nodeValue, config);
    if (!parts.some(part => part.key)) return;
    const fragment = document.createDocumentFragment();
    parts.forEach(part =>
      fragment.appendChild(part.key ? createLink(part) : document.createTextNode(part.text)),
    );
    node.parentNode.replaceChild(fragment, node);
  });
};

const unlinkJiraKeys = root => {
  root.querySelectorAll(`a.${LINK_CLASS}`).forEach(link => {
    link.replaceWith(document.createTextNode(link.textContent));
  });
  root.normalize();
};

/** Applies a configuration from the host (`undefined` or `null` turns links off). */
export const setJiraLinkConfig = config => {
  jiraLinkConfig.value = toConfig(config);
  roots.forEach(ref => {
    const root = ref.deref();
    if (!root?.isConnected) {
      roots.delete(ref);
      return;
    }
    unlinkJiraKeys(root);
    linkJiraKeys(root);
  });
};
