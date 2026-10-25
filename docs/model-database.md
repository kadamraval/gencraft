# Gencraft model database: how providers, models, jobs, prices and settings are collected and used

Written 2026-10-24 from the code as it stands. Numbers are from the latest build: **263 models, 451 provider lines, 39 jobs, 5 providers**, gate with 0 problems.

---

## 1. What problem it solves

The app has to know, for the latest and most popular image, video and audio models:

- **what each model can do** (one model often does several jobs),
- **which settings it takes** (aspect ratio, resolution, duration, seed, audio, upscale factor...),
- **what it costs** and how that is billed,
- **where it runs** (which provider, which endpoint id),
- **which model is best for a job on each provider**, with backups.

Before this database that knowledge was hand-typed in several places and was often old or wrong ("No model" on tool cards, missing prices). Now there is **one standard database** (the "sheet"), filled automatically from live provider data. The app reads nothing else for these facts.

Two rules hold everywhere:

1. **A fact comes from a named source (with its address and date) or it is absent and listed as a gap.** Nothing is guessed.
2. **A model is published only when its lines are complete**: a job, settings, a price and an endpoint.

---

## 2. Vocabulary

| Word | Meaning |
|---|---|
| **Provider** | where a model runs and who bills you: `fal`, `replicate`, `openrouter`, `openai`, `gemini` |
| **Maker** | who made the model (Google, ByteDance, Black Forest Labs, Kuaishou...). One maker's model can be on several providers |
| **Model** | one canonical model, the same on every provider. Id is `maker/family-version` |
| **Endpoint** | the provider's own id for a model (`fal-ai/flux/dev`, `google/gemini-nano-banana-2.1`) |
| **Job** | what the app does with a model, from our own list of 39 (`video-upscale`, `text-to-image`, `audio-transcribe`...) |
| **Category** | the industry name for input to output (`text-to-image`, `image-to-video`, `video-to-video`, `speech-to-text`) |
| **Capability** | what a model can do, as a combination of inputs and outputs. A model has many; it is recorded as a list of jobs |
| **Line** | one model on one provider doing one job, with its price and settings. The unit the app reads |
| **Rank / role** | position of a line for a job on a provider (1 is first choice) and why it is there: `model` (maker's own), `substitute` (provider's own newest), `alternative` (follows instructions and does the job by being told to) |
| **Pack** | the whole database as one signed JSON file, `src/lib/knowledge/pack.json` |

---

## 3. The sheets (tabs) and where they live

The agreed 11-tab Knowledge Book is written as one JSON pack and also exported as a workbook (`docs/knowledge-book.xlsx`) for people.

| Sheet | In the pack | Holds |
|---|---|---|
| Makers | `makers` | id, name, country, docs address, own API, open or closed weights |
| Models | `models` | canonical id, maker, name, version, type, category, jobs, status, `latest`, retirement |
| Jobs and names | `jobs` | the 39 jobs: id, name, kind (tool or create), group, category, what it takes in and gives, other names, where it is used |
| Capabilities | `models[].jobs` | which jobs each model does |
| Parameters | `models[].lines[].params` | the exact settings, in the registry's schema, with the provider's own field names |
| Providers | code (`adapters/`) | how each provider is read: auth, run style, limits |
| Provider lines | `models[].lines` | model x provider x job: endpoint, rank, role, price, settings, status |
| Sources | `sources` | what was read, from where, on which date, how many models the provider's own list held |
| Gaps | `gaps` | every missing fact: field (job, settings, price, endpoint, backups) and reason; some are `blocking` |
| Completeness | `completeness` | filled against total per scope |
| Safety | later | not built |

A line's price carries `from` (`standard`, `litellm`, `api`, `page` or `maker`), the source address and the date read.

---

## 4. The data flow, end to end

```
 providers' own lists          docs and pages              reference file
 fal catalog (1321)            OpenAI docs (51)            LiteLLM price file
 OpenRouter API (607)          Gemini docs (14)            (pinned to one commit)
 Replicate pages (852)         fal model pages (prices)
        |                             |                           |
        +--------------+--------------+---------------------------+
                       v
            scripts/build-knowledge.mts   (reads, caches one day in scripts/.cache)
                       v
            src/lib/knowledge/build.ts    (matches models to jobs, ranks, fills prices, builds lines)
                       v
            validatePack  +  coverage checks  +  freshness guard   <- the gate
                       |  fails: nothing is written, the build names the problem
                       v
            pack.json  (+ docs/knowledge-gaps.md + docs/knowledge-book.xlsx)
                       v
            scripts/sign-knowledge.mts   (ECDSA P-256, key never committed)
                       v
            gencraft public repo, gh-pages branch  /knowledge/pack.json + pack.sig
                       v
            the app (store.ts: loader, IndexedDB copy, schedule, keeps last good)
                       v
            registry records + AI tool matcher + defaults + price estimate
```

