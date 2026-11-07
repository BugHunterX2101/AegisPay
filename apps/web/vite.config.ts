import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// The built app is served as static files by the API (same origin, so the session cookie and CSRF need no CORS).
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: fileURLToPath(new URL('../api/public', import.meta.url)),
    emptyOutDir: true,
    chunkSizeWarningLimit: 4000,
  },
  server: { port: 5173, proxy: { '/api': 'http://localhost:3000' } },
});
