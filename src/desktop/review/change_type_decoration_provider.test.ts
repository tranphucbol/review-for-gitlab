import * as vscode from 'vscode';
import { changeTypeDecorationProvider, decorations } from './change_type_decoration_provider';
import { ADDED, DELETED, RENAMED, MODIFIED, CHANGE_TYPE_QUERY_KEY } from '../constants';
import { toReviewUri } from './review_uri';

describe('FileDecoratorProvider', () => {
  const commonParams = {
    path: './test',
    exists: true,
    mrId: 1,
    projectId: 1,
    repositoryRoot: '/',
  };

  describe.each`
    changeType  | decoration
    ${ADDED}    | ${decorations[ADDED]}
    ${DELETED}  | ${decorations[DELETED]}
    ${RENAMED}  | ${decorations[RENAMED]}
    ${MODIFIED} | ${decorations[MODIFIED]}
  `('Change type $changeType', ({ changeType, decoration }) => {
    it('decorates File urls', () => {
      const uri: vscode.Uri = vscode.Uri.file(`./test?${CHANGE_TYPE_QUERY_KEY}=${changeType}`);
      const { token } = new vscode.CancellationTokenSource();
      const returnValue = changeTypeDecorationProvider.provideFileDecoration(uri, token);

      expect(returnValue).toEqual(decoration);
    });
    it('decorates Review urls', () => {
      const uri: vscode.Uri = toReviewUri({ ...commonParams, change: changeType });
      const { token } = new vscode.CancellationTokenSource();
      const returnValue = changeTypeDecorationProvider.provideFileDecoration(uri, token);

      expect(returnValue).toEqual(decoration);
    });
  });
});
