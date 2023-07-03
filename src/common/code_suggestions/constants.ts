export const AI_ASSISTED_CODE_SUGGESTIONS_API_URL =
  'https://codesuggestions.gitlab.com/v2/completions';
export const AI_ASSISTED_CODE_SUGGESTIONS_LINES_BELOW_CURSOR = 10;
export const AI_ASSISTED_CODE_SUGGESTIONS_CONFIG_NAMESPACE = 'gitlab.aiAssistedCodeSuggestions';
// this list matches predefined list in the model gateway
// https://gitlab.com/gitlab-org/modelops/applied-ml/code-suggestions/ai-assist/-/blob/main/codesuggestions/suggestions/prompt.py#L29-44
export const AI_ASSISTED_CODE_SUGGESTIONS_LANGUAGES = [
  'c',
  'cpp',
  'csharp',
  'go',
  'java',
  'javascript',
  'javascriptreact',
  'kotlin',
  'python',
  'php',
  'ruby',
  'rust',
  'scala',
  'swift',
  'typescript',
  'typescriptreact',
  // Following languages are not explicitly supported by the model gateway but we add them
  // to have at least some autocomplete
  // See https://gitlab.com/gitlab-org/gitlab-vscode-extension/-/issues/781 for details
  'erb',
  'haml',
  'handlebars',
  'svelte',
  'vue',
];
