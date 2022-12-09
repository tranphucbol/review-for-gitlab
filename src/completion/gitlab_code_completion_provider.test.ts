import { getAiAssistConfiguration } from '../utils/extension_configuration';

import { GitLabCodeCompletionProvider } from './gitlab_code_completion_provider';

describe('GitLabCodeCompletionProvider', () => {
  it.each([
    [
      'https://codesuggestions.gitlab.com',
      'gitlab',
      '',
      'https://codesuggestions.gitlab.com/v1',
      'gitlab',
      '',
    ],
    [
      'https://localhost:4000',
      'gitlab',
      'https://codesuggestions.gitlab.com',
      'https://codesuggestions.gitlab.com/v1',
      'gitlab',
      'https://codesuggestions.gitlab.com/v1',
    ],
    [
      '',
      'gitlab',
      'https://codesuggestions.gitlab.com',
      'https://codesuggestions.gitlab.com/v1',
      'gitlab',
      'https://codesuggestions.gitlab.com/v1',
    ],
  ])(
    'Test if config is parsed correctly',
    (
      server: string,
      model: string,
      changedServer: string,
      expectedServer: string,
      expectedModel: string,
      expectedChangedServer: string,
    ) => {
      const configuration = getAiAssistConfiguration();
      configuration.server = server;
      configuration.model = model;

      let glcp: GitLabCodeCompletionProvider = new GitLabCodeCompletionProvider(configuration);
      expect(glcp.server).toBe(expectedServer);
      expect(glcp.model).toBe(expectedModel);

      if (changedServer) {
        configuration.server = changedServer;
        glcp = new GitLabCodeCompletionProvider(configuration);

        expect(glcp.server).toBe(expectedChangedServer);
        expect(glcp.model).toBe(expectedModel);
      }
    },
  );
});
