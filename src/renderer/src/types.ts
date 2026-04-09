// types.ts
// Shared TypeScript interfaces used across the renderer, preload, and main process.
// This file is the contract — if you change a shape here, update the corresponding
// IPC handler and any consumer.

// ─── Project Memory ───────────────────────────────────────────────────────────

export type ExplanationStyle = 'very_simple' | 'balanced' | 'technical'

export interface ProjectMemory {
  projectName: string
  productSummary: string
  targetUser: string
  coreProblem: string
  completedFeatures: string[]
  missingFeatures: string[]
  activeBlockers: string[]
  explanationStyle: ExplanationStyle
  brainstormSummary: string   // Extracted from the brainstorm chat
  createdAt: string           // ISO date string
  updatedAt: string
}

export function emptyProjectMemory(): ProjectMemory {
  const now = new Date().toISOString()
  return {
    projectName: '',
    productSummary: '',
    targetUser: '',
    coreProblem: '',
    completedFeatures: [],
    missingFeatures: [],
    activeBlockers: [],
    explanationStyle: 'very_simple',
    brainstormSummary: '',
    createdAt: now,
    updatedAt: now,
  }
}

// ─── Settings ─────────────────────────────────────────────────────────────────

export interface AppSettings {
  // One of apiKey or proxyUrl must be set for analysis to work
  anthropicApiKey: string      // Direct Anthropic API key (stored in local settings)
  proxyUrl: string             // Optional: Cloudflare Worker URL (overrides apiKey if set)
  useProxy: boolean            // If true, send requests to proxyUrl instead of Anthropic directly
  autoAnalysisIntervalSeconds: number  // How often to auto-analyze (default: 30)
}

export function defaultSettings(): AppSettings {
  return {
    anthropicApiKey: '',
    proxyUrl: '',
    useProxy: false,
    autoAnalysisIntervalSeconds: 30,
  }
}

// ─── Screen Capture ───────────────────────────────────────────────────────────

export interface WindowSource {
  id: string              // desktopCapturer source ID
  name: string            // Window title / application name
  thumbnailBase64: string // JPEG thumbnail for the window picker UI
  isClaudeCode: boolean   // true if Buildy auto-detected this as Claude Code
}

export interface CaptureResult {
  imageBase64: string          // JPEG screenshot for Claude vision
  windowTitle: string
  sourceId: string
  wasClaudeCodeAutoDetected: boolean
  capturedAt: string           // ISO date string
}

// ─── Analysis ─────────────────────────────────────────────────────────────────

// The exact JSON shape Claude must return for screen analysis.
// Keep this in sync with the system prompt in claude-bridge.ts.
export interface AnalysisResult {
  claudeCodeVisible: boolean
  whatIsHappening: string           // Plain language: what Claude Code is doing right now
  whatItMeans: string               // Why this matters for the product
  whatIsBuilt: string[]             // Features/things that appear to be done
  whatIsMissing: string[]           // Features/things still needed
  whatIsBroken: string[]            // Errors, failures, broken things
  whereUserIsStuck: string | null   // If the user appears stuck, describe it; else null
  bestNextMove: string              // One clear sentence: what to do right now
  nextPromptForClaudeCode: string   // Exact prompt to copy-paste into Claude Code
  builderNote: string               // Encouraging, buddy-style note from Buildy
  analyzedAt: string                // ISO date string
  analysisDurationMs: number
}

// ─── Brainstorm Chat ──────────────────────────────────────────────────────────

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: string  // ISO date string
}

// Extracted structured project data after the brainstorm conversation concludes
export interface ExtractedProjectData {
  projectName: string
  productSummary: string
  targetUser: string
  coreProblem: string
  brainstormSummary: string
}

// ─── IPC Channel Names ────────────────────────────────────────────────────────
// Centralized so typos don't cause silent failures.

export const IPC = {
  LIST_WINDOWS:        'buildy:list-windows',
  CAPTURE_WINDOW:      'buildy:capture-window',
  ANALYZE:             'buildy:analyze',
  BRAINSTORM_START:    'buildy:brainstorm-start',
  BRAINSTORM_CHUNK:    'buildy:brainstorm-chunk',    // main → renderer push
  BRAINSTORM_DONE:     'buildy:brainstorm-done',     // main → renderer push
  BRAINSTORM_ERROR:    'buildy:brainstorm-error',    // main → renderer push
  LOAD_PROJECT:        'buildy:load-project',
  SAVE_PROJECT:        'buildy:save-project',
  LOAD_SETTINGS:       'buildy:load-settings',
  SAVE_SETTINGS:       'buildy:save-settings',
} as const
