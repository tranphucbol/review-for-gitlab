import { GitLabPlatformManager } from '../platform/gitlab_platform';
import { project as currentProject } from '../test_utils/entities';
import { GitLabProject } from '../platform/gitlab_project';
import { GitLabChatApi } from './gitlab_chat_api';

const mockedMutationResponse = {
  aiAction: { requestId: '123' },
};

const mockedQueryResponse = {
  aiMessages: { nodes: [{ content: 'test', requestId: '123' }] },
};

const mockedEmptyQueryResponse = {
  aiMessages: { nodes: [] },
};

class TestGitlabChatApi extends GitLabChatApi {
  protected readonly apiPullingInterval = 1; // ms
}

const mockPrompt = 'What is a fork?';

describe('GitLabChatApi', () => {
  let makeApiRequest: jest.Mock;

  const createManager = (project: GitLabProject, queryContent: object): GitLabPlatformManager => {
    makeApiRequest = jest.fn(async <T>(params: any): Promise<T> => {
      let response;
      if (params?.query === GitLabChatApi.aiChatActionMutation) {
        response = mockedMutationResponse as T;
      } else {
        response = queryContent as T;
      }
      return response;
    });

    return {
      getForActiveProject: jest.fn(async () => ({
        project,
        fetchFromApi: makeApiRequest,
        getUserAgentHeader: () => ({}),
      })),
    };
  };

  describe('processNewUserPrompt', () => {
    it('sends user prompt as mutation and pulls chat response', async () => {
      const manager = createManager(currentProject, mockedQueryResponse);
      const gitlabChatApi = new TestGitlabChatApi(manager);

      const response = await gitlabChatApi.processNewUserPrompt(mockPrompt);

      const [[aiActionMutation], [aiMessagesQuery]] = makeApiRequest.mock.calls;

      expect(aiActionMutation.query).toBe(GitLabChatApi.aiChatActionMutation);
      expect(aiMessagesQuery.query).toBe(GitLabChatApi.getAiMessagesQuery);

      const expectedMessage = mockedQueryResponse.aiMessages.nodes[0];
      expect(response.content).toBe(expectedMessage.content);
      expect(response.requestId).toBe(expectedMessage.requestId);
    });

    it('attempts 11 pulls for chat response and then throws error', async () => {
      const manager = createManager(currentProject, mockedEmptyQueryResponse);
      const gitlabChatApi = new TestGitlabChatApi(manager);

      await expect(gitlabChatApi.processNewUserPrompt(mockPrompt)).rejects.toThrow(Error);

      const [[aiActionMutation], [aiMessagesQuery]] = makeApiRequest.mock.calls;

      expect(aiActionMutation.query).toBe(GitLabChatApi.aiChatActionMutation);
      expect(aiMessagesQuery.query).toBe(GitLabChatApi.getAiMessagesQuery);
      expect(makeApiRequest).toBeCalledTimes(12);
    });
  });
});
