import * as vscode from 'vscode';
import { CONFIG_NAMESPACE } from '../constants';
import { AI_ASSISTED_CODE_SUGGESTIONS_CONFIG_NAMESPACE } from '../code_suggestions/constants';
import { CustomQuery } from '../gitlab/custom_query';
import { getConfigurationTargetForKey } from './get_configuration_target_for_key';
import { FeatureFlag } from '../feature_flags/constants';

// These constants represent `settings.json` keys. Other constants belong to `constants.ts`.
export const GITLAB_DEBUG_MODE = 'gitlab.debug';
export const AI_ASSISTED_CODE_SUGGESTIONS_MODE = 'gitlab.aiAssistedCodeSuggestions.enabled';
export const AI_ASSISTED_CODE_SUGGESTIONS_CONFIG = 'gitlab.aiAssistedCodeSuggestions';

export interface ExtensionConfiguration {
  pipelineGitRemoteName?: string;
  debug: boolean;
  featureFlags: Partial<Record<FeatureFlag, boolean>>;
  customQueries: CustomQuery[];
}

export interface AiAssistedCodeSuggestionsConfiguration {
  enabled: boolean;
  preferredAccount?: string;
  suggestionsCache?: { enabled?: boolean };
}

// VS Code returns a value or `null` but undefined is better for using default function arguments
const turnNullToUndefined = <T>(val: T | null | undefined): T | undefined => val ?? undefined;

export function getExtensionConfiguration(): ExtensionConfiguration {
  const workspaceConfig = vscode.workspace.getConfiguration(CONFIG_NAMESPACE);

  return {
    pipelineGitRemoteName: turnNullToUndefined(workspaceConfig?.pipelineGitRemoteName),
    featureFlags: workspaceConfig?.featureFlags ?? {},
    debug: workspaceConfig?.debug || false,
    customQueries: workspaceConfig?.customQueries || [],
  };
}

export function getAiAssistedCodeSuggestionsConfiguration(): AiAssistedCodeSuggestionsConfiguration {
  const aiAssistedCodeSuggestionsConfig = vscode.workspace.getConfiguration(
    AI_ASSISTED_CODE_SUGGESTIONS_CONFIG_NAMESPACE,
  );
  return {
    enabled: aiAssistedCodeSuggestionsConfig.enabled,
    preferredAccount: aiAssistedCodeSuggestionsConfig.preferredAccount,
    suggestionsCache: aiAssistedCodeSuggestionsConfig.suggestionsCache || { enabled: false },
  };
}

/**
 * Calls `config.update` but ises `getConfigurationTargetForKey` to make
 * sure we pick the right ConfigurationTarget
 */
const updateConfig = <T>(config: vscode.WorkspaceConfiguration, key: string, value: T) => {
  const target = getConfigurationTargetForKey(config, key);
  return config.update(key, value, target);
};

export async function setAiAssistedCodeSuggestionsConfiguration(
  config: AiAssistedCodeSuggestionsConfiguration,
) {
  const aiAssistedCodeSuggestionsConfig = vscode.workspace.getConfiguration(
    AI_ASSISTED_CODE_SUGGESTIONS_CONFIG_NAMESPACE,
  );

  await updateConfig(aiAssistedCodeSuggestionsConfig, 'enabled', Boolean(config.enabled));

  if (typeof config.preferredAccount === 'string') {
    await updateConfig(
      aiAssistedCodeSuggestionsConfig,
      'preferredAccount',
      config.preferredAccount,
    );
  }
}
