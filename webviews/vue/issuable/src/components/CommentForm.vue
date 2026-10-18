<script>
import checkbox from 'markdown-it-checkbox';
import MarkdownIt from 'markdown-it';
import { submitShortcut } from '@shared/utils/keyboard';
import { SafeHtmlDirective } from '../directives/safe_html/safe_html';

const md = new MarkdownIt().use(checkbox);

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const TABS = [
  { mode: 'write', text: 'Write', title: 'Edit the comment' },
  { mode: 'preview', text: 'Preview', title: 'Show the comment as GitLab renders it' },
];

let nextId = 0;
let nextRequestId = 0;

const readAsBase64 = file =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

const imagesOf = files => [...(files ?? [])].filter(file => file.type.startsWith('image/'));

export default {
  directives: {
    SafeHtml: SafeHtmlDirective,
  },
  props: {
    replyId: {
      type: String,
      default: undefined,
    },
    submitLabel: {
      type: String,
      default: 'Comment',
    },
  },
  data() {
    nextId += 1;
    return {
      uid: `comment-form-${nextId}`,
      note: '',
      isSaving: false,
      isFailed: false,
      error: null,
      command: 'saveNote',
      mode: 'write',
      /** the server rendering of `preview.body`, once the host answers */
      preview: { body: null, html: null },
      uploads: 0,
      /** resolvers of the uploads waiting for the host, by request id */
      pendingUploads: {},
    };
  },
  computed: {
    tabs: () => TABS,
    buttonTitle() {
      return this.isSaving ? 'Saving…' : this.submitLabel;
    },
    canSubmit() {
      return !this.isSaving && this.uploads === 0 && this.note.length > 0;
    },
    isThreadReply() {
      return Boolean(this.replyId);
    },
    submitHint() {
      return `${submitShortcut()} to ${this.submitLabel.toLowerCase()}`;
    },
    previewLoading() {
      return this.preview.body !== this.note || this.preview.html === null;
    },
    previewHtml() {
      // markdown-it stands in until GitLab's rendering arrives, as for a posted note
      return this.previewLoading ? md.render(this.note) : this.preview.html;
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
      this.error = null;
      window.vsCodeApi.postMessage({ command, note, replyId });
    },
    handleKeydown(event) {
      const { key, ctrlKey, shiftKey, metaKey, altKey } = event;
      if (key === 'Enter' && (ctrlKey || metaKey) && !shiftKey && !altKey) {
        this.addComment();
      } else if (key === 'Escape' && this.isThreadReply) {
        event.preventDefault();
        this.cancelEdit();
      }
    },
    cancelEdit() {
      this.$emit('cancel-edit');
    },
    switchTab() {
      const next = this.mode === 'write' ? 'preview' : 'write';
      this.setMode(next, false);
      this.$nextTick(() => {
        const tab = this.$refs[`${next}Tab`];
        (Array.isArray(tab) ? tab[0] : tab)?.focus();
      });
    },
    setMode(mode, focusTextarea = true) {
      this.mode = mode;
      if (mode === 'preview') this.renderPreview();
      else if (focusTextarea) this.$nextTick(() => this.$refs.textarea?.focus());
    },
    renderPreview() {
      if (this.preview.body === this.note || !this.note.trim()) return;
      this.preview = { body: this.note, html: null };
      window.vsCodeApi.postMessage({
        command: 'renderMarkdown',
        markdown: this.note,
        object: 'preview',
        ref: this.uid,
      });
    },
    onPaste(event) {
      const images = imagesOf(event.clipboardData?.files);
      if (images.length === 0 || this.isSaving) return;
      event.preventDefault();
      images.forEach(image => this.upload(image));
    },
    onDrop(event) {
      if (this.isSaving) return;
      imagesOf(event.dataTransfer?.files).forEach(image => this.upload(image));
    },
    insertAtCursor(text) {
      const { textarea } = this.$refs;
      const start = textarea.selectionStart ?? this.note.length;
      const end = textarea.selectionEnd ?? start;
      this.note = `${this.note.slice(0, start)}${text}${this.note.slice(end)}`;
      this.$nextTick(() => {
        textarea.selectionStart = start + text.length;
        textarea.selectionEnd = start + text.length;
      });
    },
    replacePlaceholder(placeholder, text) {
      this.note = this.note.includes(placeholder)
        ? this.note.replace(placeholder, text)
        : `${this.note}${text}`;
    },
    requestUpload(name, contentType, base64) {
      nextRequestId += 1;
      const requestId = nextRequestId;
      return new Promise((resolve, reject) => {
        this.pendingUploads[requestId] = { resolve, reject };
        window.vsCodeApi.postMessage({
          command: 'uploadImage',
          requestId,
          name,
          contentType,
          base64,
        });
      });
    },
    async upload(image) {
      const name = image.name || 'image.png';
      if (image.size > MAX_IMAGE_BYTES) {
        this.error = `The image ${name} is larger than 10 MB.`;
        return;
      }
      const placeholder = `![Uploading ${name}…]()`;
      this.insertAtCursor(placeholder);
      this.uploads += 1;
      try {
        const base64 = await readAsBase64(image);
        const markdown = await this.requestUpload(name, image.type, base64);
        this.replacePlaceholder(placeholder, markdown);
      } catch (e) {
        this.replacePlaceholder(placeholder, '');
        this.error = e.message;
      } finally {
        this.uploads -= 1;
      }
    },
    onMessage(event) {
      const { data } = event;
      if (data.type === 'noteSaved') {
        if (data.status !== false) {
          this.note = '';
          this.mode = 'write';
          this.cancelEdit();
        } else {
          this.isFailed = true;
        }

        this.isSaving = false;
      } else if (data.type === 'markdownRendered' && data.object === 'preview') {
        if (data.ref === this.uid && data.markdown !== undefined) {
          this.preview = { ...this.preview, html: data.markdown };
        }
      } else if (data.type === 'imageUploaded' && this.pendingUploads[data.requestId]) {
        const { resolve, reject } = this.pendingUploads[data.requestId];
        delete this.pendingUploads[data.requestId];
        if (data.error) reject(new Error(data.error));
        else resolve(data.markdown);
      }
    },
  },
  mounted() {
    window.addEventListener('message', this.onMessage);
  },
  beforeUnmount() {
    window.removeEventListener('message', this.onMessage);
  },
};
</script>

