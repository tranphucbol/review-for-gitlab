/*---------------------------------------------------------------------------------------------
 * Adapted from ANSI Colors (https://github.com/iliazeus/vscode-ansi)
 *
 * Copyright (c) 2020 Ilia Pozdnyakov. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import assert from 'assert';
import { JOB_LOG_URI_SCHEME } from '../constants';
import { getGitLabService } from '../gitlab/get_gitlab_service';
import { gitlabProjectRepository } from '../gitlab/gitlab_project_repository';
import { doNotAwait } from '../utils/do_not_await';
import { AnsiDecorationProvider } from './ansi_decoration_provider';
import { jobLogCache } from './job_log_cache';
import { fromJobLogUri } from './job_log_uri';

export class JobLogContentProvider implements vscode.TextDocumentContentProvider {
  #decorationProvider = new AnsiDecorationProvider();

  #activeJobLogEditors: vscode.TextEditor[] = [];

  constructor() {
    vscode.workspace.onDidOpenTextDocument(d => {
      if (d.uri.scheme === JOB_LOG_URI_SCHEME) {
        const { job: id } = fromJobLogUri(d.uri);
        jobLogCache.touch(id);

        this.#decorateAllEditors();
      }
    });
    vscode.workspace.onDidChangeTextDocument(ev => {
      if (ev.document.uri.scheme === JOB_LOG_URI_SCHEME) {
        const docUri = ev.document.uri.toString();
        // Remove references to editors which need to be updated.
        this.#activeJobLogEditors = this.#activeJobLogEditors.filter(
          e => e.document.uri.toString() !== docUri,
        );
        this.#decorateAllEditors();
      }
    });
    vscode.window.onDidChangeVisibleTextEditors(() => {
      this.#decorateAllEditors();
    });
    vscode.workspace.onDidCloseTextDocument(d => {
      if (d.uri.scheme === JOB_LOG_URI_SCHEME) {
        const { job: id } = fromJobLogUri(d.uri);
        doNotAwait(jobLogCache.delete(id));
      }
    });
  }

  #decorateAllEditors() {
    const newActiveJobLogEditors = vscode.window.visibleTextEditors.filter(
      e => e.document.uri.scheme === JOB_LOG_URI_SCHEME,
    );

    const undecoratedJobLogEditors = newActiveJobLogEditors.filter(
      e => this.#activeJobLogEditors.indexOf(e) === -1,
    );
    this.#activeJobLogEditors = newActiveJobLogEditors;

    undecoratedJobLogEditors.forEach(e => doNotAwait(this.#decorateJobTextEditor(e)));
  }

  async #decorateJobTextEditor(editor: vscode.TextEditor) {
    const { document } = editor;

    const decorations = await this.#decorationProvider.provideDecorations(document);
    if (decorations === null || decorations === undefined) return;

    const decorationTypes = new Map<string, vscode.TextEditorDecorationType>();

    decorations.forEach((options, key) => {
      let decorationType: vscode.ProviderResult<vscode.TextEditorDecorationType> =
        decorationTypes.get(key);

      if (!decorationType) {
        try {
          decorationType = this.#decorationProvider.resolveDecoration(key);
        } catch (error) {
          console.error(`error providing decorations for key ${key}`, error);
          return;
        }

        if (!decorationType) {
          console.error(`no decoration resolved for key ${key}`);
          return;
        }

        decorationTypes.set(key, decorationType);
      }

      editor.setDecorations(decorationType, options);
    });
  }

  dispose() {
    this.#activeJobLogEditors = [];
    this.#decorationProvider.dispose();
  }

  async provideTextDocumentContent(uri: vscode.Uri): Promise<string | undefined> {
    const { repositoryRoot, job: id } = fromJobLogUri(uri);

    if (!jobLogCache.get(id)) {
      const projectInRepository = gitlabProjectRepository.getProjectOrFail(repositoryRoot);
      const gitlabService = getGitLabService(projectInRepository);

      const rawTrace = await gitlabService.getJobTrace(projectInRepository.project, id);
      jobLogCache.set(id, rawTrace);
    } else {
      jobLogCache.touch(id);
    }

    const cacheItem = jobLogCache.get(id);
    assert(cacheItem);

    if (!cacheItem.filtered) {
      const { rawTrace } = cacheItem;
      const { sections, decorations, filtered } =
        await this.#decorationProvider.provideDecorationsForPrettifiedAnsi(rawTrace);

      jobLogCache.addDecorations(id, sections, decorations, filtered);
      return filtered;
    }

    return cacheItem.filtered;
  }
}

export const jobLogContentProvider = new JobLogContentProvider();
