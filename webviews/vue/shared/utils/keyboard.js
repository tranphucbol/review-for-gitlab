export const isMac = () => {
  const platform = window.navigator.userAgentData?.platform || window.navigator.platform || '';
  return /mac/i.test(platform);
};

/** the shortcut that submits a comment, as VS Code writes it on this platform */
export const submitShortcut = () => (isMac() ? '⌘+Enter' : 'Ctrl+Enter');
