<template>
  <section
    class="gl-diff-card"
    :class="{ 'gl-diff-card-resolved': discussion.resolved }"
    :aria-label="`Discussion on line ${discussion.line}`"
  >
    <header class="gl-diff-card-header">
      <button
        type="button"
        class="gl-diff-card-toggle"
        :aria-expanded="String(!collapsed)"
        @click="collapsed = !collapsed"
      >
        <span aria-hidden="true">{{ collapsed ? '▸' : '▾' }}</span>
        {{ title }}
      </button>
      <span v-if="discussion.resolved" class="gl-diff-card-badge">Resolved</span>
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
      <article v-for="note in discussion.notes" :key="note.id" class="gl-diff-note">
        <div class="gl-diff-note-header">
          <img
            v-if="note.avatarUrl"
            class="gl-diff-avatar"
            :src="note.avatarUrl"
            alt=""
            width="20"
            height="20"
          />
          <strong>{{ note.authorName }}</strong>
          <span class="gl-diff-note-meta">@{{ note.authorUsername }} · {{ when(note) }}</span>
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
        <div v-if="confirmingId === note.id" class="gl-diff-confirm" role="alertdialog">
          <span>Delete this comment?</span>
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
        <div v-else v-safe-html="note.bodyHtml" class="gl-diff-note-body"></div>
      </article>
      <p v-if="error" class="gl-diff-card-error" role="alert">{{ error }}</p>
      <comment-box
        v-if="replying"
        label="Reply"
        submit-label="Reply"
        :send="reply"
        @sent="replying = false"
        @cancel="replying = false"
      />
      <div v-else-if="canComment && discussion.canReply" class="gl-diff-card-actions">
        <button type="button" class="gl-diff-button gl-diff-button-text" @click="replying = true">
          Reply…
        </button>
      </div>
    </template>
  </section>
</template>

<script>
import CommentBox from './CommentBox.vue';
import { SafeHtmlDirective } from '../../../issuable/src/directives/safe_html/safe_html';
import { request } from '../vscode_bridge';

export default {
  name: 'ThreadCard',
  components: { CommentBox },
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
  methods: {
    when(note) {
      const date = new Date(note.createdAt);
      return Number.isNaN(date.getTime()) ? '' : date.toLocaleString();
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
