# Contributing to MyBuildy

Thanks for your interest in contributing. MyBuildy is a small open-source project — contributions are welcome, and the bar to getting a PR merged is low as long as it keeps the build and tests green.

## Ways to contribute

- **Bug reports** — open an issue with repro steps, your OS, and your provider setup.
- **Feature ideas** — open an issue first for anything larger than a small fix so we can align on direction before you invest time in the implementation.
- **Code** — pick an open issue, or propose your own change in an issue first.

## Setup

Requires Node.js 22.12 or newer. Windows and macOS are supported (macOS testing notes: [docs/MAC-TESTING.md](./docs/MAC-TESTING.md)); Linux runs from source but is untested.

```bash
git clone https://github.com/SukinShetty/mybuildy.git
cd mybuildy

# --legacy-peer-deps is required: npm 10+ crashes with an arborist "edgesOut"
# error on a clean install without it, even though every peer dependency resolves.
npm install --legacy-peer-deps

npm run dev        # start the app (Electron + Vite HMR)
```

On first launch, open **Settings** and pick a provider: enter an API key for a cloud provider (Anthropic, OpenAI, Google Gemini, OpenRouter) or point Base URL at a local server (Ollama, LM Studio). There is no default model — pick one and let the vision check pass.

## The rules

**Typecheck, build, and tests must stay green.** CI runs these on every PR:

```bash
npm run typecheck   # tsc over main, renderer, and e2e configs
npm run build       # compile main / preload / renderer via electron-vite
npm test            # vitest unit suite
```

There is also an end-to-end suite (`npm run test:e2e`, and `npm run test:e2e:packaged` against a packaged build). It launches the real Electron app in an isolated throwaway profile — run it if you touch the main process, windows, or IPC.

**If you add behaviour, add a test.**

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

All AI calls, screen capture, and file I/O live in the **main process** (`src/main/`). The renderer never touches the filesystem or calls AI providers directly. IPC channels are defined in `ipc-handlers.ts`; the renderer accesses them through `window.mybuildy.*` (defined in `preload/index.ts`).

API keys are handled exclusively in `secure-store.ts`. Do not pass key values across the IPC boundary — only booleans (`hasKey`).

Read [`AGENTS.md`](./AGENTS.md) for the full architecture, the IPC channel map, and the code style (functional components only, explicit types, no `any`, no new dependencies without discussion).

## Before opening a PR

- Keep PRs small and focused on one change.
- Add screenshots or a short clip for UI changes — the mascot and panel are visual.
- Update `CHANGELOG.md` under Unreleased if your change is user-visible.

## PR process

1. Branch from `main`.
2. Make your change; keep typecheck, build, and tests green.
3. Open the PR with a clear description: what it does, why, and how you tested it. Link the related issue if there is one.
4. A maintainer reviews; CI must be green before merge.

## What's out of scope for now

- The `worker/` directory is not used by MyBuildy v0.1 (see [`worker/README.md`](./worker/README.md)). PRs that re-enable it will not be merged until the authentication work planned for a later release is in place.
- Bundled binaries or pre-built installers are not accepted as PR content.
