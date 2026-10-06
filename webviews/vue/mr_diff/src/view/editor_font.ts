/**
 * The editor font settings of VS Code, which the host sends. Kept apart from the Monaco
 * runtime so the app can store them before Monaco loads.
 */
export interface EditorFont {
  fontFamily: string;
  fontSize: number;
  fontWeight: string;
  /** 0: derived from the font size; below 8: a multiple of it, as in VS Code */
  lineHeight: number;
  letterSpacing: number;
  fontLigatures: boolean | string;
  tabSize: number;
}

let font: EditorFont | undefined;

const listeners = new Set<() => void>();

export const editorFont = (): EditorFont | undefined => font;

export const setEditorFont = (next: EditorFont) => {
  font = next;
  listeners.forEach(listener => listener());
};

export const onEditorFontChange = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
