import * as vscode from 'vscode';
import { WebIDEExtension } from '../common/platform/web_ide';

export const getWebIdeExports = () =>
  vscode.extensions.getExtension<WebIDEExtension>('gitlab.gitlab-web-ide')?.exports;
