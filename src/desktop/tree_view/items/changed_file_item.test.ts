import * as vscode from 'vscode';
import { USER_COMMANDS, VS_COMMANDS } from '../../command_names';
import {
  ADDED,
  CHANGE_TYPE_QUERY_KEY,
  DELETED,
  HAS_COMMENTS_QUERY_KEY,
  MODIFIED,
  RENAMED,
} from '../../constants';
import { toReviewUri } from '../../review/review_uri';
import { diffFile, mr, mrVersion } from '../../test_utils/entities';
import { ChangedFileItem } from './changed_file_item';

describe('ChangedFileItem', () => {
  describe('image file', () => {
    const extensions = ['.jpg', '.png', '.mp3', '.webm'];

    it.each(extensions)('should show diff for changed %s file', extension => {
      const changedImageFile = { ...diffFile, new_path: `file${extension}` };
      const item = new ChangedFileItem(mr, mrVersion, changedImageFile, '/repo', () => false);

      expect(item.command?.command).toBe(VS_COMMANDS.DIFF);
    });

    it.each(extensions)('should not show diff for new %s file', extension => {
      const path = `newfile${extension}`;
      const changedImageFile = {
        ...diffFile,
        renamed_file: false,
        new_file: true,
        old_path: `invalid${extension}`,
        new_path: path,
      };
      const item = new ChangedFileItem(mr, mrVersion, changedImageFile, '/repo', () => false);

      expect(item.command?.command).toBe(VS_COMMANDS.OPEN);

      const [url] = item.command?.arguments ?? [];
      expect(url.path).toBe(path);
    });

    it.each(extensions)('should not show diff for deleted %s file', extension => {
      const path = `deleted${extension}`;
      const changedImageFile = {
        ...diffFile,
        renamed_file: false,
        deleted_file: true,
        old_path: path,
        new_path: `invalid${extension}`,
      };
      const item = new ChangedFileItem(mr, mrVersion, changedImageFile, '/repo', () => false);

      expect(item.command?.command).toBe(VS_COMMANDS.OPEN);

      const [url] = item.command?.arguments ?? [];
      expect(url.path).toBe(path);
    });

    it.each`
      file                                                                          | changeType
      ${{ ...diffFile, new_file: true, deleted_file: false, renamed_file: false }}  | ${ADDED}
      ${{ ...diffFile, new_file: false, deleted_file: true, renamed_file: false }}  | ${DELETED}
      ${{ ...diffFile, new_file: false, deleted_file: false, renamed_file: true }}  | ${RENAMED}
      ${{ ...diffFile, new_file: false, deleted_file: false, renamed_file: false }} | ${MODIFIED}
    `('indicates change type $changeType', ({ file, changeType }) => {
      const item = new ChangedFileItem(mr, mrVersion, file, '/repo', () => false);

      expect(item.resourceUri?.query).toContain(`${CHANGE_TYPE_QUERY_KEY}=${changeType}`);
    });
  });

  describe('captures whether there are comments on the changes', () => {
    let areThereChanges: boolean;

    const createItem = () =>
      new ChangedFileItem(mr, mrVersion, diffFile, '/repository/fsPath', () => areThereChanges);

    it('indicates there are comments', () => {
      areThereChanges = true;
      expect(createItem().resourceUri?.query).toMatch(`${HAS_COMMENTS_QUERY_KEY}=true`);
    });

    it('indicates there are no comments', () => {
      areThereChanges = false;
      expect(createItem().resourceUri?.query).toMatch(`${HAS_COMMENTS_QUERY_KEY}=false`);
    });
  });

  describe('diff viewer setting', () => {
    const useViewer = (viewer?: string) =>
      jest.mocked(vscode.workspace.getConfiguration).mockReturnValue({
        viewer,
      } as unknown as vscode.WorkspaceConfiguration);

    afterEach(() => {
      jest
        .mocked(vscode.workspace.getConfiguration)
        .mockReturnValue({} as vscode.WorkspaceConfiguration);
    });

    it('opens the native diff by default', () => {
      useViewer(undefined);
      const item = new ChangedFileItem(mr, mrVersion, diffFile, '/repo', () => false);

      expect(item.command?.command).toBe(VS_COMMANDS.DIFF);
    });

    it('opens the side-by-side view when the setting asks for it', () => {
      useViewer('sideBySide');
      const item = new ChangedFileItem(mr, mrVersion, diffFile, '/repo', () => false);

      expect(item.command?.command).toBe(USER_COMMANDS.OPEN_MR_FILE_SIDE_BY_SIDE);
      expect(item.command?.arguments).toEqual([item]);
    });

    it('keeps opening a new image file, which has no diff', () => {
      useViewer('sideBySide');
      const image = { ...diffFile, renamed_file: false, new_file: true, new_path: 'new.png' };
      const item = new ChangedFileItem(mr, mrVersion, image, '/repo', () => false);

      expect(item.command?.command).toBe(VS_COMMANDS.OPEN);
    });
  });

  describe('intialization', () => {
    it('sets context and head and base URIs', () => {
      const item = new ChangedFileItem(mr, mrVersion, diffFile, '/repository/fsPath', () => false);
      expect(item.baseFileUri).toEqual(
        toReviewUri({
          path: diffFile.old_path,
          exists: true,
          change: 'renamed',
          commit: mrVersion.base_commit_sha,
          repositoryRoot: '/repository/fsPath',
          projectId: mr.project_id,
          mrId: mr.id,
        }),
      );
      expect(item.headFileUri).toEqual(
        toReviewUri({
          path: diffFile.new_path,
          exists: true,
          change: 'renamed',
          commit: mrVersion.head_commit_sha,
          repositoryRoot: '/repository/fsPath',
          projectId: mr.project_id,
          mrId: mr.id,
        }),
      );
      expect(item.contextValue).toBe('changed-file-item');
    });
  });
});
