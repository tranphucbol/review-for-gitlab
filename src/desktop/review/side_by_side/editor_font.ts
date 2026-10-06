import * as vscode from 'vscode';
import { EditorFont } from './messages';

const FONT_SETTINGS = [
  'fontFamily',
  'fontSize',
  'fontWeight',
  'lineHeight',
  'letterSpacing',
  'fontLigatures',
  'tabSize',
];

/** The `editor.*` settings that decide how the code editors draw text. */
export const getEditorFont = (): EditorFont => {
  const config = vscode.workspace.getConfiguration('editor');
  const get = <T>(key: string, fallback: T): T => config?.get?.<T>(key) ?? fallback;
  return {
    fontFamily: get('fontFamily', ''),
    fontSize: get('fontSize', 0),
    fontWeight: String(get<string | number>('fontWeight', 'normal')),
    lineHeight: get('lineHeight', 0),
    letterSpacing: get('letterSpacing', 0),
    fontLigatures: get<boolean | string>('fontLigatures', false),
    tabSize: get('tabSize', 4),
  };
};

export const affectsEditorFont = (e: vscode.ConfigurationChangeEvent): boolean =>
  FONT_SETTINGS.some(key => e.affectsConfiguration(`editor.${key}`));
