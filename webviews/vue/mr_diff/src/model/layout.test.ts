import {
  BLOCK_ORDINAL,
  MIRROR_ORDINAL,
  computeLayout,
  mapLine,
  mapOffset,
  mapUnchangedLine,
  unknownZones,
} from './layout';
import type { DiffBlock } from './types';

const LH = 10;

const block = (overrides: Partial<DiffBlock>): DiffBlock => ({
  id: 0,
  kind: 'modified',
  oldStart: 0,
  oldCount: 0,
  newStart: 0,
  newCount: 0,
  ...overrides,
});

describe('unknownZones', () => {
  it('finds the space under a line that no known zone explains', () => {
    // line 2 has a known 15px filler; a 30px peek opened under line 3
    const zones = unknownZones({
      lineTops: [0, 10, 35, 75],
      bottom: 85,
      lineHeight: LH,
      known: new Map([[2, 15]]),
    });

    expect(zones).toEqual([{ afterLineNumber: 3, heightInPx: 30 }]);
  });

  it('finds the space under the last line', () => {
    const zones = unknownZones({ lineTops: [0, 10], bottom: 45, lineHeight: LH, known: new Map() });

    expect(zones).toEqual([{ afterLineNumber: 2, heightInPx: 25 }]);
  });

  it('finds nothing when every zone is known', () => {
    const zones = unknownZones({
      lineTops: [0, 30, 40],
      bottom: 50,
      lineHeight: LH,
      known: new Map([[1, 20]]),
    });

    expect(zones).toEqual([]);
  });
});

