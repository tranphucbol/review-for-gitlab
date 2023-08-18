// Add your feature flag here
export enum FeatureFlag {
  // used for testing purposes
  TestFlag = 'testflag',
  SecurityScans = 'securityScansFlag',
  GitLabChat = 'chat',
  ForceCodeSuggestionsViaMonolith = 'forceCodeSuggestionsViaMonolith',
}

// Set the feature flag default value here
export const FEATURE_FLAGS_DEFAULT_VALUES = {
  [FeatureFlag.SecurityScans]: true,
  [FeatureFlag.GitLabChat]: false,
  [FeatureFlag.ForceCodeSuggestionsViaMonolith]: false,
  [FeatureFlag.TestFlag]: false,
};
