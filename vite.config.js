import { defineConfig } from 'vite';

export default defineConfig({
  // relative paths so the same build runs on the web, inside Electron and inside Capacitor
  base: './',
  build: {
    target: 'es2022', // top-level await in src/main.js
    chunkSizeWarningLimit: 1500,
  },
  server: { host: true },
});
