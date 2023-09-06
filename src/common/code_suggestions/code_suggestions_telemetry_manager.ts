import * as vscode from 'vscode';
import { v4 as uuid } from 'uuid';
import { log } from '../log';
import { Snowplow } from '../snowplow/snowplow';

// eslint-disable-next-line no-shadow
export enum CodeSuggestionTelemetryState {
  REQUESTED = 'suggestion_requested',
  LOADED = 'suggestion_loaded',
  ERROR = 'suggestion_error',
  SHOWN = 'suggestion_shown',
  ACCEPTED = 'suggestion_accepted',
  REJECTED = 'suggestion_rejected',
  CANCELLED = 'suggestion_cancelled',
}

const stateGraph = new Map<CodeSuggestionTelemetryState, CodeSuggestionTelemetryState[]>([
  [
    CodeSuggestionTelemetryState.REQUESTED,
    [CodeSuggestionTelemetryState.LOADED, CodeSuggestionTelemetryState.ERROR],
  ],
  [
    CodeSuggestionTelemetryState.LOADED,
    [CodeSuggestionTelemetryState.SHOWN, CodeSuggestionTelemetryState.CANCELLED],
  ],
  [
    CodeSuggestionTelemetryState.SHOWN,
    [CodeSuggestionTelemetryState.ACCEPTED, CodeSuggestionTelemetryState.REJECTED],
  ],
  [
    CodeSuggestionTelemetryState.ERROR,
    [
      /* end state no transition allowed */
    ],
  ],
  [
    CodeSuggestionTelemetryState.CANCELLED,
    [
      /* end state no transition allowed */
    ],
  ],
  [
    CodeSuggestionTelemetryState.REJECTED,
    [
      /* end state no transition allowed */
    ],
  ],
  [
    CodeSuggestionTelemetryState.ACCEPTED,
    [
      /* end state no transition allowed */
    ],
  ],
]);

type GitlabRealm = 'saas' | 'self-managed';

interface CodeSuggestion {
  id: string;
  state: CodeSuggestionTelemetryState;
  language: string;
  gitlabRealm: GitlabRealm;
}

const endStates = [...stateGraph]
  .filter(([, allowedTransitions]) => allowedTransitions.length === 0)
  .map(([state]) => state);

const GC_TIME = 30000;

export class CodeSuggestionsTelemetryManager {
  // eslint-disable-next-line no-use-before-define
  private static instance: CodeSuggestionsTelemetryManager;

  private suggestions: Map<string, CodeSuggestion>;

  private constructor() {
    this.suggestions = new Map<string, CodeSuggestion>();
  }

  public static createSuggestion(language: string, gitlabRealm: GitlabRealm): string {
    if (!this.instance) {
      this.instance = new CodeSuggestionsTelemetryManager();
    }
    log.debug(`Telemetry: Received request to create a new suggestion`);

    this.rejectOpenedSuggestions();

    const suggestionID = uuid();
    // Garbage collect after time
    setTimeout(() => {
      if (this.instance.suggestions.has(suggestionID)) {
        this.instance.suggestions.delete(suggestionID);
      }
    }, GC_TIME);

    const suggestion = {
      id: suggestionID,
      state: CodeSuggestionTelemetryState.REQUESTED,
      language,
      gitlabRealm,
    };
    this.instance.suggestions.set(suggestionID, suggestion);
    this.sendTelemetry(suggestionID).catch(e => log.warn('could not track telemetry', e));

    log.debug(`Telemetry: New suggestion ${suggestionID} has been requested`);

    return suggestionID;
  }

  static rejectOpenedSuggestions() {
    log.debug(`Telemetry: Reject all opened suggestions`);

    this.instance.suggestions.forEach((suggestion, suggestionID) => {
      if (endStates.includes(suggestion.state)) {
        return;
      }

      this.updateSuggestionState(suggestionID, CodeSuggestionTelemetryState.REJECTED);
    });
  }

  public static updateSuggestionState(
    suggestionID: string,
    newState: CodeSuggestionTelemetryState,
  ): void {
    if (!this.instance) {
      this.instance = new CodeSuggestionsTelemetryManager();
    }
    log.debug(`Telemetry: Transist ${suggestionID} to ${newState}`);

    const currentSuggestion = this.instance.suggestions.get(suggestionID);
    if (!currentSuggestion) {
      log.debug(`Telemetry: The suggestion with ${suggestionID} can't be found`);
      return;
    }

    const currentState = currentSuggestion.state;
    const allowedTransitions = stateGraph.get(currentState);
    if (!allowedTransitions) {
      log.debug(
        `Telemetry: The suggestion's ${suggestionID} state ${currentState} can't be found in state graph`,
      );
      return;
    }

    if (!allowedTransitions.includes(newState)) {
      log.debug(
        `Telemetry: Unexpected transition from ${currentState} into ${newState} for ${suggestionID}`,
      );
      if (newState !== CodeSuggestionTelemetryState.ACCEPTED) {
        return;
      }

      log.debug(
        `Telemetry: Conditionally allowing transition to accepted state for ${suggestionID}`,
      );
    }

    this.instance.suggestions.set(suggestionID, { ...currentSuggestion, state: newState });
    this.sendTelemetry(suggestionID).catch(e => log.warn('could not track telemetry', e));

    log.debug(`Telemetry: ${suggestionID} transisted from ${currentState} to ${newState}`);
  }

  private static async sendTelemetry(suggestionID: string) {
    log.debug(`Telemetry: Sending event for suggestion ${suggestionID}`);

    const suggestion = this.instance.suggestions.get(suggestionID);
    if (!suggestion) {
      log.debug(`Telemetry: The suggestion with ${suggestionID} can't be found`);
      return;
    }

    const extension = vscode.extensions.getExtension('Gitlab.gitlab-workflow');
    const ideVersionContext = {
      schema: 'iglu:com.gitlab/ide_extension_version/jsonschema/1-0-0',
      data: {
        ide_name: 'Visual Studio Code',
        ide_vendor: 'Microsoft Corporation',
        ide_version: vscode.version,
        extension_name: 'GitLab Workflow',
        extension_version: extension?.packageJSON?.version,
      },
    };

    const codeSuggestionContexts = {
      schema: 'iglu:com.gitlab/code_suggestions_context/jsonschema/1-0-0',
      data: {
        prefix_length: 0, // prefix infomration is not available at IDE level
        suffix_length: 0, // suffix infomration is not available at IDE level
        language: suggestion.language,
        user_agent: 'node-fetch/1.0 (+https://github.com/bitinn/node-fetch)',
        gitlab_realm: suggestion.gitlabRealm,
      },
    };

    await Snowplow.getInstance().trackStructEvent(
      {
        category: 'code suggestions',
        action: suggestion.state,
        label: suggestionID,
      },
      [ideVersionContext, codeSuggestionContexts],
    );
  }
}
