<script>
const GENIE_CHAT_MODEL_ROLES = {
  user: 'user',
  system: 'system',
  assistant: 'assistant',
};

export default {
  name: 'AiGenieChatMessage',
  props: {
    message: {
      type: Object,
      required: true,
    },
  },
  computed: {
    messageContent() {
      return this.message.errors[0] || this.message.content;
    },
  },
  methods: {
    isAssistantMessage(message) {
      return message.role.toLowerCase() === GENIE_CHAT_MODEL_ROLES.assistant;
    },
    isUserMessage(message) {
      return message.role.toLowerCase() === GENIE_CHAT_MODEL_ROLES.user;
    },
    isSystemMessage(message) {
      return message.role.toLowerCase() === GENIE_CHAT_MODEL_ROLES.system;
    },
  },
};
</script>
<template>
  <div
    class="message"
    :class="{
      prompt: isUserMessage(message),
      response: isAssistantMessage(message),
      system: isSystemMessage(message),
    }"
  >
    {{ messageContent }}
  </div>
</template>
<style lang="scss">
.message {
  margin-bottom: 10px;
  padding: 10px;
  white-space: pre-line;
  border-radius: 8px;
}
.prompt {
  background-color: teal;
  margin-right: 20px;
}
.response {
  background-color: gray;
  margin-left: 20px;
}
</style>
