# Developing Gencraft

This page is for people changing the code. To use the app, install it from the releases (see the README).

## Run from source
```bash
npm install
npm run dev          # browser copy at http://localhost:5180
npm run desktop      # the desktop app (needs Rust, see https://tauri.app/start/prerequisites/)
```

## Checks that must pass before a push
```bash
npx tsc --noEmit
npm run test:registry
npm run audit:design
```
CI runs the same three on every push to `dev`. A git `pre-commit` hook runs the type check and the design audit.

## Keys while testing (never commit a key)
- Provider keys (fal, Replicate, OpenRouter, OpenAI, Gemini) are typed into **Settings > Providers** in the app. They stay in the app's own storage and never in a file of this repository.
- A script that needs a key (for example `FAL_KEY` for the model database build) reads it from the environment. Copy `.env.example` to `.env.local` (git ignores it), fill in what you need, and run `npx tsx --env-file=.env.local scripts/build-knowledge.mts`.
- App backups (`.gencraftbackup`) never contain keys, but they hold your own files and settings, so git ignores them too.
- `scripts/check-secrets.mjs` refuses anything that looks like a key or a key file. It runs in the pre-commit hook, the pre-push hook and CI. Turn the hooks on once with `git config core.hooksPath .githooks`.

## The model database
```bash
npm run knowledge:build        # reads the providers, applies the gate and coverage checks, writes src/lib/knowledge/pack.json
npm run knowledge:build -- --refresh   # ignore the one-day read cache
```
`docs/knowledge-gaps.md` reports what changed, what is missing and where. A workflow rebuilds and publishes it daily.

## Branches
- Make your change on a branch of your fork and open a pull request into `dev` (see CONTRIBUTING.md). A pull request aimed at `main` is moved to `dev` automatically.
- `dev` is the inbox: the maintainers review and merge here, then the change is carried into the private development repository and ships with the next release.
- `main` holds released versions only. In this public repository it receives one commit per release; the maintainers prepare releases in a private repository.

## Names
The app was called T18, T20 and CineZinc before Gencraft. Those names live only in `src/lib/legacy-names.ts`, which moves data saved by older versions to the new names on first start.

## Desktop packaging
`npm run desktop:build` makes the installers for the system you are on. Releases build all three systems in CI.
