<script>
import checkbox from 'markdown-it-checkbox';
import MarkdownIt from 'markdown-it';
import { SafeHtmlDirective } from '../directives/safe_html/safe_html';

const md = new MarkdownIt().use(checkbox);

export default {
  props: {
    issuable: {
      type: Object,
      required: true,
    },
  },
  directives: {
    SafeHtml: SafeHtmlDirective,
  },
  computed: {
    description() {
      if (this.issuable.markdownRenderedOnServer) {
        return this.issuable.description;
      }

      const description = this.issuable.description || '';
      const webUrl = this.issuable.web_url || '';
      const path = `${webUrl.split('/issues/')[0]}/uploads/`;
      const normalized = description.replace(/\/uploads/gm, path);

      return md.render(normalized);
    },
  },
  watch: {
    // a reload replaces the issuable, and the new one is not rendered on the server yet
    issuable() {
      this.renderOnServer();
    },
  },
  mounted() {
    this.renderOnServer();
  },
  methods: {
    renderOnServer() {
      window.vsCodeApi.postMessage({
        command: 'renderMarkdown',
        markdown: this.issuable.description,
        object: 'issuable',
        ref: this.issuable.id,
      });
    },
  },
  created() {
    window.addEventListener('message', event => {
      if (event.data.type === 'markdownRendered') {
        const { ref, object, markdown } = event.data;
        if (object === 'issuable' && ref === this.issuable.id) {
          // TODO: fix this. The eslint rule is disabled during vue3 migration
          // eslint-disable-next-line vue/no-mutating-props
          this.issuable.markdownRenderedOnServer = true;
          // TODO: fix this. The eslint rule is disabled during vue3 migration
          // eslint-disable-next-line vue/no-mutating-props
          this.issuable.description = markdown;
        }
      }
    });
  },
};
</script>

<template>
  <div class="issuable-details">
    <div class="description gl-markdown" v-safe-html="description" />
  </div>
</template>

<style lang="scss">
.issuable-details {
  line-height: 1.5;

  .description {
    margin-bottom: var(--gl-space-6);
    overflow-wrap: anywhere;
  }
}
</style>
