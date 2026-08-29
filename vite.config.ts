import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const getGitCommit = (): string => {
  try {
    return execSync("git rev-parse --short HEAD").toString().trim();
  } catch {
    return "unknown";
  }
};

const pkgPath = fileURLToPath(new URL("./package.json", import.meta.url));
const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as {
  name?: string;
  version?: string;
};

// Computed once at module load, not inside the defineConfig callback: Vite
// calls that callback repeatedly while resolving config (dep optimization,
// SSR, etc.), and a value that changes on every call (e.g. `new Date()`)
// makes Vite's config hash differ each time, which it interprets as "the
// config changed" — triggering a dependency re-optimization loop on every
// dev-server interaction instead of once at startup.
const GIT_COMMIT = getGitCommit();
const BUILD_TIME = new Date().toISOString();

// Build a meaningful, always-changing version even when package.json is
// pinned to 0.0.0 (Lovable does not bump package.json). Format:
//   <CalVer YY.MM.DD>.<build-counter>+<git-sha>
// CalVer changes daily, the build counter changes every build within a day
// (seconds-since-midnight / 60), and the git sha pins the exact source.
const buildVersion = (): string => {
  const now = new Date();
  const yy = String(now.getUTCFullYear()).slice(-2);
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  const minutesIntoDay = Math.floor(
    (now.getUTCHours() * 60) + now.getUTCMinutes()
  );
  const base =
    pkg.version && pkg.version !== "0.0.0"
      ? pkg.version
      : `${yy}.${mm}.${dd}`;
  return `${base}.${minutesIntoDay}+${GIT_COMMIT}`;
};

const APP_VERSION = buildVersion();

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
    // Product display name, NOT pkg.name — package.json is still the Lovable
    // scaffold's "vite_react_shadcn_ts", which was leaking onto the
    // user-facing About screen. Kept in sync with capacitor.config.ts's
    // appName by hand (two build systems, no shared source of truth).
    __APP_NAME__: JSON.stringify("Commodity Hub"),
    __BUILD_TIME__: JSON.stringify(BUILD_TIME),
    __BUILD_COMMIT__: JSON.stringify(GIT_COMMIT),
    __BUILD_MODE__: JSON.stringify(mode),
  },
  plugins: [
    react(),
    mode === 'development' &&
    componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    target: 'es2020',
    cssCodeSplit: true,
    // Back to false. The previous comment here justified `true` on the
    // premise that sourcemaps were "not served publicly ... this only ships
    // inside dist/, which becomes the Capacitor app bundle" — but dist/ is
    // also exactly what Vercel deploys, so that premise was wrong. Verified
    // against production: https://app.commodity-hub.eu/assets/<chunk>.js.map
    // returned HTTP 200 with full `sourcesContent`, publishing the original
    // TypeScript of 86 src/ files from the App chunk alone to anyone who
    // asked. (No credential exposure — the anon key is public by design —
    // but the whole codebase, which is not.)
    //
    // The crash-log readability it was meant to buy also had no consumer:
    // there is no Sentry/Crashlytics/Bugsnag in this project, so nothing
    // ever symbolicated anything. Meanwhile the maps cost 40MB inside the
    // APK (vs 18MB of actual JS).
    //
    // If a crash reporter is added later, the right setup is
    // `sourcemap: 'hidden'` plus uploading the maps to that service at
    // build time — never deploying them alongside the app.
    sourcemap: false,
    minify: 'esbuild',
    rollupOptions: {
      // NOTE: '@capacitor/app' and '@capacitor/haptics' used to be listed as
      // `external` here, inherited from the initial scaffold commit with no
      // stated reason. Externalizing a real npm package in a *browser* build
      // means Rollup emits the bare specifier verbatim — `import("@capacitor/app")`
      // — and a WebView cannot resolve a bare specifier without an import map,
      // so every dynamic import of them threw at runtime. Each call site
      // happened to wrap it in try/catch, so it failed silently: the About
      // screen's native version/build rows never populated, and
      // useAndroidBackButton's Capacitor listener never attached (masked by
      // its ionBackButton "Method 1" fallback). Both are ordinary bundled
      // dependencies; do not re-add them here.
      output: {
        manualChunks: {
          // Core React chunks
          'react-vendor': ['react', 'react-dom'],
          
          // Router chunk
          'router': ['react-router-dom'],
          
          // UI library chunks
          'ui-core': [
            '@radix-ui/react-dialog',
            '@radix-ui/react-dropdown-menu',
            '@radix-ui/react-toast',
            '@radix-ui/react-tooltip',
            '@radix-ui/react-select'
          ],
          'ui-extended': [
            '@radix-ui/react-accordion',
            '@radix-ui/react-tabs',
            '@radix-ui/react-popover',
            '@radix-ui/react-slider',
            '@radix-ui/react-switch'
          ],
          
          // Charts chunk (large dependency)
          'charts': ['recharts'],
          
          // Query client chunk
          'query': ['@tanstack/react-query'],
          
          // Utilities chunk
          'utils': [
            'date-fns',
            'clsx',
            'tailwind-merge',
            'class-variance-authority'
          ],
          
          // Supabase chunk
          'supabase': ['@supabase/supabase-js'],
          
          // Icons chunk
          'icons': ['lucide-react']
        }
      }
    },
    chunkSizeWarningLimit: 1000
  },
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-router-dom',
      '@tanstack/react-query',
      'lucide-react'
    ]
  }
}));
