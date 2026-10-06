import { mapUnchangedLine } from '../model/layout';
import type { DiffBlock, DiffSide } from '../model/types';
import { monaco } from './monaco_runtime';

/** A place in a pane, 1-based like Monaco. */
export interface CodePosition {
  side: DiffSide;
  line: number;
  column: number;
  /** the same line on the other side, when the line is unchanged */
  otherLine?: number;
}

export interface CodeRange {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

/** In the file under review on `side`, or in another file at `uri`. */
export type CodeLocation =
  | { side: DiffSide; range: CodeRange }
  | { uri: string; range: CodeRange; preview?: string };

export interface CodeHover {
  contents: string[];
  range?: CodeRange;
}

/** The host side: VS Code's language extensions, asked about the local file. */
export interface CodeNavigation {
  definitions(position: CodePosition): Promise<CodeLocation[]>;
  references(position: CodePosition): Promise<CodeLocation[]>;
  hover(position: CodePosition): Promise<CodeHover | undefined>;
  open(uri: string, line: number, column: number): void;
}

interface Panes {
  models: Record<DiffSide, monaco.editor.ITextModel>;
  editors: Record<DiffSide, monaco.editor.IStandaloneCodeEditor>;
  blocks: DiffBlock[];
}

const toMonacoRange = (range: CodeRange, lineShift = 0) =>
  new monaco.Range(
    range.startLine + lineShift,
    range.startColumn,
    range.endLine + lineShift,
    range.endColumn,
  );

const startOf = (selection: monaco.IRange | monaco.IPosition | null): monaco.IPosition =>
  selection && 'startLineNumber' in selection
    ? { lineNumber: selection.startLineNumber, column: selection.startColumn }
    : selection ?? { lineNumber: 1, column: 1 };

/**
 * Lends the panes the code navigation of VS Code: F12 and Ctrl/Cmd+click go to a
 * definition, Shift+F12 peeks at the references, and hovers show what the language
 * extension knows. A target in the
 * file under review stays in the panes; a target in another file opens in VS Code.
 */
export const registerCodeNavigation = (
  { models, editors, blocks }: Panes,
  navigation: CodeNavigation,
): monaco.IDisposable => {
  const sideOf = (model: monaco.editor.ITextModel): DiffSide | undefined =>
    (['old', 'new'] as DiffSide[]).find(side => models[side] === model);
  const codePosition = (side: DiffSide, position: monaco.Position): CodePosition => ({
    side,
    line: position.lineNumber,
    column: position.column,
    otherLine: mapUnchangedLine(blocks, side, position.lineNumber),
  });
  /** monaco URI string to the URI the host sent, which is the one it opens */
  const otherFiles = new Map<string, string>();
  const previews: monaco.editor.ITextModel[] = [];

  const toMonacoLocation = (from: DiffSide, location: CodeLocation): monaco.languages.Location => {
    if ('side' in location) {
      if (location.side === from)
        return { uri: models[from].uri, range: toMonacoRange(location.range) };
      // an unchanged line is also in the pane the request came from
      const line = mapUnchangedLine(blocks, location.side, location.range.startLine);
      return line === undefined
        ? { uri: models[location.side].uri, range: toMonacoRange(location.range) }
        : {
            uri: models[from].uri,
            range: toMonacoRange(location.range, line - location.range.startLine),
          };
    }
    const uri = monaco.Uri.parse(location.uri);
    otherFiles.set(uri.toString(), location.uri);
    // Ctrl+hover and the references peek preview a target from its model, so it gets one
    if (location.preview !== undefined && !monaco.editor.getModel(uri)) {
      previews.push(monaco.editor.createModel(location.preview, undefined, uri));
    }
    return { uri, range: toMonacoRange(location.range) };
  };

  const disposables = [
    monaco.languages.registerDefinitionProvider('*', {
      provideDefinition: async (model, position) => {
        const side = sideOf(model);
        if (!side) return undefined;
        const locations = await navigation.definitions(codePosition(side, position));
        return locations.map(location => toMonacoLocation(side, location));
      },
    }),
    // Ctrl/Cmd+click on a declaration falls back to its references, as in VS Code
    monaco.languages.registerReferenceProvider('*', {
      provideReferences: async (model, position) => {
        const side = sideOf(model);
        if (!side) return undefined;
        const locations = await navigation.references(codePosition(side, position));
        return locations.map(location => toMonacoLocation(side, location));
      },
    }),
    monaco.languages.registerHoverProvider('*', {
      provideHover: async (model, position) => {
        const side = sideOf(model);
        if (!side) return undefined;
        const hover = await navigation.hover(codePosition(side, position));
        if (!hover) return undefined;
        return {
          contents: hover.contents.map(value => ({ value })),
          range: hover.range && toMonacoRange(hover.range),
        };
      },
    }),
    monaco.editor.registerEditorOpener({
      openCodeEditor: (source, resource, selection) => {
        const fromSide = (['old', 'new'] as DiffSide[]).find(side => editors[side] === source);
        if (!fromSide || resource.toString() === models[fromSide].uri.toString()) return false;
        const position = startOf(selection ?? null);
        const toSide = (['old', 'new'] as DiffSide[]).find(
          side => models[side].uri.toString() === resource.toString(),
        );
        if (toSide) {
          const editor = editors[toSide];
          editor.setPosition(position);
          editor.revealPositionNearTop(position);
          editor.focus();
          return true;
        }
        const uri = otherFiles.get(resource.toString());
        if (!uri) return false;
        navigation.open(uri, position.lineNumber, position.column);
        return true;
      },
    }),
  ];

  return {
    dispose: () => {
      disposables.forEach(d => d.dispose());
      previews.forEach(model => model.dispose());
    },
  };
};
