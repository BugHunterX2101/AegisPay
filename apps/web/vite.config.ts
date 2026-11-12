import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';

// The two faces above the fold. Their file names are hashed at build time, so the preload links are written from the bundle.
const PRELOAD_FONTS = ['schibsted-grotesk-latin-wght-normal', 'bodoni-moda-latin-wght-normal'];

function preloadFonts(): Plugin {
  return {
    name: 'aegis-preload-fonts',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        const files = Object.keys(ctx.bundle ?? {});
        return PRELOAD_FONTS.flatMap((name) => {
          const file = files.find((f) => f.includes(name) && f.endsWith('.woff2'));
          return file ? [{ tag: 'link', injectTo: 'head-prepend' as const, attrs: { rel: 'preload', as: 'font', type: 'font/woff2', crossorigin: '', href: `/${file}` } }] : [];
        });
      },
    },
  };
}

// The built app is served as static files by the API (same origin, so the session cookie and CSRF need no CORS).
export default defineConfig({
  plugins: [react(), preloadFonts()],
  // The repo keeps one `.env` at its root. Vite only exposes `VITE_`-prefixed names to the bundle, so reading it from
  // there brings in VITE_AG_GRID_LICENSE_KEY (no watermark on local builds) and nothing secret.
  envDir: fileURLToPath(new URL('../..', import.meta.url)),
  build: {
    outDir: fileURLToPath(new URL('../api/public', import.meta.url)),
    emptyOutDir: true,
    chunkSizeWarningLimit: 4000,
  },
  server: { port: 5173, proxy: { '/api': 'http://localhost:3000' } },
});
