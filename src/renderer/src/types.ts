// types.ts
// Shared TypeScript interfaces used across the renderer, preload, and main process.
// This file is the contract — if you change a shape here, update the corresponding
// IPC handler and any consumer.

// ─── Project Memory ───────────────────────────────────────────────────────────

export type ExplanationStyle = 'very_simple' | 'balanced' | 'technical'

// ─── Goal ───────────────────────────────────────────────────────────────────
// The user's stated purpose for what they're building. Every analysis is judged
// against this so the user knows whether each step moves them toward the goal.

export interface Goal {
  purpose: string            // the main "what are you building" answer
  audience?: string          // "Who is this for?"
  mostImportant?: string     // "single most important thing it should do"
  successCriteria?: string   // "what does success look like in one month"
  createdAt: string          // ISO timestamp
  lastReviewedAt?: string    // when the goal was last shown to / reviewed by the user
}

export function emptyGoal(): Goal {
  const now = new Date().toISOString()
  return { purpose: '', createdAt: now, lastReviewedAt: now }
}

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
  goal: Goal | null           // The user's stated goal (null until set; skipping leaves it null)
  goalPromptSeen: boolean      // true once the user has set OR skipped the goal prompt
  createdAt: string           // ISO date string
  updatedAt: string
  // Compact project-memory context (from the Nemp bridge) injected into the
  // analysis system prompt. Optional + transient — not persisted to disk.
  memoryContext?: string
}

// ─── Nemp Memory layer (loop engineering Block 2) ─────────────────────────────
// A single flat memory entry, mirroring Nemp's on-disk Memory shape.

export interface MemoryEntry {
  key: string
  value: string
  tags: string[]
  timestamp: string  // ISO
  source: string
}

// Structured view of memory for the Memory screen.
export interface MemorySnapshot {
  goal: Goal | null
  completed: MemoryEntry[]
  inProgress: MemoryEntry[]
  blockersOpen: MemoryEntry[]
  blockersResolved: MemoryEntry[]
  decisions: MemoryEntry[]
  patterns: MemoryEntry[]
  recent: MemoryEntry[]
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
    goal: null,
    goalPromptSeen: false,
    createdAt: now,
    updatedAt: now,
  }
}

// ─── AI Provider ──────────────────────────────────────────────────────────────

export type ProviderType =
  | 'anthropic'
  | 'openai'
  | 'gemini'
  | 'openrouter'
  | 'ollama'
  | 'lmstudio'
  | 'custom'

// ─── Settings ─────────────────────────────────────────────────────────────────
// SECURITY: API keys are secrets. They live ONLY in the main process (encrypted via
// secure-store) and are never sent to the renderer. The renderer holds RedactedSettings
// (non-secret fields + has* booleans). `AppSettings` is the MAIN-internal full shape
// with secrets injected at call time — it must never cross IPC to the renderer.

// Names of the encrypted secrets managed by the main-process secure store.
export type SecretName =
  | 'anthropicApiKey'
  | 'openaiApiKey'
  | 'geminiApiKey'
  | 'openrouterApiKey'
  | 'customApiKey'
  | 'elevenLabsApiKey'

// Non-secret settings — persisted to disk and safe to accept from / send to the renderer.
export interface NonSecretSettings {
  provider: ProviderType         // Which AI provider to use
  modelId: string                // Model identifier (e.g. "claude-sonnet-4-6", "gpt-4o")
  baseUrl: string                // Base URL — used by ollama, lmstudio, custom, openrouter
  autoAnalysisIntervalSeconds: number
  elevenLabsVoiceId: string      // ElevenLabs voice ID (default: Rachel — warm, friendly)
}

// MAIN-internal full settings: non-secret fields + secrets injected from secure-store.
// NEVER serialize this to the renderer.
export interface AppSettings extends NonSecretSettings {
  apiKey: string                 // resolved from secure-store for the active provider
  elevenLabsApiKey: string       // resolved from secure-store
}

// What the renderer receives/holds: non-secret settings + which secrets are set.
// Only booleans — never the secret values.
export interface RedactedSettings extends NonSecretSettings {
  hasApiKey: boolean             // a key for the SELECTED provider exists (convenience)
  hasElevenLabsKey: boolean      // an ElevenLabs key exists in secure-store
  secretFlags: Partial<Record<SecretName, boolean>>  // per-secret existence (for the UI)
}

const DEFAULT_VOICE_ID = '21m00Tcm4TlvDq8ikWAM' // Rachel — warm, conversational

