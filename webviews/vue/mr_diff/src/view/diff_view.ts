import {
  computeLayout,
  mapOffset,
  unknownZones,
  type DiffLayout,
  type ThreadZone,
} from '../model/layout';
import type { DiffBlock, DiffSide } from '../model/types';
import { computeWordDiff } from '../model/word_diff';
import { splitLines } from '../model/line_alignment';
import { registerCodeNavigation, type CodeNavigation } from './code_navigation';
import {
  PADDING_BOTTOM,
  PADDING_TOP,
  applyVsCodeTheme,
  createReadOnlyEditor,
  cssVariable,
  fontOptions,
  lineHeightOf,
  monaco,
  tabSize,
} from './monaco_runtime';

const SIDES: DiffSide[] = ['old', 'new'];
const INITIAL_THREAD_HEIGHT = 64;

export interface ThreadAnchor {
  id: string;
  side: DiffSide;
  line: number;
}

export interface LineHover {
  side: DiffSide;
  line: number;
  top: number;
}

export interface ViewState {
  layout: DiffLayout;
  /** of the head pane */
  scrollTop: number;
  scrollTops: Record<DiffSide, number>;
  viewportHeight: number;
  paddingTop: number;
}

interface ThreadZoneEntry {
  anchor: ThreadAnchor;
  zone: monaco.editor.IViewZone;
  zoneId: string;
  content: HTMLElement;
}

interface DiffViewOptions {
  oldText: string;
  newText: string;
  language: string;
  blocks: DiffBlock[];
  align: boolean;
  onViewStateChange: (state: ViewState) => void;
  onLineHover: (hover: LineHover | undefined) => void;
  /** Ctrl/Cmd+Enter in a pane asks to comment on the line with the cursor. */
  onCommentRequest: (side: DiffSide, line: number) => void;
  paths: Record<DiffSide, string>;
  navigation?: CodeNavigation;
}

const COMMENT_SHORTCUT_HINT =
  'Press Control+Enter or Command+Enter to comment on a line, F12 to go to a definition.';

/**
 * Owns the two read-only Monaco editors of the side-by-side view: models,
 * change decorations, row-aligning filler zones, the zones that host
 * discussions, and synchronised scrolling. Vue renders everything else.
 */
export class DiffView {
  readonly editors: Record<DiffSide, monaco.editor.IStandaloneCodeEditor>;

  #models: Record<DiffSide, monaco.editor.ITextModel>;

  #blocks: DiffBlock[];

  #options: DiffViewOptions;

  #threads = new Map<string, ThreadZoneEntry>();

  #fillerZoneIds: Record<DiffSide, string[]> = { old: [], new: [] };

  #decorations: Record<DiffSide, monaco.editor.IEditorDecorationsCollection>;

  #layout: DiffLayout;

  #align: boolean;

  #syncingScroll = false;

  #relayoutScheduled = false;

  #resizeObserver: ResizeObserver;

  #paneObserver: ResizeObserver;

  #disposables: monaco.IDisposable[] = [];

