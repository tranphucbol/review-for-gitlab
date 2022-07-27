const { Uri } = require('../test_utils/uri');
const { EventEmitter } = require('../test_utils/event_emitter');
const { FileType } = require('../test_utils/file_type');
const { FileSystemError } = require('../test_utils/file_system_error');

module.exports = {
  TreeItem: function TreeItem(labelOrUri, collapsibleState) {
    this.collapsibleState = collapsibleState;
    if (typeof labelOrUri === 'string') {
      this.label = labelOrUri;
    } else {
      this.resourceUri = labelOrUri;
    }
  },
  ThemeIcon: function ThemeIcon(id) {
    return { id };
  },
  EventEmitter,
  TreeItemCollapsibleState: {
    Collapsed: 'collapsed',
  },
  MarkdownString: function MarkdownString(value, supportThemeIcons) {
    this.value = value;
    this.supportThemeIcons = supportThemeIcons;
  },
  Uri,
  comments: {
    createCommentController: jest.fn(),
  },
  window: {
    showInformationMessage: jest.fn(),
    showWarningMessage: jest.fn(),
    showErrorMessage: jest.fn(),
    createStatusBarItem: jest.fn(),
    showInputBox: jest.fn(),
    showQuickPick: jest.fn(),
    withProgress: jest.fn().mockImplementation((opt, callback) => callback()),
    createQuickPick: jest.fn(),
  },
  commands: {
    executeCommand: jest.fn(),
    registerCommand: jest.fn(),
  },
  workspace: {
    getConfiguration: jest.fn().mockReturnValue({}),
    onDidOpenTextDocument: jest.fn(),
  },
  extensions: {
    getExtension: jest.fn(),
  },
  env: {
    uriScheme: 'vscode',
  },
  CommentMode: { Editing: 0, Preview: 1 },
  StatusBarAlignment: { Left: 0 },
  CommentThreadCollapsibleState: { Collapsed: 0, Expanded: 1 },
  Position: function Position(line, character) {
    return { line, character };
  },
  Range: function Range(start, end) {
    return { start, end };
  },
  CancellationTokenSource: jest.fn(),
  ThemeColor: jest.fn(color => color),
  ProgressLocation: {
    Notification: 'Notification',
  },
  FileType,
  FileSystemError,
};
