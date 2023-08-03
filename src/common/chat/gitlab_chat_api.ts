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

type aiActionResponseType = { requestId: string; errors: string[] };

export const AI_MESSAGES_QUERY = gql`
  query getAiMessages($requestIds: [ID!]) {
    aiMessages(requestIds: $requestIds, roles: [ASSISTANT]) {
      nodes {
        requestId
        role
        content
        errors
      }
    }
  }
`;

interface AiMessage {
  requestId: string;
  role: string;
  content?: string;
  errors: string[];
}

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

export class GitLabChatApi {
  #manager: GitLabPlatformManager;

  constructor(manager: GitLabPlatformManager) {
    this.#manager = manager;
  }

  async processNewUserPrompt(question: string): Promise<AiMessage> {
    return this.processAiAction(AI_ACTIONS.chat, { question });
  }

  private async processAiAction(actionQuery: string, variables: object): Promise<AiMessage> {
    const { requestId, errors } = await this.sendAiAction(actionQuery, variables);

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

  private async getAiMessage(requestId: string): Promise<AiMessage | undefined> {
    const request: GraphQLRequest<{ aiMessages: { nodes: AiMessage[] } }> = {
      type: 'graphql',
      query: AI_MESSAGES_QUERY,
      variables: { requestIds: [requestId] },
    };
    const platform = await this.currentPlatform();
    const history = await platform.fetchFromApi(request);

    return history.aiMessages.nodes.map(parseAiMessage)[0];
  }

  private async pullAiMessage(requestId: string): Promise<AiMessage> {
    const response = await pullHandler(() => this.getAiMessage(requestId));

    if (!response)
      return new Promise(resolve => {
        resolve(errorResponse(requestId, ['Reached timeout while fetching response.']));
      });

    return new Promise(resolve => {
      resolve(response);
    });
  }

  private async sendAiAction(
    actionQuery: string,
    variables: object,
  ): Promise<aiActionResponseType> {
    const platform = await this.currentPlatform();
    const request: GraphQLRequest<{ aiAction: aiActionResponseType }> = {
      type: 'graphql',
      query: actionQuery,
      variables: { resourceId: platform.project.gqlId, ...variables },
    };
    const response = await platform.fetchFromApi(request);

    return response.aiAction;
  }
}
