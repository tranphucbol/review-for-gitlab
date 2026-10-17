import * as vscode from 'vscode';
import { log } from '../../common/log';

export const JIRA_CONFIG_SECTION = 'gitlab.jira';

export interface JiraLinkConfig {
  /** Absolute URL ending with `/browse/`; a key is appended to it. */
  issueUrlPrefix: string;
  /** Regular expression source; group 1 is the key. Use it with the `g` flag. */
  pattern: string;
}

export interface JiraSettings {
  url?: unknown;
  projectKeys?: unknown;
  ignoredProjectKeys?: unknown;
}

interface ResolvedJiraSettings {
  issueUrlPrefix: string;
  projectKeys: string[];
  ignoredProjectKeys: string[];
}

const PROJECT_KEY = /^[A-Z][A-Z0-9_]+$/;
const KEY_NUMBER = '-[1-9]\\d{0,6}';

let lastInvalidUrl: string | undefined;

const stringsOf = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];

export const toIssueUrlPrefix = (url: string): string | undefined => {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return undefined;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return undefined;
  const path = parsed.pathname.replace(/\/+$/, '').replace(/\(/g, '%28').replace(/\)/g, '%29');
  return `${parsed.origin}${path}/browse/`;
};

const resolveSettings = (settings: JiraSettings): ResolvedJiraSettings | undefined => {
  const url = typeof settings.url === 'string' ? settings.url.trim() : '';
  if (!url) return undefined;
  const issueUrlPrefix = toIssueUrlPrefix(url);
  if (!issueUrlPrefix) {
    if (lastInvalidUrl !== url) {
      lastInvalidUrl = url;
      log.warn(`${JIRA_CONFIG_SECTION}.url is not an http(s) URL; Jira links are off.`);
    }
    return undefined;
  }
  return {
    issueUrlPrefix,
    projectKeys: stringsOf(settings.projectKeys).filter(key => PROJECT_KEY.test(key)),
    ignoredProjectKeys: stringsOf(settings.ignoredProjectKeys)
      .map(key => key.trim().toUpperCase())
      .filter(key => /^[A-Z0-9_]+$/.test(key)),
  };
};

const readSettings = (): ResolvedJiraSettings | undefined => {
  const config = vscode.workspace.getConfiguration(JIRA_CONFIG_SECTION);
  return resolveSettings({
    url: config?.url,
    projectKeys: config?.projectKeys,
    ignoredProjectKeys: config?.ignoredProjectKeys,
  });
};

const keyPrefix = ({ projectKeys, ignoredProjectKeys }: ResolvedJiraSettings): string => {
  if (projectKeys.length > 0) return `(?:${projectKeys.join('|')})`;
  const ignored = ignoredProjectKeys.length > 0 ? `(?!(?:${ignoredProjectKeys.join('|')})-)` : '';
  return `${ignored}[A-Z][A-Z0-9_]{1,9}`;
};

const linkConfig = (resolved: ResolvedJiraSettings): JiraLinkConfig => ({
  issueUrlPrefix: resolved.issueUrlPrefix,
  pattern: `(?<![\\w/.-])(${keyPrefix(resolved)}${KEY_NUMBER})(?!\\w)`,
});

const unique = (keys: string[]): string[] => [...new Set(keys)];

