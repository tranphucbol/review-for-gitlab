import { gql } from 'graphql-request';
import { GraphQLRequest } from '../platform/web_ide';
import { GitLabPlatformManager } from '../platform/gitlab_platform';

interface AiMessage {
  requestId: string;
  role: string;
  content?: string;
  errors: string[];
}

type PullableRequest = (requestId: string) => Promise<AiMessage | undefined>;

const parseAiMessage = (message: AiMessage): AiMessage => {
  const result = message;

  if (result.errors.length > 0 || !result.content) return result;

  try {
    result.content = JSON.parse(result.content).content;
  } catch (e) {
    // no-op. keep raw content
  }

  return result;
};

const errorResponse = (requestId: string, errors: string[]): AiMessage => ({
  requestId,
  errors,
  role: 'system',
});

export const API_PULLING = {
  interval: 5000,
  maxRetries: 10,
};

export class GitLabChatApi {
  #manager: GitLabPlatformManager;

  static readonly getAiMessagesQuery = gql`
    query getAiMessages($requestIds: [ID!]) {
      aiMessages(requestIds: $requestIds, roles: [ASSISTANT]) {
        nodes {
          id
          requestId
          content
          errors
          role
        }
      }
    }
  `;

  static readonly aiChatActionMutation = gql`
    mutation chat($question: String!, $resourceId: AiModelID!) {
      aiAction(input: { chat: { resourceId: $resourceId, content: $question } }) {
        requestId
        errors
      }
    }
  `;

  constructor(manager: GitLabPlatformManager) {
    this.#manager = manager;
  }

  private async currentPlatform() {
    const platform = await this.#manager.getForActiveProject(false);
    if (!platform) throw new Error('Platform is missing!');

    return platform;
  }

  private async getChatHistory(requestId: string): Promise<AiMessage | undefined> {
    const request: GraphQLRequest<{ aiMessages: { nodes: AiMessage[] } }> = {
      type: 'graphql',
      query: GitLabChatApi.getAiMessagesQuery,
      variables: { requestIds: [requestId] },
    };
    const platform = await this.currentPlatform();
    const history = await platform.fetchFromApi(request);

    return history.aiMessages.nodes.map(parseAiMessage)[0];
  }

  private async pullApiResponse(
    requestId: string,
    handler: PullableRequest,
    retry = API_PULLING.maxRetries,
  ): Promise<AiMessage> {
    if (retry <= 0)
      return new Promise(resolve => {
        resolve(errorResponse(requestId, ['Reached timeout while fetching response.']));
      });

    const response = await handler(requestId);

    if (response)
      return new Promise(resolve => {
        resolve(response);
      });

    return new Promise(resolve => {
      setTimeout(() => {
        resolve(this.pullApiResponse(requestId, handler, retry - 1));
      }, API_PULLING.interval);
    });
  }

  private async sendNewUserPrompt(text: string) {
    const platform = await this.currentPlatform();
    const request: GraphQLRequest<{ aiAction: { requestId: string; errors: string[] } }> = {
      type: 'graphql',
      query: GitLabChatApi.aiChatActionMutation,
      variables: { resourceId: platform.project.gqlId, question: text },
    };
    const response = await platform.fetchFromApi(request);

    return response.aiAction;
  }

  async processNewUserPrompt(text: string): Promise<AiMessage> {
    const { requestId, errors } = await this.sendNewUserPrompt(text);

    if (errors.length > 0) {
      return new Promise(resolve => {
        resolve(errorResponse(requestId, errors));
      });
    }

    return this.pullApiResponse(requestId, this.getChatHistory.bind(this));
  }

  // eslint-disable-next-line class-methods-use-this, @typescript-eslint/no-unused-vars
  async processNewUserFeedback(responseId: string, feedback: string) {
    // feedback values: ['helpful','unhelpful','wrong']
  }
}
