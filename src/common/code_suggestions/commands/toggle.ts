import {
  getAiAssistedCodeSuggestionsConfiguration,
  setAiAssistedCodeSuggestionsConfiguration,
} from '../../utils/extension_configuration';
import { CodeSuggestionsStateManager } from '../code_suggestions_state_manager';

export const COMMAND_TOGGLE_CODE_SUGGESTIONS = 'gl.toggleCodeSuggestions';
export const toggleCodeSuggestions = async ({
  stateManager,
}: {
  stateManager: CodeSuggestionsStateManager;
}) => {
  const config = getAiAssistedCodeSuggestionsConfiguration();
  if (!config.enabled) {
    // Enable extension globally
    await setAiAssistedCodeSuggestionsConfiguration({ enabled: true });
  } else {
    // Disable/enable extension only per session
    stateManager.setTemporaryDisabled(!stateManager.isDisabledByUser());
  }
};
