import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'

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
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    plugins: [react(), devCspPlugin()]
  }
})
