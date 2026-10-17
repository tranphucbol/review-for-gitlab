import * as vscode from 'vscode';
import { log } from '../../common/log';
import {
  JiraLinkConfig,
  JiraSettings,
  buildJiraLinkConfig,
  findJiraKeys,
  findJiraKeysFor,
  findJiraKeysInBranch,
  findJiraKeysInMarkdown,
  findJiraKeysInBranchWith,
  getJiraLinkConfig,
  jiraIssueUrl,
  linkJiraKeysInMarkdown,
  toIssueUrlPrefix,
} from './jira_keys';

jest.mock('../../common/log');

const IGNORED = [
  'AES',
  'CVE',
  'GMT',
  'HTTP',
  'ISO',
  'MD',
  'RFC',
  'RSA',
  'SHA',
  'SSL',
  'TLS',
  'UTC',
  'UTF',
  'WCAG',
];
const JIRA = 'https://jira.example.com';
const defaults: JiraSettings = { url: `${JIRA}/`, projectKeys: [], ignoredProjectKeys: IGNORED };
const config = (settings: JiraSettings = {}): JiraLinkConfig => {
  const result = buildJiraLinkConfig({ ...defaults, ...settings });
  if (!result) throw new Error('expected a config');
  return result;
};
const link = (key: string) => `[${key}](${JIRA}/browse/${key})`;

