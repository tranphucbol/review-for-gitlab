import { gql } from 'graphql-request';
import { GraphQLRequest } from '../../platform/web_ide';
import { GitLabPlatformManager } from '../../platform/gitlab_platform';
import { GitLabPlatformManagerForChat } from '../get_platform_manager_for_chat';
import { log } from '../../log';

const queryGetChatAvailability = gql`
  query duoChatAvailable {
    currentUser {
      duoChatAvailable
    }
  }
`;

export type ChatAvailableResponseType = {
  currentUser: {
    duoChatAvailable: boolean;
  };
};

export async function getChatSupport(manager: GitLabPlatformManager): Promise<boolean> {
  let user;
  const platformManagerForChat = new GitLabPlatformManagerForChat(manager);
  const request: GraphQLRequest<ChatAvailableResponseType> = {
    type: 'graphql',
    query: queryGetChatAvailability,
    variables: {},
  };
  const platform = await platformManagerForChat.getGitLabPlatform();
  if (!platform) {
    return false;
  }
  try {
    user = await platform.fetchFromApi(request);
    return user.currentUser.duoChatAvailable;
  } catch (e) {
    log.error(e);
    return false;
  }
}
