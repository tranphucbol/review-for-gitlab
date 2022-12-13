import * as vscode from 'vscode';
import { CONFIG_NAMESPACE, AIASSIST_CONFIG_NAMESPACE } from '../constants';
import { CustomQuery } from '../gitlab/custom_query';

export const GITLAB_DEBUG_MODE = 'gitlab.debug';
export const AI_ASSIST_MODE = 'gitlab.aiassist.enabled';
export const AI_ASSIST_CONFIG = 'gitlab.aiassist';

export interface ExtensionConfiguration {
  pipelineGitRemoteName?: string;
  debug: boolean;
  featureFlags?: string[];
  customQueries: CustomQuery[];
}

export interface AiAssistConfiguration {
  enabled: boolean;
  apiKey: string;
  manualTrigger: boolean;
}

// VS Code returns a value or `null` but undefined is better for using default function arguments
const turnNullToUndefined = <T>(val: T | null | undefined): T | undefined => val ?? undefined;

export function getExtensionConfiguration(): ExtensionConfiguration {
  const workspaceConfig = vscode.workspace.getConfiguration(CONFIG_NAMESPACE);
  return {
    pipelineGitRemoteName: turnNullToUndefined(workspaceConfig.pipelineGitRemoteName),
    featureFlags: turnNullToUndefined(workspaceConfig.featureFlags),
    debug: workspaceConfig.debug,
    customQueries: workspaceConfig.customQueries || [],
  };
}

export function getAiAssistConfiguration(): AiAssistConfiguration {
  const aiAssistConfig = vscode.workspace.getConfiguration(AIASSIST_CONFIG_NAMESPACE);
  return {
    enabled: aiAssistConfig.enabled,
    apiKey: aiAssistConfig.apiKey,
    manualTrigger: aiAssistConfig.manualTrigger,
  };
}