describe('jira_keys', () => {
  describe('toIssueUrlPrefix', () => {
    it.each`
      url                                  | prefix
      ${'https://jira.example.com'}         | ${'https://jira.example.com/browse/'}
      ${'https://jira.example.com/'}        | ${'https://jira.example.com/browse/'}
      ${' https://jira.example.com// '}     | ${'https://jira.example.com/browse/'}
      ${'http://example.com/jira'}         | ${'http://example.com/jira/browse/'}
      ${'https://example.com/jira/'}       | ${'https://example.com/jira/browse/'}
      ${'https://user:pw@example.com/(x)'} | ${'https://example.com/%28x%29/browse/'}
      ${'ftp://example.com'}               | ${undefined}
      ${'file:///etc/passwd'}              | ${undefined}
      ${'jira.example.com'}                 | ${undefined}
    `('turns $url into $prefix', ({ url, prefix }) => {
      expect(toIssueUrlPrefix(url)).toBe(prefix);
    });
  });

  describe('buildJiraLinkConfig', () => {
    it('is off when the url is empty or missing', () => {
      expect(buildJiraLinkConfig({ ...defaults, url: '' })).toBeUndefined();
      expect(buildJiraLinkConfig({ ...defaults, url: '   ' })).toBeUndefined();
      expect(buildJiraLinkConfig({})).toBeUndefined();
    });

    it('is off, and logs once, when the url is not http(s)', () => {
      expect(buildJiraLinkConfig({ ...defaults, url: 'ftp://jira.example' })).toBeUndefined();
      expect(buildJiraLinkConfig({ ...defaults, url: 'ftp://jira.example' })).toBeUndefined();
      expect(log.warn).toHaveBeenCalledTimes(1);
    });

    it('builds issue urls from the prefix', () => {
      expect(jiraIssueUrl(config(), 'PC-12')).toBe(`${JIRA}/browse/PC-12`);
      expect(jiraIssueUrl(config({ url: 'https://example.com/jira' }), 'PC-12')).toBe(
        'https://example.com/jira/browse/PC-12',
      );
    });
  });

  describe('findJiraKeys', () => {
    it.each`
      text                             | keys
      ${'PC-1'}                        | ${['PC-1']}
      ${'ZPA2-10'}                     | ${['ZPA2-10']}
      ${'A_B-3'}                       | ${['A_B-3']}
      ${'(PC-1)'}                      | ${['PC-1']}
      ${'PC-1: fix'}                   | ${['PC-1']}
      ${'PC-1, PE-2.'}                 | ${['PC-1', 'PE-2']}
      ${'**PC-1**'}                    | ${['PC-1']}
      ${'PC-1 and PC-1 again'}         | ${['PC-1']}
      ${'pc-1'}                        | ${[]}
      ${'PC-01'}                       | ${[]}
      ${'PC-'}                         | ${[]}
      ${'xPC-1'}                       | ${[]}
      ${'PC-1x'}                       | ${[]}
      ${'foo/PC-1'}                    | ${[]}
      ${'jira.example.com/browse/PC-1'} | ${[]}
      ${'SHA-256 UTF-8'}               | ${[]}
      ${'CVE-2024-1234'}               | ${[]}
      ${'A-1'}                         | ${[]}
      ${'PC-12345678'}                 | ${[]}
      ${'ABCDEFGHIJK-1'}               | ${[]}
    `('finds $keys in "$text"', ({ text, keys }) => {
      expect(findJiraKeys(text, config())).toEqual(keys);
    });

    it('limits matches to the allowlist and then ignores the ignore list', () => {
      const allowlist = config({ projectKeys: ['PC', 'SHA'] });
      expect(findJiraKeys('PC-1 PE-1 SHA-256 pc-2', allowlist)).toEqual(['PC-1', 'SHA-256']);
    });

    it('drops malformed allowlist entries and normalizes ignored keys', () => {
      expect(findJiraKeys('PC-1 PE-2', config({ projectKeys: ['pc', 'P'] }))).toEqual([
        'PC-1',
        'PE-2',
      ]);
      expect(findJiraKeys('PC-1 PE-2', config({ ignoredProjectKeys: [' pc ', 42] }))).toEqual([
        'PE-2',
      ]);
    });
  });

  describe('findJiraKeysInBranchWith', () => {
    it.each`
      branch               | projectKeys | keys
      ${'feature/PC-12-x'} | ${[]}       | ${['PC-12']}
      ${'PC-12'}           | ${[]}       | ${['PC-12']}
      ${'bugfix_PC-12'}    | ${[]}       | ${['PC-12']}
      ${'PC-12-PE-3'}      | ${[]}       | ${['PC-12', 'PE-3']}
      ${'feature/pc-12'}   | ${[]}       | ${[]}
      ${'feature/pc-12'}   | ${['PC']}   | ${['PC-12']}
      ${'feature/pe-12'}   | ${['PC']}   | ${[]}
      ${'release/1.2'}     | ${[]}       | ${[]}
      ${'fix/SHA-256'}     | ${[]}       | ${[]}
      ${'feature/xPC-12'}  | ${[]}       | ${[]}
    `('finds $keys in $branch with $projectKeys', ({ branch, projectKeys, keys }) => {
      expect(findJiraKeysInBranchWith(branch, { ...defaults, projectKeys })).toEqual(keys);
    });

    it('finds nothing when off', () => {
      expect(findJiraKeysInBranchWith('feature/PC-12', { ...defaults, url: '' })).toEqual([]);
    });
  });

  describe('reading the settings', () => {
    const mockSettings = (settings: JiraSettings) =>
      jest
        .mocked(vscode.workspace.getConfiguration)
        .mockReturnValue(settings as unknown as vscode.WorkspaceConfiguration);

    it('reads the gitlab.jira section', () => {
      mockSettings(defaults);
      expect(getJiraLinkConfig()).toEqual(config());
      expect(findJiraKeysInBranch('feature/PC-12')).toEqual(['PC-12']);
      expect(vscode.workspace.getConfiguration).toHaveBeenCalledWith('gitlab.jira');
    });

    it('is off when the section is empty', () => {
      mockSettings({});
      expect(getJiraLinkConfig()).toBeUndefined();
      expect(findJiraKeysInBranch('feature/PC-12')).toEqual([]);
    });
  });

  describe('linkJiraKeysInMarkdown', () => {
    const run = (markdown: string) => linkJiraKeysInMarkdown(markdown, config());

    it('links keys in prose', () => {
      expect(run('Fixes PC-1 and (PE-2), see **ZPA2-10**.')).toBe(
        `Fixes ${link('PC-1')} and (${link('PE-2')}), see **${link('ZPA2-10')}**.`,
      );
    });

    it('leaves text without keys untouched', () => {
      expect(run('SHA-256, UTF-8 and pc-5')).toBe('SHA-256, UTF-8 and pc-5');
    });

    it.each`
      name                        | markdown
      ${'a backtick fence'}       | ${'```\nPC-1\n```'}
      ${'a long backtick fence'}  | ${'````js\nPC-1\n```\nPC-2\n````'}
      ${'a tilde fence'}          | ${'~~~\nPC-1\n~~~'}
      ${'an unclosed fence'}      | ${'```\nPC-1\n\nPC-2'}
      ${'indented code'}          | ${'text\n\n    PC-1'}
      ${'inline code'}            | ${'`PC-1`'}
      ${'double backtick code'}   | ${'``a ` PC-1``'}
      ${'a link'}                 | ${'[PC-1](https://jira.example.com/browse/PC-1)'}
      ${'a link to elsewhere'}    | ${'[see PC-1](https://example.com/PC-1)'}
      ${'an image'}               | ${'![PC-1](/uploads/abc/PC-1.png)'}
      ${'a reference link'}       | ${'[PC-1][ref]'}
      ${'a reference definition'} | ${'[ref]: https://example.com PC-1'}
      ${'an autolink'}            | ${'<https://example.com/PC-1>'}
      ${'a bare URL'}             | ${'https://example.com/browse/PC-1?x=PC-2'}
      ${'a www URL'}              | ${'www.example.com/PC-1'}
      ${'an HTML link'}           | ${'<a href="x">PC-1</a>'}
      ${'HTML code'}              | ${'<code>PC-1</code>'}
      ${'an HTML attribute'}      | ${'<img alt="PC-1" src="x">'}
    `('leaves $name alone', ({ markdown }) => {
      expect(run(markdown)).toBe(markdown);
    });

    it('links keys around code and fences', () => {
      expect(run('PC-1 `PC-2` PC-3\n```\nPC-4\n```\nPC-5')).toBe(
        `${link('PC-1')} \`PC-2\` ${link('PC-3')}\n\`\`\`\nPC-4\n\`\`\`\n${link('PC-5')}`,
      );
    });

    it('does not pair code spans across a blank line', () => {
      expect(run('a ` PC-1\n\nPC-2 `')).toBe(`a \` ${link('PC-1')}\n\n${link('PC-2')} \``);
    });

    it('keeps indented list continuations as prose', () => {
      expect(run('- item\n    PC-1')).toBe(`- item\n    ${link('PC-1')}`);
    });

    it('leaves rendered suggestions alone', () => {
      const suggestion =
        '```diff\n- PC-1\n+ PC-2\n```\n*[open suggestion on the web](https://gitlab.example/x#note_1)*';
      expect(run(`PC-3\n${suggestion}`)).toBe(`${link('PC-3')}\n${suggestion}`);
    });

    it('links with a context path prefix', () => {
      expect(linkJiraKeysInMarkdown('PC-1', config({ url: 'https://example.com/jira/' }))).toBe(
        '[PC-1](https://example.com/jira/browse/PC-1)',
      );
    });
  });

  describe('findJiraKeysInMarkdown', () => {
    it('finds the keys in prose only, in order and once', () => {
      const markdown = [
        'Fixes PE-88 and PC-1, see `PC-7`.',
        '```',
        'PC-8',
        '```',
        'Again PE-88, [link](https://jira.example.com/browse/PC-2) and SHA-256.',
      ].join('\n');
      expect(findJiraKeysInMarkdown(markdown, config())).toEqual(['PE-88', 'PC-1']);
    });
  });

  describe('findJiraKeysFor', () => {
    const mr = {
      title: 'PC-12: Add retries for PE-3',
      source_branch: 'feature/PC-12-retries',
      description: 'Part of ACQ-4, not `ACQ-5`. Also PE-3.',
    };

    beforeEach(() => {
      jest
        .mocked(vscode.workspace.getConfiguration)
        .mockReturnValue(defaults as unknown as vscode.WorkspaceConfiguration);
    });

    it('takes the branch, then the title, then the description', () => {
      expect(findJiraKeysFor(config(), { mr })).toEqual([
        { key: 'PC-12', source: 'branch' },
        { key: 'PE-3', source: 'merge request title' },
        { key: 'ACQ-4', source: 'merge request description' },
      ]);
    });

    it('prefers an explicit branch over the source branch', () => {
      expect(findJiraKeysFor(config(), { branch: 'ZPA-9-local', mr })[0]).toEqual({
        key: 'ZPA-9',
        source: 'branch',
      });
    });

    it('works with a branch alone and with no description', () => {
      expect(findJiraKeysFor(config(), { branch: 'PC-1-x' })).toEqual([
        { key: 'PC-1', source: 'branch' },
      ]);
      expect(
        findJiraKeysFor(config(), { mr: { ...mr, description: null, source_branch: 'main' } }),
      ).toEqual([
        { key: 'PC-12', source: 'merge request title' },
        { key: 'PE-3', source: 'merge request title' },
      ]);
    });
  });
});
