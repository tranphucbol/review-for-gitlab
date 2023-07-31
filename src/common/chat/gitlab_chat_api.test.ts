import { GitLabPlatformManager } from '../platform/gitlab_platform';
import { project as currentProject } from '../test_utils/entities';
import { GitLabProject } from '../platform/gitlab_project';
import { GitLabChatApi, API_PULLING } from './gitlab_chat_api';

API_PULLING.interval = 1; // wait only 1ms between pulling attempts.

const mockedMutationResponse = {
  aiAction: { requestId: '123', errors: [] as string[] },
};

const mockedFailedMutationResponse = {
  aiAction: { requestId: '', errors: ['foo'] },
};

const mockedQueryResponse = {
  aiMessages: { nodes: [{ content: 'test', requestId: '123', errors: ['bar'] }] },
};

const mockedEmptyQueryResponse = {
  aiMessages: { nodes: [] },
};

const mockPrompt = 'What is a fork?';

describe('GitLabChatApi', () => {
  let makeApiRequest: jest.Mock;

  const createManager = (
    project: GitLabProject,
    queryContent = mockedQueryResponse,
    mutationContent = mockedMutationResponse,
  ): GitLabPlatformManager => {
    makeApiRequest = jest.fn(async <T>(params: any): Promise<T> => {
      let response;
      if (params?.query === GitLabChatApi.aiChatActionMutation) {
        response = mutationContent as T;
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
      const gitlabChatApi = new GitLabChatApi(manager);

      const response = await gitlabChatApi.processNewUserPrompt(mockPrompt);

      const [[aiActionMutation], [aiMessagesQuery]] = makeApiRequest.mock.calls;

      expect(aiActionMutation.query).toBe(GitLabChatApi.aiChatActionMutation);
      expect(aiMessagesQuery.query).toBe(GitLabChatApi.getAiMessagesQuery);

      const expectedMessage = mockedQueryResponse.aiMessages.nodes[0];
      expect(response.content).toBe(expectedMessage.content);
      expect(response.requestId).toBe(expectedMessage.requestId);
      expect(response.errors).toStrictEqual(expectedMessage.errors);
    });

    it('attempts 10 pulls for chat response and returns an error', async () => {
      const manager = createManager(currentProject, mockedEmptyQueryResponse);
      const gitlabChatApi = new GitLabChatApi(manager);

      const response = await gitlabChatApi.processNewUserPrompt(mockPrompt);

      const [[aiActionMutation], [aiMessagesQuery]] = makeApiRequest.mock.calls;

      expect(aiActionMutation.query).toBe(GitLabChatApi.aiChatActionMutation);
      expect(aiMessagesQuery.query).toBe(GitLabChatApi.getAiMessagesQuery);
      expect(makeApiRequest).toBeCalledTimes(11);

      expect(response.requestId).toBe(mockedMutationResponse.aiAction.requestId);
      expect(response.errors).toContainEqual('Reached timeout while fetching response.');
    });

    it('returns an error if aiAction failed', async () => {
      const manager = createManager(
        currentProject,
        mockedEmptyQueryResponse,
        mockedFailedMutationResponse,
      );
      const gitlabChatApi = new GitLabChatApi(manager);

      const response = await gitlabChatApi.processNewUserPrompt(mockPrompt);

      expect(response.requestId).toBe(mockedFailedMutationResponse.aiAction.requestId);
      expect(response.errors).toStrictEqual(mockedFailedMutationResponse.aiAction.errors);
      expect(makeApiRequest).toBeCalledTimes(1);
    });
  });
});
