# Buildy — Agent Instructions

<!-- Single source of truth for all AI coding agents working on this project. -->

## What is Buildy?

A cross-platform desktop companion (Windows + macOS + Linux) that helps non-technical founders build products with AI coding tools (Claude Code, Cursor, a terminal, or any editor). Buildy watches the coding tool's window, explains what's happening in plain language, judges it against the user's stated goal, tracks what's built and what's missing, and gives the user the exact next prompt to paste — narrated out loud by an always-on-top voice mascot.

Inspired by Clicky's screen-aware companion model — adapted to a different problem and a different tech stack.

## Architecture

- **App shell**: Electron 31
- **UI**: React 19 + TypeScript (no framework, plain CSS custom properties)
- **State**: Zustand 5 — single store, all screens read from it
- **Build tool**: electron-vite 2 (Vite 6 for renderer, separate bundles for main/preload/renderer)
- **Screen capture**: Electron `desktopCapturer` — built-in, works on Windows and macOS
- **AI**: multi-provider via a registry in `src/main/ai/` — Anthropic (Claude), OpenAI, Google Gemini, OpenRouter, Ollama, LM Studio, and custom OpenAI-compatible endpoints. All API calls happen in the main process; keys are stored locally in the OS user-data dir.
- **Voice**: ElevenLabs TTS with a Web Speech fallback. Playback is owned by a dedicated hidden voice window created with `backgroundThrottling: false`, driven by a serial voice queue (`voice-queue.ts`) that chunks long guidance and never cuts off mid-sentence.
- **Persistence**: local JSON in Electron `app.getPath('userData')`, plus project memory via the Nemp integration (`nemp-bridge.ts`, `.nemp/` directory, local-only).
  - Windows: `C:\Users\<user>\AppData\Roaming\Buildy\`
  - macOS: `~/Library/Application Support/Buildy/`

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
  ↳ MEMORY_EXPORT_BUILDYMD          (nemp-bridge.ts)

preload/index.ts
  ↳ contextBridge → window.buildy.*
```

### IPC channel map

All channel names are defined in `src/renderer/src/types.ts` (`IPC` constant). Grouped overview — check `types.ts` for the exact current list before adding or renaming a channel:

| Group | Channels | Purpose |
|---|---|---|
| Capture | `buildy:list-windows`, `buildy:capture-window`, `buildy:select-watch-source`, `buildy:companion-watched-source` | List windows with thumbnails, screenshot the watched window, choose what's watched |
| Analysis | `buildy:analyze`, `buildy:brainstorm-start/-chunk/-done/-error`, `buildy:companion-analysis` | Screen analysis (non-streaming) and streaming brainstorm chat |
| Providers | `buildy:get-provider-infos`, `buildy:test-connection` | Provider metadata for the Settings UI; connectivity check |
| Companion control | `buildy:companion-start/-stop/-pause/-resume/-quiet`, `buildy:open-panel`, `buildy:show-companion`, `buildy:reset-companion`, `buildy:companion-shutdown`, `buildy:companion-state` | Watch lifecycle, quiet mode, window management |
| Voice | `buildy:companion-speak`, `buildy:companion-audio`, `buildy:push-to-talk`, `buildy:ask-question`, `buildy:transcribe-audio`, `buildy:companion-answer` | TTS playback, push-to-talk input, Whisper STT, spoken answers |
| State | `buildy:load-project`, `buildy:save-project`, `buildy:load-settings`, `buildy:save-settings`, `buildy:set-secret` (one-way), `memory:export-buildymd`, `buildy:copy-text` | Persistence and secrets. `LOAD_SETTINGS` returns redacted settings — raw keys never cross IPC to the renderer |

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
| `src/preload/index.ts` | `contextBridge` — exposes `window.buildy.*` to the renderer. |
| `src/renderer/src/types.ts` | Shared TypeScript interfaces + IPC channel name constants. |
| `src/renderer/src/store/` | Zustand stores — all app state. |
| `src/renderer/src/App.tsx` | Root component; routes windows by query param. |
| `worker/` | Optional Cloudflare Worker proxy — **disabled in v1, see below**. |

## Development setup

```bash
# --legacy-peer-deps is required (electron-vite pins an older Vite peer range)
npm install --legacy-peer-deps

npm run dev        # dev server (Electron + Vite HMR)
npm run build      # production build
npm test           # vitest
npm run package    # installers
```

**First run**: open Settings, pick a provider, and enter an API key (cloud) or a Base URL (local). `npm run build` and `npm test` must stay green — CI enforces both on every PR.

## Worker (optional, DISABLED in v1)

The Cloudflare Worker proxy in `worker/` is **not used by the app in v1** and is kept for reference only. It is disabled pending authentication work (planned v1.1): as written it is an unauthenticated open relay for whoever holds the URL. **Do not deploy it or point the app at it** until per-user auth lands. See `worker/README.md` and `SECURITY.md`.

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
- All external API calls happen in the main process (API keys never reach the renderer; `buildy:set-secret` is one-way)
- CSP in `index.html` restricts what the renderer can load
- API keys stored in userData, never in the app bundle or version control
- Buildy sends screen captures to the AI provider the user configures — treat capture contents as sensitive (see `SECURITY.md`)
