import * as vscode from 'vscode';
import { createFakePartial } from '../test_utils/create_fake_partial';
import {
  AI_ASSISTED_CODE_SUGGESTIONS_CONFIG,
  setAiAssistedCodeSuggestionsConfiguration,
} from './extension_configuration';

describe('utils/extension_configuration', () => {
  describe('setAiAssistedCodeSuggestionsConfiguration', () => {
    let mockAiConfig: vscode.WorkspaceConfiguration;

    beforeEach(() => {
      mockAiConfig = createFakePartial<vscode.WorkspaceConfiguration>({
        update: jest.fn().mockResolvedValue(undefined),
        inspect: jest.fn().mockReturnValue(undefined),
      });

      jest.mocked(vscode.workspace.getConfiguration).mockReturnValue(mockAiConfig);
    });

    it('requests AI config', async () => {
      expect(vscode.workspace.getConfiguration).not.toHaveBeenCalled();

      await setAiAssistedCodeSuggestionsConfiguration({
        enabled: true,
      });

      expect(vscode.workspace.getConfiguration).toHaveBeenCalledTimes(1);
      expect(vscode.workspace.getConfiguration).toHaveBeenCalledWith(
        AI_ASSISTED_CODE_SUGGESTIONS_CONFIG,
      );
    });

    it.each`
      config                                          | mockInspect                  | expectedUpdate
      ${{ enabled: true }}                            | ${undefined}                 | ${[['enabled', true, vscode.ConfigurationTarget.Global]]}
      ${{ enabled: false }}                           | ${{ workspaceValue: false }} | ${[['enabled', false, vscode.ConfigurationTarget.Workspace]]}
      ${{ enabled: true, preferredAccount: 'lorem' }} | ${{ workspaceValue: false }} | ${[['enabled', true, vscode.ConfigurationTarget.Workspace], ['preferredAccount', 'lorem', vscode.ConfigurationTarget.Workspace]]}
    `(
      'with config=$config and inspect=$mockInspect, should update',
      async ({ config, mockInspect, expectedUpdate }) => {
        jest.mocked(mockAiConfig.inspect).mockReturnValue(mockInspect);
        expect(mockAiConfig.update).not.toHaveBeenCalled();

        await setAiAssistedCodeSuggestionsConfiguration(config);

        expect(jest.mocked(mockAiConfig.update).mock.calls).toEqual(expectedUpdate);
      },
    );
  });
});
