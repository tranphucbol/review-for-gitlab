import { languageForName, monaco, onThemeApplied, tabSize } from './monaco_runtime';

interface CodeBlock {
  text: string;
  language: string;
}

// colorized code loses its line breaks to <br/>, so the source is kept for the next theme
const sources = new WeakMap<HTMLElement, CodeBlock>();
const coloured = new WeakSet<HTMLElement>();

const LANGUAGE_CLASS = /(?:^|\s)language-(\S+)/;

const languageOf = (pre: HTMLElement): string | undefined => {
  const name = pre.getAttribute('lang') ?? LANGUAGE_CLASS.exec(pre.className)?.[1];
  return name ? languageForName(name) : undefined;
};

const blockOf = (code: HTMLElement): CodeBlock | undefined => {
  const known = sources.get(code);
  if (known) return known;
  const pre = code.parentElement;
  const language = pre && languageOf(pre);
  if (!language) return undefined;
  const block = { text: code.textContent ?? '', language };
  sources.set(code, block);
  return block;
};

/**
 * Colours the code blocks in rendered GitLab markdown with the tokenizers and theme of the diff
 * panes, which follow VS Code's theme. GitLab's own highlighting classes have no styles here.
 * Monaco escapes the text it colours, so the result is as safe as the text was. Blocks already
 * coloured are skipped unless `recolour` is set, as it is after a theme change.
 */
export const highlightCodeBlocks = async (root: HTMLElement, recolour = false): Promise<void> => {
  const codes = Array.from(root.querySelectorAll<HTMLElement>('pre > code'));
  await Promise.all(
    codes.map(async code => {
      if (coloured.has(code) && !recolour) return;
      const block = blockOf(code);
      if (!block) return;
      coloured.add(code);
      const html = await monaco.editor.colorize(block.text, block.language, {
        tabSize: tabSize(),
      });
      // eslint-disable-next-line no-param-reassign
      code.innerHTML = html;
      code.parentElement?.classList.add('gl-diff-code-block');
    }),
  );
};

const ignoreFailure = () => {
  // a block that cannot be coloured keeps GitLab's plain rendering
};

/**
 * Colours the root's code blocks now and again whenever the theme changes. Call the returned
 * `update` after the root re-renders and `stop` when it goes away.
 */
export const watchCodeBlocks = (root: HTMLElement): { update: () => void; stop: () => void } => {
  const update = () => highlightCodeBlocks(root).catch(ignoreFailure);
  update();
  const stop = onThemeApplied(() => highlightCodeBlocks(root, true).catch(ignoreFailure));
  return { update, stop };
};
