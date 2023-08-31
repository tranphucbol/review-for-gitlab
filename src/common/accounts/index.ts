import { Account } from '../platform/gitlab_account';

export interface IAccountService {
  getOneAccountForInstance(instanceUrl: string): Account | undefined;
}
