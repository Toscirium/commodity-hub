import { defineConfig } from 'vite';
import { resolve } from 'path';
import { copyFileSync, mkdirSync } from 'fs';

/**
 * Builds ONE entry per invocation, selected by ADDIN_ENTRY, because the two
 * bundles must be completely self-contained:
 *
 *   functions.js — loaded directly by Excel's custom-functions runtime
 *   taskpane.js  — loaded as a module by the visible task pane
 *
 * Building both in a single Rollup pass makes it hoist shared code (the API
 * client) into a third chunk, leaving `functions.js` with a bare
 * `import "./api.js"`. Excel's functions runtime is not a reliable ES-module
 * loader, and when it fails to resolve that import the only symptom is
 * #NAME? in every cell — no console, no error. So each entry gets its own
 * build with everything inlined.
 *
 * Driven by `npm run build:addin`, which runs this twice.
 */
const ENTRIES = {
  functions: resolve(__dirname, 'src/functions/index.ts'),
  taskpane: resolve(__dirname, 'src/taskpane/taskpane.ts'),
} as const;

type EntryName = keyof typeof ENTRIES;

const entry = (process.env.ADDIN_ENTRY ?? 'functions') as EntryName;
if (!(entry in ENTRIES)) {
  throw new Error(`ADDIN_ENTRY must be one of: ${Object.keys(ENTRIES).join(', ')}`);
}

// Only the first build clears the directory; the second must not wipe it.
const isFirst = entry === 'functions';

export default defineConfig({
  root: __dirname,
  build: {
    outDir: 'dist',
    emptyOutDir: isFirst,
    // Office runtimes are Chromium-based, but older Excel desktop builds can
    // lag; es2019 is a safe floor that still allows native async/await.
    target: 'es2019',
    lib: {
      entry: ENTRIES[entry],
      formats: ['iife'],
      name: entry === 'functions' ? 'CommodityHubFunctions' : 'CommodityHubTaskpane',
      // No content hash: manifest.xml references these by exact filename, and
      // a hashed name would break every already-sideloaded install on deploy.
      fileName: () => `${entry}.js`,
    },
    rollupOptions: {
      output: { inlineDynamicImports: true },
    },
  },
  plugins: [
    {
      name: 'copy-static',
      closeBundle() {
        // Static assets only need copying once.
        if (entry !== 'taskpane') return;
        const out = resolve(__dirname, 'dist');
        mkdirSync(out, { recursive: true });
        for (const f of ['functions.html', 'taskpane.html', 'commands.html', 'taskpane.css', 'manifest.xml']) {
          copyFileSync(resolve(__dirname, f), resolve(out, f));
        }
        // Function metadata must sit beside the bundle at the URL the
        // manifest declares.
        copyFileSync(
          resolve(__dirname, 'src/functions/functions.json'),
          resolve(out, 'functions.json'),
        );
      },
    },
  ],
});
