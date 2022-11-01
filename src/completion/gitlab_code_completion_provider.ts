import * as openai from 'openai';
import * as vscode from 'vscode';
import { log } from '../log';
import { getAiAssistConfiguration, AiAssistConfiguration } from '../utils/extension_configuration';
import { getActiveProject } from '../commands/run_with_valid_project';
import { tokenExchangeService } from '../gitlab/token_exchange_service';
import { getStopSequences } from '../utils/ai_assist/get_stop_sequences';

export class GitLabCodeCompletionProvider implements vscode.InlineCompletionItemProvider {
  engine: string;

  apiKey: string;

  model: string;

  server: string;

  constructor(configuration: AiAssistConfiguration = getAiAssistConfiguration()) {
    this.engine = configuration.engine;
    this.apiKey = configuration.apiKey;
    this.model = configuration.model;
    this.server = this.#getServer(configuration.server);
  }

  static async #getGitLabApiKey(): Promise<string | undefined> {
    const activeProject = getActiveProject();
    if (!activeProject) {
      log.debug(
        `AI Assist: Unable to get active project, ensure GitLab extension is properly configured`,
      );
      return undefined;
    }
    const account = await tokenExchangeService.refreshIfNeeded(activeProject.account.id);
    return account.token;
  }

  #getServer(server: string): string {
    const serverUrl = new URL(server);
    serverUrl.pathname = '/v1';
    switch (this.engine) {
      case 'FauxPilot':
        serverUrl.pathname = '/v1';
        this.model = 'fastertransformer';
        break;
      case 'OpenAI':
        serverUrl.href = 'https://api.openai.com/v1';
        break;
      case 'GitLab':
        serverUrl.href = 'https://ai.gitlab.com/v1';
        this.model = 'gitlab';
        break;
      default:
        break;
    }
    log.debug(`AI Assist: For engine ${this.engine} using server: ${serverUrl.href}`);
    return serverUrl.href.toString();
  }

  async provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.InlineCompletionContext,
  ): Promise<vscode.InlineCompletionItem[]> {
    if (context.triggerKind === 0) {
      //  TODO: In case of a hover, this will be triggered which is not desired as it calls for a new prediction
    }

    const prompt = document.getText(new vscode.Range(0, 0, position.line, position.character));

    // TODO: Sanitize prompt to prevent exposing sensitive information
    if (!prompt) {
      log.debug('AI Assist: Prompt is empty, probably due to first line');
      return Promise.resolve([] as vscode.InlineCompletionItem[]);
    }

    const oa = new openai.OpenAIApi(
      new openai.Configuration({
        apiKey: ['GitLab'].includes(this.engine)
          ? await GitLabCodeCompletionProvider.#getGitLabApiKey()
          : this.apiKey,
        basePath: this.server,
      }),
    );
    const response = await oa.createCompletion({
      model: this.model,
      prompt: prompt as openai.CreateCompletionRequestPrompt,
      stop: getStopSequences(position.line, document),
    });

    const completions =
      response.data.choices
        ?.map(choice => choice.text)
        .map(
          choiceText =>
            new vscode.InlineCompletionItem(
              choiceText as string,
              new vscode.Range(position, position),
            ),
        ) || [];

    return Promise.resolve(completions);
  }
}