const allMatches = (text: string, pattern: RegExp): RegExpExecArray[] => {
  const matches: RegExpExecArray[] = [];
  const global = new RegExp(
    pattern.source,
    pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`,
  );
  for (let match = global.exec(text); match; match = global.exec(text)) {
    matches.push(match);
    if (match[0] === '') global.lastIndex += 1;
  }
  return matches;
};

const branchKeys = (branch: string, resolved: ResolvedJiraSettings): string[] => {
  const flags = resolved.projectKeys.length > 0 ? 'gi' : 'g';
  const pattern = new RegExp(
    `(?<![A-Za-z0-9])(${keyPrefix(resolved)}${KEY_NUMBER})(?![A-Za-z0-9])`,
    flags,
  );
  return unique(allMatches(branch, pattern).map(match => match[1].toUpperCase()));
};

export const buildJiraLinkConfig = (settings: JiraSettings): JiraLinkConfig | undefined => {
  const resolved = resolveSettings(settings);
  return resolved && linkConfig(resolved);
};

export const getJiraLinkConfig = (): JiraLinkConfig | undefined => {
  const resolved = readSettings();
  return resolved && linkConfig(resolved);
};

export const findJiraKeys = (text: string, config: JiraLinkConfig): string[] =>
  unique(allMatches(text, new RegExp(config.pattern, 'g')).map(match => match[1]));

export const findJiraKeysInBranchWith = (branch: string, settings: JiraSettings): string[] => {
  const resolved = resolveSettings(settings);
  return resolved ? branchKeys(branch, resolved) : [];
};

export const findJiraKeysInBranch = (branch: string): string[] => {
  const resolved = readSettings();
  return resolved ? branchKeys(branch, resolved) : [];
};

export const jiraIssueUrl = (config: JiraLinkConfig, key: string): string =>
  `${config.issueUrlPrefix}${key}`;

type Range = [start: number, end: number];

const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})/;
const REFERENCE_DEFINITION = /^ {0,3}\[[^\]\n]+\]:/;
const INDENTED_CODE = /^(?: {4}|\t)/;

/** Fenced and indented code and reference definitions, as whole lines. */
const blockRanges = (markdown: string): Range[] => {
  const ranges: Range[] = [];
  let offset = 0;
  let fence: { char: string; length: number; start: number } | undefined;
  let previousBlank = true;
  let previousIndentedCode = false;
  for (const line of markdown.split('\n')) {
    const end = offset + line.length;
    if (fence) {
      const close = new RegExp(`^ {0,3}${fence.char === '`' ? '`' : '~'}{${fence.length},}\\s*$`);
      if (close.test(line)) {
        ranges.push([fence.start, end]);
        fence = undefined;
      }
    } else {
      const open = FENCE_OPEN.exec(line);
      const indentedCode: boolean =
        INDENTED_CODE.test(line) && line.trim() !== '' && (previousBlank || previousIndentedCode);
      if (open) {
        fence = { char: open[1][0], length: open[1].length, start: offset };
      } else if (indentedCode || REFERENCE_DEFINITION.test(line)) {
        ranges.push([offset, end]);
      }
      previousIndentedCode = indentedCode;
      previousBlank = line.trim() === '';
    }
    offset = end + 1;
  }
  if (fence) ranges.push([fence.start, markdown.length]);
  return ranges;
};

/** Code spans: a backtick run closed by a run of the same length, not across a blank line. */
const codeSpanRanges = (text: string, base: number): Range[] => {
  const ranges: Range[] = [];
  const runs = allMatches(text, /`+/g);
  let i = 0;
  while (i < runs.length) {
    const open = runs[i];
    let closeIndex = i + 1;
    while (closeIndex < runs.length && runs[closeIndex][0].length !== open[0].length)
      closeIndex += 1;
    const close = runs[closeIndex];
    const start = open.index;
    if (close && !/\n[ \t]*\n/.test(text.slice(start, close.index))) {
      ranges.push([base + start, base + close.index + close[0].length]);
      i = closeIndex + 1;
    } else {
      i += 1;
    }
  }
  return ranges;
};

const INLINE_PROTECTED = [
  /<(a|code|pre)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,
  /<[^>\n]*>/g,
  /!?\[[^\]\n]*\]\([^)\n]*\)/g,
  /\[[^\]\n]*\]\[[^\]\n]*\]/g,
  /(?:https?:\/\/|www\.)[^\s<>]+/gi,
];

const inlineRanges = (text: string, base: number): Range[] => [
  ...codeSpanRanges(text, base),
  ...INLINE_PROTECTED.flatMap(pattern =>
    allMatches(text, pattern).map((m): Range => [base + m.index, base + m.index + m[0].length]),
  ),
];

const protectedRanges = (markdown: string): Range[] => {
  const blocks = blockRanges(markdown);
  const ranges = [...blocks];
  let cursor = 0;
  for (const [start, end] of [...blocks, [markdown.length, markdown.length] as Range]) {
    ranges.push(...inlineRanges(markdown.slice(cursor, start), cursor));
    cursor = Math.max(cursor, end);
  }
  return ranges;
};

/**
 * Turns every Jira key in prose into a markdown link. Code, existing links,
 * URLs and HTML are left exactly as written.
 */
export const linkJiraKeysInMarkdown = (markdown: string, config: JiraLinkConfig): string => {
  const ranges = protectedRanges(markdown);
  return markdown.replace(
    new RegExp(config.pattern, 'g'),
    (match: string, key: string, index: number) => {
      const end = index + match.length;
      if (ranges.some(([start, stop]) => index < stop && end > start)) return match;
      return `[${key}](${jiraIssueUrl(config, key)})`;
    },
  );
};
