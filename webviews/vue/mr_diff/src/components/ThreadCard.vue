<template>
  <section
    class="gl-diff-card"
    :class="{ 'gl-diff-card-resolved': discussion.resolved && collapsed }"
    :aria-label="`Discussion on line ${discussion.line}`"
  >
    <header class="gl-diff-card-header">
      <button
        type="button"
        class="gl-diff-card-toggle"
        :aria-expanded="String(!collapsed)"
        @click="collapsed = !collapsed"
      >
        <span
          class="gl-diff-icon"
          :class="collapsed ? 'gl-diff-icon-chevron-right' : 'gl-diff-icon-chevron-down'"
          aria-hidden="true"
        ></span>
        <span class="gl-diff-card-title">{{ title }}</span>
      </button>
      <resolved-badge v-if="discussion.resolvable" :resolved="discussion.resolved">
        <template #icon="{ resolved }">
          <span
            class="gl-diff-icon gl-diff-icon-small"
            :class="resolved ? 'gl-diff-icon-pass' : 'gl-diff-icon-comment-discussion'"
            aria-hidden="true"
          ></span>
        </template>
      </resolved-badge>
      <button
        v-if="discussion.resolvable && discussion.canResolve"
        type="button"
        class="gl-diff-button gl-diff-button-text"
        :disabled="busy"
        @click="setResolved(!discussion.resolved)"
      >
        {{ discussion.resolved ? 'Unresolve' : 'Resolve' }}
      </button>
    </header>
    <template v-if="!collapsed">
      <article v-for="(note, index) in discussion.notes" :key="note.id" class="gl-diff-note">
        <div class="gl-diff-note-header">
          <user-avatar
            :user="authorOf(note)"
            :size="index === 0 ? 20 : 16"
            :show-avatar="Boolean(note.avatarUrl)"
            :show-link="false"
          />
          <span class="gl-diff-note-meta" aria-hidden="true">·</span>
          <time-ago :date="note.createdAt" class="gl-diff-note-meta" />
          <span class="gl-diff-note-actions">
            <button
              v-if="note.canEdit && editingId !== note.id"
              type="button"
              class="gl-diff-button gl-diff-button-text"
              :disabled="busy"
              :aria-label="`Edit comment by ${note.authorName}`"
              @click="editingId = note.id"
            >
              Edit
            </button>
            <button
              v-if="note.canDelete && confirmingId !== note.id"
              type="button"
              class="gl-diff-button gl-diff-button-text"
              :disabled="busy"
              :aria-label="`Delete comment by ${note.authorName}`"
              @click="confirmingId = note.id"
            >
              Delete
            </button>
          </span>
        </div>
        <div
          v-if="confirmingId === note.id"
          class="gl-diff-confirm"
          role="alertdialog"
          :aria-labelledby="`gl-diff-confirm-${note.id}`"
        >
          <span :id="`gl-diff-confirm-${note.id}`">Delete this comment?</span>
          <button
            type="button"
            class="gl-diff-button gl-diff-button-danger"
            :disabled="busy"
            @click="deleteNote(note)"
          >
            Delete
          </button>
          <button
            type="button"
            class="gl-diff-button gl-diff-button-text"
            :disabled="busy"
            @click="confirmingId = null"
          >
            Cancel
          </button>
        </div>
        <comment-box
          v-if="editingId === note.id"
          :initial-body="note.body"
          :label="`Edit comment by ${note.authorName}`"
          submit-label="Save"
          :send="body => editNote(note, body)"
          @sent="editingId = null"
          @cancel="editingId = null"
        />
        <div v-else v-safe-html="note.bodyHtml" class="gl-diff-note-body gl-markdown"></div>
      </article>
      <p v-if="error" class="gl-diff-alert" role="alert">{{ error }}</p>
      <comment-box
        v-if="replying"
        label="Reply"
        submit-label="Reply"
        :send="reply"
        @sent="replying = false"
        @cancel="replying = false"
      />
      <div v-else-if="canComment && discussion.canReply" class="gl-diff-card-actions">
        <button type="button" class="gl-diff-link-button" @click="replying = true">
          <span class="gl-diff-icon gl-diff-icon-comment" aria-hidden="true"></span>
          Reply
        </button>
      </div>
    </template>
  </section>
</template>

<script>
import ResolvedBadge from '@shared/components/ResolvedBadge.vue';
import TimeAgo from '@shared/components/TimeAgo.vue';
import UserAvatar from '@shared/components/UserAvatar.vue';
import CommentBox from './CommentBox.vue';
import { SafeHtmlDirective } from '../../../issuable/src/directives/safe_html/safe_html';
import { request } from '../vscode_bridge';

export default {
  name: 'ThreadCard',
  components: { CommentBox, ResolvedBadge, TimeAgo, UserAvatar },
  directives: { SafeHtml: SafeHtmlDirective },
  props: {
    discussion: {
      type: Object,
      required: true,
    },
    canComment: {
      type: Boolean,
      default: false,
    },
  },
  data() {
    return {
      collapsed: this.discussion.resolved,
      replying: false,
      editingId: null,
      confirmingId: null,
      busy: false,
      error: null,
    };
  },
  computed: {
    title() {
      const [first] = this.discussion.notes;
      const count = this.discussion.notes.length;
      const replies = count > 1 ? ` · ${count - 1} ${count === 2 ? 'reply' : 'replies'}` : '';
      return `${first?.authorName ?? 'Comment'}${replies}`;
    },
  },
  async mounted() {
    // the diff panes have loaded Monaco by the time a discussion shows
    const { watchCodeBlocks } = await import('../view/code_blocks.ts');
    if (!this.unmounted) this.codeBlocks = watchCodeBlocks(this.$el);
  },
  updated() {
    this.codeBlocks?.update();
  },
  beforeUnmount() {
    this.unmounted = true;
    this.codeBlocks?.stop();
  },
  methods: {
    authorOf(note) {
      return { name: note.authorName, username: note.authorUsername, avatarUrl: note.avatarUrl };
    },
    reply(body) {
      return request('reply', { discussionId: this.discussion.id, body });
    },
    editNote(note, body) {
      return request('editNote', { noteId: note.id, body, originalBody: note.body });
    },
    async run(command, payload) {
      this.busy = true;
      this.error = null;
      try {
        await request(command, payload);
        return true;
      } catch (e) {
        this.error = e.message;
        return false;
      } finally {
        this.busy = false;
      }
    },
    async deleteNote(note) {
      if (await this.run('deleteNote', { noteId: note.id })) this.confirmingId = null;
    },
    async setResolved(resolved) {
      if (await this.run('setResolved', { discussionId: this.discussion.id, resolved })) {
        this.collapsed = resolved;
      }
    },
  },
};
</script>
