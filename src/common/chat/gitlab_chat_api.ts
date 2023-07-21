import { gql } from 'graphql-request';
import { GraphQLRequest } from '../platform/web_ide';
import { GitLabPlatformManager } from '../platform/gitlab_platform';

interface RawAiMessage {
  content: string;
  errors?: string[];
  requestId: string;
}

interface AiMessage {
  requestId: string;
  text?: string;
  errors?: string[];
}

type PullableRequest = (requestId: string) => Promise<AiMessage | undefined>;

const parseAiMessage = (message: RawAiMessage): AiMessage => {
  const result = { requestId: message.requestId, errors: message.errors, text: undefined };

  if (message.errors && message.errors.length > 0) return result;

  let text;
  try {
    text = JSON.parse(message.content).content;
  } catch (e) {
    text = message.content;
  }
  result.text = text;

  return result;
};

export class GitLabChatApi {
  private manager: GitLabPlatformManager;

  protected readonly apiPullingInterval: number = 5000; // ms

  private readonly apiPullingRetryCount = 10;

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
    this.manager = manager;
  }

  private delayHandlerExecution<T>(handler: Promise<T>): Promise<T> {
    return new Promise(resolve => {
      setTimeout(() => {
        resolve(handler);
      }, this.apiPullingInterval);
    });
  }

  private async currentPlatform() {
    const platform = await this.manager.getForActiveProject(false);
    if (!platform) throw new Error('Platform is missing!');

    return platform;
  }

  private async getChatHistory(requestId: string): Promise<AiMessage | undefined> {
    const request: GraphQLRequest<{ aiMessages: { nodes: RawAiMessage[] } }> = {
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
    retry = this.apiPullingRetryCount,
  ): Promise<AiMessage> {
    if (retry < 0) throw new Error('Could not call the GitLab Duo Chat API.');

    const response = await handler(requestId);

    if (response)
      return new Promise(resolve => {
        resolve(response);
      });

    return new Promise(resolve => {
      setTimeout(() => {
        resolve(this.pullApiResponse(requestId, handler, retry - 1));
      }, this.apiPullingInterval);
    });
  }

  private async sendNewUserPrompt(text: string) {
    const platform = await this.currentPlatform();
    const request: GraphQLRequest<{ aiAction: { requestId: string } }> = {
      type: 'graphql',
      query: GitLabChatApi.aiChatActionMutation,
      variables: { resourceId: platform.project.gqlId, question: text },
    };
    const response = await platform.fetchFromApi(request);

    return response.aiAction.requestId;
  }

  async processNewUserPrompt(text: string): Promise<AiMessage> {
    const requestId = await this.sendNewUserPrompt(text);

    return this.pullApiResponse(requestId, this.getChatHistory.bind(this));
  }

  // eslint-disable-next-line class-methods-use-this, @typescript-eslint/no-unused-vars
  async processNewUserFeedback(responseId: string, feedback: string) {
    // feedback values: ['helpful','unhelpful','wrong']
  }
}
