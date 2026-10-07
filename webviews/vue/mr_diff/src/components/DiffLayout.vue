<template>
  <div class="gl-diff-layout" :class="{ 'gl-diff-layout-single': soloSide }">
    <div v-if="soloSide" class="gl-diff-header">
      <div class="gl-diff-header-path" :title="soloPath">
        <bdi>{{ soloLabel }}</bdi>
      </div>
    </div>
    <div v-else class="gl-diff-header">
      <div class="gl-diff-header-path" :title="file.oldPath">
        <bdi>{{ file.oldPath }}</bdi>
      </div>
      <div></div>
      <div class="gl-diff-header-path" :title="file.newPath">
        <bdi>{{ file.newPath }}</bdi>
      </div>
    </div>
    <div class="gl-diff-body" @mouseleave="hover = null">
      <code-pane
        v-show="soloSide !== 'new'"
        ref="oldPane"
        side="old"
        :comment-line="commentLine('old')"
        :comment-top="commentTop('old')"
        @add-comment="line => $emit('add-comment', { side: 'old', line })"
      />
      <connector-gutter
        v-if="!soloSide"
        :connectors="visibleConnectors"
        :width="gutterWidth"
        :height="viewportHeight"
        @scroll-by="scrollBy"
      >
        <slot name="gutter" :connectors="visibleConnectors"></slot>
      </connector-gutter>
      <code-pane
        v-show="soloSide !== 'old'"
        ref="newPane"
        side="new"
        :comment-line="commentLine('new')"
        :comment-top="commentTop('new')"
        @add-comment="line => $emit('add-comment', { side: 'new', line })"
      />
    </div>
    <teleport v-for="thread in mountedThreads" :key="thread.id" :to="thread.node">
      <slot name="thread" :thread="thread"></slot>
    </teleport>
  </div>
</template>

<script>
import CodePane from './CodePane.vue';
import ConnectorGutter from './ConnectorGutter.vue';
import { DiffView } from '../view/diff_view.ts';
import { languageForPath, watchThemeChanges } from '../view/monaco_runtime.ts';
import { onEditorFontChange } from '../view/editor_font.ts';
import { post, request } from '../vscode_bridge';

/** Navigation that fails or finds nothing answers nothing; the host logs why. */
const hostCodeNavigation = {
  definitions: position =>
    request('definitions', position).then(
      ({ locations }) => locations ?? [],
      () => [],
    ),
  references: position =>
    request('references', position).then(
      ({ locations }) => locations ?? [],
      () => [],
    ),
  hover: position =>
    request('hover', position).then(
      ({ hover }) => hover,
      () => undefined,
    ),
  open: (uri, line, column) => post({ command: 'openLocation', uri, line, column }),
};

const GUTTER_WIDTH = 44;

