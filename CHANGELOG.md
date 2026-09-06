# Changelog

All notable changes to Buildy are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [1.0.0]

First public open-source release (MIT).

### Added

- **Screen-aware companion** — watches your AI coding tool (Claude Code, Cursor, a terminal, or an editor) and explains what is happening in plain English, judged against your stated goal (on-track / drifting / blocked).
- **Voice mascot** — a compact, draggable, always-on-top mascot that speaks guidance out loud: ElevenLabs TTS with a Web Speech fallback, played through a dedicated hidden window so audio never cuts off when you switch focus.
- **Multi-provider AI** — Anthropic (Claude), OpenAI, Google Gemini, OpenRouter, Ollama, LM Studio, and custom OpenAI-compatible endpoints, including fully offline local setups.
- **Next-prompt guidance** — every analysis ends with the exact prompt to paste into your AI coding tool, verified by a fast prompt-quality grader before you see it.
- **Persistent project memory** — local-only memory via Nemp (`.nemp/` plain JSON) that remembers completed features, blockers, and decisions across sessions; exportable to a `BUILDY.md`.
- **Semantic de-duplication** — near-duplicate completions are recognized and skipped so guidance never repeats itself.
- **Guidance panel** — a separate frosted-glass window with the full analysis, decoupled from the mascot so it can never cover it.
- **Cross-platform packaging** — Windows (nsis), macOS (dmg), Linux (AppImage) via electron-builder.
