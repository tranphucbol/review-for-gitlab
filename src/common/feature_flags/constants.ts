// Add your feature flag here
export enum FeatureFlag {
  SecurityScans = 'securityScansFlag',
}

// Set the feature flag default value here
export const FEATURE_FLAGS_DEFAULT_VALUES = {
  [FeatureFlag.SecurityScans]: true,
};
