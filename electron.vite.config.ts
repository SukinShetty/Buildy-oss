import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import { resolve } from 'path'

// Dev-only CSP relaxation (serve mode never ships): Vite HMR needs a websocket
// to the dev server (not covered by 'self', which is scheme-specific) and the
// React refresh preamble is an inline script. Production keeps the strict
// policy written in index.html: connect-src 'self', script-src 'self'.
function devCspPlugin(): Plugin {
  return {
    name: 'buildy-dev-csp',
    apply: 'serve',
    transformIndexHtml(html) {
      return html
        .replace(
          "connect-src 'self'",
          "connect-src 'self' ws://localhost:* ws://127.0.0.1:* http://localhost:* http://127.0.0.1:*"
        )
        .replace("script-src 'self'", "script-src 'self' 'unsafe-inline'")
    }
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        // bootstrap.ts is the REAL entry (named `index` so out/main/index.js
        // stays the package.json main). It applies the e2e userData override
        // and only then dynamically imports the app (src/main/index.ts), which
        // Rollup emits as a separate deferred chunk — guaranteeing the override
        // runs before any module reads app.getPath('userData') at import time.
        input: {
          index: resolve(__dirname, 'src/main/bootstrap.ts')
        },
        output: {
          // Keep the deferred app chunk NEXT TO index.js (not in chunks/…):
          // the app resolves preload/renderer/asset paths relative to
          // __dirname (join(__dirname, '../renderer/…')), which must stay
          // out/main for those to work.
          chunkFileNames: 'app-[name].js'
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    plugins: [react(), devCspPlugin()]
  }
})
