import * as openai from 'openai';
import * as vscode from 'vscode';
import { log } from '../log';
import { getAiAssistConfiguration, AiAssistConfiguration } from '../utils/extension_configuration';

export class GitLabCodeCompletionProvider implements vscode.InlineCompletionItemProvider {
  engine: string;

  apiKey: string;

  model: string;

  server: string;

  constructor(configuration: AiAssistConfiguration = getAiAssistConfiguration()) {
    this.engine = configuration.engine;
    this.apiKey = configuration.apiKey;
    this.model = configuration.model;
    this.server = this.getServer(configuration.server);
  }

  private getServer(server: string): string {
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
    log.debug(`For engine ${this.engine} using server: ${serverUrl.href}`);
    return serverUrl.href.toString();
  }

  private openAi() {
    return new openai.OpenAIApi(
      new openai.Configuration({
        apiKey: this.apiKey,
        basePath: this.server,
      }),
    );
  }

  public async provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): Promise<vscode.InlineCompletionItem[]> {
    const prompt = document.getText(new vscode.Range(0, 0, position.line, position.character));

    // TODO: Sanitize prompt to prevent exposing sensitive information

    if (!prompt) {
      log.debug('Prompt is empty, probably due to first line');
      return Promise.resolve([] as vscode.InlineCompletionItem[]);
    }
    const response = await this.openAi().createCompletion({
      model: this.model,
      prompt: prompt as openai.CreateCompletionRequestPrompt,
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
