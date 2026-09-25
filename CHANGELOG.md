# Changelog

All notable changes to MyBuildy are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [0.1.0] — 2026-09-23

First public release (MIT). Windows installer and macOS DMGs (Apple Silicon and Intel) via GitHub Releases; Linux runs from source (untested).

### Added

- **The loop** — watch the terminal window your AI coding agent runs in (any agent; built and tested against Claude Code first, Codex CLI recognised), explain what happened in plain English, judge it against the stated goal (on track / drifting / blocked), and produce the exact next prompt. MyBuildy runs the loop; the user approves each step.
- **Loop engineering blocks** — Goal, Memory, Verifier (a separate AI check that a pasted prompt achieved its outcome), and Hand-off (genuine decisions are detected and handed back to the user with options).
- **Project system** — per-project memory namespaced under `userData/mybuildy-memory/<projectId>` (Nemp-backed, local JSON), with project switching and a one-time capture disclosure on first window pick.
- **Providers** — Anthropic, OpenAI, Google Gemini, and OpenRouter recommended, plus Ollama / LM Studio / custom OpenAI-compatible endpoints under Advanced. Live model lists fetched from the provider; no default model; a vision check gates watching until the chosen model proves it can read images.
- **Turn-end detection** — while the agent works, only cheap low-resolution local snapshots are taken (never sent anywhere); a real analysis runs within ~10 seconds of the agent finishing its turn, or as a checkpoint after 3 minutes of continuous activity.
- **Paste into terminal** — one click pastes the approved prompt into the watched terminal (Windows and macOS). MyBuildy never presses Enter: you read the prompt and run it yourself. If the prompt, project or watched window changes before the paste, nothing is pasted and the panel says why. A destructive-prompt guard asks for a second click on flagged prompts.
- **Stop** — fully stops watching: any analysis in progress is cancelled and an unfinished voice question is discarded, not transcribed.
- **Separate projects** — goal and memory changes are saved only to the project they were made in, and switching projects clears the brainstorm conversation and any guidance on screen.
- **Cost cap** — a rolling hourly limit on provider calls (default 120, editable 20-600); watching pauses at the cap.
- **Voice guidance** — optional ElevenLabs TTS with a system-voice fallback; sentence-safe queue; the mic button appears only when an ElevenLabs key is saved.
- **Mascot** — an animated, draggable, always-on-top companion with idle / watching / thinking / speaking states, plus the frosted-glass guidance panel.
- **Privacy wording** — Settings says plainly where screenshots and prompts go: your provider, a custom endpoint by its address, or this computer for local models, and ElevenLabs whenever a voice key is saved. The one-time capture notice must be accepted before anything is captured. The README lists every data flow.
- **Strict provider checks** — each API key is only ever sent to its own provider over HTTPS, a custom endpoint's key only to the endpoint it was entered for, and provider errors are shown as plain-English messages.
- **Security hardening** — API keys encrypted with Electron `safeStorage` (plaintext saving refused), sandboxed renderers (`contextIsolation`, no `nodeIntegration`), validated IPC payloads, strict CSP, navigation guards, and no telemetry. A Delete-all-data button removes keys, settings, and all project memory.
- **End-to-end test suite** — Playwright-driven Electron runs (`npm run test:e2e`, `npm run test:e2e:packaged`) in isolated throwaway profiles, covering launch, security invariants, secrets, and memory isolation, alongside the vitest unit suite.
- **Windows installer** — `MyBuildy-Setup-0.1.0.exe` built by a tag-triggered release workflow as a draft GitHub release with SHA256 checksums. The installer is unsigned in this release.
- **macOS DMGs** — `MyBuildy-0.1.0-arm64.dmg` and `MyBuildy-0.1.0-x64.dmg`, ad-hoc signed (not notarized), attached to the same draft release and covered by the same `SHA256SUMS.txt`.
- **Mascot stays reachable** — a mascot dragged (almost) off every display slides back into view when the drag ends (all platforms).
- **Settings on first run** — the model list is only requested once an API key is saved, so a fresh install no longer shows a misleading "Your API key was rejected" (all platforms).
- **macOS permission checks** — Screen Recording is checked before watching (reported status plus a blank-frame check); Accessibility and Automation (System Events) are checked before pasting. Each missing permission is explained on the mascot and in the guidance panel, with a button that opens the right System Settings pane.
