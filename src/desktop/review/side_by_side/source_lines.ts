import { CodeRange } from './messages';

/** The largest line LCS the mapping runs; past it the changed middle is one block, as in the webview. */
export const LINE_LCS_CELL_LIMIT = 250_000;

/** A range in another text, and whether every line in it is unchanged from the original. */
export interface SourceRange {
  range: CodeRange;
  exact: boolean;
}

const splitLines = (text: string): string[] => text.split(/\r?\n/);

/**
 * For each line of `from`, its 0-based index in `to` when the line is unchanged, -1 otherwise.
 * Common leading and trailing lines always match; the middle matches by LCS when it fits.
 */
const matchLines = (from: string[], to: string[]): number[] => {
  const matches = new Array<number>(from.length).fill(-1);
  let prefix = 0;
  while (prefix < from.length && prefix < to.length && from[prefix] === to[prefix]) {
    matches[prefix] = prefix;
    prefix += 1;
  }
  let suffix = 0;
  while (
    suffix < from.length - prefix &&
    suffix < to.length - prefix &&
    from[from.length - 1 - suffix] === to[to.length - 1 - suffix]
  ) {
    matches[from.length - 1 - suffix] = to.length - 1 - suffix;
    suffix += 1;
  }
  const a = from.slice(prefix, from.length - suffix);
  const b = to.slice(prefix, to.length - suffix);
  if (a.length === 0 || b.length === 0) return matches;
  if ((a.length + 1) * (b.length + 1) > LINE_LCS_CELL_LIMIT) return matches;
  // lengths[i][j]: the LCS of a[i..] and b[j..], so the walk below runs forwards
  const width = b.length + 1;
  const lengths = new Uint32Array((a.length + 1) * width);
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      lengths[i * width + j] =
        a[i] === b[j]
          ? lengths[(i + 1) * width + j + 1] + 1
          : Math.max(lengths[(i + 1) * width + j], lengths[i * width + j + 1]);
    }
  }
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      matches[prefix + i] = prefix + j;
      i += 1;
      j += 1;
    } else if (lengths[(i + 1) * width + j] >= lengths[i * width + j + 1]) {
      i += 1;
    } else {
      j += 1;
    }
  }
  return matches;
};

/**
 * The lines of `to` that a changed line of `from` corresponds to: the lines between the
 * matches around it. An empty region is the line it sits before. 0-based, inclusive.
 */
const changedRegion = (
  matches: number[],
  line: number,
  toLength: number,
): { first: number; last: number } => {
  let before = -1;
  for (let i = line - 1; i >= 0; i -= 1) {
    if (matches[i] !== -1) {
      before = matches[i];
      break;
    }
  }
  let after = toLength;
  for (let i = line + 1; i < matches.length; i += 1) {
    if (matches[i] !== -1) {
      after = matches[i];
      break;
    }
  }
  const first = Math.min(before + 1, toLength - 1);
  return { first, last: Math.max(first, Math.min(after - 1, toLength - 1)) };
};

/**
 * Maps a range in `from` to the lines that hold the same code in `to`, for a reviewer who
 * wants to read the lines of a merge request in their local file. When every line in the
 * range is unchanged and still adjacent, the range keeps its columns. Otherwise it covers the
 * closest whole lines, or is a caret at the start of the closest line if it was a caret.
 * A range that ends at column 1 of a later line does not include that line.
 */
export const mapSourceRange = (from: string, to: string, range: CodeRange): SourceRange => {
  const fromLines = splitLines(from);
  const toLines = splitLines(to);
  const clampLine = (line: number) => Math.min(Math.max(line, 1), fromLines.length);
  const startLine = clampLine(range.startLine);
  let endLine = Math.max(clampLine(range.endLine), startLine);
  let { endColumn } = range;
  if (endLine > startLine && endColumn === 1) {
    endLine -= 1;
    endColumn = fromLines[endLine - 1].length + 1;
  }
  const caret = range.startLine === range.endLine && range.startColumn === range.endColumn;
  const matches = matchLines(fromLines, toLines);
  const start = startLine - 1;
  const end = endLine - 1;
  const exact =
    matches.slice(start, end + 1).every(m => m !== -1) &&
    matches[end] - matches[start] === end - start;
  if (exact) {
    return {
      exact,
      range: {
        startLine: matches[start] + 1,
        startColumn: range.startColumn,
        endLine: matches[end] + 1,
        endColumn,
      },
    };
  }
  const first =
    matches[start] !== -1 ? matches[start] : changedRegion(matches, start, toLines.length).first;
  const last = Math.max(
    first,
    matches[end] !== -1 ? matches[end] : changedRegion(matches, end, toLines.length).last,
  );
  if (caret) {
    return {
      exact,
      range: { startLine: first + 1, startColumn: 1, endLine: first + 1, endColumn: 1 },
    };
  }
  return {
    exact,
    range: {
      startLine: first + 1,
      startColumn: 1,
      endLine: last + 1,
      endColumn: toLines[last].length + 1,
    },
  };
};
