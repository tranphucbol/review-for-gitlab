<script>
import IssuableDetails from './components/IssuableDetails.vue';
import IssuableHeader from './components/IssuableHeader.vue';
import IssuableSidebar from './components/IssuableSidebar.vue';
import IssuableDiscussions from './components/IssuableDiscussions.vue';
import CommentForm from './components/CommentForm.vue';
import { setJiraLinkConfig } from './utils/jira_links';
import createReactionStore from './reactions';

const vscode = acquireVsCodeApi();

export default {
  name: 'App',
  provide() {
    return { reactions: this.reactions };
  },
  data() {
    return {
      isLoading: false,
      isReloading: false,
      issuable: {},
      discussions: [],
    };
  },
  components: {
    IssuableDetails,
    IssuableHeader,
    IssuableSidebar,
    IssuableDiscussions,
    CommentForm,
  },
  beforeCreate() {
    this.reactions = createReactionStore(vscode);
  },
  created() {
    window.vsCodeApi = vscode;
    this.isLoading = true;

    window.addEventListener('message', event => {
      this.reactions.onMessage(event.data);
      if (event.data.type === 'jiraLinks') setJiraLinkConfig(event.data.config);
      if (event.data.type === 'issuableFetch') {
        this.issuable = event.data.issuable;
        this.discussions = event.data.discussions;
        this.isLoading = false;
      }
      if (event.data.type === 'issuableReloading') this.isReloading = true;
      if (event.data.type === 'issuableReloaded') this.isReloading = false;
    });

    window.vsCodeApi.postMessage({
      command: 'appReady',
    });
  },
  methods: {
    reload() {
      this.isReloading = true;
      window.vsCodeApi.postMessage({ command: 'reloadIssuable' });
    },
  },
};
</script>

<template>
  <div id="app">
    <div v-if="isLoading" class="loading js-loading" role="status" aria-busy="true">
      <div class="loading__progress" />
      <span class="loading__label">Fetching details and discussions…</span>
      <div class="loading__skeleton" aria-hidden="true">
        <div class="loading__line loading__line--pill" />
        <div class="loading__line loading__line--title" />
        <div class="loading__line loading__line--meta" />
      </div>
    </div>
    <div v-else class="issuable-layout">
      <div v-if="isReloading" class="loading__progress js-reloading" role="status">
        <span class="loading__label">Reloading details and discussions…</span>
      </div>
      <issuable-header
        :issuable="issuable"
        :reloading="isReloading"
        class="issuable-layout__header"
        @reload="reload"
      />
      <issuable-sidebar
        :issuable="issuable"
        :discussions="discussions"
        class="issuable-layout__sidebar"
      />
      <main class="issuable-layout__main">
        <issuable-details :issuable="issuable" />
        <issuable-discussions :discussions="discussions" />
        <comment-form />
      </main>
    </div>
  </div>
</template>

<style lang="scss">
.code {
  padding: 2px 4px;
  color: var(--gl-text);
  background-color: var(--gl-code-bg);
  border-radius: var(--gl-radius-medium);
  border-color: var(--gl-quote-border);
  font-family: var(--gl-editor-font-family);
  font-size: var(--gl-editor-font-size);
}

// the layout sets its own 24px page padding instead of the webview's default
body {
  padding: 0;
}

#app {
  container-type: inline-size;
  margin-bottom: 600px; // to give editor scroll past end effect
}

.loading {
  &__progress {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    height: 2px;
    overflow: hidden;

    &::before {
      content: '';
      position: absolute;
      top: 0;
      bottom: 0;
      width: 2%;
      background-color: var(--gl-progress);
      animation: loading-progress 4s linear infinite;
    }
  }

  &__label {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  &__skeleton {
    display: flex;
    flex-direction: column;
    gap: var(--gl-space-3);
    max-width: 1100px;
    padding: var(--gl-space-6);
    box-sizing: border-box;
  }

  &__line {
    height: 12px;
    border-radius: var(--gl-radius-small);
    background-color: var(--gl-border-subtle);
    opacity: 0.6;

    &--pill {
      width: 72px;
      height: 20px;
      border-radius: var(--gl-radius-circle);
    }

    &--title {
      width: 60%;
      height: 22px;
    }

    &--meta {
      width: 40%;
    }
  }
}

@keyframes loading-progress {
  from {
    transform: translateX(0) scaleX(1);
  }

  50% {
    transform: translateX(2500%) scaleX(3);
  }

  to {
    transform: translateX(4900%) scaleX(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .loading__progress::before {
    width: 100%;
    animation: none;
    opacity: 0.6;
  }
}

.issuable-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 240px;
  grid-template-areas:
    'header header'
    'main sidebar';
  gap: 0 var(--gl-space-6);
  max-width: 1100px;
  padding: var(--gl-space-6) var(--gl-space-6) 0;
  box-sizing: border-box;

  &__header {
    grid-area: header;
  }

  &__main {
    grid-area: main;
    min-width: 0;
  }

  &__sidebar {
    grid-area: sidebar;
    align-self: start;
    position: sticky;
    top: var(--gl-space-4);
  }
}

// a narrow panel folds the sidebar into a wrapped row above the description
@container (max-width: 719px) {
  .issuable-layout {
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas:
      'header'
      'sidebar'
      'main';
    padding: var(--gl-space-4) var(--gl-space-4) 0;

    &__sidebar {
      position: static;
      flex-flow: row wrap;
      gap: var(--gl-space-3) var(--gl-space-6);
      margin-bottom: var(--gl-space-4);

      .issuable-sidebar__people {
        flex-flow: row wrap;
        gap: var(--gl-space-1) var(--gl-space-3);
      }
    }
  }
}
</style>
