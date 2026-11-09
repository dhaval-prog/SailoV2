import { defineConfig } from 'vite';

export default defineConfig({
  // relative paths so the same build runs on the web, inside Electron and inside Capacitor
  base: './',
  build: {
    target: 'es2022', // top-level await in src/main.js
    chunkSizeWarningLimit: 1500,
    // two pages: the sea (index.html) and the Drive mode on the city's roads (drive.html)
    rollupOptions: { input: { main: 'index.html', drive: 'drive.html' } },
  },
  server: { host: true },
});
