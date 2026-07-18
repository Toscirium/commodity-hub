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
  return `${base}.${minutesIntoDay}+${getGitCommit()}`;
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
    __APP_NAME__: JSON.stringify(pkg.name || "commodity-hub"),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    __BUILD_COMMIT__: JSON.stringify(getGitCommit()),
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
    sourcemap: false,
    minify: 'esbuild',
    rollupOptions: {
      external: ['@capacitor/app', '@capacitor/haptics'],
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
