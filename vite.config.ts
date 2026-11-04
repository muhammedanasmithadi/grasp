import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5176,
    open: true,
    // Browser code calls /api on its own origin only. The dev proxy
    // forwards to the local Grasp server (server/index.mjs), which
    // holds the Meta key. Never point the browser at the provider.
    proxy: {
      '/api': 'http://localhost:8787',
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
