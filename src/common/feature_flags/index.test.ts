import * as vscode from 'vscode';
import { getExtensionConfiguration } from '../utils/extension_configuration';
import {
  initializeFeatureFlagContext,
  isEnabled,
  FeatureFlag,
  FEATURE_FLAGS_DEFAULT_VALUES,
} from './index';

jest.mock('../utils/extension_configuration');

describe('feature_flags/index', () => {
  const mockExtensionConfiguration = (featureFlags = {}) => {
    jest.mocked(getExtensionConfiguration).mockReturnValue({
      debug: false,
      featureFlags,
      customQueries: [],
    });
  };

  describe('isEnabled', () => {
    it.each`
      configurationValue | defaultValue | enabled
      ${undefined}       | ${true}      | ${true}
      ${undefined}       | ${false}     | ${false}
      ${true}            | ${true}      | ${true}
      ${true}            | ${false}     | ${true}
      ${false}           | ${true}      | ${false}
      ${false}           | ${false}     | ${false}
    `(
      'returns $outcome when config = $configurationValue && default = $defaultValue',
      ({ configurationValue, defaultValue, enabled }) => {
        mockExtensionConfiguration({ [FeatureFlag.TestFlag]: configurationValue });
        FEATURE_FLAGS_DEFAULT_VALUES[FeatureFlag.TestFlag] = defaultValue;

        expect(isEnabled(FeatureFlag.TestFlag)).toBe(enabled);
      },
    );
  });

  describe('initializeFeatureFlagContext', () => {
    it('sets a special context with the feature flag state', () => {
      mockExtensionConfiguration({ [FeatureFlag.TestFlag]: true });
      initializeFeatureFlagContext();

      Object.values(FeatureFlag).forEach(feature => {
        expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
          'setContext',
          `gitlab.featureFlags.${feature}`,
          isEnabled(feature as FeatureFlag),
        );
      });
    });

    describe('when a feature flag setting changes', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let onDidChangeConfigurationListener: (e: vscode.ConfigurationChangeEvent) => any;

      beforeEach(() => {
        jest.mocked(vscode.workspace.onDidChangeConfiguration).mockImplementationOnce(listener => {
          onDidChangeConfigurationListener = listener;

          return { dispose: () => {} };
        });
      });

      it('updates the special feature flag context', () => {
        initializeFeatureFlagContext();

        mockExtensionConfiguration({ [FeatureFlag.TestFlag]: true });

        onDidChangeConfigurationListener({ affectsConfiguration: () => true });

        expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
          'setContext',
          `gitlab.featureFlags.${FeatureFlag.TestFlag}`,
          true,
        );

        mockExtensionConfiguration({ [FeatureFlag.TestFlag]: false });

        onDidChangeConfigurationListener({ affectsConfiguration: () => true });

        expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
          'setContext',
          `gitlab.featureFlags.${FeatureFlag.TestFlag}`,
          false,
        );
      });
    });
  });
});
