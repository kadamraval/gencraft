# Gencraft terms

The one list of words for models. The doc, the sheet (`docs/knowledge-book.xlsx`), the database (`src/lib/knowledge/pack.json`) and the code use these words with exactly these meanings. If a word is not here, it is not a model term.

| Word | Means | Values or example | In the database |
|---|---|---|---|
| **Maker** | The company that made the model | ByteDance, Google, Alibaba | `makers[]` |
| **Model** | One model by one maker, the same on every provider | `bytedance/seedance-2-5` | `models[]`, id = `maker/model` |
| **Category** | What a model makes | `image`, `video`, `audio`, `text`, `embedding` | `models[].category` |
| **Task** | A way of making something inside a category | `text-to-video`, `image-to-video`, `reference-to-video`, `text-to-image` | `tasks[]` (own list), `models[].tasks` |
| **Tool** | Changes a file you already have. A separate list from Tasks | `video-upscale`, `image-remove-background`, `video-lip-sync`, `audio-stems` | `tools[]` (own list), `models[].tools` |
| **Capability** | What a model can take in | `start-image`, `end-image`, `reference-images` (max 9), `reference-videos`, `reference-audio`, `elements`, `source-video`, `source-audio` | `models[].capabilities` |
| **Parameter** | A setting you change | `resolution`, `duration`, `aspect_ratio`, `seed`, `quality` | `models[].lines[].parameters` |
| **Provider** | Where a model runs and who bills you | `fal`, `replicate`, `openrouter`, `openai`, `gemini` | `lines[].provider` |
| **Provider line** | One model on one provider, serving one task or tool | endpoint, price, the provider's own field names | `models[].lines[]` |
| **Serves** | The task or tool a provider line is for | `text-to-video`, `video-upscale` | `lines[].serves` |
| **Price** | What one unit costs on that provider, with one rule per tier (resolution, audio, quality) | `per_second`, 480p $0.2205, 720p $0.4730 | `lines[].price` |
| **Role** | Why a line is there | `model` (maker's own), `substitute` (provider's own best), `alternative` (does it when told to) | `lines[].role` |
| **Rank** | The order of lines for one task or tool on one provider (1 = first choice) | 1, 2, 3 | `lines[].rank` |
| **Provider task** | The name a provider files a model under, used only to read providers | `text-to-speech`, `video-to-video`, `speech-to-text` | `tasks[].providerTask`, `tools[].providerTask` |
| **Action** | What an endpoint's own name says it does, used only to read providers | `generate`, `upscale`, `remove-background`, `lip-sync` | maker list `action` |

## Rules
1. A **Model** belongs to its **Maker**. Its **Capabilities** are the same on every provider.
2. A **Provider** decides only two things: its own **field names** and its **price**.
3. **Tasks** and **Tools** are two separate lists. A model's tasks and tools come from what it can do, not from its name.
4. **Capabilities** (files that go in) and **Parameters** (settings) are kept apart.
5. Each fact is stored once.

## Old words (do not use)
| Old | Now |
|---|---|
| job, `jobs.json`, `jobId`, `PackJob` | **Task** (`tasks.json`, kind create) or **Tool** (`tools.json`, kind tool); a line's `jobId` is `serves` |
| category = `text-to-image`, `video-to-video` | **Task**, or **Provider task** when it is a provider's own name |
| `type`, `gen_type`, `group`, `modality` (image / video / audio) | **Category** |
| `embedded` | `embedding` |
| settings | **Parameters** |
| `params` on a provider line | `parameters` |
| Capabilities = list of jobs | **Capabilities** = what the model takes in |
| maker list `type` / `category` / `job` | `category` / `task` / `action` |

In the code: the type `Category` (all five) and `AppCategory` (the four the app runs today) in `src/lib/registry/types.ts`; every model record has `category`. Data saved before the rename (field `modality`, ledger value `embedded`) is converted when read (`src/lib/legacy-names.ts`).
