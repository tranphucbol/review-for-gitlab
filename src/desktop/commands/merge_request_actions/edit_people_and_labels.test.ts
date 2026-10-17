import * as vscode from 'vscode';
import { GitLabService } from '../../gitlab/gitlab_service';
import { createFakePartial } from '../../../common/test_utils/create_fake_partial';
import {
  diffLabels,
  haveSameMembers,
  KeyedItem,
  pickLabels,
  pickManyWithQuery,
  pickUsers,
} from './edit_people_and_labels';
import { createMrDetail } from './test_entities';

type Item = KeyedItem<number>;

/** A quick pick whose user is driven by the test: type, select, accept or hide. */
const createFakeQuickPick = () => {
  const listeners: Record<string, ((value?: unknown) => void)[]> = {};
  const on =
    (event: string) =>
    (listener: (value?: unknown) => void): vscode.Disposable => {
      listeners[event] = [...(listeners[event] ?? []), listener];
      return { dispose: jest.fn() };
    };
  const fire = (event: string, value?: unknown) => listeners[event]?.forEach(l => l(value));
  const pick = {
    title: '',
    items: [] as Item[],
    selectedItems: [] as Item[],
    value: '',
    onDidChangeValue: on('value'),
    onDidChangeSelection: on('selection'),
    onDidAccept: on('accept'),
    onDidHide: on('hide'),
    show: jest.fn(),
    hide: jest.fn(() => fire('hide')),
    dispose: jest.fn(),
  };
  return {
    pick,
    type: (value: string) => fire('value', value),
    select: (keys: number[]) =>
      fire(
        'selection',
        pick.items.filter(i => keys.includes(i.key)),
      ),
    accept: () => fire('accept'),
  };
};

const flush = () => new Promise(process.nextTick);

const item = (key: number, label = `user ${key}`): Item => ({ key, label });

describe('pickManyWithQuery', () => {
  let fake: ReturnType<typeof createFakeQuickPick>;

  beforeEach(() => {
    fake = createFakeQuickPick();
    jest.mocked(vscode.window.createQuickPick).mockReturnValue(fake.pick as never);
  });

  it('lists the current items checked, above the results', async () => {
    const result = pickManyWithQuery('Reviewers', [item(1)], async () => [item(1), item(2)]);
    await flush();

    expect(fake.pick.items.map(i => [i.key, i.picked])).toEqual([
      [1, true],
      [2, false],
    ]);
    expect(fake.pick.selectedItems.map(i => i.key)).toEqual([1]);
    fake.accept();

    expect((await result)?.map(i => i.key)).toEqual([1]);
  });

  it('keeps what was chosen across searches', async () => {
    const query = jest.fn(async (search?: string) =>
      search === 'b' ? [item(3, 'bob')] : [item(2, 'ann')],
    );
    const result = pickManyWithQuery('Reviewers', [item(1)], query);
    await flush();
    fake.select([1, 2]);
    fake.type('b');
    await flush();

    expect(query).toHaveBeenLastCalledWith('b');
    expect(fake.pick.items.map(i => i.key)).toEqual([1, 2, 3]);
    fake.select([2, 3]);
    fake.accept();

    expect((await result)?.map(i => i.key)).toEqual([2, 3]);
  });

  it('ignores the results of a search that finishes after a newer one', async () => {
    let finishSlow: (items: Item[]) => void = () => {};
    const query = jest.fn(async (search?: string) =>
      search === 'slow'
        ? new Promise<Item[]>(r => {
            finishSlow = r;
          })
        : [item(5)],
    );
    const result = pickManyWithQuery('Reviewers', [], query);
    fake.type('slow');
    fake.type('fast');
    await flush();
    finishSlow([item(9)]);
    await flush();

    expect(fake.pick.items.map(i => i.key)).toEqual([5]);
    fake.accept();
    await result;
  });

  it('resolves undefined when dismissed', async () => {
    const result = pickManyWithQuery('Reviewers', [item(1)], async () => []);
    fake.pick.hide();

    expect(await result).toBeUndefined();
    expect(fake.pick.dispose).toHaveBeenCalled();
  });

  describe('pickers', () => {
    const service = createFakePartial<GitLabService>({
      getProjectUsers: jest
        .fn()
        .mockResolvedValue([{ id: 7, name: 'Ann', username: 'ann', avatar_url: '' }]),
      getProjectLabels: jest
        .fn()
        .mockResolvedValue([{ id: 1, name: 'bug', color: '#f00', description: 'Broken' }]),
    });
    const detail = createMrDetail({ labels: ['backend'] });

    it('searches the members of the merge request project', async () => {
      const result = pickUsers(service, detail, 'Reviewers of !42', []);
      fake.type('an');
      await flush();
      fake.select([7]);
      fake.accept();

      expect(await result).toEqual([7]);
      expect(service.getProjectUsers).toHaveBeenCalledWith(detail.project_id, 'an');
      expect(fake.pick.title).toBe('Reviewers of !42');
    });

    it('offers the project labels, keeping the current ones', async () => {
      const result = pickLabels(service, detail);
      await flush();

      expect(fake.pick.items.map(i => [i.label, i.description])).toEqual([
        ['backend', undefined],
        ['bug', 'Broken'],
      ]);
      fake.accept();

      expect(await result).toEqual(['backend']);
      expect(service.getProjectLabels).toHaveBeenCalledWith(detail.project_id, undefined);
    });
  });
});

describe('diffLabels', () => {
  it('adds and removes only what changed', () => {
    expect(diffLabels(['a', 'b'], ['b', 'c'])).toEqual({
      add_labels: ['c'],
      remove_labels: ['a'],
    });
  });

  it('sends nothing when nothing changed', () => {
    expect(diffLabels(['a', 'b'], ['b', 'a'])).toEqual({});
  });
});

describe('haveSameMembers', () => {
  it.each`
    a         | b         | same
    ${[1, 2]} | ${[2, 1]} | ${true}
    ${[1]}    | ${[1, 2]} | ${false}
    ${[]}     | ${[]}     | ${true}
  `('$a and $b → $same', ({ a, b, same }) => {
    expect(haveSameMembers(a, b)).toBe(same);
  });
});
