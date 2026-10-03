import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Everything (JS, CSS, logo) is inlined into dist/index.html: one
// self-contained file that web/server.mjs serves with a hash-pinned CSP (the
// same build also runs inside a Google Apps Script web app).
export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile()],
  build: {
    target: 'es2020',
    outDir: 'dist',
    emptyOutDir: true,
  },
});
