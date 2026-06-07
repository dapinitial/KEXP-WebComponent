import { resolve } from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src',
  build: {
    outDir: '../dist',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'src/index.html'),
        privacy: resolve(__dirname, 'src/privacy/index.html'),
      },
    },
  },
  css: {
    modules: {
      scopeBehaviour: 'local', // Default
      generateScopedName: '[name]__[local]___[hash:base64:5]', // Scoped naming
    },
  },
  server: {
    headers: {
      'Cache-Control': 'no-store, no-cache, max-age=0, must-revalidate, proxy-revalidate',
    },
  },
});