describe('computeLayout', () => {
  it('mirrors a zone it did not place, such as a references peek, with a filler', () => {
    const blocks = [block({ kind: 'inserted', oldStart: 1, newStart: 1, newCount: 1 })];
    // the peek opens under the inserted line 2, so the old side's block filler grows
    const layout = computeLayout({
      blocks,
      oldLineCount: 3,
      newLineCount: 4,
      lineHeight: LH,
      threads: [{ id: 'peek', side: 'new', afterLineNumber: 2, heightInPx: 300 }],
    });

    expect(layout.fillers.old).toEqual([
      { afterLineNumber: 1, heightInPx: 310, ordinal: BLOCK_ORDINAL, blockId: 0 },
    ]);
  });

  describe('unaligned, a references peek never creates empty space on the other side', () => {
    const peek = (afterLineNumber: number) => ({
      id: 'peek',
      side: 'new' as const,
      afterLineNumber,
      heightInPx: 300,
    });

    it('in an unchanged region', () => {
      const layout = computeLayout({
        blocks: [],
        oldLineCount: 3,
        newLineCount: 3,
        lineHeight: LH,
        threads: [peek(1)],
        align: false,
      });

      expect(layout.fillers.old).toEqual([]);
      expect(layout.fillers.new).toEqual([]);
      expect(mapOffset(layout.anchors, 'new', 320)).toBe(20);
    });

    it('inside an inserted block', () => {
      const blocks = [block({ kind: 'inserted', oldStart: 1, newStart: 1, newCount: 1 })];
      const layout = computeLayout({
        blocks,
        oldLineCount: 3,
        newLineCount: 4,
        lineHeight: LH,
        threads: [peek(2)],
        align: false,
      });

      expect(layout.fillers.old).toEqual([]);
      expect(layout.fillers.new).toEqual([]);
      // Scrolling past the peek still maps to the next unchanged line in the collapsed pane.
      expect(mapOffset(layout.anchors, 'new', 320)).toBe(10);
    });

    it('restores padding only when alignment is turned back on', () => {
      const input = {
        blocks: [block({ kind: 'inserted', oldStart: 1, newStart: 1, newCount: 1 })],
        oldLineCount: 3,
        newLineCount: 4,
        lineHeight: LH,
        threads: [peek(2)],
      };
      const aligned = computeLayout({ ...input, align: true });
      const collapsed = computeLayout({ ...input, align: false });
      const restored = computeLayout({ ...input, align: true });

      expect(aligned.fillers.old[0].heightInPx).toBe(310);
      expect(collapsed.fillers).toEqual({ old: [], new: [] });
      expect(restored).toEqual(aligned);
    });
  });

  it('adds a filler opposite an inserted block and spans it with the connector', () => {
    const blocks = [block({ kind: 'inserted', oldStart: 1, newStart: 1, newCount: 2 })];

    const layout = computeLayout({
      blocks,
      oldLineCount: 3,
      newLineCount: 5,
      lineHeight: LH,
      threads: [],
    });

    expect(layout.fillers.old).toEqual([
      { afterLineNumber: 1, heightInPx: 20, ordinal: BLOCK_ORDINAL, blockId: 0 },
    ]);
    expect(layout.fillers.new).toEqual([]);
    expect(layout.connectors).toEqual([
      { blockId: 0, old: { top: 10, bottom: 30 }, new: { top: 10, bottom: 30 } },
    ]);
    expect(layout.contentHeight).toBe(50);
  });

  it('pads the shorter side of a modified block', () => {
    const blocks = [block({ oldStart: 0, oldCount: 3, newStart: 0, newCount: 1 })];

    const layout = computeLayout({
      blocks,
      oldLineCount: 4,
      newLineCount: 2,
      lineHeight: LH,
      threads: [],
    });

    expect(layout.fillers.new).toEqual([
      { afterLineNumber: 1, heightInPx: 20, ordinal: BLOCK_ORDINAL, blockId: undefined },
    ]);
    expect(layout.connectors[0]).toEqual({
      blockId: 0,
      old: { top: 0, bottom: 30 },
      new: { top: 0, bottom: 10 },
    });
  });

  it('mirrors a thread in an unchanged region on the other side', () => {
    const blocks = [block({ kind: 'inserted', oldStart: 0, newStart: 0, newCount: 1 })];
    const threads = [{ id: 't', side: 'old' as const, afterLineNumber: 2, heightInPx: 50 }];

    const layout = computeLayout({
      blocks,
      oldLineCount: 3,
      newLineCount: 4,
      lineHeight: LH,
      threads,
    });

    expect(layout.fillers.new).toEqual([
      { afterLineNumber: 3, heightInPx: 50, ordinal: MIRROR_ORDINAL },
    ]);
  });

  it('absorbs a thread inside a block into the block filler', () => {
    const blocks = [block({ oldStart: 0, oldCount: 1, newStart: 0, newCount: 1 })];
    const threads = [{ id: 't', side: 'new' as const, afterLineNumber: 1, heightInPx: 40 }];

    const layout = computeLayout({
      blocks,
      oldLineCount: 2,
      newLineCount: 2,
      lineHeight: LH,
      threads,
    });

    expect(layout.fillers.old).toEqual([
      { afterLineNumber: 1, heightInPx: 40, ordinal: BLOCK_ORDINAL, blockId: undefined },
    ]);
    expect(layout.connectors[0].new).toEqual({ top: 0, bottom: 50 });
  });

  it('only pads the difference when both sides have a thread on the same row', () => {
    const threads = [
      { id: 'a', side: 'old' as const, afterLineNumber: 1, heightInPx: 30 },
      { id: 'b', side: 'new' as const, afterLineNumber: 1, heightInPx: 50 },
    ];

    const layout = computeLayout({
      blocks: [],
      oldLineCount: 1,
      newLineCount: 1,
      lineHeight: LH,
      threads,
    });

    expect(layout.fillers.old).toEqual([
      { afterLineNumber: 1, heightInPx: 20, ordinal: MIRROR_ORDINAL },
    ]);
    expect(layout.fillers.new).toEqual([]);
  });

  it('maps scroll offsets one to one while aligned', () => {
    const blocks = [block({ kind: 'inserted', oldStart: 1, newStart: 1, newCount: 2 })];

    const layout = computeLayout({
      blocks,
      oldLineCount: 3,
      newLineCount: 5,
      lineHeight: LH,
      threads: [],
    });

    [0, 15, 25, 45].forEach(offset => {
      expect(mapOffset(layout.anchors, 'new', offset)).toBe(offset);
    });
  });

  describe('without alignment', () => {
    const blocks = [block({ kind: 'inserted', oldStart: 1, newStart: 1, newCount: 2 })];
    const threads = [{ id: 't', side: 'old' as const, afterLineNumber: 2, heightInPx: 50 }];
    const layout = computeLayout({
      blocks,
      oldLineCount: 3,
      newLineCount: 5,
      lineHeight: LH,
      threads,
      align: false,
    });

    it('adds no fillers', () => {
      expect(layout.fillers).toEqual({ old: [], new: [] });
    });

    it('narrows the connector to the insertion point on the empty side', () => {
      expect(layout.connectors).toEqual([
        { blockId: 0, old: { top: 10, bottom: 10 }, new: { top: 10, bottom: 30 } },
      ]);
    });

    it('keeps the panes on the same place while scrolling', () => {
      // before the block
      expect(mapOffset(layout.anchors, 'new', 5)).toBe(5);
      // halfway through the inserted lines, the base stays at the insertion point
      expect(mapOffset(layout.anchors, 'new', 20)).toBe(10);
      // the head's line 4 is the base's line 2
      expect(mapOffset(layout.anchors, 'new', 35)).toBe(15);
      expect(mapOffset(layout.anchors, 'old', 15)).toBe(35);
      // the head waits while the base scrolls past its discussion
      expect(mapOffset(layout.anchors, 'old', 45)).toBe(40);
      // after it, both scroll together again
      expect(mapOffset(layout.anchors, 'old', 75)).toBe(45);
    });
  });
});

