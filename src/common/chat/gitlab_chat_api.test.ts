import assert from 'assert';
import { GitLabPlatformManager } from '../platform/gitlab_platform';
import { project as currentProject } from '../test_utils/entities';
import { GitLabProject } from '../platform/gitlab_project';
import { GitLabChatApi, AI_ACTIONS, AI_MESSAGES_QUERY } from './gitlab_chat_api';
import { API_PULLING } from './api/pulling';

API_PULLING.interval = 1; // wait only 1ms between pulling attempts.

const mockedMutationResponse = {
  aiAction: { requestId: '123', errors: [] as string[] },
};

const mockedQueryResponse = {
  aiMessages: {
    nodes: [
      {
        content: 'test',
        requestId: '123',
        role: 'assistant',
        errors: ['bar'],
        timestamp: '2023-01-01 01:01:01',
      },
    ],
  },
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
      if (params?.query === AI_ACTIONS.chat) {
        response = mutationContent as T;
      } else {
        response = queryContent as T;
      }
      return response;
    });

    return {
      getForActiveProject: jest.fn(async () => ({
        type: 'project' as const,
        project,
        fetchFromApi: makeApiRequest,
        getUserAgentHeader: () => ({}),
      })),
      getForActiveAccount: jest.fn(async () => ({
        type: 'account' as const,
        fetchFromApi: makeApiRequest,
        getUserAgentHeader: () => ({}),
      })),
      getForAllAccounts: jest.fn(),
    };
  };

  describe('getAiMessage', () => {
    it('returns first message with given requestId and role', async () => {
      const manager = createManager(currentProject, mockedQueryResponse);
      const gitlabChatApi = new GitLabChatApi(manager);

      const expectedMessage = mockedQueryResponse.aiMessages.nodes[0];

      const response = await gitlabChatApi.pullAiMessage(
        expectedMessage.requestId,
        expectedMessage.role,
      );

      assert(response.type === 'message');

      const [[aiMessagesQuery]] = makeApiRequest.mock.calls;

      expect(aiMessagesQuery.query).toBe(AI_MESSAGES_QUERY);
      expect(response.content).toBe(expectedMessage.content);
      expect(response.requestId).toBe(expectedMessage.requestId);
      expect(response.errors).toStrictEqual(expectedMessage.errors);
      expect(response.timestamp).toStrictEqual(expectedMessage.timestamp);
    });

    it('returns an error if pulling timeout is reached', async () => {
      const manager = createManager(currentProject, mockedEmptyQueryResponse);
      const gitlabChatApi = new GitLabChatApi(manager);

      const response = await gitlabChatApi.pullAiMessage('123', 'assistant');

      expect(response.requestId).toBe('123');
      expect(response.errors).toContainEqual('Reached timeout while fetching response.');
    });
  });

  describe('processNewUserPrompt', () => {
    it('sends user prompt as mutation', async () => {
      const manager = createManager(currentProject, mockedQueryResponse);
      const gitlabChatApi = new GitLabChatApi(manager);

      const response = await gitlabChatApi.processNewUserPrompt(mockPrompt);

      expect(response.aiAction).toBe(mockedMutationResponse.aiAction);

      const [[aiActionMutation]] = makeApiRequest.mock.calls;

      expect(aiActionMutation.query).toBe(AI_ACTIONS.chat);
    });
  });
});
