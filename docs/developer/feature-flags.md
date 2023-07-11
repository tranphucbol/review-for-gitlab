---
stage: Create
group: Editor
info: To determine the technical writer assigned to the Stage/Group associated with this page, see https://about.gitlab.com/handbook/product/ux/technical-writing/#assignments
---

# Feature flags

Feature flags define a way to control unstable or experimental features of the extension. We use simple configuration object to define enabled feature flags.

## Enabling or disabling feature flag

Open your `settings.json` and add configuration property similar to example below:

```
"gitlab": {
    "featureFlags": {
        "snippets": true,
        "vulnerabilities": false
    }
}
```

## Working with feature flags while contributing to the extension

Example of checking feature flag state in the source code

```typescript
import { getExtensionConfiguration } from 'common/utils/extension_configuration';

if (getExtensionConfiguration().featureFlags['snippets']) {
  // snippets are enabled
}
```

Example of checking feature flag state in `package.json`

```
{
  "command": "gl.createSnippet",
  "when": "config.gitlab.featureFlags.snippets"
}
```
