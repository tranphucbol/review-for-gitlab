import * as vscode from 'vscode';
import assert from 'assert';
import { Account } from '../../../common/platform/gitlab_account';

/** global state key of the heads each reviewer last marked as reviewed */
export const REVIEWED_VERSIONS_KEY = 'gitlab.reviewedVersions';

/** the most merge requests remembered; recording one more forgets the oldest */
export const MAX_REVIEWED_VERSIONS = 500;

export interface ReviewedVersion {
  headSha: string;
  /** ISO 8601 */
  reviewedAt: string;
}

type ReviewedVersions = Record<string, ReviewedVersion>;

/** `account.id` is `instanceUrl|userId`, so two accounts on one instance don't share a review */
const keyOf = (account: Account, mr: RestMr) => `${account.id}|${mr.project_id}|${mr.iid}`;

/**
 * The version of each merge request the reviewer last marked as reviewed. It is kept on this
 * machine only; nothing is sent to GitLab.
 */
export class ReviewedVersionStore {
  #memento?: Pick<vscode.Memento, 'get' | 'update'>;

  init(memento: Pick<vscode.Memento, 'get' | 'update'>): void {
    this.#memento = memento;
  }

  #all(): ReviewedVersions {
    return this.#memento?.get<ReviewedVersions>(REVIEWED_VERSIONS_KEY) ?? {};
  }

  get(account: Account, mr: RestMr): ReviewedVersion | undefined {
    return this.#all()[keyOf(account, mr)];
  }

  async record(account: Account, mr: RestMr, headSha: string, now = new Date()): Promise<void> {
    assert(this.#memento, 'ReviewedVersionStore was not initialized');
    const all = {
      ...this.#all(),
      [keyOf(account, mr)]: { headSha, reviewedAt: now.toISOString() },
    };
    const keys = Object.keys(all);
    if (keys.length > MAX_REVIEWED_VERSIONS) {
      keys
        .sort((a, b) => all[a].reviewedAt.localeCompare(all[b].reviewedAt))
        .slice(0, keys.length - MAX_REVIEWED_VERSIONS)
        .forEach(key => delete all[key]);
    }
    await this.#memento.update(REVIEWED_VERSIONS_KEY, all);
  }
}

export const reviewedVersionStore = new ReviewedVersionStore();
