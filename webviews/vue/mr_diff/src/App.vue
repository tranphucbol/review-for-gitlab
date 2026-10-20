<template>
  <div class="gl-diff-app">
    <div class="gl-diff-toolbar" role="toolbar" aria-label="Diff actions">
      <span class="gl-diff-summary">{{ summary }}</span>
      <span
        v-if="file && localState.enabled"
        class="gl-diff-local-state"
        role="status"
        :title="localStateTitle"
        :aria-label="localStateTitle"
      >
        {{ localStateLabel }}
      </span>
      <button
        v-if="localState.enabled && dismissed.length"
        type="button"
        class="gl-diff-button gl-diff-button-text"
        title="Show the arrows you hid again"
        @click="dismissed = []"
      >
        Show hidden arrows
      </button>
      <button
        type="button"
        class="gl-diff-button gl-diff-icon-button"
        :disabled="blocks.length === 0 || !diffLayout"
        title="Previous change"
        aria-label="Previous change"
        @click="navigate(-1)"
      >
        <span class="gl-diff-icon gl-diff-icon-arrow-up" aria-hidden="true"></span>
      </button>
      <button
        type="button"
        class="gl-diff-button gl-diff-icon-button"
        :disabled="blocks.length === 0 || !diffLayout"
        title="Next change"
        aria-label="Next change"
        @click="navigate(1)"
      >
        <span class="gl-diff-icon gl-diff-icon-arrow-down" aria-hidden="true"></span>
      </button>
      <button
        v-if="!soloSide"
        type="button"
        class="gl-diff-button gl-diff-icon-button"
        :aria-pressed="String(aligned)"
        :title="
          aligned
            ? 'Align both sides (on): hide the hatched space'
            : 'Align both sides (off): show hatched space so the lines line up'
        "
        aria-label="Align both sides"
        @click="toggleAligned"
      >
        <span class="gl-diff-icon gl-diff-icon-align" aria-hidden="true"></span>
      </button>
      <button
        type="button"
        class="gl-diff-button gl-diff-icon-button"
        title="Refresh: load the latest version of the merge request and its discussions"
        aria-label="Refresh"
        @click="refresh"
      >
        <span class="gl-diff-icon gl-diff-icon-refresh" aria-hidden="true"></span>
      </button>
      <button
        type="button"
        class="gl-diff-button gl-diff-button-text"
        title="Open this file in the native VS Code diff"
        @click="openNative"
      >
        Open native diff
      </button>
    </div>
    <div v-if="file && file.collapsed" class="gl-diff-banner" role="status">
      GitLab didn't return a diff for this file because it is too large. The changes below are
      computed locally, and new comments are disabled.
    </div>
    <div v-if="notice" class="gl-diff-banner" role="status">
      <span class="gl-diff-banner-text">{{ notice }}</span>
      <button type="button" class="gl-diff-button gl-diff-button-text" @click="notice = null">
        Dismiss
      </button>
    </div>
    <div v-if="applyError" class="gl-diff-banner gl-diff-banner-warning" role="alert">
      <span class="gl-diff-banner-text">{{ applyError }}</span>
      <button type="button" class="gl-diff-button gl-diff-button-text" @click="applyError = null">
        Dismiss
      </button>
    </div>
    <div v-if="discussionsError" class="gl-diff-banner gl-diff-banner-warning" role="alert">
      <span class="gl-diff-banner-text">{{ discussionsError }}</span>
      <button type="button" class="gl-diff-button gl-diff-button-text" @click="refresh">
        Retry
      </button>
    </div>
    <div v-else-if="unsupported" class="gl-diff-banner" role="status">
      This GitLab version does not report merge request discussions to the extension, so they are
      not shown here.
    </div>
    <div v-if="fatalError" class="gl-diff-error">
      <p class="gl-diff-alert" role="alert">{{ fatalError }}</p>
      <button type="button" class="gl-diff-button gl-diff-button-text" @click="openNative">
        Open native diff
      </button>
    </div>
    <component
      :is="diffLayout"
      v-else-if="file && diffLayout"
      :key="fileKey"
      ref="layout"
      :file="file"
      :blocks="blocks"
      :threads="threads"
      :can-comment-on="canCommentOn"
      :aligned="aligned"
      :solo-side="soloSide"
      :block-states="blockStates"
      @add-comment="addDraft"
      @comment-refused="explainRefusedComment"
      @go-to-source="goToSource"
      @failed="onLayoutFailed"
    >
      <template #gutter="{ connectors }">
        <hunk-actions
          v-for="connector in actionable(connectors)"
          :key="connector.blockId"
          :connector="connector"
          :direction="arrowDirection"
          :busy="pendingBlockId !== null"
          @apply="applyBlock(connector.blockId)"
          @dismiss="dismissed = [...dismissed, connector.blockId]"
        />
      </template>
      <template #thread="{ thread }">
        <div class="gl-diff-thread-group">
          <thread-card
            v-for="discussion in thread.discussions"
            :key="discussion.id"
            :discussion="discussion"
            :can-comment="canComment"
          />
          <section
            v-if="thread.draft"
            class="gl-diff-card"
            :aria-label="`New comment on line ${thread.line}`"
          >
            <comment-box
              :label="`New comment on line ${thread.line}`"
              submit-label="Comment"
              :send="body => createThread(thread, body)"
              @sent="closeDraft(thread)"
              @cancel="closeDraft(thread)"
            />
          </section>
        </div>
      </template>
    </component>
    <div v-else class="gl-diff-loading" role="status" aria-busy="true">Loading…</div>
  </div>
