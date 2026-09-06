# Security Policy

## Reporting a vulnerability

Please **do not open a public GitHub issue** for security reports.

- **Preferred:** use GitHub's private vulnerability reporting on this repository (Security tab → **Report a vulnerability**).
- **Or email:** sukin.shetty8@gmail.com

Include steps to reproduce, the affected version or commit, and the potential impact. You can expect an acknowledgement within 72 hours and follow-up updates until the report is resolved. If the issue is confirmed, we will credit you in the fix notes unless you prefer otherwise.

## Things to know about Buildy's security model

### Screen capture and your data

Buildy works by capturing your screen (or a window you pick) and **sending those screenshots to the AI provider you configure** — Anthropic, OpenAI, Google Gemini, OpenRouter, or a custom/local endpoint. Screenshots may contain code, secrets, or personal data visible on screen.

- Only watch the window you intend to share, and avoid capturing screens with live secrets, keys, or private data.
- Your screenshots go to the provider **you** selected; their data-retention and training policies apply.
- For fully local analysis, use Ollama or LM Studio with a vision-capable local model — nothing leaves your machine.

Project memory (`.nemp/`) is plain JSON on your disk and is never uploaded. API keys are stored in your OS user-data directory, never in the repo, and the renderer process never receives raw keys (a one-way IPC channel only).

### The `worker/` proxy is disabled — do not deploy it without auth

The Cloudflare Worker proxy in `worker/` is **disabled in v1** and kept for reference only. In its current form it is an **unauthenticated open relay**: anyone with the deployed URL could spend your Anthropic API key. Do not deploy it, and do not point the app at a deployment of it, until per-user authentication lands (planned for v1.1).

If you find that a deployment of this worker is live anywhere, please report it through the channels above.

## Supported versions

| Version | Supported |
|---|---|
| 1.0.x (latest release) | ✅ |
| < 1.0 | ❌ |
