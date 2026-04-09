# Buildy — Agent Instructions

<!-- Single source of truth for all AI coding agents working on this project. -->

## What is Buildy?

A cross-platform desktop companion (Windows + macOS) that helps non-technical founders build products with Claude Code. Buildy watches the Claude Code window, explains what's happening in plain language, tracks what's built and what's missing, and always gives the user the exact next prompt to paste into Claude Code.

Inspired by Clicky's screen-aware companion model — adapted to a different problem and a different tech stack.

## Architecture

- **App shell**: Electron 31
- **UI**: React 19 + TypeScript (no framework, plain CSS custom properties)
- **State**: Zustand 5 — single store, all screens read from it
- **Build tool**: electron-vite 2 (Vite 6 for renderer, separate bundles for main/preload/renderer)
- **Screen capture**: Electron `desktopCapturer` — built-in, works on Windows and macOS
- **AI**: Claude (claude-sonnet-4-6) via direct Anthropic API or Cloudflare Worker proxy
- **Persistence**: Local JSON files in Electron `app.getPath('userData')`
  - Windows: `C:\Users\<user>\AppData\Roaming\Buildy\`
  - macOS: `~/Library/Application Support/Buildy/`

### Process model

```
Main process (Node.js)          Renderer process (React)
─────────────────────────       ──────────────────────────────
index.ts                        App.tsx → screen router
  ↓ creates                     
BrowserWindow                   Screens:
  ↓ loads                         BrainstormScreen   ← chat with Buildy to define project
renderer/index.html               GuidanceWorkspace  ← live screen analysis + 7-section output
                                  MemoryScreen       ← view/edit project memory
ipc-handlers.ts                   SettingsScreen     ← API key or proxy URL
  ↳ LIST_WINDOWS    (capturer.ts)
  ↳ CAPTURE_WINDOW  (capturer.ts)
  ↳ ANALYZE         (claude-bridge.ts)
  ↳ BRAINSTORM_*    (claude-bridge.ts, streaming)
  ↳ LOAD/SAVE_*     (memory.ts)

preload/index.ts
  ↳ contextBridge → window.buildy.*
