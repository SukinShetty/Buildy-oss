# Security Policy

## Supported versions

| Version | Supported |
|---|---|
| 0.1.x (latest release) | ✅ |
| < 0.1 | ❌ |

## Reporting a vulnerability

Please **do not open a public GitHub issue** for security reports.

- **Preferred:** use GitHub's private vulnerability reporting on this repository (Security tab → **Report a vulnerability** on [SukinShetty/mybuildy](https://github.com/SukinShetty/mybuildy/security)).
- **Or email:** sukin.shetty8@gmail.com

Include steps to reproduce, the affected version or commit, and the potential impact. You can expect an acknowledgement within 72 hours and follow-up updates until the report is resolved. If the issue is confirmed, we will credit you in the fix notes unless you prefer otherwise.

## Things to know about My Buildy's security model

### Screen capture and your data

My Buildy works by capturing a window you explicitly pick and **sending those screenshots to the AI provider you configure** — Anthropic, OpenAI, Google Gemini, OpenRouter, or a custom/local endpoint. Screenshots may contain code, secrets, or personal data visible in that window.

- Only watch the window you intend to share, and avoid capturing screens with live secrets, keys, or private data.
- Your screenshots go to the provider **you** selected; their data-retention and training policies apply.
- For fully local analysis, use Ollama or LM Studio with a vision-capable local model — nothing leaves your machine.

Project memory (`userData/mybuildy-memory/<projectId>`) is plain JSON on your disk and is never uploaded except as context in the analysis calls to your chosen provider. API keys are encrypted at rest with Electron `safeStorage` (DPAPI on Windows); if OS encryption is unavailable, My Buildy refuses to save keys rather than store them in plaintext. The renderer process never receives raw keys — secrets cross IPC one way only, and the UI sees only `hasKey` booleans.

### Screen text can influence suggested prompts

My Buildy reads the watched window, so text visible on that screen can influence the prompts it suggests (a prompt-injection vector). Mitigations: My Buildy never sends a prompt without an explicit user click, and a destructive-prompt guard requires a second confirmation click on prompts that match dangerous patterns (deletes, force-pushes, secret exfiltration). The guard is heuristic — the user's review is the final check.

### The `worker/` proxy is not used — do not deploy it without auth

The proxy in `worker/` is **not used by My Buildy v0.1** and is kept only for a possible hosted option later. In its current form it is an **unauthenticated open relay**: anyone with a deployed URL could spend your API key. Do not deploy it, and do not point the app at a deployment of it, until per-user authentication lands. See [`worker/README.md`](./worker/README.md).

If you find that a deployment of this worker is live anywhere, please report it through the channels above.
