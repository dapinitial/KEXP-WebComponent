import { defineConfig } from 'vite';
import { resolve } from 'path';

// Builds the browser extension into dist-extension/.
// extension/public/ (manifest, background.js, icons) is copied verbatim;
// popup and offscreen pages are bundled with their shared component/engine.
export default defineConfig({
  root: 'extension',
  publicDir: 'public',
  build: {
    outDir: resolve(__dirname, 'dist-extension'),
    emptyOutDir: true,
    modulePreload: false,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'extension/popup.html'),
        offscreen: resolve(__dirname, 'extension/offscreen.html'),
        'background-ff': resolve(__dirname, 'extension/background-ff.html'),
      },
    },
  },
});
