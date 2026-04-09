# Buildy

**Your AI builder buddy — helps non-tech founders build with Claude Code.**

Works on Windows and macOS. Watches what Claude Code is doing and tells you exactly what's happening and what to do next.

## How it works

1. **Brainstorm**: Chat with Buildy to define your product. It asks questions and extracts what you're building, who it's for, and what the MVP should be.
2. **Open Claude Code** and start building.
3. **Analyze**: Click Analyze Now. Buildy takes a screenshot of your screen, finds the Claude Code window, and sends it to Claude.
4. **Guidance**: Buildy shows you 7 sections:
   - What's happening right now
   - What it means for your product
   - What's been built
   - What's still missing
   - What's broken
   - Where you might be stuck
   - Your best next move
5. **Next prompt**: Buildy writes the exact prompt to paste into Claude Code.
6. Paste it, watch Claude work, analyze again. Repeat.

## Setup

### Requirements
- Windows 10+ or macOS 12+
- Node.js 18+
- An [Anthropic API key](https://console.anthropic.com)

### Install and run

```bash
cd buildy
npm install
npm run dev
```

On first launch, go to **Settings** and enter your Anthropic API key.

### Build for distribution

```bash
npm run build
npm run package
# Output in dist/
```

## Architecture

Electron + React + TypeScript. For the full technical breakdown, read `AGENTS.md`.

- Main process (Node.js): screen capture, Claude API calls, local storage
- Renderer (React): all UI, Zustand state
- Preload: secure contextBridge between main and renderer
- Optional Cloudflare Worker proxy (see `worker/`) for team deployments

## Screen capture

Uses Electron's built-in `desktopCapturer` API — no extra OS permissions library needed. Captures the Claude Code window specifically (auto-detected by window title), falls back to full screen if not found. You can also manually pick which window using the window picker.

## Project structure

```
src/
  main/
    index.ts            Electron entry + window management
    capturer.ts         Screen/window capture
    memory.ts           Local JSON storage
    claude-bridge.ts    Claude API — analysis + brainstorm streaming
    ipc-handlers.ts     All IPC channels
  preload/
    index.ts            Secure window.buildy.* API bridge
  renderer/
    index.html
    src/
      App.tsx           Root — loads state, routes screens
      types.ts          Shared TypeScript interfaces
      store/
        useAppStore.ts  Zustand — all app state
      screens/
        BrainstormScreen.tsx    Define your product
        GuidanceWorkspace.tsx   Live analysis + guidance
        MemoryScreen.tsx        Project memory editor
        SettingsScreen.tsx      API key / proxy config
      components/
        NavBar.tsx
        GuidanceSections.tsx    7-section guidance output
        PromptCard.tsx          Next prompt + copy button
        WindowPicker.tsx        Pick which window to analyze
      styles/
        global.css              CSS design system

worker/                 Optional Cloudflare Worker proxy
```