A GitHub workflow runs this every day at 03:17 UTC. The app also ships with a copy of the pack inside it.

---

## 5. How each provider is read

All readers return the same record shape (`ModelRecord`: provider, endpoint, modality, task, inputs, settings, price, status). No provider needs a key for the build except where noted.

### fal
- **List:** fal's own catalog, category by category (`text-to-image`, `image-to-image`, `text-to-video`, `image-to-video`, `video-to-video`, `text-to-audio`, `text-to-speech`, `audio-to-audio`, `speech-to-speech`, `speech-to-text`, `audio-to-text`, `video-to-audio`, `audio-to-video`).
- **Coverage check:** the build also reads fal's whole list with no filter and compares categories; a media category it does not know stops the build (this found `speech-to-speech`).
- **Settings:** from each model's own OpenAPI input schema.
- **Price:** fal's price API needs a key, so the build reads the **price note embedded in each model's page** (`fal-price.ts`). It understands many wordings: per image, per megapixel, per second of video, with and without audio, tiers by resolution, per frame, per 1,000 video tokens, token prices, "tentative" prices, and **compute-time billing** (shown as its published rate per compute second). Rate-limit answers are retried.
- **Tools:** a fal endpoint is marked a tool from its own name (`isToolEndpoint`), e.g. names containing upscale, background-removal, interpolate, isolate.

