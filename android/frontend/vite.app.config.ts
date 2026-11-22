import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// The frontend of the Tauri Android app (../app): only the phone app page, without the review page.
export default defineConfig({
  build: {
    outDir: 'dist-app',
    emptyOutDir: true,
    rollupOptions: { input: resolve(__dirname, 'index.html') },
  },
});
