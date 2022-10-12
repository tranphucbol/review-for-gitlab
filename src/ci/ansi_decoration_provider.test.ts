import * as vscode from 'vscode';
import { promises as fs } from 'fs';
import * as path from 'path';
import { AnsiDecorationProvider } from './ansi_decoration_provider';

describe('AnsiDecorationProvider', () => {
  it('returns ranges', async () => {
    const rawTrace = await fs.readFile(
      path.join(__dirname, '..', 'test_utils', 'raw_trace.log'),
      'utf-8',
    );
    const provider = new AnsiDecorationProvider();
    const { decorations } = await provider.provideDecorationsForPrettifiedAnsi(rawTrace);

    const expected = new vscode.Range(new vscode.Position(26, 0), new vscode.Position(26, 5));
    const values = [...decorations.values()];
    expect(values).toContainEqual([{ range: expected }]);
  });
});
