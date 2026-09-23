/// <reference types="vite/client" />

// Global type for the secure preload bridge (window.buildy.*).
// Type-only import: nothing from the preload is bundled into the renderer —
// TypeScript just derives the API shape from the single source of truth.
import type { BuildyAPI } from '../../preload/index'

declare global {
  interface Window {
    buildy: BuildyAPI
  }
}

export {}
