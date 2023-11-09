import { DependencyContainer } from '../common/dependency_container';
import { createGitLabPlatformManagerBrowser } from './gitlab_platform_browser';
import { GitLabTelemetryEnvironmentBrowser } from './gitlab_telemetry_environment_browser';

export const createDependencyContainer = async (): Promise<DependencyContainer> => ({
  gitLabPlatformManager: await createGitLabPlatformManagerBrowser(),
  gitLabTelemetryEnvironment: new GitLabTelemetryEnvironmentBrowser(),
});
