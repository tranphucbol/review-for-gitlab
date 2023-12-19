import { gql } from 'graphql-request';
import { GraphQLRequest } from '../platform/web_ide';
import { GitLabPlatformManagerForChat } from './get_platform_manager_for_chat';
import { pullHandler } from './api/pulling';
import { GitLabChatFileContext } from './gitlab_chat_file_context';
import { SPECIAL_MESSAGES } from './constants';
import {
  AiCompletionResponseChannel,
  AiCompletionResponseMessageType,
} from '../api/graphql/ai_completion_response_channel';
import { extractUserId } from '../platform/gitlab_account';

export const AI_ACTIONS = {
  chat: gql`
    mutation chat(
      $question: String!
      $resourceId: AiModelID
      $currentFileContext: AiCurrentFileInput
      $clientSubscriptionId: String
    ) {
      aiAction(
        input: {
          chat: { resourceId: $resourceId, content: $question, currentFile: $currentFileContext }
          clientSubscriptionId: $clientSubscriptionId
        }
      ) {
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

type AiMessageResponseType = {
  requestId: string;
  role: string;
  content: string;
  contentHtml: string;
  timestamp: string;
  errors: string[];
  extras?: {
    sources: object[];
  };
};

type AiMessagesResponseType = {
  aiMessages: {
    nodes: AiMessageResponseType[];
  };
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
  #manager: GitLabPlatformManagerForChat;

  constructor(manager: GitLabPlatformManagerForChat) {
    this.#manager = manager;
  }

  async processNewUserPrompt(
    question: string,
    subscriptionId?: string,
    currentFileContext?: GitLabChatFileContext,
  ): Promise<AiActionResponseType> {
    return this.sendAiAction(AI_ACTIONS.chat, {
      question,
      currentFileContext,
      clientSubscriptionId: subscriptionId,
    });
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

  async cleanChat(): Promise<AiActionResponseType> {
    return this.sendAiAction(AI_ACTIONS.chat, { question: SPECIAL_MESSAGES.CLEAN });
  }

  private async currentPlatform() {
    const platform = await this.#manager.getGitLabPlatform();
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

  async subscribeToUpdates(
    messageCallback: (message: AiCompletionResponseMessageType) => Promise<void>,
    subscriptionId?: string,
  ) {
    const platform = await this.currentPlatform();

    const channel = new AiCompletionResponseChannel({
      htmlResponse: true,
      userId: `gid://gitlab/User/${extractUserId(platform.account.id)}`,
      aiAction: 'CHAT',
      clientSubscriptionId: subscriptionId,
    });

    const cable = await platform.connectToCable();

    channel.on('newChunk', messageCallback);
    channel.on('fullMessage', async message => {
      await messageCallback(message);

      if (subscriptionId) {
        cable.disconnect();
      }
    });

    cable.subscribe(channel);
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
