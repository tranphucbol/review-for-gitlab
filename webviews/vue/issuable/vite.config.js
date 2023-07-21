import { fileURLToPath, URL } from 'node:url';

import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    vue({
      template: {
        compilerOptions: {
          compatConfig: {
            MODE: 2,
          },
        },
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      vue: '@vue/compat',
    },
  },
  build: {
    // TODO: split the config into dev and prod versions and enable inline sourcemaps in the dev
    // you can set sourcemaps to 'inline' for webview debugging
    // sourcemap: 'inline',
    sourcemap: false,
    rollupOptions: {
      input: 'issuable/index.html',
      output: {
        entryFileNames: `issuable/assets/app.js`,
        assetFileNames: `issuable/assets/[name].[ext]`,
      },
    },
  },
});
