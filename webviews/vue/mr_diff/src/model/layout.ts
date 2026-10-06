import type { DiffBlock, DiffSide } from './types';

/** A view zone that only takes up space, so that both panes stay row-aligned. */
export interface FillerZone {
  afterLineNumber: number;
  heightInPx: number;
  /** Zones after the same line are ordered by this; thread-related zones come first. */
  ordinal: number;
  /** Set when the filler stands opposite a block that has no lines on this side. */
  blockId?: number;
}

/** A view zone hosting a discussion, anchored after a 1-based line. */
export interface ThreadZone {
  id: string;
  side: DiffSide;
  afterLineNumber: number;
  heightInPx: number;
}

export interface SideSpan {
  top: number;
  bottom: number;
}

/** Vertical extent of a block on each side, in content pixels from the first line. */
export interface ConnectorGeometry {
  blockId: number;
  old: SideSpan;
  new: SideSpan;
}

/** Content offsets, one per side, that show the same place in the file. */
export type ScrollAnchor = Record<DiffSide, number>;

export interface DiffLayout {
  fillers: Record<DiffSide, FillerZone[]>;
  connectors: ConnectorGeometry[];
  /** Ascending on both sides; scrolling interpolates between them */
  anchors: ScrollAnchor[];
  contentHeight: number;
}

export interface LayoutInput {
  blocks: DiffBlock[];
  oldLineCount: number;
  newLineCount: number;
  lineHeight: number;
  threads: ThreadZone[];
  /** Without alignment there are no fillers, and the panes scroll by anchors instead */
  align?: boolean;
}

export const THREAD_ORDINAL = 0;
export const MIRROR_ORDINAL = 1;
export const BLOCK_ORDINAL = 2;

const sumThreadHeights = (threads: ThreadZone[], side: DiffSide) => {
  const byLine = new Map<number, number>();
  threads
    .filter(t => t.side === side)
    .forEach(t =>
      byLine.set(t.afterLineNumber, (byLine.get(t.afterLineNumber) ?? 0) + t.heightInPx),
    );
  return byLine;
};

/**
 * Walks both files in step and places filler zones so that every unchanged
 * line and every block boundary sits at the same height in both panes.
 * Threads inside an unchanged region get a filler of the same height after the
 * matching line on the other side; threads inside a block are absorbed by the
 * filler at the end of the block.
 *
 * Without `align`, each pane keeps its natural height: no fillers, and the
 * anchors tell the panes how to follow each other while scrolling.
 */
export const computeLayout = ({
  blocks,
  oldLineCount,
  newLineCount,
  lineHeight,
  threads,
  align = true,
}: LayoutInput): DiffLayout => {
  const threadHeights = {
    old: sumThreadHeights(threads, 'old'),
    new: sumThreadHeights(threads, 'new'),
  };
  const fillers: Record<DiffSide, FillerZone[]> = { old: [], new: [] };
  const connectors: ConnectorGeometry[] = [];
  const y: ScrollAnchor = { old: 0, new: 0 };
  const anchors: ScrollAnchor[] = [{ ...y }];
  let oldLine = 0;
  let newLine = 0;

  const zoneAfter = (side: DiffSide, line: number) => threadHeights[side].get(line) ?? 0;
  const anchor = () => anchors.push({ ...y });

  const walkUnchanged = (count: number) => {
    for (let i = 0; i < count; i += 1) {
      oldLine += 1;
      newLine += 1;
      y.old += lineHeight;
      y.new += lineHeight;
      const oldZone = zoneAfter('old', oldLine);
      const newZone = zoneAfter('new', newLine);
      if (!align) {
        // a discussion on one side only: the other pane waits while it scrolls past
        if (oldZone !== newZone) anchor();
        y.old += oldZone;
        y.new += newZone;
        if (oldZone !== newZone) anchor();
      } else {
        const height = Math.max(oldZone, newZone);
        if (oldZone < height) {
          fillers.old.push({
            afterLineNumber: oldLine,
            heightInPx: height - oldZone,
            ordinal: MIRROR_ORDINAL,
          });
        }
        if (newZone < height) {
          fillers.new.push({
            afterLineNumber: newLine,
            heightInPx: height - newZone,
            ordinal: MIRROR_ORDINAL,
          });
        }
        y.old += height;
        y.new += height;
      }
    }
  };

  const sideHeight = (side: DiffSide, start: number, count: number) => {
    let height = count * lineHeight;
    for (let line = start + 1; line <= start + count; line += 1) height += zoneAfter(side, line);
    return height;
  };

  blocks.forEach(block => {
    walkUnchanged(Math.min(block.oldStart - oldLine, block.newStart - newLine));
    oldLine = block.oldStart;
    newLine = block.newStart;

    const oldHeight = sideHeight('old', block.oldStart, block.oldCount);
    const newHeight = sideHeight('new', block.newStart, block.newCount);
    const height = Math.max(oldHeight, newHeight);
    // aligned, a side without lines spans its filler, so the ribbon meets the hatched area
    const span = (side: DiffSide, ownHeight: number, count: number): SideSpan => ({
      top: y[side],
      bottom: y[side] + (align && count === 0 ? height : ownHeight),
    });
    connectors.push({
      blockId: block.id,
      old: span('old', oldHeight, block.oldCount),
      new: span('new', newHeight, block.newCount),
    });
    anchor();
    if (!align) {
      y.old += oldHeight;
      y.new += newHeight;
      anchor();
      oldLine = block.oldStart + block.oldCount;
      newLine = block.newStart + block.newCount;
      return;
    }
    if (oldHeight < height) {
      fillers.old.push({
        afterLineNumber: block.oldStart + block.oldCount,
        heightInPx: height - oldHeight,
        ordinal: BLOCK_ORDINAL,
        blockId: block.oldCount === 0 ? block.id : undefined,
      });
    }
    if (newHeight < height) {
      fillers.new.push({
        afterLineNumber: block.newStart + block.newCount,
        heightInPx: height - newHeight,
        ordinal: BLOCK_ORDINAL,
        blockId: block.newCount === 0 ? block.id : undefined,
      });
    }
    y.old += height;
    y.new += height;
    anchor();
    oldLine = block.oldStart + block.oldCount;
    newLine = block.newStart + block.newCount;
  });
  walkUnchanged(Math.min(oldLineCount - oldLine, newLineCount - newLine));
  // a trailing mismatch in line counts (for example, a missing final newline) stays unaligned
  y.old += Math.max(oldLineCount - oldLine, 0) * lineHeight;
  y.new += Math.max(newLineCount - newLine, 0) * lineHeight;
  anchor();

  return { fillers, connectors, anchors, contentHeight: Math.max(y.old, y.new) };
};

