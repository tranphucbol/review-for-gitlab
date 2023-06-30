import * as vscode from 'vscode';
import { VS_COMMANDS } from '../command_names';
import { contextUtils } from '../utils/context_utils';
import { HelpError } from './help_error';

describe('HelpError', () => {
  describe('show', () => {
    beforeAll(() => {
      contextUtils.init({
        extensionUri: vscode.Uri.parse(`file:///path/to/extension`),
      } as vscode.ExtensionContext);
      jest.mocked(vscode.window.showErrorMessage).mockResolvedValue('Show Help' as any);
    });

    it('opens the file', async () => {
      const error = new HelpError('message');

      await error.showUi();

      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        VS_COMMANDS.MARKDOWN_SHOW_PREVIEW,
        vscode.Uri.parse(`file:///path/to/extension/README.md`),
      );
    });

    it('opens the file to the correct section', async () => {
      const error = new HelpError('message', { section: 'foobar' });

      await error.showUi();
      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        VS_COMMANDS.MARKDOWN_SHOW_PREVIEW,
        vscode.Uri.parse(`file:///path/to/extension/README.md#foobar`),
      );
    });
  });
});
