# Contributing to Gencraft

Thank you for helping. Gencraft is open source under the [AGPL-3.0](LICENSE); the name and logo are covered by the [trademark policy](TRADEMARK.md). Be kind: the [code of conduct](CODE_OF_CONDUCT.md) applies everywhere.

## Ways to help, from least to most work
1. **Report a problem or suggest something** with an [issue](https://github.com/kadamraval/gencraft/issues/new/choose). Model requests are welcome: say which model and which provider.
2. **Improve the guides.** Every page of the [documentation](https://kadamraval.github.io/gencraft/) is a markdown file in `docs-site/src/content/docs/`. Fixing a sentence is a good first contribution.
3. **Add content packs.** Effects, transitions, caption styles, text styles, elements and templates are plain data files in `content/`. `npm run packs:validate` names the first problem in any pack. The maintainer signs and publishes packs after a merge, so you never need a key.
4. **Fix a bug or improve something small.** One change per pull request.

Larger features and anything about licences, keys, signing or the paid plan are done by the maintainer: please open an issue first to talk about it, so you do not spend time on a change that cannot be merged.

## Before your first pull request
1. Fork the repository and make a branch from `dev`. Never put a real key in a file: see "Keys while testing" in [docs/DEVELOPING.md](docs/DEVELOPING.md).
2. Install and check that it runs: see [docs/DEVELOPING.md](docs/DEVELOPING.md).
3. Make your change. Match the style of the code around it.
4. Run the checks, which must all pass:
   ```bash
   npx tsc --noEmit
   npm run typecheck:community
   npm run test:registry
   npm run audit:design
   ```
   If you changed the user guide, run `npm run help:build` and include the updated `src/lib/help/help.generated.json`.
5. Open the pull request against the **`dev`** branch (`main` holds released versions only; a pull request aimed at `main` is moved to `dev` for you). Say what changed and why, in plain words.
6. **Sign the CLA once.** A bot comments on your first pull request with the one line to reply. The [agreement](CLA.md) lets the owner also include your work in the official paid build.

## What happens next
The maintainer reviews, may ask for changes, and merges. Merged changes reach the next release. Your name stays in the history.

## What a community build does not include
The Agent and the App builder are part of the paid plan and live in a private folder, so a build made from this source has stand-ins for them. Please do not send changes that try to re-create them here; if you want to build your own agent, that is welcome as a separate project under the AGPL.

## Security
Please report vulnerabilities privately: see [SECURITY.md](SECURITY.md).
