// Add your feature flag here
export enum FeatureFlag {
  // used for testing purposes
  TestFlag = 'testflag',
  SecurityScans = 'securityScansFlag',
  ForceCodeSuggestionsViaMonolith = 'forceCodeSuggestionsViaMonolith',
  LanguageServer = 'languageServer',
  LanguageServerWebIDE = 'languageServerWebIDE',
  CodeSuggestionsClientDirectToGateway = 'codeSuggestionsClientDirectToGateway',
  StreamCodeGenerations = 'streamCodeGenerations',
  ChatStreaming = 'chatStreaming',
}

// Set the feature flag default value here
export const FEATURE_FLAGS_DEFAULT_VALUES = {
  [FeatureFlag.SecurityScans]: true,
  [FeatureFlag.ForceCodeSuggestionsViaMonolith]: false,
  [FeatureFlag.TestFlag]: false,
  [FeatureFlag.LanguageServer]: true,
  [FeatureFlag.CodeSuggestionsClientDirectToGateway]: false,
  [FeatureFlag.LanguageServerWebIDE]: false,
  [FeatureFlag.StreamCodeGenerations]: false,
  [FeatureFlag.ChatStreaming]: false,
};