<template>
  <div class="main-comment-form" :class="{ 'thread-reply': isThreadReply }">
    <div class="comment-form__tabs" role="tablist" aria-label="Comment mode">
      <button
        v-for="tab in tabs"
        :id="`${uid}-${tab.mode}-tab`"
        :key="tab.mode"
        :ref="`${tab.mode}Tab`"
        type="button"
        role="tab"
        class="comment-form__tab"
        :class="[`js-${tab.mode}-tab`, { 'comment-form__tab--active': mode === tab.mode }]"
        :aria-selected="String(mode === tab.mode)"
        :aria-controls="`${uid}-${tab.mode}-panel`"
        :tabindex="mode === tab.mode ? 0 : -1"
        :title="tab.title"
        @click="setMode(tab.mode)"
        @keydown.left.prevent="switchTab"
        @keydown.right.prevent="switchTab"
      >
        {{ tab.text }}
      </button>
    </div>
    <div
      v-show="mode === 'write'"
      :id="`${uid}-write-panel`"
      role="tabpanel"
      :aria-labelledby="`${uid}-write-tab`"
    >
      <textarea
        ref="textarea"
        v-model="note"
        @keydown="handleKeydown"
        @paste="onPaste"
        @dragover.prevent
        @drop.prevent="onDrop"
        placeholder="Write a comment. Paste or drop an image to attach it."
        aria-label="Comment"
        :aria-invalid="isFailed ? 'true' : undefined"
        :class="{ 'is-invalid': isFailed }"
      />
    </div>
    <div
      v-if="mode === 'preview'"
      :id="`${uid}-preview-panel`"
      class="comment-form__preview js-preview"
      tabindex="0"
      role="tabpanel"
      :aria-labelledby="`${uid}-preview-tab`"
      :aria-busy="String(previewLoading && note.trim().length > 0)"
      @keydown="handleKeydown"
    >
      <p v-if="!note.trim()" class="comment-form__empty">Nothing to preview.</p>
      <div v-else class="note-body gl-markdown" v-safe-html="previewHtml" />
    </div>
    <p v-if="isFailed" class="comment-form__error js-error" role="alert">
      Failed to save your comment. Please try again.
    </p>
    <p v-if="error" class="comment-form__alert js-upload-error" role="alert">{{ error }}</p>
    <div class="comment-form__actions">
      <button class="primary js-submit" @click="addComment" :disabled="!canSubmit">
        {{ buttonTitle }}
      </button>
      <button class="secondary js-cancel" v-if="isThreadReply" @click="cancelEdit">Cancel</button>
      <span v-if="uploads > 0" class="comment-form__status js-uploading" role="status">
        Uploading image…
      </span>
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

  .comment-form__tabs {
    @include mixins.composer-tabs;

    margin-bottom: var(--gl-space-2);
  }

  .comment-form__tab {
    @include mixins.composer-tab;
  }

  .comment-form__tab--active {
    @include mixins.composer-tab-active;
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

  .comment-form__preview {
    box-sizing: border-box;
    min-height: 96px;
    padding: 4px 6px;
    border: var(--gl-stroke) solid var(--gl-input-border);
    border-radius: var(--gl-radius-small);
    word-wrap: break-word;

    &:focus {
      @include mixins.focus-ring;
    }
  }

  .comment-form__empty {
    margin: 0;
    color: var(--gl-text-muted);
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

  .comment-form__alert {
    margin: var(--gl-space-2) 0 0;
    padding: 4px 8px;
    border: var(--gl-stroke) solid var(--gl-error-border);
    border-radius: var(--gl-radius-small);
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

  .comment-form__status,
  .comment-form__hint {
    color: var(--gl-text-muted);
    font-size: var(--gl-font-size-small);
  }

  .comment-form__hint {
    margin-left: auto;
  }

  button.primary {
    @include mixins.text-button(primary);
  }

  button.secondary {
    @include mixins.text-button(secondary);
  }
}
</style>