describe('mapLine', () => {
  const blocks = [
    block({ id: 0, kind: 'inserted', oldStart: 1, oldCount: 0, newStart: 1, newCount: 2 }),
    block({ id: 1, kind: 'modified', oldStart: 4, oldCount: 2, newStart: 6, newCount: 1 }),
  ];

  it('maps unchanged lines through the offsets of earlier blocks', () => {
    expect(mapLine(blocks, 'old', 1)).toBe(1);
    expect(mapLine(blocks, 'old', 3)).toBe(5);
    expect(mapLine(blocks, 'new', 5)).toBe(3);
    expect(mapLine(blocks, 'old', 8)).toBe(9);
  });

  it('clamps lines inside a block to the other side of the block', () => {
    expect(mapLine(blocks, 'old', 6)).toBe(7);
    expect(mapLine(blocks, 'new', 2)).toBe(1);
  });
});

describe('mapUnchangedLine', () => {
  const blocks = [
    block({ id: 0, kind: 'inserted', oldStart: 1, oldCount: 0, newStart: 1, newCount: 2 }),
    block({ id: 1, kind: 'modified', oldStart: 4, oldCount: 2, newStart: 6, newCount: 1 }),
  ];

  it('maps an unchanged line to the other side', () => {
    expect(mapUnchangedLine(blocks, 'old', 3)).toBe(5);
    expect(mapUnchangedLine(blocks, 'new', 5)).toBe(3);
    expect(mapUnchangedLine(blocks, 'old', 8)).toBe(9);
  });

  it('does not map a changed line', () => {
    expect(mapUnchangedLine(blocks, 'new', 2)).toBeUndefined();
    expect(mapUnchangedLine(blocks, 'old', 5)).toBeUndefined();
    expect(mapUnchangedLine(blocks, 'new', 7)).toBeUndefined();
    expect(mapUnchangedLine(blocks, 'new', 6)).toBe(4);
  });
});
