import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const root = import.meta.dirname;

// Content scripts cannot be ES modules, so the banner is bundled on its own as
// a single self-executing file appended to the main build output.
export default defineConfig({
  publicDir: false,
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    target: 'chrome123',
    sourcemap: true,
    lib: {
      entry: resolve(root, 'src/content/banner.ts'),
      formats: ['iife'],
      name: 'EnvironautBanner',
      fileName: () => 'content/banner.js',
    },
  },
});
