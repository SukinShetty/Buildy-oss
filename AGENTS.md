# My Buildy — Agent Instructions

<!-- Single source of truth for all AI coding agents working on this project. -->

## What is My Buildy?

A desktop companion (Windows-first; macOS/Linux run from source, untested) that helps non-technical builders work with AI coding tools (Claude Code primarily; Codex CLI experimental). My Buildy watches the coding tool's window, explains what's happening in plain language, judges it against the user's stated goal, tracks what's built and what's missing, and gives the user the exact next prompt — which it can send into the watched window on an approving click (Windows). Narrated out loud by an always-on-top voice mascot. My Buildy runs the loop; the user approves each step.

Inspired by Clicky's screen-aware companion model — adapted to a different problem and a different tech stack.

## Architecture

- **App shell**: Electron 44
- **UI**: React 19 + TypeScript (no framework, plain CSS custom properties)
- **State**: Zustand 5 — single store, all screens read from it
- **Build tool**: electron-vite 5 (Vite 7 for renderer, separate bundles for main/preload/renderer)
- **Screen capture**: Electron `desktopCapturer` — built-in, works on Windows and macOS
- **AI**: multi-provider via a registry in `src/main/ai/` — Anthropic (Claude), OpenAI, Google Gemini, OpenRouter, Ollama, LM Studio, and custom OpenAI-compatible endpoints. Live model lists, no default model, and a vision check (`ai/vision-gate.ts`) that gates watching until the chosen model proves it can read images. All API calls happen in the main process; keys are encrypted with Electron `safeStorage` (`secure-store.ts`) — plaintext saving is refused.
- **Voice**: ElevenLabs TTS with a Web Speech fallback. Playback is owned by a dedicated hidden voice window created with `backgroundThrottling: false`, driven by a serial voice queue (`voice-queue.ts`) that chunks long guidance and never cuts off mid-sentence.
- **Persistence**: local JSON in Electron `app.getPath('userData')`, plus per-project memory via the Nemp integration (`nemp-bridge.ts`), namespaced under `userData/mybuildy-memory/<projectId>` — local-only.
  - Windows: `C:\Users\<user>\AppData\Roaming\MyBuildy\`
  - macOS: `~/Library/Application Support/MyBuildy/`

### Process model

Three renderer windows, all routed by query param in `App.tsx` (`?companion` / `?guidance` / `?voice`), driven from one main process:

```
Main process (Node.js)              Renderer windows (React)
─────────────────────────           ──────────────────────────────
index.ts                            companion/   ← always-on-top mascot + pill
  ↓ creates                         guidance/    ← frosted side panel, full analysis
BrowserWindows                      voice/       ← hidden, owns audio playback
  ↓ loads
renderer/index.html?<window>
                                    Screens (guidance window):
ipc-handlers.ts                       Goal · Brainstorm · Guidance · Memory · Settings
  ↳ LIST_WINDOWS / CAPTURE_WINDOW   (capturer.ts)
  ↳ ANALYZE / BRAINSTORM_*          (analysis-loop.ts, ai/)
  ↳ COMPANION_* / PUSH_TO_TALK      (companion control, voice I/O)
  ↳ LOAD/SAVE_* , SET_SECRET        (settings + secrets, one-way)
  ↳ MEMORY_EXPORT_MYBUILDYMD          (nemp-bridge.ts)

preload/index.ts
  ↳ contextBridge → window.mybuildy.*
