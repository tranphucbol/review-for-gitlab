import { toggleCodeSuggestions } from './toggle';
import {
  getAiAssistedCodeSuggestionsConfiguration,
  setAiAssistedCodeSuggestionsConfiguration,
} from '../../utils/extension_configuration';
import { CodeSuggestionsStateManager } from '../code_suggestions_state_manager';
import { createFakePartial } from '../../test_utils/create_fake_partial';

jest.mock('../../utils/extension_configuration', () => ({
  getAiAssistedCodeSuggestionsConfiguration: jest.fn(() => ({ enabled: false })),
  setAiAssistedCodeSuggestionsConfiguration: jest.fn(),
}));

const stateManager = createFakePartial<CodeSuggestionsStateManager>({
  setTemporaryDisabled: jest.fn(),
  isDisabledByUser: jest.fn().mockReturnValue(false),
});

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
