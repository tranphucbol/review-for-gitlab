<script>
export default {
  props: {
    replyId: {
      type: String,
      default: undefined,
    },
  },
  data() {
    return {
      note: '',
      isSaving: false,
      isFailed: false,
      command: 'saveNote',
    };
  },
  computed: {
    buttonTitle() {
      return this.isSaving ? 'Saving...' : 'Comment';
    },
    canSubmit() {
      return !this.isSaving && this.note.length > 0;
    },
    isThreadReply() {
      return Boolean(this.replyId);
    },
    submitHint() {
      const platform = window.navigator.userAgentData?.platform || window.navigator.platform || '';
      return /mac/i.test(platform) ? '⌘+Enter to comment' : 'Ctrl+Enter to comment';
    },
  },
  methods: {
    addComment() {
      if (!this.canSubmit) {
        return;
      }

      const { note, command, replyId } = this;

      this.isSaving = true;
      this.isFailed = false;
      window.vsCodeApi.postMessage({ command, note, replyId });
    },
    handleKeydown({ key, ctrlKey, shiftKey, metaKey, altKey }) {
      if (key === 'Enter' && (ctrlKey || metaKey) && !shiftKey && !altKey) {
        this.addComment();
      }
    },
    cancelEdit() {
      this.$emit('cancel-edit');
    },
  },
  mounted() {
    window.addEventListener('message', event => {
      if (event.data.type === 'noteSaved') {
        if (event.data.status !== false) {
          this.note = '';
          this.cancelEdit();
        } else {
          this.isFailed = true;
        }

        this.isSaving = false;
      }
    });
  },
};
</script>

<template>
  <div class="main-comment-form" :class="{ 'thread-reply': isThreadReply }">
    <textarea
      v-model="note"
      @keydown="handleKeydown"
      placeholder="Write a comment..."
      aria-label="Comment"
      :aria-invalid="isFailed ? 'true' : undefined"
      :class="{ 'is-invalid': isFailed }"
    />
    <p v-if="isFailed" class="comment-form__error js-error" role="alert">
      Failed to save your comment. Please try again.
    </p>
    <div class="comment-form__actions">
      <button class="primary js-submit" @click="addComment" :disabled="!canSubmit">
        {{ buttonTitle }}
      </button>
      <button class="secondary js-cancel" v-if="isThreadReply" @click="cancelEdit">Cancel</button>
      <span class="comment-form__hint js-hint">{{ submitHint }}</span>
    </div>
  </div>
</template>

<style lang="scss">
@use '@shared/styles/mixins';

.main-comment-form {
  margin: var(--gl-space-4) 0 var(--gl-space-6);

  &.thread-reply {
    margin: 0;
  }

  textarea {
    display: block;
    width: 100%;
    min-height: 96px;
    margin: 0;
    padding: 4px 6px;
    box-sizing: border-box;
    border: var(--gl-stroke) solid var(--gl-input-border);
    border-radius: var(--gl-radius-small);
    background-color: var(--gl-input-bg);
    color: var(--gl-input-fg);
    font-family: var(--gl-font-family);
    font-size: var(--gl-font-size);
    line-height: 1.4;
    resize: vertical;
    outline: 0;

    &::placeholder {
      color: var(--gl-input-placeholder);
    }

    // VS Code draws the focused input box with a focus outline over its border
    &:focus {
      @include mixins.focus-ring;
    }

    &.is-invalid {
      border-color: var(--gl-error-border);
    }

    &.is-invalid:not(:focus) {
      border-bottom-left-radius: 0;
      border-bottom-right-radius: 0;
    }
  }

  .comment-form__error {
    margin: 0;
    padding: 4px 8px;
    border: var(--gl-stroke) solid var(--gl-error-border);
    border-top: 0;
    border-radius: 0 0 var(--gl-radius-small) var(--gl-radius-small);
    background-color: var(--gl-error-bg);
    color: var(--gl-text);
    font-size: var(--gl-font-size-small);
  }

  .comment-form__actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--gl-space-2);
    margin-top: var(--gl-space-2);
  }

  .comment-form__hint {
    margin-left: auto;
    color: var(--gl-text-muted);
    font-size: var(--gl-font-size-small);
  }

  button.primary {
    @include mixins.text-button(primary);
  }

  button.secondary {
    @include mixins.text-button(secondary);
  }
}
</style>
