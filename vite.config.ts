import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

// After every production build, write the pre-rendered public pages, the app
// shell and the real 404 page (scripts/prerender.mjs). Runs inside Vite so it
// happens whether the host runs `vite build` or `npm run build`.
const prerenderPages = () => ({
  name: 'gid-prerender',
  apply: 'build' as const,
  async closeBundle() {
    const { prerender } = await import(pathToFileURL(resolve(__dirname, 'scripts/prerender.mjs')).href);
    console.log(`prerender: ${prerender(pathToFileURL(resolve(__dirname, 'dist') + '/')).join(', ')}`);
  },
});

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), prerenderPages()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});
