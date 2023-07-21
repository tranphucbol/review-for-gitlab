const newPromptResponse = {
  aiAction: {
    requestId: '7ab3912a-a77e-448d-80cf-5b3f0ea6295d',
    errors: [],
  },
};

const newResponseResponse = {
  aiMessages: {
    nodes: [
      {
        id: 'gid://gitlab/Gitlab::Llm::CachedMessage/e48b1082-5a89-40bf-af33-d62b5941574d',
        requestId: '7ab3912a-a77e-448d-80cf-5b3f0ea6295d',
        content: 'Hello! My name is GitLab Duo Chat. How may I assist you today?',
        errors: [],
        role: 'ASSISTANT',
      },
    ],
  },
};

module.exports = {
  newPromptResponse,
  newResponseResponse,
};
