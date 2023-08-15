import { getExtensionConfiguration } from '../utils/extension_configuration';
import { FEATURE_FLAGS_DEFAULT_VALUES, FeatureFlag } from './constants';

export { FeatureFlag } from './constants';

export function isEnabled(feature: FeatureFlag): boolean {
  const featureFlagUserPreferences = getExtensionConfiguration().featureFlags;

  return { ...FEATURE_FLAGS_DEFAULT_VALUES, ...featureFlagUserPreferences }[feature];
}
