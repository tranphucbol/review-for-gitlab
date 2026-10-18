import * as vscode from 'vscode';
import { handleError } from '../../../common/errors/handle_error';
import { GitLabService } from '../../gitlab/gitlab_service';

export interface KeyedItem<K> extends vscode.QuickPickItem {
  key: K;
}

/**
 * A multi-select quick pick that searches GitLab as the user types. Unlike `pickWithQuery`, it
 * keeps what the user chose across searches: chosen items stay listed, checked, above the
 * results. Resolves the chosen items, or `undefined` when the user dismisses it.
 */
export const pickManyWithQuery = async <K, T extends KeyedItem<K>>(
  title: string,
  initial: T[],
  query: (search?: string) => Promise<T[]>,
): Promise<T[] | undefined> => {
  const pick = vscode.window.createQuickPick<T>();
  pick.title = title;
  pick.canSelectMany = true;
  pick.matchOnDescription = true;
  pick.placeholder = 'Select with Space, type to search, then press Enter';
  pick.ignoreFocusOut = true;
  const chosen = new Map(initial.map(i => [i.key, i]));
  let latestRequest = 0;

  const show = (results: T[]) => {
    const items = [...chosen.values(), ...results.filter(r => !chosen.has(r.key))].map(i => ({
      ...i,
      picked: chosen.has(i.key),
    }));
    pick.items = items;
    pick.selectedItems = items.filter(i => i.picked);
  };

  const load = async (search?: string) => {
    latestRequest += 1;
    const request = latestRequest;
    pick.busy = true;
    try {
      const results = await query(search);
      // a slower, older search must not replace the results of the latest one
      if (request === latestRequest) show(results);
    } catch (e) {
      handleError(e as Error);
      pick.hide();
    } finally {
      if (request === latestRequest) pick.busy = false;
    }
  };

  const subscriptions = [
    pick.onDidChangeValue(load),
    pick.onDidChangeSelection(selected => {
      const keys = new Set(selected.map(i => i.key));
      pick.items.forEach(i => {
        if (keys.has(i.key)) chosen.set(i.key, i);
        else chosen.delete(i.key);
      });
    }),
  ];
  show([]);

  const [, accepted] = await Promise.all([
    load(),
    new Promise<boolean>(resolve => {
      subscriptions.push(
        pick.onDidAccept(() => {
          resolve(true);
          pick.hide();
        }),
        pick.onDidHide(() => resolve(false)),
      );
      pick.show();
    }),
  ]);
  subscriptions.forEach(s => s.dispose());
  pick.dispose();
  return accepted ? [...chosen.values()] : undefined;
};

const userItem = (user: RestMrUser): KeyedItem<number> => ({
  key: user.id,
  label: user.name,
  description: `@${user.username}`,
});

/** The ids of the users picked from the project's members, or `undefined` if dismissed. */
export const pickUsers = async (
  service: GitLabService,
  detail: RestMrDetail,
  title: string,
  current: RestMrUser[],
): Promise<number[] | undefined> => {
  const picked = await pickManyWithQuery(title, current.map(userItem), async search =>
    (await service.getProjectUsers(detail.project_id, search)).map(userItem),
  );
  return picked?.map(i => i.key);
};

const labelItem = (name: string, label?: RestLabel): KeyedItem<string> => ({
  key: name,
  label: name,
  description: label?.description ?? undefined,
});

/**
 * The names of the labels picked from the project's labels, or `undefined` if dismissed.
 * Only existing labels are offered: `add_labels` would create a mistyped one.
 */
export const pickLabels = async (
  service: GitLabService,
  detail: RestMrDetail,
): Promise<string[] | undefined> => {
  const picked = await pickManyWithQuery(
    `Labels of !${detail.iid}`,
    detail.labels.map(name => labelItem(name)),
    async search =>
      (await service.getProjectLabels(detail.project_id, search)).map(l => labelItem(l.name, l)),
  );
  return picked?.map(i => i.key);
};

export const haveSameMembers = <T>(a: T[], b: T[]): boolean =>
  a.length === b.length && a.every(x => b.includes(x));

/** What to send so the merge request carries `picked` labels instead of `current`. */
export const diffLabels = (
  current: string[],
  picked: string[],
): { add_labels?: string[]; remove_labels?: string[] } => {
  const added = picked.filter(l => !current.includes(l));
  const removed = current.filter(l => !picked.includes(l));
  return {
    ...(added.length ? { add_labels: added } : {}),
    ...(removed.length ? { remove_labels: removed } : {}),
  };
};
