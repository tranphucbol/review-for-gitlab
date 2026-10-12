<template>
  <form class="gl-diff-comment-box" @submit.prevent="submit" @keydown="onKeyDown">
    <div class="gl-diff-comment-tabs" role="tablist" :aria-label="`${label} mode`">
      <button
        v-for="tab in tabs"
        :key="tab.mode"
        type="button"
        role="tab"
        class="gl-diff-comment-tab"
        :class="{ 'gl-diff-comment-tab-active': mode === tab.mode }"
        :aria-selected="String(mode === tab.mode)"
        :title="tab.title"
        @click="setMode(tab.mode)"
      >
        {{ tab.text }}
      </button>
    </div>
    <textarea
      v-show="mode === 'write'"
      ref="textarea"
      v-model="body"
      class="gl-diff-textarea"
      rows="3"
      :aria-label="label"
      :placeholder="placeholder"
      :readonly="busy"
      @paste="onPaste"
      @dragover.prevent
      @drop.prevent="onDrop"
    ></textarea>
    <div
      v-if="mode === 'preview'"
      ref="preview"
      class="gl-diff-comment-preview"
      tabindex="0"
      role="tabpanel"
      :aria-label="`${label} preview`"
      :aria-busy="String(preview.loading)"
    >
      <p v-if="preview.loading" class="gl-diff-card-hint">Loading preview…</p>
      <p v-else-if="preview.error" class="gl-diff-card-error" role="alert">{{ preview.error }}</p>
      <p v-else-if="!preview.html" class="gl-diff-card-hint">Nothing to preview.</p>
      <div v-else v-safe-html="preview.html" class="gl-diff-note-body"></div>
    </div>
    <p v-if="error" class="gl-diff-card-error" role="alert">{{ error }}</p>
    <div class="gl-diff-card-actions">
      <button
        type="submit"
        class="gl-diff-button gl-diff-button-primary"
        :disabled="!canSubmit"
        :title="`${submitText} (${modifierKey}+Enter)`"
      >
        {{ submitText }}
      </button>
      <button type="button" class="gl-diff-button gl-diff-button-text" @click="$emit('cancel')">
        Cancel
      </button>
      <span v-if="uploads > 0" class="gl-diff-card-hint" role="status">Uploading image…</span>
    </div>
  </form>
</template>

<script>
import { SafeHtmlDirective } from '../../../issuable/src/directives/safe_html/safe_html';
import { request } from '../vscode_bridge';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const TABS = [
  { mode: 'write', text: 'Write', title: 'Edit the comment' },
  { mode: 'preview', text: 'Preview', title: 'Show the comment as GitLab renders it' },
];

const readAsBase64 = file =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

const imagesOf = files => [...(files ?? [])].filter(file => file.type.startsWith('image/'));

export default {
  name: 'CommentBox',
  directives: { SafeHtml: SafeHtmlDirective },
  props: {
    initialBody: {
      type: String,
      default: '',
    },
    label: {
      type: String,
      required: true,
    },
    placeholder: {
      type: String,
      default: 'Write a comment. Paste or drop an image to attach it.',
    },
    submitLabel: {
      type: String,
      required: true,
    },
    /** Sends the body to GitLab; a rejection keeps the draft and shows its message. */
    send: {
      type: Function,
      required: true,
    },
  },
  emits: ['cancel', 'sent'],
  data() {
    return {
      body: this.initialBody,
      busy: false,
      uploads: 0,
      error: null,
      mode: 'write',
      /** the last rendering, kept while `body` is unchanged */
      preview: { body: null, html: '', loading: false, error: null },
      previewRequest: 0,
    };
  },
  computed: {
    tabs: () => TABS,
    canSubmit() {
      return !this.busy && this.uploads === 0 && this.body.trim().length > 0;
    },
    submitText() {
      return this.error && !this.busy ? 'Retry' : this.submitLabel;
    },
    modifierKey() {
      return navigator.platform.startsWith('Mac') ? 'Cmd' : 'Ctrl';
    },
  },
  watch: {
    body() {
      // an upload that finishes while the preview shows changes the body
      if (this.mode === 'preview') this.renderPreview();
    },
  },
  mounted() {
    // Monaco shows a new view zone on its next render; focus fails until then.
    const focus = framesLeft => {
      const { textarea } = this.$refs;
      if (textarea?.getClientRects().length) textarea.focus({ preventScroll: true });
      else if (textarea && framesLeft > 0) requestAnimationFrame(() => focus(framesLeft - 1));
    };
    focus(10);
  },
  updated() {
    this.highlightPreview();
  },
  beforeUnmount() {
    this.unmounted = true;
    this.codeBlocks?.stop();
  },
  methods: {
    setMode(mode) {
      this.mode = mode;
      if (mode === 'preview') this.renderPreview();
      else this.$nextTick(() => this.$refs.textarea?.focus({ preventScroll: true }));
    },
    async renderPreview() {
      const { body } = this;
      if (this.preview.body === body && !this.preview.error) return;
      this.previewRequest += 1;
      const current = this.previewRequest;
      if (!body.trim()) {
        this.preview = { body, html: '', loading: false, error: null };
        return;
      }
      this.preview = { body, html: '', loading: true, error: null };
      let next;
      try {
        const { html } = await request('previewMarkdown', { body });
        next = { body, html: html ?? '', loading: false, error: null };
      } catch (e) {
        next = { body, html: '', loading: false, error: e.message };
      }
      if (current === this.previewRequest) this.preview = next;
    },
    async highlightPreview() {
      if (!this.preview.html || this.mode !== 'preview') return;
      if (this.codeBlocks) {
        this.codeBlocks.update();
        return;
      }
      // the diff panes have loaded Monaco by the time a comment box shows
      const { watchCodeBlocks } = await import('../view/code_blocks.ts');
      if (!this.unmounted && !this.codeBlocks) this.codeBlocks = watchCodeBlocks(this.$el);
    },
    async submit() {
      if (!this.canSubmit) return;
      this.busy = true;
      this.error = null;
      try {
        await this.send(this.body);
        this.$emit('sent');
      } catch (e) {
        this.error = e.message;
      } finally {
        this.busy = false;
      }
    },
    onKeyDown(event) {
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        this.submit();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        this.$emit('cancel');
      }
    },
    onPaste(event) {
      const images = imagesOf(event.clipboardData?.files);
      if (images.length === 0 || this.busy) return;
      event.preventDefault();
      images.forEach(image => this.upload(image));
    },
    onDrop(event) {
      if (this.busy) return;
      imagesOf(event.dataTransfer?.files).forEach(image => this.upload(image));
    },
    insertAtCursor(text) {
      const { textarea } = this.$refs;
      const start = textarea.selectionStart ?? this.body.length;
      const end = textarea.selectionEnd ?? start;
      this.body = `${this.body.slice(0, start)}${text}${this.body.slice(end)}`;
      this.$nextTick(() => {
        textarea.selectionStart = start + text.length;
        textarea.selectionEnd = start + text.length;
      });
    },
    replacePlaceholder(placeholder, text) {
      this.body = this.body.includes(placeholder)
        ? this.body.replace(placeholder, text)
        : `${this.body}${text}`;
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
        const { markdown } = await request('uploadImage', {
          name,
          contentType: image.type,
          base64,
        });
        this.replacePlaceholder(placeholder, markdown);
      } catch (e) {
        this.replacePlaceholder(placeholder, '');
        this.error = e.message;
      } finally {
        this.uploads -= 1;
      }
    },
  },
};
</script>
