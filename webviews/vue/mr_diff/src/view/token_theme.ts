/**
 * The syntax colours of the active VS Code theme, which the host reads from the theme file.
 * Kept apart from the Monaco runtime so the app can store them before Monaco loads.
 */
export interface TokenRule {
  token: string;
  foreground?: string;
  fontStyle?: string;
}

let rules: TokenRule[] = [];

const listeners = new Set<() => void>();

export const tokenRules = (): TokenRule[] => rules;

export const setTokenRules = (next: TokenRule[]) => {
  rules = next;
  listeners.forEach(listener => listener());
};

export const onTokenRulesChange = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
