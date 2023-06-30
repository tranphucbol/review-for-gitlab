import { TreeItem, ThemeIcon } from 'vscode';
import { COMMAND_SHOW_OUTPUT } from '../../../common/show_output_command';

export class ErrorItem extends TreeItem {
  constructor(message = 'Error occurred, please try to refresh.') {
    super(message);
    this.iconPath = new ThemeIcon('error');
    this.command = {
      command: COMMAND_SHOW_OUTPUT,
      title: 'Show error output',
    };
  }
}
