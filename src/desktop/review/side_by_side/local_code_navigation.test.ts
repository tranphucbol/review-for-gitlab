import * as vscode from 'vscode';
import {
  findLocalPosition,
  LocalCodeNavigation,
  PREVIEW_FILE_LIMIT,
  PREVIEW_LIMIT,
} from './local_code_navigation';
import { CodePosition } from './messages';

jest.mock('../../../common/log');

const texts = { old: 'a\nb\nc', new: 'a\nnew\nb\nc' };
const localUri = vscode.Uri.file('/repo/src/file.ts');
const otherUri = vscode.Uri.file('/repo/src/other.ts');
const range = (line: number, start: number, end: number) =>
  new vscode.Range(line, start, line, end);

const request = (overrides: Partial<CodePosition> = {}): CodePosition => ({
  side: 'new',
  line: 3,
  column: 2,
  ...overrides,
});

describe('findLocalPosition', () => {
  it('answers on the same line when the local file equals the pane', () => {
    expect(findLocalPosition(texts.new, texts, request())).toEqual({
      side: 'new',
      position: new vscode.Position(2, 1),
    });
  });

  it('ignores the line endings', () => {
    expect(findLocalPosition('a\r\nnew\r\nb\r\nc', texts, request())?.side).toBe('new');
  });

  it('answers through the other side for an unchanged line', () => {
    expect(findLocalPosition(texts.old, texts, request({ otherLine: 2 }))).toEqual({
      side: 'old',
      position: new vscode.Position(1, 1),
    });
  });

  it('does not answer for a changed line when the local file equals the other side', () => {
    expect(findLocalPosition(texts.old, texts, request({ line: 2 }))).toBeUndefined();
  });

  it('does not answer when the local file equals neither side', () => {
    expect(findLocalPosition('changed', texts, request({ otherLine: 2 }))).toBeUndefined();
  });
});