```

### IPC channel map

All channel names are defined in `src/renderer/src/types.ts` (`IPC` constant).

| Channel | Direction | Purpose |
|---|---|---|
| `buildy:list-windows` | renderer → main | Get all open windows with thumbnails |
| `buildy:capture-window` | renderer → main | Screenshot a specific window |
| `buildy:analyze` | renderer → main | Claude screen analysis (non-streaming) |
| `buildy:brainstorm-start` | renderer → main | Start streaming brainstorm chat |
| `buildy:brainstorm-chunk` | main → renderer | Text delta from streaming response |
| `buildy:brainstorm-done` | main → renderer | Stream complete + extracted project data |
| `buildy:brainstorm-error` | main → renderer | Stream error |
| `buildy:load-project` | renderer → main | Load project memory from disk |
| `buildy:save-project` | renderer → main | Persist project memory to disk |
| `buildy:load-settings` | renderer → main | Load API key / proxy config from disk |
| `buildy:save-settings` | renderer → main | Persist settings to disk |

### Screen capture approach

`desktopCapturer.getSources()` runs in the main process and returns:
- Window list with JPEG thumbnails (320×200) for the WindowPicker UI
- High-res capture (1280×800) for Claude analysis

Claude Code window auto-detection: checks for "claude" in the window title, then falls back to known terminal app names (Windows Terminal, iTerm2, Warp, etc.).

If ambiguous or not found → shows `WindowPicker` UI for the user to manually select.

### Claude analysis response shape

Claude must return this exact JSON (see `claude-bridge.ts`):

```json
{
  "claudeCodeVisible": true,
  "whatIsHappening": "plain language, 1-2 sentences",
  "whatItMeans": "why this matters for the product",
  "whatIsBuilt": ["done feature", "another done thing"],
  "whatIsMissing": ["missing feature"],
  "whatIsBroken": ["specific error"],
  "whereUserIsStuck": "description or null",
  "bestNextMove": "one clear sentence",
  "nextPromptForClaudeCode": "exact prompt to paste",
  "builderNote": "short encouraging buddy note"
}
```

### Brainstorm streaming

- Renderer calls `buildy.startBrainstorm()` (IPC invoke)
- Main process opens streaming SSE to Anthropic
- Chunks arrive via `buildy:brainstorm-chunk` IPC push
- When done, `buildy:brainstorm-done` includes `extractedProjectData` if Claude included the summary block
- Renderer accumulates chunks in `brainstormStreamingBuffer` (Zustand)

## Key Files

| File | Purpose |
|---|---|
| `src/main/index.ts` | App entry. Creates BrowserWindow, Tray, registers IPC handlers. |
| `src/main/capturer.ts` | `desktopCapturer` — list windows, capture screenshot, auto-detect Claude Code. |
| `src/main/memory.ts` | `fs.promises` JSON persistence for project + settings in userData dir. |
| `src/main/claude-bridge.ts` | All Claude API calls. `analyzeScreen()` (non-streaming) + `streamBrainstorm()` (SSE streaming). |
| `src/main/ipc-handlers.ts` | Registers all IPC channels. Single file for easy auditing. |
| `src/preload/index.ts` | `contextBridge` — exposes `window.buildy.*` API to renderer. |
| `src/renderer/src/types.ts` | Shared TypeScript interfaces + IPC channel name constants. |
| `src/renderer/src/store/useAppStore.ts` | Zustand store — all app state (screens, analysis, brainstorm, project, settings). |
| `src/renderer/src/App.tsx` | Root component. Loads persisted state on startup. Routes to active screen. |
| `src/renderer/src/screens/BrainstormScreen.tsx` | Chat UI for defining the product. Streaming Claude responses. |
| `src/renderer/src/screens/GuidanceWorkspace.tsx` | Main analysis screen. WindowPicker → capture → analyze → 7-section display. |
| `src/renderer/src/screens/MemoryScreen.tsx` | View/edit project memory (name, summary, user, problem, explanation style). |
| `src/renderer/src/screens/SettingsScreen.tsx` | API key (direct) or proxy URL config. Saved to userData. |
| `src/renderer/src/components/GuidanceSections.tsx` | 7-section structured guidance output. |
| `src/renderer/src/components/PromptCard.tsx` | Next prompt for Claude Code + copy button. |
| `src/renderer/src/components/WindowPicker.tsx` | Modal to pick which window is Claude Code. |
| `src/renderer/src/components/NavBar.tsx` | Top navigation — 4 tabs + logo. |
| `src/renderer/src/styles/global.css` | CSS custom properties design system. All colors/spacing defined here. |
| `worker/src/index.ts` | Cloudflare Worker proxy — `/chat` route to Anthropic. |

## Development Setup

```bash
# Install dependencies
npm install

# Start dev server (Electron + Vite HMR)
npm run dev

# Build for production
npm run build

# Package (creates installer)
npm run package
```

**First run**: Go to Settings and enter your Anthropic API key (starts with `sk-ant-`), or configure a Cloudflare Worker proxy URL.

## Worker Setup (Optional)

The worker in `worker/` is an API proxy so you can avoid shipping API keys in the app binary. Only needed if distributing to others.

```bash
cd worker
npm install
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler deploy
# → copy the URL into Settings → Proxy URL, enable Proxy mode
```

## Code Style

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
- Do not add a router library — screen routing is done via Zustand `currentScreen` state
- Do not add a component library — use CSS custom properties and plain HTML elements
- Do not put API calls in React components — all Claude/storage calls go through IPC

## Security Notes

- `contextIsolation: true`, `nodeIntegration: false` — renderer cannot access Node.js
- All external API calls happen in the main process (API keys never reach renderer)
- CSP in `index.html` restricts what the renderer can load
- API keys stored in userData, never in the app bundle or version control
