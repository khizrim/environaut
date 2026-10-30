import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const root = import.meta.dirname;

// Popup, options page and the service worker. The content script is built
// separately (vite.config.content.ts) because content scripts must be classic
// scripts, while the service worker is an ES module.
export default defineConfig({
  plugins: [react()],
  publicDir: resolve(root, 'public'),
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'chrome123',
    sourcemap: true,
    rollupOptions: {
      input: {
        popup: resolve(root, 'popup.html'),
        options: resolve(root, 'options.html'),
        'service-worker': resolve(root, 'src/background/service-worker.ts'),
      },
      output: {
        // The manifest points at a fixed service worker path, so that one entry
        // may not be hashed.
        entryFileNames: (chunk) =>
          chunk.name === 'service-worker' ? 'service-worker.js' : 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        manualChunks: (id) => (id.includes('node_modules') ? 'vendor' : undefined),
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
});
