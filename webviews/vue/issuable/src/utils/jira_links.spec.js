import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { linkJiraKeys, setJiraLinkConfig, splitJiraKeys } from './jira_links';

const config = {
  issueUrlPrefix: 'https://jira.example/browse/',
  pattern: '(?<![\\w/.-])((?!(?:SHA|UTF)-)[A-Z][A-Z0-9_]{1,9}-[1-9]\\d{0,6})(?!\\w)',
};

const render = html => {
  const root = document.createElement('div');
  root.innerHTML = html;
  document.body.appendChild(root);
  linkJiraKeys(root);
  return root;
};

const jiraLinks = root =>
  [...root.querySelectorAll('a.gl-jira-link')].map(a => [a.textContent, a.getAttribute('href')]);

describe('jira_links', () => {
  beforeEach(() => setJiraLinkConfig(config));

  afterEach(() => {
    setJiraLinkConfig(undefined);
    document.body.innerHTML = '';
  });

  describe('splitJiraKeys', () => {
    it('splits text around keys', () => {
      expect(splitJiraKeys('PC-1: fix PE-2')).toEqual([
        { key: 'PC-1', href: 'https://jira.example/browse/PC-1' },
        { text: ': fix ' },
        { key: 'PE-2', href: 'https://jira.example/browse/PE-2' },
      ]);
    });

    it('returns the text alone without keys or config', () => {
      expect(splitJiraKeys('SHA-256')).toEqual([{ text: 'SHA-256' }]);
      setJiraLinkConfig(null);
      expect(splitJiraKeys('PC-1')).toEqual([{ text: 'PC-1' }]);
    });

    it('treats an invalid pattern as no config', () => {
      setJiraLinkConfig({ issueUrlPrefix: 'https://jira.example/browse/', pattern: '(' });
      expect(splitJiraKeys('PC-1')).toEqual([{ text: 'PC-1' }]);
    });
  });

  describe('linkJiraKeys', () => {
    it('links several keys in one text node', () => {
      const root = render('<p>PC-1 and PE-2, not SHA-256</p>');

      expect(jiraLinks(root)).toEqual([
        ['PC-1', 'https://jira.example/browse/PC-1'],
        ['PE-2', 'https://jira.example/browse/PE-2'],
      ]);
      expect(root.textContent).toBe('PC-1 and PE-2, not SHA-256');
      expect(root.querySelector('a').title).toBe('Open PC-1 in Jira');
    });

    it('skips links, code, pre and kbd', () => {
      const html =
        '<p><a href="https://example.com">PC-1</a> <code>PC-2</code> <kbd>PC-3</kbd></p><pre><code>PC-4</code></pre>';
      const root = render(html);

      expect(root.innerHTML).toBe(html);
    });

    it('leaves a GitLab gfm-issue link as GitLab made it', () => {
      const html =
        '<p><a href="https://jira.example.com/browse/PC-1" data-reference-type="external_issue" class="gfm gfm-issue">PC-1</a></p>';
      const root = render(html);

      expect(root.innerHTML).toBe(html);
    });

    it('links inside emphasis and list items', () => {
      const root = render('<ul><li><strong>PC-1</strong></li></ul>');

      expect(root.innerHTML).toBe(
        '<ul><li><strong><a href="https://jira.example/browse/PC-1" title="Open PC-1 in Jira" class="gl-jira-link">PC-1</a></strong></li></ul>',
      );
    });

    it('leaves the DOM unchanged without config', () => {
      setJiraLinkConfig(undefined);
      const root = render('<p>PC-1</p>');

      expect(root.innerHTML).toBe('<p>PC-1</p>');
    });

    it('relinks rendered roots when the config changes', () => {
      setJiraLinkConfig(undefined);
      const root = render('<p>PC-1 text</p>');

      setJiraLinkConfig(config);
      expect(jiraLinks(root)).toEqual([['PC-1', 'https://jira.example/browse/PC-1']]);

      setJiraLinkConfig({ ...config, issueUrlPrefix: 'https://other.example/browse/' });
      expect(jiraLinks(root)).toEqual([['PC-1', 'https://other.example/browse/PC-1']]);

      setJiraLinkConfig(null);
      expect(root.innerHTML).toBe('<p>PC-1 text</p>');
      expect(root.querySelector('p').childNodes).toHaveLength(1);
    });
  });
});