  constructor(containers: Record<DiffSide, HTMLElement>, options: DiffViewOptions) {
    this.#options = options;
    this.#blocks = options.blocks;
    this.#align = options.align;
    applyVsCodeTheme();
    // distinct URIs, so that code navigation can tell the panes apart
    const modelUri = (side: DiffSide) =>
      monaco.Uri.from({ scheme: 'gl-diff', authority: side, path: `/${options.paths[side]}` });
    this.#models = {
      old: monaco.editor.createModel(options.oldText, options.language, modelUri('old')),
      new: monaco.editor.createModel(options.newText, options.language, modelUri('new')),
    };
    SIDES.forEach(side => this.#models[side].detectIndentation(true, tabSize()));
    this.editors = {
      old: createReadOnlyEditor(containers.old, this.#models.old),
      new: createReadOnlyEditor(containers.new, this.#models.new),
    };
    // Monaco measures characters once; a font that finishes loading later needs a re-measure
    document.fonts?.ready.then(() => monaco.editor.remeasureFonts());
    this.editors.old.updateOptions({
      ariaLabel: `Base version of ${options.paths.old}. ${COMMENT_SHORTCUT_HINT}`,
    });
    this.editors.new.updateOptions({
      ariaLabel: `Merge request version of ${options.paths.new}. ${COMMENT_SHORTCUT_HINT}`,
    });
    this.#decorations = {
      old: this.editors.old.createDecorationsCollection(),
      new: this.editors.new.createDecorationsCollection(),
    };
    this.#layout = this.#computeLayout();
    this.#resizeObserver = new ResizeObserver(() => this.#scheduleRelayout());
    this.#paneObserver = new ResizeObserver(() =>
      SIDES.forEach(side => this.editors[side].layout()),
    );
    SIDES.forEach(side => this.#paneObserver.observe(containers[side]));
    this.refreshDecorations();
    this.#applyFillers();
    SIDES.forEach(side => this.#wireEditor(side));
    if (options.navigation) {
      this.#disposables.push(
        registerCodeNavigation(
          { models: this.#models, editors: this.editors, blocks: this.#blocks },
          options.navigation,
        ),
      );
    }
  }

  get layout(): DiffLayout {
    return this.#layout;
  }

  #wireEditor(side: DiffSide) {
    const editor = this.editors[side];
    const other = this.editors[side === 'old' ? 'new' : 'old'];
    this.#disposables.push(
      editor.onDidScrollChange(e => {
        this.#threads.forEach(entry => {
          if (entry.anchor.side === side) {
            entry.content.style.transform = `translateX(${e.scrollLeft}px)`;
          }
        });
        if (e.scrollTopChanged) this.#followScroll(side);
        this.#emitViewState();
      }),
      editor.onDidLayoutChange(() => {
        this.#threads.forEach(entry => {
          if (entry.anchor.side === side) this.#sizeThreadContent(entry);
        });
        this.#emitViewState();
      }),
      // a zone Monaco adds itself, such as the references peek, needs room on the other side
      editor.onDidContentSizeChange(e => {
        if (e.contentHeightChanged) this.#scheduleRelayout();
      }),
      editor.onMouseMove(e => {
        const line = e.target.position?.lineNumber;
        const overLine =
          e.target.type === monaco.editor.MouseTargetType.CONTENT_TEXT ||
          e.target.type === monaco.editor.MouseTargetType.CONTENT_EMPTY ||
          e.target.type === monaco.editor.MouseTargetType.GUTTER_LINE_NUMBERS ||
          e.target.type === monaco.editor.MouseTargetType.GUTTER_LINE_DECORATIONS;
        this.#options.onLineHover(
          line && overLine ? { side, line, top: this.lineTop(side, line) } : undefined,
        );
      }),
      editor.onMouseLeave(() => this.#options.onLineHover(undefined)),
      editor.onDidChangeCursorPosition(e => {
        if (e.source !== 'keyboard') return;
        const line = e.position.lineNumber;
        this.#options.onLineHover({ side, line, top: this.lineTop(side, line) });
      }),
      editor.onKeyDown(e => {
        if (!(e.ctrlKey || e.metaKey) || e.keyCode !== monaco.KeyCode.Enter) return;
        const line = editor.getPosition()?.lineNumber;
        if (!line) return;
        e.preventDefault();
        e.stopPropagation();
        this.#options.onCommentRequest(side, line);
      }),
    );
  }

  /** Scrolls the other pane to the place that the `side` pane shows. */
  #followScroll(side: DiffSide) {
    if (this.#syncingScroll) return;
    const other: DiffSide = side === 'old' ? 'new' : 'old';
    const offset = this.editors[side].getScrollTop() - PADDING_TOP;
    this.#syncingScroll = true;
    this.editors[other].setScrollTop(
      Math.round(mapOffset(this.#layout.anchors, side, offset) + PADDING_TOP),
    );
    this.#syncingScroll = false;
  }

  get aligned(): boolean {
    return this.#align;
  }

  /** Turns the hatched fillers that keep both panes row-aligned on or off. */
  setAligned(align: boolean) {
    if (align === this.#align) return;
    this.#align = align;
    this.refreshDecorations();
    this.relayout();
    this.#followScroll('new');
    this.#emitViewState();
  }

  /** Top of a 1-based line relative to the pane viewport. */
  lineTop(side: DiffSide, line: number): number {
    const editor = this.editors[side];
    return editor.getTopForLineNumber(line) - editor.getScrollTop();
  }

  scrollBy(deltaY: number) {
    const editor = this.editors.new;
    editor.setScrollTop(editor.getScrollTop() + deltaY);
  }

  /** Scrolls so that the block sits a third of the way down the viewport. */
  revealBlock(blockId: number) {
    const connector = this.#layout.connectors.find(c => c.blockId === blockId);
    if (!connector) return;
    const viewport = this.editors.new.getLayoutInfo().height;
    this.editors.new.setScrollTop(Math.max(0, connector.new.top + PADDING_TOP - viewport / 3));
    const block = this.#blocks.find(b => b.id === blockId)!;
    const side: DiffSide = block.newCount > 0 ? 'new' : 'old';
    const line = side === 'new' ? block.newStart + 1 : Math.max(block.oldStart, 1);
    this.editors[side].setPosition({ lineNumber: line, column: 1 });
  }

  refreshDecorations() {
    const removedColor = cssVariable('--vscode-diffEditorOverview-removedForeground', '#f8514966');
    const insertedColor = cssVariable(
      '--vscode-diffEditorOverview-insertedForeground',
      '#2ea04366',
    );
    const decorations: Record<DiffSide, monaco.editor.IModelDeltaDecoration[]> = {
      old: [],
      new: [],
    };
    const lineDecoration = (side: DiffSide, start: number, count: number) => {
      if (count === 0 && !this.#align) {
        // no filler marks the spot, so the neighbouring line does
        const after = start >= 1;
        if (!after && this.#models[side].getValueLength() === 0) return;
        decorations[side].push({
          range: new monaco.Range(after ? start : 1, 1, after ? start : 1, 1),
          options: {
            isWholeLine: true,
            className: `gl-diff-insertion-${after ? 'after' : 'before'}-${side}`,
          },
        });
      }
      if (count === 0) return;
      const color = side === 'old' ? removedColor : insertedColor;
      decorations[side].push({
        range: new monaco.Range(start + 1, 1, start + count, 1),
        options: {
          isWholeLine: true,
          className: side === 'old' ? 'gl-diff-line-removed' : 'gl-diff-line-inserted',
          marginClassName: side === 'old' ? 'gl-diff-gutter-removed' : 'gl-diff-gutter-inserted',
          overviewRuler: { color, position: monaco.editor.OverviewRulerLane.Full },
        },
      });
    };
    const oldLines = splitLines(this.#models.old.getValue());
    const newLines = splitLines(this.#models.new.getValue());
    this.#blocks.forEach(block => {
      lineDecoration('old', block.oldStart, block.oldCount);
      lineDecoration('new', block.newStart, block.newCount);
      if (block.kind !== 'modified') return;
      const words = computeWordDiff(
        oldLines.slice(block.oldStart, block.oldStart + block.oldCount),
        newLines.slice(block.newStart, block.newStart + block.newCount),
        block.oldStart + 1,
        block.newStart + 1,
      );
      SIDES.forEach(side => {
        words[side].forEach(range => {
          decorations[side].push({
            range: new monaco.Range(range.line, range.startColumn, range.line, range.endColumn),
            options: {
              inlineClassName: side === 'old' ? 'gl-diff-word-removed' : 'gl-diff-word-inserted',
            },
          });
        });
      });
    });
    SIDES.forEach(side => this.#decorations[side].set(decorations[side]));
  }

  /** Font, theme and decoration colours, after VS Code changes its theme. */
  refreshTheme() {
    applyVsCodeTheme();
    this.refreshDecorations();
    this.#emitViewState();
  }

  /** Redraws both panes with the editor font settings, after VS Code changes them. */
  refreshFont() {
    SIDES.forEach(side => {
      this.editors[side].updateOptions(fontOptions());
      this.#models[side].detectIndentation(true, tabSize());
    });
    this.#threads.forEach(entry => this.#sizeThreadContent(entry));
    this.relayout();
  }

  /**
   * Adds zones for new anchors, removes zones whose anchor is gone, and returns
   * the element each thread should render into.
   */
  syncThreadZones(anchors: ThreadAnchor[]): Map<string, HTMLElement> {
    const wanted = new Map(anchors.map(a => [a.id, a]));
    SIDES.forEach(side => {
      this.editors[side].changeViewZones(accessor => {
        this.#threads.forEach((entry, id) => {
          const anchor = wanted.get(id);
          if (
            entry.anchor.side === side &&
            (!anchor || anchor.side !== side || anchor.line !== entry.anchor.line)
          ) {
            accessor.removeZone(entry.zoneId);
            this.#resizeObserver.unobserve(entry.content);
            this.#threads.delete(id);
          }
        });
        anchors
          .filter(anchor => anchor.side === side && !this.#threads.has(anchor.id))
          .forEach(anchor => {
            const domNode = document.createElement('div');
            domNode.className = 'gl-diff-thread-zone';
            const content = document.createElement('div');
            content.className = 'gl-diff-thread-zone-content';
            domNode.appendChild(content);
            ['mousedown', 'keydown', 'keypress', 'keyup', 'paste', 'copy', 'cut', 'drop'].forEach(
              type => domNode.addEventListener(type, e => e.stopPropagation()),
            );
            const zone: monaco.editor.IViewZone = {
              afterLineNumber: anchor.line,
              heightInPx: INITIAL_THREAD_HEIGHT,
              domNode,
              ordinal: 0,
            };
            const zoneId = accessor.addZone(zone);
            const entry = { anchor, zone, zoneId, content };
            this.#threads.set(anchor.id, entry);
            this.#sizeThreadContent(entry);
            this.#resizeObserver.observe(content);
          });
      });
    });
    this.#scheduleRelayout();
    return new Map([...this.#threads].map(([id, entry]) => [id, entry.content]));
  }

  #sizeThreadContent(entry: ThreadZoneEntry) {
    const info = this.editors[entry.anchor.side].getLayoutInfo();
    entry.content.style.width = `${Math.max(info.contentWidth - 16, 200)}px`;
  }

  #scheduleRelayout() {
    if (this.#relayoutScheduled) return;
    this.#relayoutScheduled = true;
    requestAnimationFrame(() => {
      this.#relayoutScheduled = false;
      this.relayout();
    });
  }

  relayout() {
    SIDES.forEach(side => {
      this.editors[side].changeViewZones(accessor => {
        this.#threads.forEach(entry => {
          if (entry.anchor.side !== side) return;
          const height = Math.ceil(entry.content.getBoundingClientRect().height);
          if (height > 0 && height !== entry.zone.heightInPx) {
            entry.zone.heightInPx = height;
            accessor.layoutZone(entry.zoneId);
          }
        });
      });
    });
    const previous = this.#layout;
    this.#layout = this.#computeLayout([
      ...this.#unknownZones('old'),
      ...this.#unknownZones('new'),
    ]);
    // re-adding the same fillers would change nothing but fire another content size change
    if (JSON.stringify(previous.fillers) !== JSON.stringify(this.#layout.fillers)) {
      this.#applyFillers();
    }
    this.#emitViewState();
  }

  /** Zones on `side` that the view did not place, measured from where Monaco put the lines. */
  #unknownZones(side: DiffSide): ThreadZone[] {
    const editor = this.editors[side];
    const known = new Map<number, number>();
    const add = (line: number, height: number) => known.set(line, (known.get(line) ?? 0) + height);
    this.#layout.fillers[side].forEach(f => add(f.afterLineNumber, f.heightInPx));
    this.#threads.forEach(({ anchor, zone }) => {
      if (anchor.side === side) add(anchor.line, zone.heightInPx ?? 0);
    });
    const lineTops = Array.from({ length: this.#models[side].getLineCount() }, (_, i) =>
      editor.getTopForLineNumber(i + 1),
    );
    return unknownZones({
      lineTops,
      bottom: editor.getContentHeight() - PADDING_BOTTOM,
      lineHeight: lineHeightOf(editor),
      known,
    }).map(zone => ({
      id: `unknown:${side}:${zone.afterLineNumber}`,
      side,
      ...zone,
    }));
  }

  #computeLayout(unknown: ThreadZone[] = []): DiffLayout {
    return computeLayout({
      blocks: this.#blocks,
      oldLineCount: this.#models.old.getLineCount(),
      newLineCount: this.#models.new.getLineCount(),
      lineHeight: lineHeightOf(this.editors.new),
      threads: [
        ...[...this.#threads.values()].map(({ anchor, zone }) => ({
          id: anchor.id,
          side: anchor.side,
          afterLineNumber: anchor.line,
          heightInPx: zone.heightInPx ?? 0,
        })),
        ...unknown,
      ],
      align: this.#align,
    });
  }

  #applyFillers() {
    SIDES.forEach(side => {
      this.editors[side].changeViewZones(accessor => {
        this.#fillerZoneIds[side].forEach(id => accessor.removeZone(id));
        this.#fillerZoneIds[side] = this.#layout.fillers[side].map(filler => {
          const domNode = document.createElement('div');
          domNode.className =
            filler.blockId === undefined
              ? 'gl-diff-filler'
              : `gl-diff-filler gl-diff-filler-empty gl-diff-filler-${side}`;
          return accessor.addZone({
            afterLineNumber: filler.afterLineNumber,
            heightInPx: filler.heightInPx,
            ordinal: filler.ordinal,
            domNode,
          });
        });
      });
    });
  }

  #emitViewState() {
    const editor = this.editors.new;
    this.#options.onViewStateChange({
      layout: this.#layout,
      scrollTop: editor.getScrollTop(),
      scrollTops: { old: this.editors.old.getScrollTop(), new: editor.getScrollTop() },
      viewportHeight: editor.getLayoutInfo().height,
      paddingTop: PADDING_TOP,
    });
  }

  dispose() {
    this.#resizeObserver.disconnect();
    this.#paneObserver.disconnect();
    this.#disposables.forEach(d => d.dispose());
    SIDES.forEach(side => {
      this.editors[side].dispose();
      this.#models[side].dispose();
    });
  }
}