describe('LocalCodeNavigation', () => {
  let navigation: LocalCodeNavigation;
  let results: Record<string, unknown>;
  let documents: Record<string, string>;

  beforeEach(() => {
    navigation = new LocalCodeNavigation(localUri, texts);
    documents = { [localUri.toString()]: texts.new, [otherUri.toString()]: 'other file' };
    results = {};
    jest.mocked(vscode.workspace.openTextDocument).mockImplementation(async (uri: unknown) => {
      const text = documents[(uri as vscode.Uri).toString()];
      if (text === undefined) throw new Error('not found');
      return { getText: () => text } as vscode.TextDocument;
    });
    jest
      .mocked(vscode.commands.executeCommand)
      .mockImplementation(async (command: string) => results[command]);
  });

  describe('definitions', () => {
    it('asks the language extensions about the local file', async () => {
      results['vscode.executeDefinitionProvider'] = [];

      await navigation.definitions(request());

      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        'vscode.executeDefinitionProvider',
        localUri,
        new vscode.Position(2, 1),
      );
    });

    it('keeps a target in the local file on the side the local file equals', async () => {
      results['vscode.executeDefinitionProvider'] = [
        new vscode.Location(localUri, range(0, 4, 7)),
        {
          targetUri: otherUri,
          targetRange: range(9, 0, 20),
          targetSelectionRange: range(9, 6, 9),
        },
      ];

      expect(await navigation.definitions(request())).toEqual([
        { side: 'new', range: { startLine: 1, startColumn: 5, endLine: 1, endColumn: 8 } },
        {
          uri: otherUri.toString(),
          range: { startLine: 10, startColumn: 7, endLine: 10, endColumn: 10 },
          preview: 'other file',
        },
      ]);
    });

    it('sends the text of a target in another file for the preview', async () => {
      results['vscode.executeDefinitionProvider'] = [new vscode.Location(otherUri, range(0, 0, 5))];

      const [location] = await navigation.definitions(request());

      expect(location).toMatchObject({ uri: otherUri.toString(), preview: 'other file' });
    });

    it('sends no preview of a large file', async () => {
      documents[otherUri.toString()] = 'x'.repeat(PREVIEW_LIMIT + 1);
      results['vscode.executeDefinitionProvider'] = [new vscode.Location(otherUri, range(0, 0, 5))];

      const [location] = await navigation.definitions(request());

      expect(location).not.toHaveProperty('preview');
    });

    it('answers nothing when the local file has other content', async () => {
      documents[localUri.toString()] = 'changed';

      expect(await navigation.definitions(request())).toEqual([]);
      expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
    });
  });

  describe('references', () => {
    it('asks the language extensions for the references in the local file', async () => {
      results['vscode.executeReferenceProvider'] = [
        new vscode.Location(localUri, range(2, 1, 4)),
        new vscode.Location(otherUri, range(4, 2, 5)),
        new vscode.Location(otherUri, range(8, 2, 5)),
      ];

      const locations = await navigation.references(request());

      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        'vscode.executeReferenceProvider',
        localUri,
        new vscode.Position(2, 1),
      );
      expect(locations).toEqual([
        { side: 'new', range: { startLine: 3, startColumn: 2, endLine: 3, endColumn: 5 } },
        {
          uri: otherUri.toString(),
          range: { startLine: 5, startColumn: 3, endLine: 5, endColumn: 6 },
          preview: 'other file',
        },
        {
          uri: otherUri.toString(),
          range: { startLine: 9, startColumn: 3, endLine: 9, endColumn: 6 },
          preview: 'other file',
        },
      ]);
    });

    it('sends no previews when the references are in too many files', async () => {
      results['vscode.executeReferenceProvider'] = Array.from(
        { length: PREVIEW_FILE_LIMIT + 1 },
        (_, i) => new vscode.Location(vscode.Uri.file(`/repo/src/f${i}.ts`), range(0, 0, 1)),
      );

      const locations = await navigation.references(request());

      expect(locations).toHaveLength(PREVIEW_FILE_LIMIT + 1);
      expect(locations.some(location => 'preview' in location)).toBe(false);
      expect(vscode.workspace.openTextDocument).toHaveBeenCalledTimes(1);
    });
  });

  describe('hover', () => {
    it('turns every kind of content into markdown', async () => {
      results['vscode.executeHoverProvider'] = [
        new vscode.Hover([new vscode.MarkdownString('**doc**'), 'plain']),
        new vscode.Hover({ language: 'ts', value: 'const a: number' }),
      ];

      expect(await navigation.hover(request())).toEqual({
        contents: ['**doc**', 'plain', '```ts\nconst a: number\n```'],
      });
    });

    it('puts the range on the requested line when the other side answered', async () => {
      documents[localUri.toString()] = texts.old;
      results['vscode.executeHoverProvider'] = [new vscode.Hover('doc', range(1, 0, 1))];

      const hover = await navigation.hover(request({ otherLine: 2 }));

      expect(hover?.range).toEqual({ startLine: 3, startColumn: 1, endLine: 3, endColumn: 2 });
    });

    it('answers nothing without content', async () => {
      results['vscode.executeHoverProvider'] = [];

      expect(await navigation.hover(request())).toBeUndefined();
    });
  });

  describe('open', () => {
    it('opens a target in another file from the last answer', async () => {
      results['vscode.executeDefinitionProvider'] = [new vscode.Location(otherUri, range(0, 0, 5))];
      await navigation.definitions(request());

      await navigation.open(otherUri.toString(), 10, 7);

      expect(vscode.window.showTextDocument).toHaveBeenCalledWith(
        vscode.Uri.parse(otherUri.toString()),
        { selection: new vscode.Range(new vscode.Position(9, 6), new vscode.Position(9, 6)) },
      );
    });

    it('still opens a target of an earlier answer', async () => {
      results['vscode.executeReferenceProvider'] = [new vscode.Location(otherUri, range(0, 0, 5))];
      await navigation.references(request());
      results['vscode.executeDefinitionProvider'] = [];
      await navigation.definitions(request());

      await navigation.open(otherUri.toString(), 1, 1);

      expect(vscode.window.showTextDocument).toHaveBeenCalled();
    });

    it('opens nothing that was not an answer', async () => {
      await navigation.open('file:///etc/passwd', 1, 1);

      expect(vscode.window.showTextDocument).not.toHaveBeenCalled();
    });
  });
});
