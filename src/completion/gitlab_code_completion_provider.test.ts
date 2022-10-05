import { getAiAssistConfiguration } from '../utils/extension_configuration';

import { GitLabCodeCompletionProvider } from './gitlab_code_completion_provider';

describe('GitLabCodeCompletionProvider', () => {
  it.each([
    [
      'FauxPilot',
      'https://localhost:5002',
      'gpt-j',
      'https://localhost:8000',
      'FauxPilot',
      'https://localhost:5002/v1',
      'fastertransformer',
      'https://localhost:8000/v1',
    ],
    [
      'OpenAI',
      'https://api.openai.com/v1',
      'text-davinci-002',
      '',
      'OpenAI',
      'https://api.openai.com/v1',
      'text-davinci-002',
      '',
    ],
    [
      'OpenAI',
      'https://localhost:5045',
      'text-davinci-002',
      '',
      'OpenAI',
      'https://api.openai.com/v1',
      'text-davinci-002',
      '',
    ],
    [
      'GitLab',
      'https://ai.gitlab.com',
      'gitlab',
      '',
      'GitLab',
      'https://ai.gitlab.com/v1',
      'gitlab',
      '',
    ],
    [
      'GitLab',
      'https://localhost:4000',
      'gitlab',
      'https://ai.gitlab.com',
      'GitLab',
      'https://ai.gitlab.com/v1',
      'gitlab',
      'https://ai.gitlab.com/v1',
    ],
  ])(
    'Test if config is parsed correctly',
    (
      engine: string,
      server: string,
      model: string,
      changedServer: string,
      expectedEngine: string,
      expectedServer: string,
      expectedModel: string,
      expectedChangedServer: string,
    ) => {
      const configuration = getAiAssistConfiguration();
      configuration.engine = engine;
      configuration.server = server;
      configuration.model = model;

      let glcp: GitLabCodeCompletionProvider = new GitLabCodeCompletionProvider(configuration);
      expect(glcp.engine).toBe(expectedEngine);
      expect(glcp.server).toBe(expectedServer);
      expect(glcp.model).toBe(expectedModel);

      if (changedServer) {
        configuration.server = changedServer;
        glcp = new GitLabCodeCompletionProvider(configuration);

        expect(glcp.engine).toBe(expectedEngine);
        expect(glcp.server).toBe(expectedChangedServer);
        expect(glcp.model).toBe(expectedModel);
      }
    },
  );
});
