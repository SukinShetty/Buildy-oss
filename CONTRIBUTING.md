# Contributing to Buildy

Thanks for your interest in contributing. Buildy is a small open-source project — contributions are welcome, and the bar to getting a PR merged is low as long as it keeps the build and tests green.

## Before you start

For anything beyond a small bug fix or typo, please **open an issue first** so we can discuss direction before you invest time in the implementation. This avoids the frustrating situation where a PR is well-written but goes in a direction the project isn't heading.

## Setup

```bash
git clone https://github.com/SukinShetty/Buildy-oss.git
cd Buildy-oss

# --legacy-peer-deps is required — electron-vite pins an older Vite peer range
npm install --legacy-peer-deps

npm run dev
```

## The rules

**Build must stay green.**
```bash
npm run build
```
This compiles main, preload, and renderer via electron-vite. Fix any TypeScript errors before opening a PR.

**Tests must stay green.**
```bash
npm test
```
45 tests covering the voice queue, speech formatter, semantic dedup, capture guard, verifier, and response parser. If you add behaviour, add a test.

**Commit style.** Use [Conventional Commits](https://www.conventionalcommits.org/):
- `feat: add X` — new behaviour
- `fix: correct Y` — bug fix
- `docs: update README` — documentation only
- `refactor: simplify Z` — no behaviour change
- `test: add coverage for W` — tests only

## Code orientation

The renderer is a single bundle routed to three windows via a query param in `App.tsx`:
- `?companion` — the always-on-top mascot
- `?guidance` — the frosted-glass guidance panel
- `?voice` — the hidden audio player

All AI calls, screen capture, and file I/O live in the **main process** (`src/main/`). The renderer never touches the filesystem or calls AI providers directly. IPC channels are defined in `ipc-handlers.ts`; the renderer accesses them through `window.buildy.*` (defined in `preload/index.ts`).

API keys are handled exclusively in `secure-store.ts`. Do not pass key values across the IPC boundary — only booleans (`hasKey`).

## What's out of scope for now

- The Cloudflare Worker proxy (`worker/`) is disabled in v1. PRs that re-enable it will not be merged until the authentication work planned for v1.1 is in place.
- Bundled binaries or pre-built installers are not accepted as PR content.
