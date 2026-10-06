<template>
  <form class="gl-diff-comment-box" @submit.prevent="submit">
    <textarea
      ref="textarea"
      v-model="body"
      class="gl-diff-textarea"
      rows="3"
      :aria-label="label"
      :placeholder="placeholder"
      :readonly="busy"
      @keydown="onKeyDown"
      @paste="onPaste"
      @dragover.prevent
      @drop.prevent="onDrop"
    ></textarea>
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
import { request } from '../vscode_bridge';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

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
    };
  },
  computed: {
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
  mounted() {
    // Monaco shows a new view zone on its next render; focus fails until then.
    const focus = framesLeft => {
      const { textarea } = this.$refs;
      if (textarea?.getClientRects().length) textarea.focus({ preventScroll: true });
      else if (textarea && framesLeft > 0) requestAnimationFrame(() => focus(framesLeft - 1));
    };
    focus(10);
  },
  methods: {
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
