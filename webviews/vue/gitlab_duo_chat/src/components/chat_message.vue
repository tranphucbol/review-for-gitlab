<script>
import { renderMarkdown } from '../utils';
import { CHAT_MODEL_ROLES } from '../constants';

export default {
  name: 'DuoChatMessage',
  props: {
    message: {
      type: Object,
      required: true,
    },
  },
  computed: {
    messageContent() {
      return renderMarkdown(this.message.errors[0] || this.message.content);
    },
    isPending() {
      return this.message.state === 'pending';
    },
    isAssistantMessage() {
      return this.message.role.toLowerCase() === CHAT_MODEL_ROLES.assistant;
    },
    isUserMessage() {
      return this.message.role.toLowerCase() === CHAT_MODEL_ROLES.user;
    },
    isSystemMessage() {
      return this.message.role.toLowerCase() === CHAT_MODEL_ROLES.system;
    },
    hasErrors() {
      return this.message.errors.length > 0;
    },
  },
};
</script>
<template>
  <div
    class="message"
    :class="{
      prompt: isUserMessage,
      response: isAssistantMessage,
      system: isSystemMessage,
      'with-errors': hasErrors,
    }"
  >
    <template v-if="isPending">
      <div class="ai-genie-loader">
        <div class="ai-genie-loader__dot ai-genie-loader__dot--1"></div>
        <div class="ai-genie-loader__dot ai-genie-loader__dot--2"></div>
        <div class="ai-genie-loader__dot ai-genie-loader__dot--3"></div>
      </div>
    </template>
    <template v-else>
      <p v-safe-html="messageContent"></p>
    </template>
  </div>
</template>
<style lang="scss">
@keyframes AIGenieLoading {
  0%,
  80%,
  100% {
    transform: scale(0);
  }

  40% {
    transform: scale(1);
  }
}

.ai-genie-loader {
  max-width: unset;

  &__dot {
    display: inline-block;
    width: 0.5rem;
    height: 0.5rem;
    background-color: var(--vscode-editor-foreground);
    border-radius: 100%;
    animation: AIGenieLoading 1400ms ease-in-out infinite;
    animation-fill-mode: both;
  }

  &__dot--1 {
    animation-delay: -0.3s;
  }

  &__dot--2 {
    animation-delay: -0.15s;
  }
}
.message {
  max-width: 90%;
  line-height: 1.25rem;
  word-break: break-word;
  margin-bottom: 0.75rem;
  padding: 0.5rem 0.75rem 0.5rem 0.75rem;
  border-radius: 0.5rem;
  border: 1px solid var(--vscode-editorWidget-border);
  color: var(--vscode-editor-foreground);
  pre {
    overflow-x: auto;
    border: 1px dotted var(--vscode-editorWidget-border);
    border-radius: 0.25em;
    padding: 0.25em;
    background-color: rgba(255, 255, 255, 0.1);
  }

  p {
    margin-bottom: 0;
    margin-top: 0;
  }
}
.prompt {
  margin-left: auto;
  border-bottom-right-radius: 0;
  background-color: var(--vscode-editor-selectionBackground);
}
.response {
  margin-right: auto;
  border-bottom-left-radius: 0;
  background-color: var(--vscode-editor-background);
}
.with-errors {
  background-color: var(--vscode-inputValidation-errorBackground);
}
</style>
