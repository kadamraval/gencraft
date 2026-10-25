# Gencraft library content packs

Elements and templates for the Gencraft app, as signed data packs. The app checks this repository's published address once a day and uses anything newer, so adding or improving content here reaches every user without an app update.

## Add or change content
1. Edit or add a file in `packs/` (one pack per file). A pack is `{ id, title, version, type, license, items }`.
2. Raise the pack's `version` whenever you change it. The app only takes a higher version than the one it has.
3. Run `npm install` once, then `npm run validate`. It names the first problem in any pack.
4. Push to `main`. The GitHub Action validates, signs and publishes to GitHub Pages.

## One-time setup
- Repository settings, Pages: source "GitHub Actions".
- Repository secret `PACKS_PRIVATE_KEY`: the contents of `.license/packs-private.jwk.json` from the app repository (made by `npx tsx scripts/packs.mts keygen`). Never commit that file.
- In the app, Settings, Content packs: paste this repository's Pages address (for example `https://<you>.github.io/<repo>/`).

## Rules
- Data only: values for controls the app already has. No code. A pack that needs a newer app says so with `minApp`.
- Anything imported from elsewhere needs its licence named in the pack's `license` field.
- Large media does not belong here: keep only metadata and a hash, and host the file on a CDN.
