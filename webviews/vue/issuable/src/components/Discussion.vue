<script>
import Note from './Note.vue';
import CommentForm from './CommentForm.vue';
import CodiconIcon from './CodiconIcon.vue';

const formatPosition = position => {
  if (!position) return '';
  if (position.newPath && position.newLine) return `${position.newPath}:${position.newLine}`;
  if (position.oldPath && position.oldLine) return `${position.oldPath}:${position.oldLine}`;
  return position.newPath || position.oldPath || position.filePath || '';
};

export default {
  name: 'Discussion',
  props: {
    noteable: {
      type: Object,
      required: true,
    },
  },
  data() {
    return {
      // a resolved thread starts folded to its header and first line
      isRepliesVisible: !this.noteable.resolved,
      isEditing: false,
      reply: '',
    };
  },
  components: {
    Note,
    CommentForm,
    CodiconIcon,
  },
  computed: {
    initialDiscussion() {
      return this.noteable.notes.nodes[0];
    },
    replies() {
      return this.noteable.notes.nodes.slice(1);
    },
    hasReplies() {
      return this.replies.length > 0;
    },
    canCollapse() {
      return this.hasReplies || this.noteable.resolved;
    },
    isFolded() {
      return !this.isRepliesVisible && this.noteable.resolved;
    },
    toggleRepliesText() {
      if (!this.hasReplies) return this.isRepliesVisible ? 'Collapse thread' : 'Expand thread';
      return this.isRepliesVisible ? 'Collapse replies' : 'Expand replies';
    },
    toggleRepliesIcon() {
      return this.isRepliesVisible ? 'chevron-down' : 'chevron-right';
    },
    position() {
      return formatPosition(this.initialDiscussion.position);
    },
  },
  methods: {
    toggleReplies() {
      this.isRepliesVisible = !this.isRepliesVisible;
    },
    toggleEditting() {
      this.isEditing = !this.isEditing;
    },
  },
};
</script>

<template>
  <li class="discussion" :class="{ 'discussion--folded': isFolded }">
    <ul class="discussion__notes">
      <note :noteable="initialDiscussion" class="discussion__first">
        <template #header>
          <code v-if="position" class="branch-chip discussion__file js-file-chip" :title="position">
            <codicon-icon name="file" :size="14" />
            {{ position }}
          </code>
          <span
            v-if="noteable.resolvable"
            class="discussion__badge js-resolved-badge"
            :class="noteable.resolved ? 'discussion__badge--resolved' : 'discussion__badge--open'"
          >
            <codicon-icon :name="noteable.resolved ? 'pass' : 'comment-discussion'" :size="14" />
            {{ noteable.resolved ? 'Resolved' : 'Unresolved' }}
          </span>
        </template>
      </note>
    </ul>
    <template v-if="isRepliesVisible">
      <ul v-if="hasReplies" class="discussion__replies">
        <note v-for="note in replies" :key="note.id" :noteable="note" is-reply />
      </ul>
    </template>
    <div class="discussion__footer">
      <button
        v-if="canCollapse"
        type="button"
        class="discussion__link collapse js-collapse"
        :aria-expanded="String(isRepliesVisible)"
        @click="toggleReplies"
      >
        <codicon-icon :name="toggleRepliesIcon" /> {{ toggleRepliesText }}
      </button>
      <template v-if="isRepliesVisible">
        <button
          v-if="!isEditing"
          type="button"
          class="discussion__link reply js-reply"
          @click="toggleEditting"
        >
          <codicon-icon name="comment" /> Reply
        </button>
      </template>
    </div>
    <comment-form
      v-if="isRepliesVisible && isEditing"
      class="discussion__form"
      :reply-id="noteable.replyId"
      @cancel-edit="toggleEditting"
    />
  </li>
</template>

<style lang="scss">
@use '@shared/styles/mixins';

.discussion {
  list-style: none;
  margin: var(--gl-space-3) 0;
  border: var(--gl-stroke) solid var(--gl-border);
  border-radius: var(--gl-radius-medium);
  background: var(--gl-surface-raised);

  &__notes,
  &__replies {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  &__replies {
    margin: 0 var(--gl-space-3) 0 calc(var(--gl-space-3) + 10px);
    border-left: 1px solid var(--gl-border-subtle);

    .note {
      padding-left: var(--gl-space-3);
    }
  }

  &__file {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__badge {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    padding: 0 6px;
    border-radius: var(--gl-radius-circle);
    font-size: var(--gl-font-size-small);
    line-height: 16px;

    &--resolved {
      @include mixins.tinted(var(--gl-state-open));
    }

    &--open {
      color: var(--gl-badge-fg);
      background-color: var(--gl-badge-bg);
    }
  }

  &--folded .discussion__first .note-body {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 1;
    overflow: hidden;
    color: var(--gl-text-muted);

    .body > * {
      margin: 0;
    }
  }

  &__footer {
    display: flex;
    gap: var(--gl-space-1);
    padding: 0 calc(var(--gl-space-3) - 6px) var(--gl-space-2);

    &:empty {
      display: none;
    }
  }

  &__link {
    @include mixins.toolbar-button;
    display: inline-flex;
    align-items: center;
    gap: var(--gl-space-1);
    padding: 2px 6px;
    color: var(--gl-link);
    font: inherit;

    &:hover {
      color: var(--gl-link-active);
    }
  }

  &__form {
    padding: 0 var(--gl-space-3) var(--gl-space-3);
  }
}
</style>
