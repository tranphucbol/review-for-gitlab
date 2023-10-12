import * as vscode from 'vscode';
import { VS_COMMANDS } from '../command_names';
import { contextUtils } from '../utils/context_utils';
import { UiError } from '../../common/errors/ui_error';

export type HelpOptions = { section?: string };

const showMarkdownPreview = async (section?: string) => {
  const help = contextUtils.getEmbededFileUri('README.md').with({ fragment: section });
  await vscode.commands.executeCommand(VS_COMMANDS.MARKDOWN_SHOW_PREVIEW, help);
};

type maybeStatus = number | undefined;

export class HelpError extends Error implements UiError {
  readonly options: HelpOptions;

  readonly status: maybeStatus;

  constructor(message: string, options: HelpOptions = {}, status: maybeStatus = undefined) {
    super(message);
    this.options = options;
    this.status = status;
  }

  static isHelpError(object: unknown): object is HelpError {
    return object instanceof HelpError;
  }

  async showUi(): Promise<void> {
    const shouldShow = !!(await vscode.window.showErrorMessage(this.message, 'Show Help'));

    if (shouldShow) {
      await showMarkdownPreview(this.options.section);
    }
  }
}