export default {
  name: 'DiffLayout',
  components: { CodePane, ConnectorGutter },
  props: {
    file: {
      type: Object,
      required: true,
    },
    blocks: {
      type: Array,
      required: true,
    },
    threads: {
      type: Array,
      default: () => [],
    },
    blockStates: {
      type: Object,
      default: () => ({}),
    },
    canCommentOn: {
      type: Function,
      default: () => false,
    },
    aligned: {
      type: Boolean,
      default: true,
    },
    /** The only side of an added (`new`) or deleted (`old`) file, shown as one pane. */
    soloSide: {
      type: String,
      default: null,
    },
  },
  emits: ['add-comment', 'comment-refused', 'failed'],
  data() {
    return {
      viewState: null,
      hover: null,
      mountedThreads: [],
      gutterWidth: GUTTER_WIDTH,
    };
  },
  computed: {
    soloPath() {
      return this.soloSide === 'old' ? this.file.oldPath : this.file.newPath;
    },
    soloLabel() {
      return `${this.soloPath} (${this.soloSide === 'old' ? 'deleted' : 'added'})`;
    },
    viewportHeight() {
      return this.viewState?.viewportHeight ?? 0;
    },
    visibleConnectors() {
      if (!this.viewState) return [];
      const { layout, scrollTops, paddingTop, viewportHeight } = this.viewState;
      const oldOffset = paddingTop - scrollTops.old;
      const newOffset = paddingTop - scrollTops.new;
      const kinds = new Map(this.blocks.map(b => [b.id, b.kind]));
      return layout.connectors
        .map(c => ({
          blockId: c.blockId,
          kind: kinds.get(c.blockId),
          oldTop: c.old.top + oldOffset,
          oldBottom: c.old.bottom + oldOffset,
          newTop: c.new.top + newOffset,
          newBottom: c.new.bottom + newOffset,
          ...this.blockStates[c.blockId],
        }))
        .filter(
          c =>
            Math.max(c.oldBottom, c.newBottom) >= 0 &&
            Math.min(c.oldTop, c.newTop) <= viewportHeight,
        );
    },
  },
  watch: {
    aligned(value) {
      this.diffView?.setAligned(value);
    },
    threads: {
      handler() {
        this.syncThreads();
      },
      deep: true,
    },
  },
  mounted() {
    try {
      this.diffView = new DiffView(
        { old: this.$refs.oldPane.editorElement(), new: this.$refs.newPane.editorElement() },
        {
          oldText: this.file.oldText,
          newText: this.file.newText,
          language: languageForPath(this.file.newPath || this.file.oldPath),
          blocks: this.blocks,
          align: this.aligned,
          onViewStateChange: state => {
            this.viewState = Object.freeze(state);
          },
          onLineHover: hover => {
            if (hover) this.hover = { side: hover.side, line: hover.line };
          },
          onCommentRequest: (side, line) => {
            if (this.canCommentOn(side, line)) this.$emit('add-comment', { side, line });
            else this.$emit('comment-refused', { side, line });
          },
          paths: { old: this.file.oldPath, new: this.file.newPath },
          navigation: hostCodeNavigation,
          soloSide: this.soloSide ?? undefined,
        },
      );
    } catch (e) {
      this.$emit('failed', e);
      return;
    }
    this.stopWatchingTheme = watchThemeChanges(() => this.diffView.refreshTheme());
    this.stopWatchingFont = onEditorFontChange(() => this.diffView.refreshFont());
    window.addEventListener('keydown', this.onKeyDown);
    this.syncThreads();
    if (this.blocks.length > 0) this.$nextTick(() => this.diffView.revealBlock(this.blocks[0].id));
  },
  beforeUnmount() {
    window.removeEventListener('keydown', this.onKeyDown);
    this.stopWatchingTheme?.();
    this.stopWatchingFont?.();
    this.diffView?.dispose();
  },
  methods: {
    syncThreads() {
      if (!this.diffView) return;
      const nodes = this.diffView.syncThreadZones(
        this.threads.map(t => ({ id: t.id, side: t.side, line: t.line })),
      );
      this.mountedThreads = this.threads
        .filter(t => nodes.has(t.id))
        .map(t => ({ ...t, node: nodes.get(t.id) }));
    },
    commentLine(side) {
      if (!this.hover || this.hover.side !== side) return null;
      return this.canCommentOn(side, this.hover.line) ? this.hover.line : null;
    },
    commentTop(side) {
      const line = this.commentLine(side);
      if (line === null || !this.diffView || !this.viewState) return null;
      const top = this.diffView.lineTop(side, line);
      return top >= 0 && top < this.viewportHeight ? top : null;
    },
    scrollBy(deltaY) {
      this.diffView?.scrollBy(deltaY);
    },
    /** Moves to the next or previous change relative to where revealBlock puts one. */
    navigate(direction) {
      if (!this.diffView || !this.viewState || this.blocks.length === 0) return;
      const { layout, scrollTop, viewportHeight, paddingTop } = this.viewState;
      const anchor = scrollTop + viewportHeight / 3 - paddingTop;
      const tops = layout.connectors.map(c => c[this.soloSide ?? 'new'].top);
      const index =
        direction > 0
          ? tops.findIndex(top => top > anchor + 1)
          : tops
              .map((top, i) => (top < anchor - 1 ? i : -1))
              .filter(i => i >= 0)
              .pop() ?? -1;
      const first = direction > 0 ? 0 : tops.length - 1;
      this.diffView.revealBlock(layout.connectors[index === -1 ? first : index].blockId);
    },
    onKeyDown(event) {
      if (event.key !== 'F7') return;
      event.preventDefault();
      this.navigate(event.shiftKey ? -1 : 1);
    },
    revealBlock(blockId) {
      this.diffView?.revealBlock(blockId);
    },
    focusPane(side) {
      this.diffView?.editors[side].focus();
    },
  },
};
</script>
