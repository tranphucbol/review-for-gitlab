import { Account } from '../platform/gitlab_account';

export interface IAccountService {
  /**
   * @deprecated don't use this unreliable way of getting an account
   */
  getOneAccountForInstance(instanceUrl: string): Account | undefined;
}
