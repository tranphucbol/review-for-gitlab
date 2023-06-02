import { PostRequest } from '../gitlab/api/rest';
import { GitLabPlatform } from '../gitlab/gitlab_platform';

export interface CompletionToken {
  access_token: string;
  /* expires in number of seconds since `created_at` */
  expires_in: number;
  /* unix timestamp of the datetime of token creation */
  created_at: number;
}

const tokenRequest: PostRequest<CompletionToken> = {
  type: 'rest',
  method: 'POST',
  path: '/code_suggestions/tokens',
};

export class CodeCompletionTokenManager {
  private platform: GitLabPlatform;

  private currentToken: CompletionToken | undefined;

  constructor(platform: GitLabPlatform) {
    this.platform = platform;
  }

  async getToken(): Promise<CompletionToken | undefined> {
    if (this.currentToken) {
      const unixTimestampNow = Math.floor(new Date().getTime() / 1000);
      if (unixTimestampNow < this.currentToken.created_at + this.currentToken.expires_in) {
        return this.currentToken;
      }
    }

    const project = await this.platform.getProject(false);
    if (!project) {
      return undefined;
    }

    const token = await this.platform.fetchFromApi(tokenRequest, project);
    this.currentToken = token;

    return this.currentToken;
  }
}
