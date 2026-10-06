import { defineConfig } from 'vite';
import buildConfigForWebview from '../vite.config.shared';

const config = buildConfigForWebview('mr_diff');

export default defineConfig({
  ...config,
  build: {
    ...config.build,
    // the codicon font must be a data URL; the CSS cannot reach a file next to it
    assetsInlineLimit: 128 * 1024,
    // Monaco's CSS nests selectors; every VS Code from engines.vscode on runs Chromium 114+
    cssTarget: 'chrome114',
    // Monaco alone is ~3 MB minified and is loaded from disk, not the network
    chunkSizeWarningLimit: 4096,
    rollupOptions: {
      ...config.build.rollupOptions,
      output: {
        ...config.build.rollupOptions.output,
        // the webview loads exactly one script, so Monaco's lazy language chunks are inlined
        inlineDynamicImports: true,
      },
    },
  },
});
