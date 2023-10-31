import { GetRequest } from '../../../common/platform/web_ide';

// GitLab token info
interface PersonalAccessTokenDetails {
  scopes: string[];
}
export const getPersonalAccessTokenDetails = (): GetRequest<PersonalAccessTokenDetails> => ({
  type: 'rest',
  method: 'GET',
  path: '/personal_access_tokens/self',
});
