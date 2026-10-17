<script>
import CodiconIcon from './CodiconIcon.vue';
import Date from './Date.vue';
import JiraText from './JiraText.vue';
import StatePill from './StatePill.vue';
import UserAvatar from './UserAvatar.vue';

const COPY_STATUS_TIMEOUT = 2000;

export default {
  components: {
    CodiconIcon,
    Date,
    JiraText,
    StatePill,
    UserAvatar,
  },
  props: {
    issuable: {
      type: Object,
      required: true,
    },
  },
  data() {
    return {
      copyStatus: '',
    };
  },
  computed: {
    isMergeRequest() {
      return Boolean(this.issuable.sha || this.issuable.source_branch);
    },
    isDraft() {
      return Boolean(this.issuable.draft ?? this.issuable.work_in_progress);
    },
    fullReference() {
      return this.issuable.references?.full || '';
    },
    shortReference() {
      const match = this.fullReference.match(/[!#]\d+$/);
      return match ? match[0] : this.issuable.references?.short || '';
    },
    copyTitle() {
      if (this.copyStatus === 'copied') return 'Copied';
      if (this.copyStatus === 'failed') return 'Copy failed';
      return `Copy reference ${this.fullReference}`;
    },
  },
  beforeUnmount() {
    clearTimeout(this.copyTimer);
  },
  methods: {
    async copyReference() {
      try {
        await navigator.clipboard.writeText(this.fullReference);
        this.setCopyStatus('copied');
      } catch (e) {
        this.setCopyStatus('failed');
      }
    },
    setCopyStatus(status) {
      this.copyStatus = status;
      clearTimeout(this.copyTimer);
      this.copyTimer = setTimeout(() => {
        this.copyStatus = '';
      }, COPY_STATUS_TIMEOUT);
    },
  },
};
</script>

<template>
  <header class="issuable-header">
    <div class="issuable-header__top">
      <state-pill :state="issuable.state" :is-merge-request="isMergeRequest" />
      <span v-if="shortReference" class="issuable-header__reference js-reference">
        {{ shortReference }}
      </span>
      <span v-if="isDraft" class="issuable-header__draft js-draft">Draft</span>
      <span class="issuable-header__actions">
        <span
          v-if="copyStatus"
          :class="{ 'issuable-header__copy-status--failed': copyStatus === 'failed' }"
          class="issuable-header__copy-status js-copy-status"
          role="status"
          >{{ copyTitle }}</span
        >
        <button
          v-if="fullReference"
          :title="copyTitle"
          :aria-label="copyTitle"
          type="button"
          class="gl-icon-button js-copy-reference"
          @click="copyReference"
        >
          <codicon-icon :name="copyStatus === 'failed' ? 'error' : 'copy'" />
        </button>
        <a
          v-if="issuable.web_url"
          :href="issuable.web_url"
          title="Open in GitLab"
          aria-label="Open in GitLab"
          class="gl-icon-button js-open-in-gitlab"
        >
          <codicon-icon name="link-external" />
        </a>
      </span>
    </div>
    <h1 class="issuable-header__title"><jira-text :text="issuable.title" /></h1>
    <div class="issuable-header__meta">
      <user-avatar
        v-if="issuable.author"
        :user="issuable.author"
        :size="16"
        :show-handle="false"
        class="issuable-header__author"
      />
      <template v-if="isMergeRequest">
        <span>wants to merge</span>
        <code class="branch-chip js-source-branch" :title="issuable.source_branch">{{
          issuable.source_branch
        }}</code>
        <span>into</span>
        <code class="branch-chip js-target-branch" :title="issuable.target_branch">{{
          issuable.target_branch
        }}</code>
      </template>
      <span v-else>opened</span>
      <template v-if="issuable.created_at">
        <span aria-hidden="true">·</span>
        <date :date="issuable.created_at" />
      </template>
    </div>
  </header>
</template>

<style lang="scss">
@use '@shared/styles/mixins';

.issuable-header {
  padding-bottom: var(--gl-space-4);
  margin-bottom: var(--gl-space-4);
  border-bottom: 1px solid var(--gl-border-subtle);

  &__top {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--gl-space-2);
    min-height: 26px;
  }

  &__reference {
    font-family: var(--gl-editor-font-family);
    color: var(--gl-text-muted);
  }

  &__draft {
    padding: 0 var(--gl-space-2);
    border-radius: var(--gl-radius-circle);
    font-size: var(--gl-font-size-small);
    line-height: 18px;
    color: var(--gl-badge-fg);
    background-color: var(--gl-badge-bg);
  }

  &__actions {
    display: inline-flex;
    align-items: center;
    gap: var(--gl-space-1);
    margin-left: auto;
  }

  &__copy-status {
    font-size: var(--gl-font-size-small);
    color: var(--gl-text-muted);

    &--failed {
      color: var(--gl-text-error);
    }
  }

  &__title {
    margin: var(--gl-space-2) 0;
    font-size: 20px;
    font-weight: 600;
    line-height: 1.35;
    overflow-wrap: anywhere;
  }

  &__meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--gl-space-1) 6px;
    color: var(--gl-text-muted);
  }

  &__author strong {
    font-weight: 600;
    color: var(--gl-text);
  }
}

.branch-chip {
  max-width: 100%;
  padding: 0 6px;
  overflow: hidden;
  border-radius: var(--gl-radius-small);
  font-family: var(--gl-editor-font-family);
  font-size: 0.92em;
  line-height: 18px;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: var(--gl-inline-code-fg);
  background-color: var(--gl-inline-code-bg);
}

.gl-icon-button {
  @include mixins.toolbar-button;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  color: var(--gl-text);
}
</style>
