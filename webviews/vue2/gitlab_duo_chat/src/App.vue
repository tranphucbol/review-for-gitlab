<script>
import { GlDuoChat } from '@gitlab/ui';

const vscode = acquireVsCodeApi();
const i18n = {
  predefinedPrompts: [
    'How do I change my password in GitLab?',
    'How do I fork a project?',
    'How do I clone a repository?',
    'How do I create a template?',
  ],
};

export default {
  name: 'GitLabDuoChat',
  i18n,
  components: {
    GlDuoChat,
  },
  provide() {
    return {
      renderMarkdown: () => {},
      renderGFM: element => {
        element.classList.add('gl-markdown', 'gl-compact-markdown');
      },
    };
  },
  data() {
    return {
      chatMessages: [],
      promptDraft: null,
    };
  },
  created() {
    window.vsCodeApi = vscode;
    window.addEventListener('message', this.handleExtensionMessageEvent);
    window.vsCodeApi.postMessage({ command: 'appReady' });
  },
  onBeforeDestroy() {
    window.removeEventListener('message', this.handleExtensionMessageEvent);
  },
  computed: {
    isLoading() {
      console.log(this.chatMessages);
      return this.chatMessages.findIndex(message => message.state === 'pending') >= 0;
    },
    messages() {
      console.log(this.chatMessages);
      return this.chatMessages.filter(message => message.state !== 'pending');
    },
  },
  mounted() {
    this.attachToVsCodeState();
  },
  watch: {
    promptDraft(newVal) {
      window.vsCodeApi.setState({
        promptDraft: newVal,
      });
    },
  },
  methods: {
    handleExtensionMessageEvent(event) {
      const message = event.data;
      console.log('received', message);

      switch (message.eventType) {
        case 'focus': {
          this.focusInput();
          break;
        }
        case 'newRecord': {
          this.newRecord(message.record);
          break;
        }
        case 'updateRecord': {
          this.updateRecord(message.record);
          break;
        }
        default:
          console.log('Chat view received unexpected message type.');
          break;
      }
    },
    newRecord(record) {
      this.chatMessages.push(record);
      this.scrollBottom();
    },
    updateRecord(record) {
      const index = this.chatMessages.findIndex(r => r.id === record.id);

      this.chatMessages.splice(index, 1, record);

      this.scrollBottom();
    },
    scrollBottom() {
      setTimeout(() => {
        window.scrollTo(0, document.body.scrollHeight);
      }, 20); // TODO: replace this hack with proper CSS.
    },
    attachToVsCodeState() {
      const currentState = window.vsCodeApi.getState();
      if (currentState && currentState.promptDraft) {
        this.promptDraft = currentState.promptDraft;
      }
    },
    onSendChatPrompt(question) {
      window.vsCodeApi.postMessage({
        eventType: 'newPrompt',
        record: {
          content: question,
        },
      });
    },
    handleKeyPress(event) {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        this.onSendChatPrompt();
      }
    },
    focusInput() {
      // this.$refs.promptTextarea.focus();
      console.log('should focus');
    },
    onTrackFeedback() {},
  },
};
</script>
<template>
  <gl-duo-chat
    :messages="messages"
    error=""
    :is-loading="isLoading"
    :predefined-prompts="$options.i18n.predefinedPrompts"
    @send-chat-prompt="onSendChatPrompt"
    @track-feedback="onTrackFeedback"
  />
</template>
<style lang="scss">
@import 'styles.scss';
</style>