### Replicate
- **List and prices:** read from Replicate's **public pages**, no key (`scripts/lib/replicate-public.mts`): the model pages hold the billing block. Hardware-billed models show the rate per second.
- **Jobs:** Replicate groups models into **collections** (`text-to-video`, `super-resolution`, `remove-backgrounds`, `lipsync`...). `collection-jobs.ts` maps each collection to jobs; for a collection with several jobs the model's own endpoint name picks among the few the table lists. Collections the build does not read are written to the report.
- **Bring-your-own-key models** (running on the maker's own key) are priced from the maker's price in the LiteLLM file.

### OpenRouter
- **List:** `GET /api/v1/models?output_modalities=all`, plus `/api/v1/videos/models`. OpenRouter lists **kinds of output** separately: text, image, video, speech, transcription, embeddings, rerank, decisions.
- **Coverage check:** per kind, models listed against models read. A media kind that is not fully read stops the build; routers with a negative price are skipped on purpose.
- **Prices:** video from `pricing_skus` (per second by resolution, with or without audio, per run, per token); image per image or per token; **speech per input character**, **transcription per second of audio** (shown per minute), token-priced when an output price also exists.
- **Settings:** from `supported_*` fields, frame image slots (first and last frame), aspect ratios, resolutions, durations and the voice list.
- A picture model that takes text and optionally a picture counts for text-to-image and for edit.

### OpenAI and Gemini
- Read live from their **model documentation pages** (`openai-docs.ts`, `gemini-docs.ts`), because they retire models without notice.
- Image, speech, music and transcription models, with token, character, second or minute prices parsed from the pricing tables.
- Known facts at the last build: OpenAI has no video model (Sora 2 was shut down on 2026-09-24); Gemini video is Gemini Omni Flash; Veo previews and Imagen 4 are retired.

### LiteLLM (reference, not a provider)
- The public model price file, **pinned to one commit** (sha recorded in `sources`). Used to fill a price when the provider gives none and to price bring-your-own-key models.

### Order in which a fact is taken
1. OpenAI standard and the LiteLLM file
2. the provider's own API or list
3. the provider's page reader
4. otherwise a named gap

For prices the provider's own number wins; LiteLLM fills only where the provider states nothing. A second source that differs by more than 10 percent marks the line `conflict`.

---

## 6. How a job is identified (category, capability, parameters)

A model never has one category. The database records a **list of jobs**, decided from three signals, strongest first:

1. **The provider's own grouping** where it gives one (fal category, Replicate collection, OpenRouter output kind).
2. **The model's input schema**: a field of format `video`, `image` or `audio` shows what file it takes. Video in and video out can be a tool; text only in is a generator.
3. **The endpoint name** (`src/lib/sheet/jobs.ts`, `job-map.ts`): rules such as `upscale`, `remove-background`, `interpolate`, `isolate-voice`, `reframe`, `extend`, `lip-sync`.

Where the signals are weak the model is **"unknown"**: it is left out, never guessed.

### The 39 jobs

**Tools (change a file you have)**

| Group | Jobs |
|---|---|
| Video | `video-edit`, `video-extend`, `video-lip-sync`, `video-motion-transfer`, `video-upscale`, `video-slow-motion`, `video-denoise`, `video-remove-background`, `video-remove-object`, `video-colorize`, `video-relight`, `video-restyle`, `video-reframe`, `video-dub`, `video-remove-fillers`, `video-sound-effects`, `video-music` |
| Audio | `audio-voice-isolation`, `audio-noise-reduction`, `audio-stems`, `audio-voice-changer`, `audio-transcribe` |
| Image | `image-remove-background`, `image-upscale`, `image-restore`, `image-remove-object`, `image-relight`, `image-restyle`, `image-outpaint`, `image-colorize`, `image-edit` |

**Create (make something from a prompt)**

`text-to-image`, `image-to-image`, `text-to-video`, `image-to-video`, `reference-to-video`, `audio-text-to-speech`, `audio-text-to-music`, `audio-text-to-sfx`.

Each job records its category, what it takes in, what it may also take, what it gives, other names it is known by, and where the app uses it (create, audio, edit, story, agent, library).

---

## 7. Price handling

`PriceUnit` values: `per_image`, `per_second`, `per_run`, `per_1m_tokens`, `per_megapixel`, `per_1k_chars`, `per_minute`, `per_megapixel_second`, `per_frame`, `unknown`.

- A price counts if `amount > 0`, or a compute-second rate is published, or the provider's API states an explicit zero (free).
- Token-billed models carry input, output and cached rates.
- Compute-time billing is shown as its published rate; the real total is learned from the run (fal usage reconcile, run calibration).
- **A top model is never hidden because its price is hard to read.** The build stops and names it; the fix goes into the reader. Exceptions the owner accepts are listed in `src/lib/knowledge/unpriced-allowed.json` (BiRefNet and Wizper on fal publish no price).
- Prices feed the estimate shown before each run (`registry/price.ts`); real runs correct it (`ledger/actual-cost.ts`, `calibration.ts`).

---

## 8. The build stages (`src/lib/knowledge/build.ts`)

| Stage | What it does |
|---|---|
| 1 | **Maker list** (`src/lib/sheet/makers.json`, about 87 entries): each declared model on every provider that runs it |
| 1b | **Tool jobs**: declared tool endpoints, found on whichever provider lists them |
| 1b2 | **Newer versions**: for each declared family, a higher version in a provider's own list is added as a top model and listed under "New versions found" (for example Kling V3 to Kling 4.0) |
| 1c | **Popular and latest**: the arena leaderboards' leaders and the newest releases of the leading makers (`computeDefaultEnabled`) |
| 1d | **Jobs no leaderboard ranks**: transcription, sound for a video, a talking video from a voice; the provider's newest models, up to eight |
| 2 | **Backups**: where a job has fewer than four lines on a provider, that provider's own newest complete models fill the rest (role `substitute`) |
| 2b | **Alternatives**: for `image-remove-object`, `image-restyle`, `image-outpaint`, `image-relight`, instruction-following picture models fill the rest (role `alternative`); the tool carries the instruction sentence |
| 3 | **Ranks**: for each job on each provider, maker-list models first, then backups newest first, then alternatives; ranks run 1, 2, 3 without a gap |

The maker list is a seed, not a hand-kept truth: stages 1b2 to 1d find models it does not name.

---

## 9. The gate (what stops a bad database)

The build writes `pack.json` only when there are **no problems**:

- **`validatePack`**: a job, a known maker and job ids, settings, a price with a date, an endpoint, ranks 1..n without gaps, no duplicate model.
- **Blocking price gaps**: a top model without a readable price.
- **Coverage checks**: every media kind OpenRouter lists, and every media category fal lists, must be read (a new kind or category stops the build and names it).
- **Freshness guard**: a provider's list that shrinks by more than 30 percent, or is empty, stops the build.
- **What changed** is written to `docs/knowledge-gaps.md`: per provider the count read and the count last time, models new and gone, new versions found, Replicate collections not read, and the provider x job matrix.

When the gate fails nothing is published, the app keeps the last good pack, and the daily workflow opens a GitHub issue.

---

## 10. Signing, publishing, loading

- `scripts/sign-knowledge.mts` signs `pack.json` with ECDSA P-256 (the same key as content packs, `.license/packs-private.jwk.json`, never committed; a GitHub secret in CI). It refuses to sign a pack that fails the gate.
- It is published to `https://kadamraval.github.io/gencraft/knowledge/` (`pack.json`, `pack.sig`, the gap report and the workbook).
- `src/lib/knowledge/store.ts` loads the pack bundled in the app, or a newer downloaded one kept in IndexedDB; `pack-client.ts` verifies the signature with the public key `packs-public.json` and ignores anything that does not verify. It keeps the last good copy.
- The person chooses how often it is checked (Settings, General, Updates: every day, week, month or only on click).

---

## 11. How the app uses it

- **Registry** (`registry/store.ts`, `pack-to-registry.ts`): pack lines become `ModelRecord`s with `jobs` and ranks attached; tool models carry `utility: true`.
- **AI tool cards** (`ai-tools/match.ts`): for a tool, take the pack models ranked for that job, on providers the person has a key for and the app can run, best rank first then cheapest. Word search over names and descriptions (`finders.ts`) is only a fallback, and only accepts a model that takes the right kind of file. If nothing fits the card says "add a key" or "add a model".
- **Per-tool choice**: the card opens with the last model used, otherwise a favourite, otherwise the top-ranked one; a picker lists the others, and "Show all" adds models that fit by file type.
- **Defaults and roles** (`registry/enabled.ts`, `roles.ts`): the database's own models get priority in default picks.
- **Settings forms** are built from each line's settings schema, so a tool shows only options its model has.
- **Cost**: the estimate uses the line's price; actual cost corrects it.

---

## 12. Numbers at the last build

| | |
|---|---|
| Models | 263 |
| Provider lines | 451 (fal 182, OpenRouter 100, Replicate 114, OpenAI 29, Gemini 26) |
| Jobs | 39 |
| Provider lists read | fal 1,321 - Replicate 852 - OpenRouter 607 - OpenAI 51 - Gemini 14 |
| Gate problems | 0 |
| Gaps | 469: endpoint 308 (a provider has no such model), backups 152 (fewer than four exist), price 7, settings 2 |

OpenRouter lines by job, as an example of coverage: text-to-video 15, image-to-video 15, text-to-speech 16, speech-to-text 9, text-to-image 7, image-edit 14 and others. Only the first four backups per job per provider are kept; the rest appear under "Show all" in the app.

---

## 13. Real limits (stated plainly)

- No provider-model exists for some jobs: OpenAI has no video; OpenAI, Gemini and OpenRouter have few or no models for upscale, remove background and voice isolation. The card says so.
- BiRefNet and Wizper publish no price on fal (accepted exceptions).
- Replicate, OpenAI and Gemini have no per-kind count to compare against like OpenRouter and fal; they rely on the shrink guard.
- Unit meaning on OpenRouter speech and transcription prices is inferred from known prices (Whisper, Qwen TTS) because the API states none; two Microsoft transcription prices only make sense per hour and are read that way.
- Real paid runs of every model have not been done; accepted and rejected settings are learned from real runs over time.

---

## 14. Files

| Path | Role |
|---|---|
| `scripts/build-knowledge.mts` | reads every source, runs the gate, writes the pack and reports |
| `scripts/sign-knowledge.mts` | signs the pack |
| `scripts/test-knowledge.mts` | tests for the build, gate, coverage and schema |
| `scripts/export-knowledge-xlsx.py` | writes the workbook |
| `scripts/lib/replicate-public.mts` | keyless Replicate reader |
| `src/lib/knowledge/schema.ts` | pack types and `validatePack` |
| `src/lib/knowledge/build.ts` | matching, ranking, line building |
| `src/lib/knowledge/jobs.json`, `job-map.ts`, `collection-jobs.ts` | the 39 jobs and how a model maps to them |
| `src/lib/knowledge/unpriced-allowed.json` | accepted price exceptions |
| `src/lib/knowledge/pack.json` | the database |
| `src/lib/knowledge/pack-client.ts`, `store.ts`, `update-schedule.ts` | verify, load, schedule |
| `src/lib/registry/adapters/*` | the provider readers (fal, fal-price, openrouter, openai-docs, gemini-docs, replicate) |
| `src/lib/sheet/makers.json`, `jobs.ts` | the maker list and endpoint-name rules |
| `src/lib/ai-tools/*` | tool catalog, matcher, runner |
| `docs/knowledge-gaps.md`, `docs/knowledge-book.xlsx` | report and workbook |

---

## 15. How to extend it

- **A new maker or model:** add it to `src/lib/sheet/makers.json` (or do nothing: stages 1b2 to 1d find new versions and popular models by themselves).
- **A new job:** add it to `jobs.json`, give `job-map.ts` the (type, category, job) mapping and the endpoint-name rule in `sheet/jobs.ts`, and add a tool entry in `ai-tools/catalog.ts`.
- **A new provider:** write an adapter that returns `ModelRecord`s, add it to `Provider`, `PROVIDERS` and the build script, and add a coverage check against that provider's own counts.
- **A price wording that is not read:** the build names the model; add the pattern to `fal-price.ts` (or the right reader) with a test using the real sentence.
- Commands: `npm run knowledge:build` (add `-- --refresh` to ignore the one-day cache), `npx tsx scripts/test-knowledge.mts`, `npm run test:registry`.