export function defaultNonSecretSettings(): NonSecretSettings {
  return {
    provider: 'anthropic',
    modelId: 'claude-opus-4-7',
    baseUrl: '',
    autoAnalysisIntervalSeconds: 30,
    elevenLabsVoiceId: DEFAULT_VOICE_ID,
  }
}

export function defaultSettings(): AppSettings {
  return { ...defaultNonSecretSettings(), apiKey: '', elevenLabsApiKey: '' }
}

export function defaultRedactedSettings(): RedactedSettings {
  return { ...defaultNonSecretSettings(), hasApiKey: false, hasElevenLabsKey: false, secretFlags: {} }
}

// ─── Screen Capture ───────────────────────────────────────────────────────────

export interface WindowSource {
  id: string              // desktopCapturer source ID
  name: string            // Window title / application name
  thumbnailBase64: string // low-res JPEG thumbnail for the window picker UI
}

export interface CaptureResult {
  imageBase64: string          // JPEG screenshot for Claude vision
  windowTitle: string
  sourceId: string
  capturedAt: string           // ISO date string
}

// Result of a manual capture request. There is NO full-screen fallback: if the
// selected window is missing, capture halts with a reason so the app can prompt
// for reselection instead of sending the whole desktop to a provider.
export type CaptureOutcome =
  | { ok: true; capture: CaptureResult }
  | { ok: false; reason: 'no-source' | 'window-missing' }

// ─── Analysis ─────────────────────────────────────────────────────────────────

// The exact JSON shape the AI must return for screen analysis.
// Keep this in sync with the system prompt in prompt-builder.ts.
// NOTE: Screen-agnostic — works for any watched window, not just Claude Code.

// How the current activity relates to the user's goal.
export type GoalAlignment = 'on-track' | 'drift' | 'blocked'

export interface AnalysisResult {
  screenContentVisible: boolean
  whatIsHappening: string           // Plain language: what's happening on screen right now
  whatItMeans: string               // Why this matters for the product
  whatIsBuilt: string[]             // Features/things that appear to be done
  whatIsMissing: string[]           // Features/things still needed
  whatIsBroken: string[]            // Errors, failures, broken things
  whereUserIsStuck: string | null   // If the user appears stuck, describe it; else null
  bestNextMove: string              // One clear sentence: what to do right now
  nextPrompt: string                // Suggested next prompt or action
  builderNote: string               // Encouraging, buddy-style note from Buildy
  // Goal alignment — present only when the user has set a goal (see Goal type).
  goalAlignment?: GoalAlignment | null
  alignmentNote?: string            // One-sentence plain-English reason for the alignment judgment
  // One sentence: what Buildy currently understands the user is building (memory + screen).
  projectUnderstandingNote?: string
  // True only for a NEW, fundamentally different blocker. When true the voice
  // queue truncates after the current chunk so the alert is spoken next.
  isCriticalOverride?: boolean
  analyzedAt: string                // ISO date string
  analysisDurationMs: number
}

// ─── Guidance panel ───────────────────────────────────────────────────────────
// The guidance panel lives in its own floating window (separate from the mascot
// window) so guidance content can never overflow or push the mascot out of view.
// The companion forwards either an analysis result or a spoken-question answer.

export interface QuestionAnswer {
  question: string
  answer: string
}

