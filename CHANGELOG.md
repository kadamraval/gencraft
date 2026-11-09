# Changelog

Release notes are added at the top by the `/release` flow, newest first. Commit messages start with `feat`, `fix`, `docs`, `chore` and so on; a `!` after the type marks a breaking change.

## v0.1.0-beta.5 (2026-11-10)

Beta. Features may change and some things are rough: please report problems at https://github.com/kadamraval/gencraft/issues.

### New
- One capability rule across the studio: Edit and Video Edit apps, a full-screen picture editor, and top-makers ranking.
- One model database read by the whole app, one model selector everywhere, and AI tools across every provider.
- Pricing page with centered Lifetime plan, six-box PIN, unified onboarding shell, and licence settings placed above updates.

### Fixed
- Updated `rustls` to `0.23.46` for Dependabot security alerts.
- Fixed `gifenc` ESM import compatibility in Node test runners.

## v0.1.0-beta.4 (2026-10-25)

Beta. Features may change and some things are rough: please report problems at https://github.com/kadamraval/gencraft/issues.

### New
- First run is short: sign up (guest for now, accounts open later), an optional PIN, pricing, and one quick setup screen.
- Free and Paid: Free is open source with one project; Paid (One Year $39 or Lifetime $99, same features) adds Agents, Connectors, building your own Apps and email support.
- Agents has its own area: Plan, Batch Create & Edit and Skills. Create and Edit no longer carry skills or batch controls.
- Connectors (Google Drive, Dropbox, Pinterest) are Paid.
- Providers show this month's usage next to each provider name.

### Other
- Projects are now saved on this device; a new install starts with one project.
- The folders, skills and elements limits are removed.

## v0.1.0-beta.3 (2026-10-25)

First public beta (beta.1 and beta.2 were never published: their Linux and Windows builds failed). Features may change and some things are rough: please report problems at https://github.com/kadamraval/gencraft/issues.

### New
- Gencraft, a desktop AI studio for images, video, voice and finished stories, using your own provider keys (fal, Replicate, OpenRouter, OpenAI, Gemini). Windows, macOS and Linux.
- First-run setup: choose Free or Paid, then profile, first project, provider keys, a drive and the save folder.
- One signed model database, rebuilt every day, with what each model can do, its settings and its price on every provider, and AI tools for any file: upscale, remove background, remove object, restyle, relight, lip-sync, dubbing, transcription and more.
- Story and Edit, Library, brand kits and elements, and Apps.
- Updates you control: the app and the model database check on the schedule you choose, with Check now.
- Free plan without the Agent and the App builder; a lifetime paid plan with a licence key unlocks them.
- Documentation website, in-app Help generated from the same guide, signed installers with checksums.

### Other
- Source under AGPL-3.0; the name Gencraft is a trademark.
