/// <reference types="vite/client" />

// Global type for the secure preload bridge (window.mybuildy.*).
// Type-only import: nothing from the preload is bundled into the renderer —
// TypeScript just derives the API shape from the single source of truth.
import type { MyBuildyAPI } from '../../preload/index'

declare global {
  interface Window {
    mybuildy: MyBuildyAPI
  }
}

export {}
