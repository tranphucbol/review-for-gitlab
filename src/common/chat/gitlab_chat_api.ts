import { gql } from 'graphql-request';
import { GraphQLRequest } from '../platform/web_ide';
import { GitLabPlatformManager } from '../platform/gitlab_platform';
import { pullHandler } from './api/pulling';

export const AI_ACTIONS = {
  chat: gql`
    mutation chat($question: String!, $resourceId: AiModelID) {
      aiAction(input: { chat: { resourceId: $resourceId, content: $question } }) {
        requestId
        errors
      }
    }
  `,
};

export type AiActionResponseType = {
  aiAction: { requestId: string; errors: string[] };
};

export const AI_MESSAGES_QUERY = gql`
  query getAiMessages($requestIds: [ID!], $roles: [AiMessageRole!]) {
    aiMessages(requestIds: $requestIds, roles: $roles) {
      nodes {
        requestId
        role
        content
        contentHtml
        timestamp
        errors
        extras {
          sources
        }
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
      contentHtml: string;
      timestamp: string;
      errors: string[];
      extras?: {
        sources: object[];
      };
    }[];
  };
};
type AiMessageResponseType = AiMessagesResponseType['aiMessages']['nodes'][0];

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
  contentHtml: string;
  timestamp: string;
  errors: string[];
  extras?: {
    sources: object[];
  };
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

  async processNewUserPrompt(question: string): Promise<AiActionResponseType> {
    return this.sendAiAction(AI_ACTIONS.chat, { question });
  }

  async pullAiMessage(requestId: string, role: string): Promise<AiMessage> {
    const response = await pullHandler(() => this.getAiMessage(requestId, role));

    if (!response)
      return new Promise(resolve => {
        resolve(errorResponse(requestId, ['Reached timeout while fetching response.']));
      });

    return new Promise(resolve => {
      resolve(successResponse(response));
    });
  }

  private async currentPlatform() {
    const platform = await this.#manager.getForActiveAccount();
    if (!platform) throw new Error('Platform is missing!');

    return platform;
  }

  private async getAiMessage(
    requestId: string,
    role: string,
  ): Promise<AiMessageResponseType | undefined> {
    const request: GraphQLRequest<AiMessagesResponseType> = {
      type: 'graphql',
      query: AI_MESSAGES_QUERY,
      variables: { requestIds: [requestId], roles: [role.toUpperCase()] },
    };
    const platform = await this.currentPlatform();
    const history = await platform.fetchFromApi(request);

    return history.aiMessages.nodes[0];
  }

  private async sendAiAction(
    actionQuery: string,
    variables: object,
  ): Promise<AiActionResponseType> {
    const platform = await this.currentPlatform();
    const request: GraphQLRequest<AiActionResponseType> = {
      type: 'graphql',
      query: actionQuery,
      variables: { ...variables },
    };

    return platform.fetchFromApi(request);
  }
}
