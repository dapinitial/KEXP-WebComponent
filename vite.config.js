import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src',
  build: {
    outDir: '../dist',
  },
  css: {
    modules: {
      scopeBehaviour: 'local', // Default
      generateScopedName: '[name]__[local]___[hash:base64:5]', // Scoped naming
    },
  },
});