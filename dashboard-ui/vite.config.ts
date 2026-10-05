import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

/**
 * shared/Logic.js and dashboard/src/Config.js are plain scripts shared with
 * Google Apps Script and the Node server (they end with an optional
 * `module.exports`). This wraps them as ES modules so the demo can run the very
 * same business logic in the browser.
 */
function sharedScripts(): Plugin {
  return {
    name: 'itn-shared-scripts',
    transform(code, id) {
      if (!/[\\/](shared[\\/]Logic|dashboard[\\/]src[\\/]Config)\.js$/.test(id)) return null;
      return { code: `var module = { exports: {} };\n${code}\nexport default module.exports;\n`, map: null };
    },
  };
}

// Everything (JS, CSS, logo) is inlined into dist/index.html: one
// self-contained file that web/server.mjs serves with a hash-pinned CSP (the
// same build also runs inside a Google Apps Script web app). `--mode demo`
// builds the stakeholder demo (fictional data, mock login; see README).
export default defineConfig({
  plugins: [sharedScripts(), react(), tailwindcss(), viteSingleFile()],
  server: { fs: { allow: ['..'] } },
  build: {
    target: 'es2020',
    outDir: 'dist',
    emptyOutDir: true,
  },
});
