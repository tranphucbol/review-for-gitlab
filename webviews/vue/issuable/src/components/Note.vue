<script>
import UserAvatar from './UserAvatar.vue';
import Date from './Date.vue';
import CodiconIcon from './CodiconIcon.vue';
import { SafeHtmlDirective } from '../directives/safe_html/safe_html';

export default {
  name: 'Note',
  directives: {
    SafeHtml: SafeHtmlDirective,
  },
  props: {
    noteable: {
      type: Object,
      required: true,
    },
    isReply: {
      type: Boolean,
      required: false,
      default: false,
    },
  },
  components: {
    UserAvatar,
    Date,
    CodiconIcon,
  },
  computed: {
    author() {
      return this.noteable.author;
    },
    avatarSize() {
      return this.isReply ? 16 : 20;
    },
  },
  mounted() {
    this.initializeSuggestions();
  },
  methods: {
    initializeSuggestions() {
      const suggestions = this.$el.querySelectorAll('pre.language-suggestion');
      suggestions.forEach(suggestionEl => {
        const wrapper = document.createElement('div');
        wrapper.className = 'suggestion';
        const header = document.createElement('div');
        header.className = 'header';
        const title = document.createElement('strong');
        title.textContent = 'Suggested change:';
        const link = document.createElement('a');
        link.href = this.noteable.url;
        link.textContent = 'open on the web';
        header.append(title, ' ', link);
        suggestionEl.parentNode.insertBefore(wrapper, suggestionEl);
        wrapper.append(header, suggestionEl);
      });
    },
  },
};
</script>

<template>
  <li class="note">
    <div class="note-header">
      <user-avatar :user="author" :size="avatarSize" class="note-header__author" />
      <span class="note-header__separator">·</span>
      <date :date="noteable.createdAt" class="note-header__date" />
      <slot name="header" />
      <a
        v-if="noteable.url"
        :href="noteable.url"
        class="gl-icon-button note-header__open js-open-note"
        title="Open on GitLab"
        aria-label="Open on GitLab"
      >
        <codicon-icon name="link-external" />
      </a>
    </div>
    <div class="note-body">
      <div class="body gl-markdown" v-safe-html="noteable.bodyHtml" />
    </div>
  </li>
</template>

<style lang="scss">
.note {
  display: block;
  list-style: none;
  padding: var(--gl-space-2) var(--gl-space-3);

  .note-header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--gl-space-1);
    min-height: 22px;

    .author span {
      color: var(--gl-text-muted);
    }

    &__separator,
    &__date {
      color: var(--gl-text-muted);
    }

    &__open {
      margin-left: auto;
      opacity: 0;
    }
  }

  &:hover .note-header__open,
  &:focus-within .note-header__open {
    opacity: 1;
  }

  .note-body {
    display: block;
    margin-top: var(--gl-space-1);
    overflow-wrap: anywhere;

    .body > :first-child {
      margin-top: 0;
    }

    .body > :last-child {
      margin-bottom: 0;
    }
  }

  .suggestion {
    border: var(--gl-stroke) solid var(--gl-border);
    border-radius: var(--gl-radius-medium);
    margin: var(--gl-space-3) 0;
    overflow: hidden;

    .header {
      display: flex;
      justify-content: space-between;
      gap: var(--gl-space-2);
      padding: var(--gl-space-1) var(--gl-space-2);
      background-color: var(--gl-surface-sunken);
      border-bottom: 1px solid var(--gl-border-subtle);
      font-size: var(--gl-font-size-small);
    }
  }

  .gl-markdown pre.language-suggestion {
    margin: 0;
    padding: var(--gl-space-1) 0;
    border: none;
    border-radius: 0;
    background-color: var(--gl-inserted-bg);

    code {
      display: flex;
      flex-direction: column;
      padding: 0;
      background: none;
      color: var(--gl-inserted-fg);
    }

    .line {
      padding: 0 var(--gl-space-2);
    }

    .line::before {
      content: '+ ';
      color: var(--gl-text-muted);
    }
  }
}
</style>
