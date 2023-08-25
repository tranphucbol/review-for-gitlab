import { fileURLToPath, URL } from 'node:url';

import vue2 from '@vitejs/plugin-vue2';

export default function buildConfigForWebview(name) {
  return {
    plugins: [vue2()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    root: `./${name}`,
    build: {
      // TODO: split the config into dev and prod versions and enable inline sourcemaps in the dev
      // you can set sourcemaps to 'inline' for webview debugging
      // sourcemap: 'inline',
      // Can be achieved by supplying the `isProd` argument to buildConfigForWebview
      sourcemap: false,
      rollupOptions: {
        input: `${name}/index.html`,
        output: {
          dir: 'dist',
          entryFileNames: `${name}/assets/app.js`,
          assetFileNames: `${name}/assets/[name].[ext]`,
        },
      },
      emptyOutDir: false,
    },
  };
}