```

### IPC channel map

All channel names are defined in `src/renderer/src/types.ts` (`IPC` constant). Grouped overview — check `types.ts` for the exact current list before adding or renaming a channel:

| Group | Channels | Purpose |
|---|---|---|
| Capture | `mybuildy:list-windows`, `mybuildy:capture-window`, `mybuildy:select-watch-source`, `mybuildy:companion-watched-source` | List windows with thumbnails, screenshot the watched window, choose what's watched |
| Analysis | `mybuildy:analyze`, `mybuildy:brainstorm-start/-chunk/-done/-error`, `mybuildy:companion-analysis` | Screen analysis (non-streaming) and streaming brainstorm chat |
| Providers | `mybuildy:get-provider-infos`, `mybuildy:test-connection` | Provider metadata for the Settings UI; connectivity check |
| Companion control | `mybuildy:companion-start/-stop/-pause/-resume/-quiet`, `mybuildy:open-panel`, `mybuildy:show-companion`, `mybuildy:reset-companion`, `mybuildy:companion-shutdown`, `mybuildy:companion-state` | Watch lifecycle, quiet mode, window management |
| Voice | `mybuildy:companion-speak`, `mybuildy:companion-audio`, `mybuildy:push-to-talk`, `mybuildy:ask-question`, `mybuildy:transcribe-audio`, `mybuildy:companion-answer` | TTS playback, push-to-talk input, Whisper STT, spoken answers |
| State | `mybuildy:load-project`, `mybuildy:save-project`, `mybuildy:load-settings`, `mybuildy:save-settings`, `mybuildy:set-secret` (one-way), `memory:export-mybuildymd`, `mybuildy:copy-text` | Persistence and secrets. `LOAD_SETTINGS` returns redacted settings — raw keys never cross IPC to the renderer |

### Screen capture approach

`desktopCapturer.getSources()` runs in the main process and returns:
- Window list with JPEG thumbnails (320×200) for the window picker UI
- High-res capture for vision-model analysis

Watched-window auto-detection looks for known AI coding tools and terminal app names; if ambiguous or not found, the user picks a window manually.

### Analysis response shape

Providers must return the structured analysis JSON (see `src/main/ai/prompt-builder.ts`): what's happening, what it means, what's built/missing/broken, where the user is stuck, the best next move, the exact next prompt to paste, and a short encouraging buddy note. A second-pass prompt-quality check (`prompt-quality-check.ts`) grades the suggested prompt before it is shown.

## Key files

| File | Purpose |
|---|---|
| `src/main/index.ts` | App entry. Creates windows, tray, single-instance, registers IPC handlers. |
| `src/main/capturer.ts` | `desktopCapturer` — list windows, capture screenshots, auto-detect the coding tool. |
| `src/main/analysis-loop.ts` | The live watch → analyze → speak loop. |
| `src/main/companion-window.ts` | The always-on-top mascot window. |
| `src/main/guidance-window.ts` | The separate guidance panel window. |
| `src/main/voice-player.ts` | Hidden audio window + queue glue. |
| `src/main/voice-queue.ts` | Electron-free serial TTS queue (chunking, dedup). |
| `src/main/semantic-dedup.ts` | Near-duplicate detection (shared). |
| `src/main/nemp-bridge.ts` | Local persistent project memory (Nemp integration). |
| `src/main/ai/provider-interface.ts`, `provider-registry.ts` | Provider contract + factory/registry for all providers. |
| `src/main/ai/providers/` | anthropic · openai-compatible (OpenAI/OpenRouter/LM Studio/custom) · gemini · ollama |
| `src/main/ai/prompt-builder.ts` | System/user prompts for analysis. |
| `src/main/ai/speech-formatter.ts` | Spoken-guidance phrasing. |
| `src/main/ai/prompt-quality-check.ts` | Second-pass prompt grader. |
| `src/main/ai/elevenlabs-tts.ts` | TTS synthesis. |
| `src/main/ipc-handlers.ts` | Registers all IPC channels. Single file for easy auditing. |
| `src/preload/index.ts` | `contextBridge` — exposes `window.mybuildy.*` to the renderer. |
| `src/renderer/src/types.ts` | Shared TypeScript interfaces + IPC channel name constants. |
| `src/renderer/src/store/` | Zustand stores — all app state. |
| `src/renderer/src/App.tsx` | Root component; routes windows by query param. |
| `src/main/projects.ts`, `projects-core.ts` | Project system — per-project memory dirs under `userData/mybuildy-memory/<projectId>`. |
| `src/main/turn-detector.ts` | Turn-end detection state machine (Electron-free, unit-tested). |
| `src/main/prompt-sender.ts`, `prompt-sender-core.ts` | Send-to-watched-window (Windows) + destructive-prompt guard. |
| `src/main/secure-store.ts` | Encrypted API-key storage (Electron `safeStorage`). |
| `worker/` | Worker proxy — **not used in v0.1, see below**. |

## Development setup

```bash
# --legacy-peer-deps is required: npm 10+ crashes with an arborist "edgesOut" error
# on a clean install without it, even though every peer dependency resolves.
npm install --legacy-peer-deps