export type GuidancePayload =
  | { kind: 'analysis'; analysis: AnalysisResult }
  | { kind: 'answer'; answer: QuestionAnswer }
  | { kind: 'message'; message: string }   // plain notice (e.g. "No guidance yet")

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
  GET_PROVIDER_INFOS:  'buildy:get-provider-infos',  // renderer → main (provider metadata)
  TEST_CONNECTION:     'buildy:test-connection',     // renderer → main (connectivity check)
  COMPANION_ANALYSIS:  'buildy:companion-analysis',  // main → companion (new analysis result)
  COMPANION_STATE:     'buildy:companion-state',     // main → companion (idle/thinking/speaking)
  COMPANION_SPEAK:     'buildy:companion-speak',     // main → companion (trigger voice)
  COMPANION_START:     'buildy:companion-start',     // renderer → main (start watching)
  COMPANION_STOP:      'buildy:companion-stop',      // renderer → main (stop watching)
  COMPANION_PAUSE:     'buildy:companion-pause',     // renderer → main (pause analysis)
  COMPANION_RESUME:    'buildy:companion-resume',    // renderer → main (resume analysis)
  COMPANION_QUIET:     'buildy:companion-quiet',     // renderer → main (quiet mode toggle)
  OPEN_PANEL:          'buildy:open-panel',          // companion → main (open full panel)
  RESET_COMPANION:     'buildy:reset-companion',    // any → main (reset companion position)
  SHOW_COMPANION:      'buildy:show-companion',     // any → main (bring companion to front)
  COMPANION_SHUTDOWN:  'buildy:companion-shutdown',  // main → companion (stop everything, app is quitting)
  COMPANION_AUDIO:     'buildy:companion-audio',    // main → companion (ElevenLabs audio buffer to play)
  PUSH_TO_TALK:        'buildy:push-to-talk',       // companion → main (voice input audio)
  ASK_QUESTION:        'buildy:ask-question',       // companion → main (spoken question text)
  TRANSCRIBE_AUDIO:    'buildy:transcribe-audio',   // companion → main (audio buffer for Whisper STT)
  COMPANION_ANSWER:    'buildy:companion-answer',   // main → companion (answer to spoken question)
  SELECT_WATCH_SOURCE: 'buildy:select-watch-source', // companion → main (user picks a window)
  COMPANION_WATCHED_SOURCE: 'buildy:companion-watched-source', // main → companion (what's being watched)
  GUIDANCE_SHOW:       'guidance:show',             // companion → main (show guidance panel with payload)
  GUIDANCE_HIDE:       'guidance:hide',             // companion → main (hide guidance panel)
  GUIDANCE_DATA:       'guidance:data',             // main → guidance window (payload to render)
  GUIDANCE_RESIZE:     'guidance:resize',           // guidance window → main (report content height)
  GUIDANCE_SHOW_LAST:  'guidance:show-last',         // companion/tray → main (re-show cached guidance)
  COPY_TEXT:           'buildy:copy-text',          // renderer → main (write to clipboard; works in non-focusable windows)
  LOAD_PROJECT:        'buildy:load-project',
  SAVE_PROJECT:        'buildy:save-project',
  LOAD_SETTINGS:       'buildy:load-settings',     // → RedactedSettings (never raw keys)
  SAVE_SETTINGS:       'buildy:save-settings',     // non-secret settings only
  SET_SECRET:          'buildy:set-secret',        // renderer → main, one-way (store an API key)
  GOAL_GET:            'goal:get',                 // renderer → main (read current goal)
  GOAL_SET:            'goal:set',                 // renderer → main (create/replace goal)
  GOAL_UPDATE:         'goal:update',              // renderer → main (merge into goal, e.g. lastReviewedAt)
  // ─── Memory layer (Nemp bridge) ──────────────────────────────────────────
  MEMORY_GET:             'memory:get',                  // → MemorySnapshot
  MEMORY_GET_CONTEXT:     'memory:get-context-summary',  // → string
  MEMORY_SEARCH:          'memory:search',               // (query) → MemoryEntry[]
  MEMORY_ADD_OBSERVATION: 'memory:add-observation',
  MEMORY_ADD_COMPLETION:  'memory:add-completion',
  MEMORY_ADD_BLOCKER:     'memory:add-blocker',
  MEMORY_RESOLVE_BLOCKER: 'memory:resolve-blocker',
  MEMORY_ADD_DECISION:    'memory:add-decision',
  MEMORY_ADD_PATTERN:     'memory:add-pattern',
  MEMORY_EXPORT_BUILDYMD: 'memory:export-buildymd',
  MEMORY_RESET:           'memory:reset',
  // ─── Voice player (audio owned by a hidden main-process window) ───────────
  VOICE_PLAY_AUDIO:    'voice:play-audio',     // main → voice window (base64 MP3)
  VOICE_PLAY_TTS:      'voice:play-tts',       // main → voice window (system TTS text)
  VOICE_STOP:          'voice:stop',           // main → voice window (stop current)
  VOICE_ENDED:         'voice:ended',          // voice window → main (clip finished)
  VOICE_ERROR:         'voice:error',          // voice window → main (clip failed)
  VOICE_SPEAK_PROGRESS: 'voice:speak-progress', // main → guidance window (current chunk text / null)
  VOICE_CTL_STOP:      'voice:ctl-stop',       // companion → main (explicit stop)
  VOICE_CTL_MUTE:      'voice:ctl-mute',       // companion → main (mute on/off)
  VOICE_CTL_RESET:     'voice:ctl-reset',      // companion → main (reset dedup)
} as const
