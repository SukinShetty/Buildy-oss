# Changelog

All notable changes to Buildy are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [0.1.0] — 2026-09-23

First public release (MIT). Windows installer via GitHub Releases; macOS and Linux run from source (untested).

### Added

- **The loop** — watch a chosen Claude Code (or Codex CLI, experimental) window, explain what happened in plain English, judge it against the stated goal (on track / drifting / blocked), and produce the exact next prompt. Buildy runs the loop; the user approves each step.
- **Loop engineering blocks** — Goal, Memory, Verifier (a separate AI check that the sent prompt achieved its outcome), and Hand-off (genuine decisions are detected and handed back to the user with options).
- **Project system** — per-project memory namespaced under `userData/buildy-memory/<projectId>` (Nemp-backed, local JSON), with project switching and a one-time capture disclosure on first window pick.
- **Providers** — Anthropic, OpenAI, Google Gemini, and OpenRouter recommended, plus Ollama / LM Studio / custom OpenAI-compatible endpoints under Advanced. Live model lists fetched from the provider; no default model; a vision check gates watching until the chosen model proves it can read images.
- **Turn-end detection** — while the agent works, only cheap low-resolution local snapshots are taken (never sent anywhere); a real analysis runs within ~10 seconds of the agent finishing its turn, or as a checkpoint after 3 minutes of continuous activity.
- **Send** — one click sends the approved prompt into the watched window (Windows only), with a destructive-prompt guard that requires a second confirmation click on flagged prompts.
- **Cost cap** — a rolling hourly limit on provider calls (default 120, editable 20-600); watching pauses at the cap.
- **Voice guidance** — optional ElevenLabs TTS with a system-voice fallback; sentence-safe queue; the mic button appears only when an ElevenLabs key is saved.
- **Mascot** — an animated, draggable, always-on-top companion with idle / watching / thinking / speaking states, plus the frosted-glass guidance panel.
- **Security hardening** — API keys encrypted with Electron `safeStorage` (plaintext saving refused), sandboxed renderers (`contextIsolation`, no `nodeIntegration`), validated IPC payloads, strict CSP, navigation guards, and no telemetry. A Delete-all-data button removes keys, settings, and all project memory.
- **End-to-end test suite** — Playwright-driven Electron runs (`npm run test:e2e`, `npm run test:e2e:packaged`) in isolated throwaway profiles, covering launch, security invariants, secrets, and memory isolation, alongside the vitest unit suite.
- **Windows installer** — `Buildy-Setup-0.1.0.exe` built by a tag-triggered release workflow as a draft GitHub release with SHA256 checksums. The installer is unsigned in this release.
