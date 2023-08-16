import { toggleCodeSuggestions } from './toggle';
import {
  getAiAssistedCodeSuggestionsConfiguration,
  setAiAssistedCodeSuggestionsConfiguration,
} from '../../utils/extension_configuration';
import { CodeSuggestionsStateManager } from '../code_suggestions_state';

jest.mock('../../utils/extension_configuration', () => ({
  getAiAssistedCodeSuggestionsConfiguration: jest.fn(() => ({ enabled: false })),
  setAiAssistedCodeSuggestionsConfiguration: jest.fn(),
}));

const stateManager = {
  setTemporaryDisabled: jest.fn(),
  isEnabled: jest.fn().mockReturnValue(true),
} as unknown as CodeSuggestionsStateManager;

describe('toggle code suggestions command', () => {
  it('enables code suggestions globally if previously disabled', async () => {
    await toggleCodeSuggestions({ stateManager });

    expect(setAiAssistedCodeSuggestionsConfiguration).toHaveBeenCalledWith({
      enabled: !getAiAssistedCodeSuggestionsConfiguration().enabled,
    });
    expect(stateManager.setTemporaryDisabled).not.toHaveBeenCalled();
  });

  it('disables code suggestions per session if previously globally enabled', async () => {
    jest.mocked(getAiAssistedCodeSuggestionsConfiguration).mockReturnValue({ enabled: true });

    await toggleCodeSuggestions({ stateManager });

    expect(setAiAssistedCodeSuggestionsConfiguration).not.toHaveBeenCalled();
    expect(stateManager.setTemporaryDisabled).toHaveBeenCalledWith(true);
  });
});
