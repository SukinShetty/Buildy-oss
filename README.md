<div align="center">

# 🛠️ Buildy

**Your AI builder buddy — a screen-aware desktop companion that helps non-technical founders build with AI coding tools.**

Buildy watches what you're doing on screen (e.g. Claude Code, Cursor, a terminal, your editor), explains in plain English what's happening, judges it against your goal, and writes the exact next prompt to paste — all narrated by a floating mascot with a real voice.

[![Electron](https://img.shields.io/badge/Electron-31-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)
[![Platforms](https://img.shields.io/badge/platforms-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey)](#-install--run)

</div>

---

## ✨ What it does

You're building something with an AI coding agent, but you can't always tell *what just happened* or *what to do next*. Buildy sits on top of your desktop as a small always-on-top mascot and acts as your translator and guide:

1. **Set a goal** — tell Buildy what you're building, who it's for, and what success looks like.
2. **Pick a window to watch** — your AI coding tool, terminal, or editor.
3. **Buildy analyzes the screen** — it takes a screenshot, sends it to a vision model, and reports:
   - What's happening right now (plain English, no jargon)
   - Whether it moves you toward your goal (**on-track / drifting / blocked**)
   - What's been built, what's missing, what's broken, where you might be stuck
   - **The exact next prompt to paste** into your AI coding tool
4. **It speaks the guidance** out loud through a friendly voice, and shows the details in a polished side panel.
5. **It remembers** — completed features, blockers, and decisions persist across sessions, so guidance gets smarter over time.

Buildy is **provider-agnostic** (Anthropic, OpenAI, Gemini, OpenRouter, Ollama, LM Studio, or any OpenAI-compatible endpoint) and **local-first** (your project memory never leaves your machine).

---

## 🧠 Highlights

- **🪟 Two-window companion UI** — a compact, draggable, always-on-top mascot that's *always visible*, plus a separate frosted-glass guidance panel that can never overflow or cover the mascot.
- **🎙️ Real voice guidance** — ElevenLabs TTS with a graceful Web Speech fallback. Audio is owned by a dedicated background window so it plays cleanly even when you switch focus to your editor. A sentence-safe queue plays long guidance to completion and never cuts off mid-sentence.
- **🔌 Multi-provider AI** — Anthropic (Claude), OpenAI, Google Gemini, OpenRouter, Ollama, LM Studio, and custom OpenAI-compatible providers. Use a top cloud model or run fully offline with local models.
- **🎯 Goal-aware analysis** — every read is judged against *your* stated goal so you know if you're on track or drifting.
- **💾 Persistent project memory** — integrates [Nemp Memory](https://github.com/SukinShetty/Nemp-memory) as a local-only memory layer. Completed features, blockers, decisions, and patterns are remembered and fed back into future analysis. Exportable to a `BUILDY.md`.
- **✅ Prompt quality grading** — a fast second-pass check (Haiku) verifies that each suggested prompt is specific, actionable, and non-redundant before you see it.
- **🔁 Semantic de-duplication** — Buildy won't repeat the same fact in slightly different words; near-duplicate completions are recognized and skipped.
- **🔒 Private by default** — project memory is plain JSON on your disk. API keys live in your OS user-data dir. Nothing is sent anywhere except the AI provider you choose.

---

## 🖼️ How it works (architecture)

Buildy is an **Electron + React + TypeScript** app split across three windows, all driven from one main process:

```
┌─────────────────┐        ┌──────────────────────┐        ┌────────────────────┐
│  Mascot window  │        │   Guidance window    │        │  Voice window      │
│ (always-on-top) │◀──────▶│ (frosted side panel) │        │ (hidden, audio)    │
│ mascot + pill   │        │ analysis + prompt    │        │ plays clips        │
└────────┬────────┘        └──────────▲───────────┘        └─────────▲──────────┘
         │  IPC                       │ IPC                          │ IPC
         ▼                            │                              │
┌───────────────────────────────────────────────────────────────────────────────┐
│                                Main process (Node)                              │
│  capture → AI provider (vision) → analysis → goal alignment → memory → voice    │
│  screen capture · multi-provider AI · Nemp memory · prompt grader · TTS queue   │
└───────────────────────────────────────────────────────────────────────────────┘
```

- **Main process** — screen capture (`desktopCapturer`), provider-agnostic AI calls, Nemp memory, prompt-quality grading, and the voice queue + synthesis.
- **Renderer** — React UI for the mascot, the guidance panel, the settings/workspace, and the hidden voice player. State via Zustand.
- **Preload** — a secure `contextBridge` (`window.buildy.*`) between renderer and main; no `nodeIntegration`.
- **Optional Cloudflare Worker** (`worker/`) — a proxy for team deployments that keeps your Anthropic key off client machines.

---

## 🚀 Install & run

### Requirements
- **Node.js 18+**
- **Windows 10+, macOS 12+, or Linux**
- An API key for at least one provider (e.g. an [Anthropic API key](https://console.anthropic.com)), **or** a local model server like [Ollama](https://ollama.com).

### Run from source
```bash
git clone https://github.com/SukinShetty/Buildy-oss.git
cd Buildy-oss

# NOTE: --legacy-peer-deps is required (electron-vite pins an older Vite peer range)
npm install --legacy-peer-deps

npm run dev
```

On first launch, open **Settings** and choose your provider + enter your API key (and optionally an ElevenLabs key for the premium voice).

### Build a distributable
```bash
npm run build      # compile main / preload / renderer
npm run package    # build installers (nsis / dmg / AppImage) → dist/
```

### Run the tests
```bash
npm test           # vitest — voice queue, speech formatter, semantic dedup
```

---

## ⚙️ Configuration

All configuration is done in the in-app **Settings** screen and stored locally in your OS user-data directory.

| Setting | Notes |
|---|---|
| **Provider** | `anthropic` · `openai` · `gemini` · `openrouter` · `ollama` · `lmstudio` · `custom` |
| **Model** | e.g. `claude-opus-4-7`, `gpt-4o`, `gemini-2.5-flash`, or any local model id |
| **API key** | Used for cloud providers. Stored locally, never committed. |
| **Base URL** | For Ollama / LM Studio / custom OpenAI-compatible endpoints |
| **ElevenLabs key + voice** | Optional — enables premium TTS; otherwise the system voice is used |
| **Proxy URL** | Optional Cloudflare Worker proxy for Anthropic (see `worker/`) |

> 💡 **Fully offline:** select `ollama` (or `lmstudio`), point the Base URL at your local server, pick a vision-capable local model, and skip the ElevenLabs key to use the built-in system voice.

---

## 📁 Project structure

```
src/
  main/                     Electron main process (Node)
    index.ts                entry · windows · tray · single-instance
    capturer.ts             screen / window capture
    companion-window.ts     the always-on-top mascot window
    guidance-window.ts      the separate guidance panel window
    voice-player.ts         hidden audio window + queue glue
    voice-queue.ts          electron-free serial TTS queue (chunking, dedup)
    semantic-dedup.ts       near-duplicate detection (shared)
    nemp-bridge.ts          local persistent memory (Nemp integration)
    analysis-loop.ts        the live watch → analyze → speak loop
    ipc-handlers.ts         all IPC channels
    ai/
      provider-interface.ts , provider-registry.ts
      providers/            anthropic · openai-compatible · gemini · ollama
      prompt-builder.ts     system/user prompts
      speech-formatter.ts   spoken-guidance phrasing
      prompt-quality-check.ts   Haiku second-pass grader
      elevenlabs-tts.ts     TTS synthesis
  preload/index.ts          secure window.buildy.* bridge
  renderer/src/
    App.tsx                 routes windows by query param
    companion/              mascot UI
    guidance/               guidance panel UI
    voice/                  hidden voice player UI
    screens/                Goal · Brainstorm · Guidance · Memory · Settings
    store/                  Zustand state
worker/                     optional Cloudflare Worker proxy
```

For a deeper technical walkthrough, see [`AGENTS.md`](./AGENTS.md).

---

## 🔐 Privacy

- **Project memory is 100% local** — stored as plain JSON in a `.nemp/` directory; nothing is uploaded.
- **API keys** are stored in your OS user-data directory, never in the repo (`.env` and friends are git-ignored).
- The **only** outbound network calls are to the AI provider you configure (and ElevenLabs, if you enable it).

---

## 🤝 Contributing

Contributions are welcome! A few notes:

- Install with `npm install --legacy-peer-deps`.
- Keep `npm run build` and `npm test` green before opening a PR.
- The codebase is TypeScript throughout; the renderer is split by window via a `?companion` / `?guidance` / `?voice` query param in `App.tsx`.
- Open an issue first for larger changes so we can align on direction.

---

## 📜 License

[MIT](./LICENSE) © Sukin Shetty

---

<div align="center">
Built for non-technical founders who want to ship.
</div>
