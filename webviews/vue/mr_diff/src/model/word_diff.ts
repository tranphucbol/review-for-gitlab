export const WORD_LCS_CELL_LIMIT = 50_000;

/** A changed range on one line; line and columns are 1-based, endColumn is exclusive. */
export interface WordRange {
  line: number;
  startColumn: number;
  endColumn: number;
}

interface Token {
  text: string;
  line: number;
  column: number;
}

const TOKEN = /\w+|\s+|[^\w\s]/gu;

const tokenize = (lines: string[], firstLine: number): Token[] => {
  const tokens: Token[] = [];
  lines.forEach((text, index) => {
    if (index > 0) tokens.push({ text: '\n', line: firstLine + index - 1, column: 0 });
    for (const match of text.matchAll(TOKEN)) {
      tokens.push({ text: match[0], line: firstLine + index, column: (match.index ?? 0) + 1 });
    }
  });
  return tokens;
};

const unmatchedTokens = (a: Token[], b: Token[]): [boolean[], boolean[]] => {
  const n = a.length;
  const m = b.length;
  const width = m + 1;
  const table = new Uint32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      table[i * width + j] =
        a[i].text === b[j].text
          ? table[(i + 1) * width + j + 1] + 1
          : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
    }
  }
  const aChanged = new Array<boolean>(n).fill(true);
  const bChanged = new Array<boolean>(m).fill(true);
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i].text === b[j].text) {
      aChanged[i] = false;
      bChanged[j] = false;
      i += 1;
      j += 1;
    } else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) {
      i += 1;
    } else {
      j += 1;
    }
  }
  return [aChanged, bChanged];
};

const toRanges = (tokens: Token[], changed: boolean[]): WordRange[] => {
  const ranges: WordRange[] = [];
  tokens.forEach((token, index) => {
    if (!changed[index] || token.text === '\n') return;
    const endColumn = token.column + token.text.length;
    const previous = ranges[ranges.length - 1];
    if (previous && previous.line === token.line && previous.endColumn === token.column) {
      previous.endColumn = endColumn;
    } else {
      ranges.push({ line: token.line, startColumn: token.column, endColumn });
    }
  });
  return ranges;
};

/**
 * Finds the words that differ between the two sides of a modified block.
 * `oldFirstLine` and `newFirstLine` are the 1-based numbers of the first line
 * of each side. Returns nothing when the block is too large to compare.
 */
export const computeWordDiff = (
  oldLines: string[],
  newLines: string[],
  oldFirstLine: number,
  newFirstLine: number,
  cellLimit = WORD_LCS_CELL_LIMIT,
): { old: WordRange[]; new: WordRange[] } => {
  const oldTokens = tokenize(oldLines, oldFirstLine);
  const newTokens = tokenize(newLines, newFirstLine);
  if (oldTokens.length * newTokens.length > cellLimit) return { old: [], new: [] };
  const [oldChanged, newChanged] = unmatchedTokens(oldTokens, newTokens);
  return { old: toRanges(oldTokens, oldChanged), new: toRanges(newTokens, newChanged) };
};
