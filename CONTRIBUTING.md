# Contributing to Buildy

Thanks for helping make Buildy better. Buildy is a screen-aware desktop companion that helps non-technical founders build with AI coding tools — contributions of all sizes are welcome.

## Ways to contribute

- **Bug reports** — open an issue with repro steps, your OS, and your provider setup.
- **Feature ideas** — open an issue first for anything larger than a small fix so we can align on direction before you spend time on it.
- **Code** — pick an open issue, or propose your own change in an issue first.

## Development setup

**Requirements:** Node.js 18+, Windows 10+ / macOS 12+ / Linux.

```bash
git clone https://github.com/SukinShetty/Buildy-oss.git
cd Buildy-oss

# NOTE: --legacy-peer-deps is required.
# electron-vite pins an older Vite peer range than the Vite 6 we use,
# so a plain `npm install` fails with peer-dependency errors.
npm install --legacy-peer-deps

npm run dev        # start the app (Electron + Vite HMR)
```

On first launch, open **Settings** and pick a provider: enter an API key for a cloud provider (Anthropic, OpenAI, Gemini, OpenRouter) or point Base URL at a local server (Ollama, LM Studio).

## Useful commands

```bash
npm run dev        # dev mode with HMR
npm run build      # compile main / preload / renderer
npm test           # vitest — voice queue, speech formatter, semantic dedup
npm run package    # build installers (nsis / dmg / AppImage) → dist/
```

## Before opening a PR

- `npm run build` and `npm test` must both pass — CI runs exactly these two on every PR.
- Read [`AGENTS.md`](./AGENTS.md) — it documents the architecture, the IPC channel map, and the code style (functional components only, explicit types, no `any`, all API/storage calls through IPC, no new dependencies without discussion).
- Keep PRs small and focused on one change.
- Add screenshots or a short clip for UI changes — the mascot and panel are visual.
- Update `CHANGELOG.md` under Unreleased if your change is user-visible.

## PR process

1. Branch from `main`.
2. Make your change, keep the build and tests green.
3. Open the PR with a clear description: what it does, why, and how you tested it. Link the related issue if there is one.
4. A maintainer reviews; CI must be green before merge.