npm run dev             # dev server (Electron + Vite HMR)
npm run build           # production build
npm run typecheck       # tsc over main, renderer, and e2e configs
npm test                # vitest unit suite
npm run test:e2e        # Playwright e2e suite (builds first)
npm run test:e2e:packaged  # e2e against a packaged build
npm run package         # Windows installer (nsis) → dist/
```

**First run**: open Settings, pick a provider, and enter an API key (cloud) or a Base URL (local). There is no default model — one must be chosen and pass the vision check. `npm run typecheck`, `npm run build`, and `npm test` must stay green — CI (Node 22) enforces them on every PR.

## Project system (per-project memory)

Every project gets its own memory directory: `userData/mybuildy-memory/<projectId>` (see `projects-core.ts` for the path rules; `mybuildy-memory/default` is the fallback). `projects.ts` owns the project registry and re-initializes the Nemp bridge on the active project's directory when the user switches projects. Memory never leaks across projects — `e2e/memory-isolation.spec.ts` and the unit tests in `nemp-bridge.project-scope.test.ts` assert this. The Delete-all-data path (`memory.ts` → `deleteAllMyBuildyData`) removes keys, settings, project records, and every project's memory.

## Turn detector

`src/main/turn-detector.ts` is a pure, Electron-free state machine that decides *when an analysis is worth paying for*. While the coding agent is mid-turn, the loop takes a cheap low-resolution local capture every 5 s (never sent anywhere) and feeds the change fraction in. A turn end = the screen changed and then stayed stable for two consecutive polls — analyze then (within ~10 s of the agent stopping). Continuous change for 3 minutes forces one checkpoint analysis. "Working" mode comes from the last analysis's `terminalState` or from being within 3 minutes of a Send. No timers, no `Date.now()` — callers pass timestamps, which keeps the policy fully unit-testable (`turn-detector.test.ts`).

## E2E testing

The Playwright suite in `e2e/` launches the real Electron app. Isolation works via `src/main/bootstrap.ts` — the actual entry point — which honours `MYBUILDY_USER_DATA_DIR` **only when `MYBUILDY_E2E=1`** and overrides Electron's `userData`/`sessionData` paths *before* the app modules are evaluated (dynamic import; never convert it to a static import — path-at-import-time modules would break). `e2e/helpers.ts` creates a fresh throwaway profile per launch, snapshots the real userData dir, and asserts after close that it was untouched. No e2e test ever calls an AI provider: the fresh profile has no key and no model, so analysis paths refuse by design.

- `npm run test:e2e` — builds, then runs against `out/`
- `npm run test:e2e:packaged` — runs the same suite against the packaged exe (`scripts/e2e-packaged.mjs` sets `MYBUILDY_E2E_EXE`)

## Release pipeline

`.github/workflows/release.yml` triggers on `v*` tags, guarded to the canonical repo (`SukinShetty/mybuildy`) so forks don't cut releases. It runs typecheck + tests, builds, packages a Windows NSIS installer (`MyBuildy-Setup-<version>.exe`, unsigned), writes `SHA256SUMS.txt`, and uploads both to a **draft** GitHub release — publishing is a manual step. v1 ships a Windows installer only; macOS/Linux stay "run from source, untested". `ci.yml` runs typecheck + build + test on Node 22 for every push/PR to main.

## Worker (not used in v0.1)

The proxy in `worker/` is **not used by the app in v0.1** and is kept only for a possible hosted option later. It is disabled pending authentication work: as written it is an unauthenticated open relay for whoever holds the URL. **Do not deploy it or point the app at it** until per-user auth lands. See `worker/README.md` and `SECURITY.md`.

## Code style

### Naming
- Optimize for clarity over concision. A developer with zero context should understand what a variable or function does from its name alone.
- `analyzeClaudeCodeScreen` not `analyze`. `captureWindowForAnalysis` not `capture`.
- IPC handlers: prefix with the channel name they handle.

### React / TypeScript
- No classes — functional components only
- All async operations: `async/await`, not `.then()`
- Types: explicit everywhere. No `any`.
- Inline styles (CSSProperties objects) — no CSS modules, no Tailwind (keep deps minimal)
- State: all app state lives in Zustand. No prop drilling beyond one level.

### Do NOT
- Do not add features beyond what was asked
- Do not add comments to code you didn't touch
- Do not add a router library — screen routing is done via Zustand state
- Do not add a component library — use CSS custom properties and plain HTML elements
- Do not put API calls in React components — all AI/storage calls go through IPC

## Security notes

- `contextIsolation: true`, `nodeIntegration: false` — the renderer cannot access Node.js
- All external API calls happen in the main process (API keys never reach the renderer; `mybuildy:set-secret` is one-way)
- CSP in `index.html` restricts what the renderer can load
- API keys stored encrypted (Electron `safeStorage`) in userData, never in the app bundle or version control; plaintext saving is refused
- My Buildy sends screen captures to the AI provider the user configures — treat capture contents as sensitive (see `SECURITY.md`)
