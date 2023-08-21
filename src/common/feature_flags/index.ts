import * as vscode from 'vscode';
import { CONFIG_NAMESPACE } from '../constants';
import { getExtensionConfiguration } from '../utils/extension_configuration';
import { FEATURE_FLAGS_DEFAULT_VALUES, FeatureFlag } from './constants';

export { FeatureFlag, FEATURE_FLAGS_DEFAULT_VALUES } from './constants';

export function isEnabled(feature: FeatureFlag): boolean {
  const featureFlagUserPreferences = getExtensionConfiguration().featureFlags;
  const configurationValue = featureFlagUserPreferences[feature];
  const defaultValue = FEATURE_FLAGS_DEFAULT_VALUES[feature];

  return typeof configurationValue === 'boolean' ? configurationValue : defaultValue;
}

const updateFeatureFlagContext = () =>
  Object.values(FeatureFlag).forEach(feature =>
    vscode.commands.executeCommand(
      'setContext',
      `gitlab.featureFlags.${feature}`,
      isEnabled(feature as FeatureFlag),
    ),
  );

export function initializeFeatureFlagContext(): vscode.Disposable {
  updateFeatureFlagContext();

  return vscode.workspace.onDidChangeConfiguration(event => {
    if (event.affectsConfiguration(CONFIG_NAMESPACE)) {
      updateFeatureFlagContext();
    }
  });
}