</template>

<script>
import { markRaw } from 'vue';
import CommentBox from './components/CommentBox.vue';
import HunkActions from './components/HunkActions.vue';
import ThreadCard from './components/ThreadCard.vue';
import { onMessage, post, request } from './vscode_bridge';
import { parseUnifiedDiff } from './model/unified_diff_parser.ts';
import { computeLineBlocks, splitLines } from './model/line_alignment.ts';
import { setTokenRules } from './view/token_theme.ts';
import { setEditorFont } from './view/editor_font.ts';
import { setDiffKeybindings } from './view/keybindings.ts';
import { setJiraLinkConfig } from '../../issuable/src/utils/jira_links';

const describeError = e => (e instanceof Error ? e.message : String(e));

const threadKey = (side, line) => `${side}:${line}`;

const NO_LOCAL_STATE = { enabled: false, applicable: 'none', appliedBlockIds: [] };

export default {
  name: 'App',
  components: { CommentBox, HunkActions, ThreadCard },
  data() {
    return {
      file: null,
      fileKey: 0,
      /** the host's load of `file`, sent back with the writes that count its lines */
      generation: 0,
      blocks: [],
      diffLayout: null,
      fatalError: null,
      discussions: [],
      canComment: false,
      unsupported: false,
      discussionsError: null,
      drafts: [],
      aligned: true,
      localState: NO_LOCAL_STATE,
      dismissed: [],
      pendingBlockId: null,
      applyError: null,
      notice: null,
    };
  },
  computed: {
    arrowDirection() {
      if (!this.localState.enabled) return null;
      if (this.localState.applicable === 'base') return 'apply';
      if (this.localState.applicable === 'head') return 'revert';
      return null;
    },
    blockStates() {
      const applied = new Set(this.localState.appliedBlockIds);
      return Object.fromEntries(
        this.blocks.map(({ id }) => [
          id,
          { applied: applied.has(id), dismissed: this.dismissed.includes(id) },
        ]),
      );
    },
    localStateLabel() {
      const applied = this.localState.appliedBlockIds.length;
      const suffix = applied ? `, ${applied} applied` : '';
      if (this.localState.applicable === 'base') return `Local: base${suffix}`;
      if (this.localState.applicable === 'head') return `Local: head${suffix}`;
      return 'Local: no arrows';
    },
    localStateTitle() {
      if (this.localState.applicable === 'base') {
        return 'The local file is the base of the merge request. The arrow beside a change copies it into the file.';
      }
      if (this.localState.applicable === 'head') {
        return 'The local file is the head of the merge request. The arrow beside a change reverts it in the file.';
      }
      return this.localState.reason ?? 'The view does not change the local file.';
    },
    /** An added or deleted file has one side, shown as a single pane. */
    soloSide() {
      if (!this.file) return null;
      if (!this.file.oldExists) return 'new';
      if (!this.file.newExists) return 'old';
      return null;
    },
    summary() {
      if (!this.file) return '';
      const count = this.blocks.length;
      return count === 1 ? '1 change' : `${count} changes`;
    },
    lineCounts() {
      if (!this.file) return { old: 0, new: 0 };
      return {
        old: this.file.oldExists ? splitLines(this.file.oldText).length : 0,
        new: this.file.newExists ? splitLines(this.file.newText).length : 0,
      };
    },
    commentableNewLines() {
      return new Set(this.file?.commentableNewLines ?? []);
    },
    /** One zone per commented line: its discussions, oldest first, then a draft if any. */
    threads() {
      const byLine = new Map();
      const threadFor = (side, line) => {
        const id = threadKey(side, line);
        if (!byLine.has(id)) byLine.set(id, { id, side, line, discussions: [], draft: false });
        return byLine.get(id);
      };
      this.discussions.forEach(d => threadFor(d.side, d.line).discussions.push(d));
      this.drafts.forEach(({ side, line }) => {
        threadFor(side, line).draft = true;
      });
      return [...byLine.values()].filter(t => t.line >= 1 && t.line <= this.lineCounts[t.side]);
    },
  },
  mounted() {
    this.stopListening = onMessage(message => this.onHostMessage(message));
    import('./components/DiffLayout.vue')
      .then(module => {
        this.diffLayout = markRaw(module.default);
      })
      .catch(e => this.onLayoutFailed(e));
    post({ command: 'appReady' });
  },
  beforeUnmount() {
    this.stopListening?.();
  },
  methods: {
    onHostMessage(message) {
      if (message?.command === 'tokenTheme') setTokenRules(message.rules ?? []);
      if (message?.command === 'editorFont' && message.font) setEditorFont(message.font);
      if (message?.command === 'jiraLinks') setJiraLinkConfig(message.config);
      if (message?.command === 'keybindings') setDiffKeybindings(message.keybindings ?? []);
      if (message?.command === 'runAction') this.$refs.layout?.runAction(message.action);
      if (message?.command === 'init') this.init(message.file, message.aligned, message.generation);
      if (message?.command === 'error') this.fatalError = message.message;
      if (message?.command === 'discussions') this.setDiscussions(message);
      if (message?.command === 'localState') this.localState = message;
    },
    actionable(connectors) {
      if (!this.arrowDirection) return [];
      return connectors.filter(c => !c.applied && !c.dismissed);
    },
    applyBlock(blockId) {
      const block = this.blocks.find(b => b.id === blockId);
      if (!block || this.pendingBlockId !== null) return;
      const { oldStart, oldCount, newStart, newCount } = block;
      this.pendingBlockId = blockId;
      this.applyError = null;
      request('applyHunk', {
        generation: this.generation,
        blockId,
        oldStart,
        oldCount,
        newStart,
        newCount,
        direction: this.arrowDirection,
      })
        .catch(e => {
          this.applyError = describeError(e);
        })
        .finally(() => {
          this.pendingBlockId = null;
        });
    },
    setDiscussions({ discussions, canComment, unsupported, error }) {
      const byDate = (a, b) =>
        (a.notes[0]?.createdAt ?? '').localeCompare(b.notes[0]?.createdAt ?? '');
      this.discussions = [...discussions].sort(byDate);
      this.canComment = canComment;
      this.unsupported = Boolean(unsupported);
      this.discussionsError = error ?? null;
      if (!canComment) this.drafts = [];
    },
    canCommentOn(side, line) {
      if (!this.file || !this.canComment || this.file.collapsed) return false;
      if (side === 'old') return line >= 1 && line <= this.lineCounts.old;
      return this.commentableNewLines.has(line);
    },
    explainRefusedComment({ line }) {
      if (this.file?.collapsed) {
        this.notice = 'This file is too large for GitLab to accept new comments on it.';
      } else if (!this.canComment) {
        this.notice = "You can't comment on this merge request from the extension.";
      } else {
        this.notice = `Line ${line} is unchanged in the merge request version. Comment on a changed line, or on the base version.`;
      }
    },
    addDraft({ side, line }) {
      this.notice = null;
      const id = threadKey(side, line);
      if (!this.drafts.some(d => d.id === id)) this.drafts = [...this.drafts, { id, side, line }];
    },
    closeDraft({ id, side }) {
      this.drafts = this.drafts.filter(d => d.id !== id);
      this.$refs.layout?.focusPane(side);
    },
    createThread({ side, line }, body) {
      return request('createThread', { generation: this.generation, side, line, body });
    },
    init(file, aligned = true, generation = 0) {
      this.fatalError = null;
      this.generation = generation;
      this.aligned = aligned;
      this.blocks = file.collapsed
        ? computeLineBlocks(splitLines(file.oldText), splitLines(file.newText))
        : parseUnifiedDiff(file.diff);
      this.file = file;
      this.drafts = [];
      this.localState = NO_LOCAL_STATE;
      this.dismissed = [];
      this.applyError = null;
      this.notice = null;
      this.fileKey += 1;
    },
    navigate(direction) {
      this.$refs.layout?.navigate(direction);
    },
    toggleAligned() {
      this.aligned = !this.aligned;
      post({ command: 'setAligned', aligned: this.aligned });
    },
    refresh() {
      post({ command: 'refresh' });
    },
    openNative() {
      post({ command: 'openNative' });
    },
    goToSource({ side, range }) {
      post({ command: 'openSource', generation: this.generation, side, ...range });
    },
    onLayoutFailed(e) {
      this.fatalError = `The side-by-side view couldn't start: ${describeError(e)}`;
      this.openNative();
    },
  },
};
</script>
