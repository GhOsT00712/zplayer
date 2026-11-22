import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// Two pages: index.html is the phone app itself (open it at phone size, or on a phone);
// review.html shows it in a 412 x 892 frame with the review panel beside it.
export default defineConfig({
  build: {
    rollupOptions: { input: { app: resolve(__dirname, 'index.html'), review: resolve(__dirname, 'review.html') } },
  },
});
