import * as vscode from 'vscode';
import { getGitLabService } from '../../gitlab/get_gitlab_service';
import { GitLabService } from '../../gitlab/gitlab_service';
import { ProjectInRepository } from '../../gitlab/new_project';
import { FetchError } from '../../errors/fetch_error';
import { createFakePartial } from '../../../common/test_utils/create_fake_partial';
import { asMock } from '../../test_utils/as_mock';
import { mr } from '../../test_utils/entities';
import { openUrl } from '../openers';
import {
  DELETE_SOURCE_BRANCH,
  MrState,
  OPEN_IN_GITLAB,
  runAction,
  SQUASH_COMMITS,
} from './run_action';
import { createApprovals, createMrDetail } from './test_entities';
import { pickLabels, pickUsers } from './edit_people_and_labels';

jest.mock('../../gitlab/get_gitlab_service');
jest.mock('../openers');
jest.mock('./edit_people_and_labels', () => ({
  ...jest.requireActual('./edit_people_and_labels'),
  pickUsers: jest.fn(),
  pickLabels: jest.fn(),
}));

const fetchError = (status: number) =>
  new FetchError(createFakePartial<Response>({ status, url: 'https://example' }), 'resource');

describe('runAction', () => {
  let service: GitLabService;
  let state: MrState;
  const projectInRepository = createFakePartial<ProjectInRepository>({});
  const target = { mr, projectInRepository };

  beforeEach(() => {
    state = { detail: createMrDetail(), approvals: createApprovals() };
    service = createFakePartial<GitLabService>({
      getMrDetail: jest.fn().mockResolvedValue(state.detail),
      approveMr: jest.fn().mockResolvedValue(createApprovals()),
      unapproveMr: jest.fn().mockResolvedValue(createApprovals()),
      mergeMr: jest.fn().mockResolvedValue(state.detail),
      cancelAutoMerge: jest.fn().mockResolvedValue({}),
      setMrDraft: jest.fn().mockResolvedValue(undefined),
      updateMr: jest.fn().mockResolvedValue(state.detail),
    });
    asMock(getGitLabService).mockReturnValue(service);
    asMock(vscode.window.showInformationMessage).mockResolvedValue(undefined);
    asMock(vscode.window.showWarningMessage).mockResolvedValue(undefined);
  });

  const confirmWith = (answer: string | undefined) =>
    asMock(vscode.window.showWarningMessage).mockImplementation(async (message, options) =>
      options?.modal ? answer : undefined,
    );

  describe('approve', () => {
    it('approves the sha the user was shown', async () => {
      await expect(runAction('approve', target, state)).resolves.toBe(true);

      expect(service.approveMr).toHaveBeenCalledWith(state.detail, state.detail.sha);
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith('Approved !42.');
    });

    it('finishes without waiting for the message to be dismissed', async () => {
      asMock(vscode.window.showInformationMessage).mockReturnValue(new Promise(() => {}));

      await expect(runAction('approve', target, state)).resolves.toBe(true);
    });

    it('reports a refusal when a 401 is followed by a successful read', async () => {
      asMock(service.approveMr).mockRejectedValue(fetchError(401));

      await expect(runAction('approve', target, state)).resolves.toBe(true);

      expect(service.getMrDetail).toHaveBeenCalled();
      expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
        'You are not allowed to approve !42.',
      );
    });

    it('rethrows the original 401 when the read fails too', async () => {
      const original = fetchError(401);
      asMock(service.approveMr).mockRejectedValue(original);
      asMock(service.getMrDetail).mockRejectedValue(fetchError(401));

      await expect(runAction('approve', target, state)).rejects.toBe(original);
    });

    it('explains a 409', async () => {
      asMock(service.approveMr).mockRejectedValue(fetchError(409));

      await expect(runAction('approve', target, state)).resolves.toBe(true);

      expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
        'New commits were pushed to !42. Review them, then try again.',
      );
    });

    it('rethrows a 500', async () => {
      const original = fetchError(500);
      asMock(service.approveMr).mockRejectedValue(original);

      await expect(runAction('approve', target, state)).rejects.toBe(original);
      expect(service.getMrDetail).not.toHaveBeenCalled();
    });
  });

  describe('unapprove', () => {
    it('revokes the approval', async () => {
      await runAction('unapprove', target, state);

      expect(service.unapproveMr).toHaveBeenCalledWith(state.detail);
    });

    it('explains a 404', async () => {
      asMock(service.unapproveMr).mockRejectedValue(fetchError(404));

      await expect(runAction('unapprove', target, state)).resolves.toBe(true);

      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith("You hadn't approved !42.");
    });
  });

  describe('merge', () => {
    beforeEach(() => {
      asMock(vscode.window.showQuickPick).mockImplementation(async items =>
        (items as vscode.QuickPickItem[]).filter(i => i.picked),
      );
      confirmWith('Merge');
    });

    it('pre-selects the options from the merge request', async () => {
      state.detail = createMrDetail({ squash: true, force_remove_source_branch: false });

      await runAction('merge', target, state);

      const [items, options] = asMock(vscode.window.showQuickPick).mock.calls[0];
      expect(options).toEqual(expect.objectContaining({ canPickMany: true }));
      expect(items).toEqual([
        expect.objectContaining({ label: SQUASH_COMMITS, picked: true }),
        expect.objectContaining({ label: DELETE_SOURCE_BRANCH, picked: false }),
      ]);
    });

    it('merges with the sha and the picked options after confirmation', async () => {
      await expect(runAction('merge', target, state)).resolves.toBe(true);

      expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
        'Merge !42 now?',
        expect.objectContaining({
          modal: true,
          detail: expect.stringContaining('feature-a → main'),
        }),
        'Merge',
      );
      expect(service.mergeMr).toHaveBeenCalledWith(state.detail, {
        sha: state.detail.sha,
        squash: false,
        shouldRemoveSourceBranch: true,
        whenPipelineSucceeds: false,
      });
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith('Merged !42 into main.');
    });

    it('sets merge when pipeline succeeds', async () => {
      confirmWith('Merge When Pipeline Succeeds');

      await runAction('mergeWhenPipelineSucceeds', target, state);

      expect(service.mergeMr).toHaveBeenCalledWith(
        state.detail,
        expect.objectContaining({ whenPipelineSucceeds: true }),
      );
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        'Merge when pipeline succeeds is set for !42.',
      );
    });

    it('does nothing when the options pick is dismissed', async () => {
      asMock(vscode.window.showQuickPick).mockResolvedValue(undefined);

      await expect(runAction('merge', target, state)).resolves.toBe(false);
      expect(service.mergeMr).not.toHaveBeenCalled();
    });

    it('does nothing when the confirmation is dismissed', async () => {
      confirmWith(undefined);

      await expect(runAction('merge', target, state)).resolves.toBe(false);
      expect(service.mergeMr).not.toHaveBeenCalled();
    });

    it('explains a 405 with the reason from a fresh read', async () => {
      asMock(service.mergeMr).mockRejectedValue(fetchError(405));
      asMock(service.getMrDetail).mockResolvedValue(createMrDetail({ work_in_progress: true }));

      await expect(runAction('merge', target, state)).resolves.toBe(true);

      expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
        "GitLab won't merge !42 right now: It is a draft — mark it as ready first.",
        OPEN_IN_GITLAB,
      );
    });

    it('offers to open GitLab on a 406', async () => {
      asMock(service.mergeMr).mockRejectedValue(fetchError(406));
      asMock(vscode.window.showWarningMessage).mockImplementation(async (message, ...rest) =>
        typeof rest[0] === 'object' ? 'Merge' : OPEN_IN_GITLAB,
      );

      await expect(runAction('merge', target, state)).resolves.toBe(true);

      expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
        "!42 has conflicts or can't be merged. Resolve them in GitLab.",
        OPEN_IN_GITLAB,
      );
      expect(openUrl).toHaveBeenCalledWith(state.detail.web_url);
    });

    it('explains a 409', async () => {
      asMock(service.mergeMr).mockRejectedValue(fetchError(409));

      await runAction('merge', target, state);

      expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
        'New commits were pushed to !42. Review them, then try again.',
      );
    });

    it('re-checks a 401', async () => {
      asMock(service.mergeMr).mockRejectedValue(fetchError(401));

      await runAction('merge', target, state);

      expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
        'You are not allowed to merge !42.',
      );
    });
  });

  describe('cancel merge when pipeline succeeds', () => {
    beforeEach(() => confirmWith('Cancel Automatic Merge'));

    it('cancels after confirmation', async () => {
      await expect(runAction('cancelAutoMerge', target, state)).resolves.toBe(true);

      expect(service.cancelAutoMerge).toHaveBeenCalledWith(state.detail);
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        'Merge when pipeline succeeds is cancelled for !42.',
      );
    });

    it('reports the 201 error body GitLab 13.12 sends when there is nothing to cancel', async () => {
      asMock(service.cancelAutoMerge).mockResolvedValue({
        status: 'error',
        message: "Can't cancel the automatic merge",
        http_status: 406,
      });

      await expect(runAction('cancelAutoMerge', target, state)).resolves.toBe(true);

      expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
        "!42 has no automatic merge to cancel (GitLab: Can't cancel the automatic merge).",
      );
    });

    it('does nothing when the confirmation is dismissed', async () => {
      confirmWith(undefined);

      await expect(runAction('cancelAutoMerge', target, state)).resolves.toBe(false);
      expect(service.cancelAutoMerge).not.toHaveBeenCalled();
    });
  });

  it.each`
    id               | draft
    ${'markAsDraft'} | ${true}
    ${'markAsReady'} | ${false}
  `('$id sets draft to $draft without confirmation', async ({ id, draft }) => {
    await expect(runAction(id, target, state)).resolves.toBe(true);

    expect(service.setMrDraft).toHaveBeenCalledWith(state.detail, draft);
    expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
  });

  it('closes after confirmation', async () => {
    confirmWith('Close Merge Request');

    await runAction('close', target, state);

    expect(service.updateMr).toHaveBeenCalledWith(state.detail, { state_event: 'close' });
  });

  it('does not close when the confirmation is dismissed', async () => {
    confirmWith(undefined);

    await expect(runAction('close', target, state)).resolves.toBe(false);
    expect(service.updateMr).not.toHaveBeenCalled();
  });

  it('reopens without confirmation', async () => {
    await runAction('reopen', target, state);

    expect(service.updateMr).toHaveBeenCalledWith(state.detail, { state_event: 'reopen' });
    expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
  });

  describe('reviewers and assignees', () => {
    const ann = { id: 7, name: 'Ann', username: 'ann', avatar_url: '' };
    const bob = { id: 8, name: 'Bob', username: 'bob', avatar_url: '' };

    beforeEach(() => {
      state = { ...state, detail: createMrDetail({ reviewers: [ann] }) };
    });

    it('sends the full new list of reviewers', async () => {
      asMock(pickUsers).mockResolvedValue([7, 8]);
      asMock(service.updateMr).mockResolvedValue(createMrDetail({ reviewers: [ann, bob] }));

      await expect(runAction('editReviewers', target, state)).resolves.toBe(true);

      expect(pickUsers).toHaveBeenCalledWith(service, state.detail, 'Reviewers of !42', [ann]);
      expect(service.updateMr).toHaveBeenCalledWith(state.detail, { reviewer_ids: [7, 8] });
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        'Reviewers of !42: Ann, Bob.',
      );
    });

    it('clears the assignees with an empty list', async () => {
      state = { ...state, detail: createMrDetail({ assignees: [ann] }) };
      asMock(pickUsers).mockResolvedValue([]);
      asMock(service.updateMr).mockResolvedValue(createMrDetail({ assignees: [] }));

      await runAction('editAssignees', target, state);

      expect(service.updateMr).toHaveBeenCalledWith(state.detail, { assignee_ids: [] });
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        '!42 has no assignees now.',
      );
    });

    it.each`
      case                | picked
      ${'dismissed'}      | ${undefined}
      ${'left unchanged'} | ${[7]}
    `('sends nothing when the pick is $case', async ({ picked }) => {
      asMock(pickUsers).mockResolvedValue(picked);

      await expect(runAction('editReviewers', target, state)).resolves.toBe(false);
      expect(service.updateMr).not.toHaveBeenCalled();
    });

    it('reports a 403 as a refusal', async () => {
      asMock(pickUsers).mockResolvedValue([8]);
      asMock(service.updateMr).mockRejectedValue(fetchError(403));

      await expect(runAction('editReviewers', target, state)).resolves.toBe(true);
      expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
        'You are not allowed to change the reviewers of !42.',
      );
    });
  });

  describe('labels', () => {
    beforeEach(() => {
      state = { ...state, detail: createMrDetail({ labels: ['backend', 'bug'] }) };
    });

    it('sends only the labels added and removed', async () => {
      asMock(pickLabels).mockResolvedValue(['bug', 'urgent']);
      asMock(service.updateMr).mockResolvedValue(createMrDetail({ labels: ['bug', 'urgent'] }));

      await expect(runAction('editLabels', target, state)).resolves.toBe(true);

      expect(service.updateMr).toHaveBeenCalledWith(state.detail, {
        add_labels: ['urgent'],
        remove_labels: ['backend'],
      });
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        'Labels of !42: bug, urgent.',
      );
    });

    it('sends nothing when the labels did not change', async () => {
      asMock(pickLabels).mockResolvedValue(['bug', 'backend']);

      await expect(runAction('editLabels', target, state)).resolves.toBe(false);
      expect(service.updateMr).not.toHaveBeenCalled();
    });
  });
});