export interface UnknownZonesInput {
  /** top of each line, 1-based line `n` at index `n - 1` */
  lineTops: number[];
  /** where a line after the last one would start */
  bottom: number;
  lineHeight: number;
  /** total height of the zones this view placed, by the line they follow */
  known: Map<number, number>;
}

/**
 * The space under each line that zones the view did not place take up, such as
 * Monaco's references peek: the gap below a line, less its own height and the
 * known zones.
 */
export const unknownZones = ({
  lineTops,
  bottom,
  lineHeight,
  known,
}: UnknownZonesInput): { afterLineNumber: number; heightInPx: number }[] =>
  lineTops.flatMap((top, index) => {
    const line = index + 1;
    const next = index + 1 < lineTops.length ? lineTops[index + 1] : bottom;
    const height = next - top - lineHeight - (known.get(line) ?? 0);
    return height > 0 ? [{ afterLineNumber: line, heightInPx: height }] : [];
  });

/**
 * Maps a content offset in one pane to the offset that shows the same place
 * in the other pane, interpolating linearly between anchors.
 */
export const mapOffset = (anchors: ScrollAnchor[], from: DiffSide, offset: number): number => {
  const to: DiffSide = from === 'old' ? 'new' : 'old';
  let index = -1;
  for (let i = 0; i < anchors.length && anchors[i][from] <= offset; i += 1) index = i;
  if (index === -1) return offset;
  const start = anchors[index];
  const end = anchors[index + 1];
  if (!end) return start[to] + (offset - start[from]);
  const ratio = (offset - start[from]) / (end[from] - start[from]);
  return start[to] + ratio * (end[to] - start[to]);
};

/**
 * Maps a 1-based line on one side to the 1-based line at the same height on
 * the other side, or the nearest line before it inside a block.
 */
export const mapLine = (blocks: DiffBlock[], side: DiffSide, line: number): number => {
  const startKey = side === 'old' ? 'oldStart' : 'newStart';
  const countKey = side === 'old' ? 'oldCount' : 'newCount';
  const otherStartKey = side === 'old' ? 'newStart' : 'oldStart';
  const otherCountKey = side === 'old' ? 'newCount' : 'oldCount';
  let offset = 0;
  for (const block of blocks) {
    const start = block[startKey];
    if (line <= start) break;
    if (line <= start + block[countKey]) {
      return block[otherStartKey] + Math.min(line - start, block[otherCountKey]);
    }
    offset = block[otherStartKey] + block[otherCountKey] - (start + block[countKey]);
  }
  return line + offset;
};

/**
 * Maps a 1-based unchanged line to the same line on the other side, or returns
 * `undefined` for a line inside a block.
 */
export const mapUnchangedLine = (
  blocks: DiffBlock[],
  side: DiffSide,
  line: number,
): number | undefined => {
  const start = side === 'old' ? 'oldStart' : 'newStart';
  const count = side === 'old' ? 'oldCount' : 'newCount';
  const inBlock = blocks.some(b => line > b[start] && line <= b[start] + b[count]);
  return inBlock ? undefined : mapLine(blocks, side, line);
};
