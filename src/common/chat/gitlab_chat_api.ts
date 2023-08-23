import { gql } from 'graphql-request';
import { GraphQLRequest } from '../platform/web_ide';
import { GitLabPlatformManager } from '../platform/gitlab_platform';
import { pullHandler } from './api/pulling';

export const AI_ACTIONS = {
  chat: gql`
    mutation chat($question: String!, $resourceId: AiModelID!) {
      aiAction(input: { chat: { resourceId: $resourceId, content: $question } }) {
        requestId
        errors
      }
    }
  `,
};

type AiActionResponseType = {
  aiAction: { requestId: string; errors: string[] };
};

export const AI_MESSAGES_QUERY = gql`
  query getAiMessages($requestIds: [ID!]) {
    aiMessages(requestIds: $requestIds, roles: [ASSISTANT]) {
      nodes {
        requestId
        role
        content
        timestamp
        errors
      }
    }
  }
`;

type AiMessagesResponseType = {
  aiMessages: {
    nodes: {
      requestId: string;
      role: string;
      content: string;
      timestamp: string;
      errors: string[];
    }[];
  };
};
type AiMessageResponseType = AiMessagesResponseType['aiMessages']['nodes'][0];

const parseMessageContent = <T extends { content: string }>(message: T): T => {
  const result = message;

  try {
    result.content = JSON.parse(result.content).content;
  } catch (e) {
    // no-op. keep raw content
  }

  return result;
};

interface ErrorMessage {
  type: 'error';
  requestId: string;
  role: 'system';
  errors: string[];
}

const errorResponse = (requestId: string, errors: string[]): ErrorMessage => ({
  requestId,
  errors,
  role: 'system',
  type: 'error',
});

interface SuccessMessage {
  type: 'message';
  requestId: string;
  role: string;
  content: string;
  timestamp: string;
  errors: string[];
}

const successResponse = (response: AiMessageResponseType): SuccessMessage => ({
  type: 'message',
  ...response,
});

type AiMessage = SuccessMessage | ErrorMessage;

export class GitLabChatApi {
  #manager: GitLabPlatformManager;

  constructor(manager: GitLabPlatformManager) {
    this.#manager = manager;
  }

  async processNewUserPrompt(question: string): Promise<AiMessage> {
    return this.processAiAction(AI_ACTIONS.chat, { question });
  }

  private async processAiAction(actionQuery: string, variables: object): Promise<AiMessage> {
    const { requestId, errors } = (await this.sendAiAction(actionQuery, variables)).aiAction;

    if (errors.length > 0) {
      return new Promise(resolve => {
        resolve(errorResponse(requestId, errors));
      });
    }

    return this.pullAiMessage(requestId);
  }

  private async currentPlatform() {
    const platform = await this.#manager.getForActiveProject(false);
    if (!platform) throw new Error('Platform is missing!');

    return platform;
  }

  private async getAiMessage(requestId: string): Promise<AiMessageResponseType | undefined> {
    const request: GraphQLRequest<AiMessagesResponseType> = {
      type: 'graphql',
      query: AI_MESSAGES_QUERY,
      variables: { requestIds: [requestId] },
    };
    const platform = await this.currentPlatform();
    const history = await platform.fetchFromApi(request);

    return history.aiMessages.nodes.map(parseMessageContent)[0];
  }

  private async pullAiMessage(requestId: string): Promise<AiMessage> {
    const response = await pullHandler(() => this.getAiMessage(requestId));

    if (!response)
      return new Promise(resolve => {
        resolve(errorResponse(requestId, ['Reached timeout while fetching response.']));
      });

    return new Promise(resolve => {
      resolve(successResponse(response));
    });
  }

  private async sendAiAction(
    actionQuery: string,
    variables: object,
  ): Promise<AiActionResponseType> {
    const platform = await this.currentPlatform();
    const request: GraphQLRequest<AiActionResponseType> = {
      type: 'graphql',
      query: actionQuery,
      variables: { resourceId: platform.project.gqlId, ...variables },
    };

    return platform.fetchFromApi(request);
  }
}
