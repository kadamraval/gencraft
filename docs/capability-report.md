# Capability report

Read from the standard database (398 endpoints). Made by `npx tsx scripts/capability-report.mts`.

## Edit options: models that fit, per provider

| Option | fal | Replicate | OpenRouter |
|---|---|---|---|
| Voice isolation (audio) | 1 (ElevenLabs) | 1 (Demucs) | 1 (GPT Audio) |
| Noise reduction (audio) | 1 (DeepFilterNet 3) | 1 (Resemble Enhance) | 1 (GPT Audio) |
| Stem splitter (audio) | 2 (SAM Audio) | 2 (Demucs) | 1 (Demucs (on this computer)) |
| Voice changer (audio) | 1 (ElevenLabs) | 1 (Realistic Voice Cloning) | 1 (GPT Audio) |
| Voiceover (audio) | 6 (Eleven 4) | 5 (MiniMax Speech 2.8) | 13 (Eleven 4) |
| Music (audio) | 6 (Eleven Music 2.5) | 6 (Lyria 3.0) | 2 (Lyria 3.0) |
| Sound effects (audio) | 7 (Stable Audio 3.0) | 6 (Stable Audio 2.5) | 3 (Lyria 3.0) |
| Remove background (video) | 4 (Bria) | 5 (BiRefNet) | 3 (FLUX) |
| Remove object (video) | 4 (Bria) | 4 (Gemini Omni Flash 1.1) | 3 (FLUX) |
| Upscale (video) | 5 (SeedVR) | 6 (Crystal) | 4 (FLUX) |
| Slow motion (video) | 5 (Topaz) | 5 (RIFE) | 3 (FLUX) |
| Denoise (video) | 5 (Topaz) | 5 (Stability AI) | 3 (FLUX) |
| Colorize (video) | 4 (LTX 2.3) | 4 (Gemini Omni Flash 1.1) | 3 (FLUX) |
| Relight (video) | 5 (Lightx) | 4 (Gemini Omni Flash 1.1) | 3 (FLUX) |
| Restyle (video) | 4 (Lucy) | 5 (Black Forest Labs) | 3 (FLUX) |
| Reframe (video) | 5 (Ray 3.2) | 5 (Luma) | 3 (FLUX) |
| AI dubbing (video) | 4 (ElevenLabs) | 5 (ElevenLabs) | 3 (FLUX) |
| Auto sound FX (video) | 4 (Mirelo SFX2.0) | 6 (HunyuanVideo-Foley) | 3 (FLUX) |
| Auto score (video) | 3 (FLUX 3) | 5 (Video2Music) | 3 (FLUX) |
| Extend video (video) | 5 (Hailuo H3) | 5 (Grok Imagine) | 3 (Seedance 2.5) |
| Lip-sync (video) | 3 (ElevenLabs) | 1 (PixVerse) | 1 (Avatar IV) |
| Motion transfer (video) | 4 (Kling 3) | 6 (Kling 3) | 2 (FLUX 3) |
| Edit by prompt (video) | 3 (FLUX 3) | 4 (Kling 3.0) | 3 (FLUX) |
| Remove background (image) | 14 (Ideogram) | 24 (BiRefNet) | 21 (FLUX 3) |
| Upscale (image) | 15 (Topaz) | 24 (Crystal) | 21 (FLUX 3) |
| Colorize (image) | 14 (DDColor) | 23 (Topaz Labs) | 21 (FLUX 3) |
| Restore (image) | 15 (Topaz) | 24 (GFPGAN) | 21 (FLUX 3) |
| Remove object (image) | 15 (Ideogram) | 23 (Eraser) | 21 (FLUX 3) |
| Relight (image) | 14 (Fibo) | 23 (IC-Light) | 21 (FLUX 3) |
| Restyle (image) | 14 (Fibo) | 23 (Clarity AI) | 21 (FLUX 3) |
| Generative fill (image) | 14 (Bria Expand) | 24 (Bria Expand) | 21 (FLUX 3) |

## Gaps to look into

Each is checked against the provider's own list: either our reader misses the model, or the maker's model is not offered there.

None.

## Readings that look wrong

- fal/google/nano-banana-2.1/edit: a picture model with a clip or sound field (ignored)
- replicate/prunaai/flux-kontext-fast: edits but no field for the file it changes
