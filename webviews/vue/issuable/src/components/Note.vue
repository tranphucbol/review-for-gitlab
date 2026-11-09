<script>
import UserAvatar from '@shared/components/UserAvatar.vue';
import TimeAgo from '@shared/components/TimeAgo.vue';
import ReactionBar from '@shared/components/ReactionBar.vue';
import AddReactionButton from '@shared/components/AddReactionButton.vue';
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
  inject: {
    reactions: { default: null },
  },
  components: {
    UserAvatar,
    TimeAgo,
    CodiconIcon,
    ReactionBar,
    AddReactionButton,
  },
  computed: {
    author() {
      return this.noteable.author;
    },
    reactionGroups() {
      return this.reactions?.groupsOf(this.noteable.id) ?? [];
    },
    canReact() {
      return (
        Boolean(this.reactions) &&
        !this.noteable.system &&
        Boolean(this.noteable.userPermissions?.awardEmoji)
      );
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
    toggleReaction({ name, on, emoji }) {
      this.reactions.toggle(this.noteable.id, name, on, emoji);
    },
  },
};
</script>

<template>
  <li class="note">
    <div class="note-header">
      <user-avatar :user="author" :size="avatarSize" class="note-header__author" />
      <span class="note-header__separator">·</span>
      <time-ago :date="noteable.createdAt" class="note-header__date" />
      <slot name="header" />
      <add-reaction-button
        v-if="canReact && !reactionGroups.length"
        class="note-header__react js-add-reaction"
        :load-emojis="reactions.loadEmojis"
        @pick="entry => toggleReaction({ name: entry.name, on: true, emoji: entry.emoji })"
      >
        <codicon-icon name="reactions" />
      </add-reaction-button>
      <a
        v-if="noteable.url"
        :href="noteable.url"
        class="gl-icon-button note-header__open js-open-note"
        title="Open in GitLab"
        aria-label="Open in GitLab"
      >
        <codicon-icon name="link-external" />
      </a>
    </div>
    <div class="note-body">
      <div class="body gl-markdown" v-safe-html="noteable.bodyHtml" />
    </div>
    <reaction-bar
      v-if="reactionGroups.length"
      class="js-reactions"
      :reactions="reactionGroups"
      :can-react="canReact"
      :load-emojis="reactions.loadEmojis"
      @toggle="toggleReaction"
    >
      <template #add-icon><codicon-icon name="reactions" /></template>
    </reaction-bar>
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

    &__react,
    &__open {
      opacity: 0;
    }

    &__react,
    &__open {
      margin-left: auto;
    }

    &__react + .note-header__open {
      margin-left: 0;
    }

    &__react.gl-reaction-add-open {
      opacity: 1;
    }
  }

  &:hover .note-header__react,
  &:focus-within .note-header__react,
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
