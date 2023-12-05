import * as vscode from 'vscode';
import { NodeModule, LanguageClient, TransportKind } from 'vscode-languageclient/node';
import {
  LANGUAGE_SERVER_ID,
  LANGUAGE_SERVER_NAME,
  LanguageClientFactory,
} from '../../common/language_server/client_factory';
import { CONFIG_LS_DEBUG } from '../constants';

export const desktopLanguageClientFactory: LanguageClientFactory = {
  createLanguageClient(context, clientOptions) {
    const exec: NodeModule = {
      module: context.asAbsolutePath('./assets/language-server/node/main-bundle.js'),
      transport: TransportKind.stdio,
    };

    const lsDebug = vscode.workspace.getConfiguration().get(CONFIG_LS_DEBUG);

    const debugArgs = lsDebug ? ['--inspect=6010'] : [];

    return new LanguageClient(
      LANGUAGE_SERVER_ID,
      LANGUAGE_SERVER_NAME,
      {
        debug: {
          ...exec,
          options: {
            execArgv: ['--nolazy', ...debugArgs],
          },
        },
        run: exec,
      },
      clientOptions,
    );
  },
};
