import { resolve } from 'path';
import { defineConfig } from 'vite';

// Build for the Tauri menu-bar app: same source tree as the site,
// but the entry is tauri.html (hosts <audio-player> in the tray dropdown).
export default defineConfig({
  root: 'src',
  build: {
    outDir: '../dist-tauri',
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, 'src/tauri.html'),
    },
  },
  css: {
    modules: {
      scopeBehaviour: 'local',
      generateScopedName: '[name]__[local]___[hash:base64:5]',
    },
  },
});
