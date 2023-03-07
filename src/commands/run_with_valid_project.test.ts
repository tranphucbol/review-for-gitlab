import { asMock } from '../test_utils/as_mock';
import { getExtensionConfiguration } from '../utils/extension_configuration';
import { projectInRepository } from '../test_utils/entities';
import { getRepositoryRootForUri, runWithValidProject } from './run_with_valid_project';
import { gitlabProjectRepository } from '../gitlab/gitlab_project_repository';
import { toJobLogUri } from '../ci/job_log_uri';
import { toMergedYamlUri } from '../ci/merged_yaml_uri';

jest.mock('../gitlab/gitlab_project_repository');
jest.mock('../utils/extension_configuration');
jest.mock('../log');

describe('runWithValidProject', () => {
  beforeEach(() => {
    asMock(getExtensionConfiguration).mockReturnValue({ instanceUrl: 'https://gitlab.com' });
  });

  describe('with valid project', () => {
    beforeEach(() => {
      asMock(gitlabProjectRepository.getDefaultAndSelectedProjects).mockReturnValue([
        projectInRepository,
      ]);
    });

    it('injects repository, remote, and GitLab project into the command', async () => {
      const command = jest.fn();

      await runWithValidProject(command)();

      expect(command).toHaveBeenCalledWith(projectInRepository);
    });

    describe('getRepositoryRootForUri', () => {
      it('returns the root for Job Log uri', () => {
        const uri = toJobLogUri('repository root', 1);
        const root = getRepositoryRootForUri(uri);
        expect(root).toEqual('repository root');
      });
      it('returns the root for Merged YAML uri', () => {
        const uri = toMergedYamlUri({
          repositoryRoot: 'repository root',
          path: 'path',
          initial: 'initial',
        });
        const root = getRepositoryRootForUri(uri);
        expect(root).toEqual('repository root');
      });
    });
  });

  describe('without project', () => {
    beforeEach(() => {
      asMock(gitlabProjectRepository.getDefaultAndSelectedProjects).mockReturnValue([]);
    });

    it('does not run the command', async () => {
      const command = jest.fn();

      await runWithValidProject(command)();

      expect(command).not.toHaveBeenCalled();
    });
  });
});
