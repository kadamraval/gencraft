# Knowledge database: what was found and what is missing

Built 2026-10-27T16:55:02.395Z. 322 models, 674 provider lines. The gate found 0 problems.

## Replicate collections not read
video-to-text, ai-face-generator, text-recognition-ocr, detect-nsfw-content, text-classification, speaker-diarization, face-swap, sketch-to-image, generate-emoji, generate-anime, vision-models, image-to-text, 3d-models, official, language-models, try-for-free, control-net, embedding-models, ai-detect-objects, flux-fine-tunes, flux-kontext-fine-tunes, utilities, qwen-image-fine-tunes

## What changed since the last build
- fal: 1323 models read (last time 1323), read on 2026-10-27
- openai: 51 models read (last time 51), read on 2026-10-27
- gemini: 14 models read (last time 14), read on 2026-10-27
- openrouter: 604 models read (last time 604), read on 2026-10-27
- replicate: 6158 models read (last time 6158), read on 2026-10-27
- New in the database (2): Qwen Image Edit Plus Lora (alibaba/qwen-image-edit-plus-lora), Qwen Edit Multiangle (alibaba/qwen-edit-multiangle)
- No longer in the database (6): Restyle Video Frame (bfl/restyle-video-frame), Qwen Image Edit Plus Lora Upscale (alibaba/qwen-image-edit-plus-lora-upscale), Restore Image (bfl/restore-image), Maxim (google/maxim), Qwen Image Edit Plus Lora Fusion (alibaba/qwen-image-edit-plus-lora-fusion), Qwen Image Edit Plus Lora Relight (alibaba/qwen-image-edit-plus-lora-relight)

## Lines per provider
- fal: 290
- replicate: 144
- openrouter: 209
- openai: 16
- gemini: 15

## Families: each maker family's latest versions on every provider

### Image

| Maker | Model | Type | fal | replicate | openrouter |
|---|---|---|---|---|---|
| OpenAI | GPT Image 2.5 Flare | closed | ✓ | ✓ | ✓ |
| OpenAI | GPT Image 2.5 Sunburst | closed | ✓ | ✓ | ✓ |
| OpenAI | GPT Image 2.0 | closed | ✗ | ✓ | ✓ |
| OpenAI | GPT Image 1.5 | closed | ✗ | ✓ | ✗ |
| Google | Nano Banana 2.1 | closed | ✓ | ✓ | ✓ |
| Google | Nano Banana 2.0 | closed | ✗ | ✓ | ✗ |
| Google | Nano Banana 2.0 Lite | closed | ✓ | ✓ | ✗ |
| Google | Nano Banana Lite | closed | ✓ | ✗ | ✗ |
| ByteDance | Seedream 5.0 Flash | ? | ✓ | ✗ | ✓ |
| ByteDance | Seedream 5.0 Lite | closed | ✓ | ✓ | ✓ |
| ByteDance | Seedream 5.0 Pro | closed | ✓ | ✓ | ✓ |
| ByteDance | Seedream 4.5 | closed | ✗ | ✓ | ✓ |
| Black Forest Labs | FLUX 3 | closed | ✓ | ✓ | ✓ |
| Black Forest Labs | FLUX 3 Klein | open | ✓ | ✗ | ✓ |
| Black Forest Labs | FLUX 2 Dev | open | ✗ | ✓ | ✗ |
| Black Forest Labs | FLUX 2 Flex | closed | ✗ | ✓ | ✗ |
| Krea | Krea 3 | closed | ✓ | ✓ | ✗ |
| Krea | Krea K3 | ? | ✗ | ✗ | ✓ |
| Krea | Krea 2 Large | closed | ✗ | ✓ | ✓ |
| Krea | Krea 2 Medium | closed | ✗ | ✓ | ✓ |
| xAI | Grok Imagine Image 2.0 | closed | ✓ | ✓ | ✓ |
| xAI | Grok Imagine Image Quality | closed | ✗ | ✓ | ✓ |
| Ideogram | Ideogram 4.5 | closed | ✓ | ✓ | ✗ |
| Ideogram | Ideogram 4.5 Precise | closed | ✗ | ✓ | ✗ |
| Ideogram | Ideogram 4.0 Balanced | closed | ✗ | ✓ | ✗ |
| Ideogram | Ideogram 4.0 Instant | closed | ✓ | ✗ | ✗ |
| Alibaba | Qwen-Image 3.0 | closed | ✓ | ✓ | ✓ |
| Alibaba | Qwen-Image 3.0 Pro | closed | ✗ | ✓ | ✓ |
| Alibaba | Qwen-Image 2.1 Pro | closed | ✗ | ✗ | ✓ |
| Alibaba | Qwen-Image 2.1 Turbo | closed | ✗ | ✗ | ✓ |
| Recraft | Recraft 4.1 | closed | ✗ | ✓ | ✓ |
| Recraft | Recraft 4.1 Flash | closed | ✓ | ✗ | ✓ |
| Recraft | Recraft 4.1 Pro | closed | ✗ | ✓ | ✓ |
| Recraft | Recraft 4.1 Pro Svg | closed | ✗ | ✓ | ✗ |

### Video

| Maker | Model | Type | fal | replicate | openrouter |
|---|---|---|---|---|---|
| MiniMax | Hailuo 3.0 | closed | ✗ | ✗ | ✓ |
| MiniMax | Hailuo H3 Max | closed | ✓ | ✗ | ✓ |
| MiniMax | Hailuo H3 Max Turbo | closed | ✓ | ✗ | ✗ |
| MiniMax | Hailuo 2.3 | closed | ✗ | ✓ | ✓ |
| Alibaba | Wan 3.0 | closed | ✓ | ✓ | ✓ |
| Alibaba | Wan 3.0 Prime | closed | ✓ | ✓ | ✓ |
| Alibaba | Wan 2.7 | closed | ✗ | ✓ | ✓ |
| Alibaba | Wan 2.6 | closed | ✓ | ✓ | ✓ |
| Kuaishou (Kling) | Kling 4.0 | closed | ✓ | ✗ | ✗ |
| Kuaishou (Kling) | Kling 3.0 | closed | ✓ | ✓ | ✓ |
| Kuaishou (Kling) | Kling O3 | closed | ✓ | ✗ | ✗ |
| Kuaishou (Kling) | Kling 3.0 Omni | closed | ✗ | ✓ | ✗ |
| Google | Gemini Omni Flash 1.1 | closed | ✓ | ✓ | ✗ |
| xAI | Grok Imagine Video 1.5 | closed | ✓ | ✓ | ✓ |
| xAI | Grok Imagine Video 1.5 Lite | closed | ✓ | ✗ | ✓ |
| Lightricks | LTX 2.5 Fast | open | ✓ | ✓ | ✗ |
| Lightricks | LTX 2.5 Pro | open | ✓ | ✗ | ✗ |
| Lightricks | LTX 2.3 | open | ✓ | ✗ | ✗ |
| Lightricks | LTX 2.3 22B | open | ✓ | ✗ | ✗ |
| Luma | Ray 3.2 | closed | ✓ | ✓ | ✗ |
| Black Forest Labs | FLUX Video 3 | closed | ✓ | ✓ | ✓ |
| Black Forest Labs | FLUX Video 3 Max | closed | ✓ | ✗ | ✗ |
| Vidu | Vidu Q4 | closed | ✓ | ✗ | ✗ |
| Vidu | Vidu Q3 Pro | closed | ✗ | ✓ | ✗ |
| Vidu | Vidu Q3 Turbo | closed | ✗ | ✓ | ✗ |
| ByteDance | Seedance 2.5 | closed | ✓ | ✓ | ✓ |
| ByteDance | Seedance 2.0 | closed | ✗ | ✓ | ✓ |
| ByteDance | Seedance 2.0 Fast | closed | ✗ | ✓ | ✓ |
| ByteDance | Seedance 2.0 Mini | closed | ✓ | ✓ | ✓ |
| PixVerse | PixVerse 6.0 | closed | ✓ | ✓ | ✗ |
| PixVerse | PixVerse 6.0 Max | closed | ✗ | ✓ | ✗ |
| PixVerse | PixVerse 5.6 | closed | ✗ | ✓ | ✗ |
| PixVerse | PixVerse 5.0 | closed | ✗ | ✓ | ✗ |
| Google | Veo 3.1 | closed | ✗ | ✓ | ✓ |
| Google | Veo 3.1 Fast | closed | ✗ | ✓ | ✓ |
| Google | Veo 3.1 Lite | closed | ✗ | ✓ | ✓ |
| Google | Veo 3.0 | closed | ✗ | ✓ | ✗ |

### Audio

| Maker | Model | Type | fal | replicate | openrouter |
|---|---|---|---|---|---|
| ElevenLabs | Eleven Music 2.5 | closed | ✓ | ✗ | ✗ |
| ElevenLabs | Eleven Music 2.0 | closed | ✓ | ✗ | ✗ |
| Google | Lyria 3.5 | closed | ✓ | ✗ | ✗ |
| Google | Lyria 3.0 | closed | ✗ | ✓ | ✗ |
| Google | Lyria 3.0 Clip | closed | ✗ | ✗ | ✓ |
| Google | Lyria 3.0 Pro | closed | ✗ | ✓ | ✓ |
| MiniMax | MiniMax Music 3.0 | closed | ✓ | ✗ | ✗ |
| MiniMax | MiniMax Music 2.6 | closed | ✗ | ✓ | ✗ |
| MiniMax | MiniMax Music 2.5 | closed | ✗ | ✓ | ✗ |
| MiniMax | MiniMax Music 1.5 | closed | ✗ | ✓ | ✗ |
| Stability AI | Stable Audio 3.0 Medium | open | ✓ | ✗ | ✗ |
| Stability AI | Stable Audio 3.0 Small Music | open | ✓ | ✗ | ✗ |
| Stability AI | Stable Audio 3.0 Small Sfx | open | ✓ | ✗ | ✗ |
| Stability AI | Stable Audio 2.5 | open | ✗ | ✓ | ✗ |
| ElevenLabs | Eleven 4 | closed | ✓ | ✗ | ✓ |
| ElevenLabs | Eleven 4 Turbo | closed | ✓ | ✗ | ✓ |
| ElevenLabs | Eleven 3 | closed | ✗ | ✗ | ✓ |
| ElevenLabs | Eleven 3 Conversational | closed | ✗ | ✗ | ✓ |
| MiniMax | MiniMax Speech 2.8 HD | closed | ✓ | ✓ | ✓ |
| MiniMax | MiniMax Speech 2.8 Turbo | closed | ✓ | ✓ | ✓ |
| MiniMax | MiniMax Speech 2.6 HD | closed | ✗ | ✓ | ✗ |
| MiniMax | MiniMax Speech 2.6 Turbo | closed | ✗ | ✓ | ✗ |
| Google | Gemini TTS 3.8 Flash | closed | ✓ | ✗ | ✓ |
| Google | Gemini TTS 3.8 Flash Lite | closed | ✓ | ✗ | ✓ |
| Google | Gemini TTS 3.1 Flash | closed | ✗ | ✓ | ✓ |
| Mistral | Voxtral TTS 3.0 | ? | ✗ | ✗ | ✓ |
| Mistral | Voxtral TTS Mini | ? | ✗ | ✗ | ✓ |
| Fish Audio | Fish Audio 3 | open | ✗ | ✗ | ✓ |
| Fish Audio | Fish Audio Pro | open | ✗ | ✗ | ✓ |

### Text

| Maker | Model | Type | fal | replicate | openrouter |
|---|---|---|---|---|---|
| Moonshot AI | Kimi K3.1 Pro | closed | ✓ | ✗ | ✓ |
| Moonshot AI | Kimi K3 | open | ✓ | ✗ | ✓ |
| Moonshot AI | Kimi K2.7 Code | open | ✓ | ✗ | ✓ |
| Moonshot AI | Kimi K2.6 | open | ✓ | ✓ | ✓ |
| MiniMax | MiniMax M3.1 Flash | open | ✓ | ✗ | ✓ |
| MiniMax | MiniMax M3 | open | ✓ | ✗ | ✓ |
| MiniMax | MiniMax M2.7 | open | ✓ | ✗ | ✓ |
| MiniMax | MiniMax M2.5 | open | ✓ | ✗ | ✓ |
| DeepSeek | DeepSeek 4.1 Flash | open | ✓ | ✗ | ✓ |
| DeepSeek | DeepSeek 4.0 Flash | open | ✓ | ✗ | ✓ |
| DeepSeek | DeepSeek 4.0 Flash Vision | open | ✓ | ✗ | ✓ |
| DeepSeek | DeepSeek 4.0 Pro | open | ✓ | ✗ | ✓ |
| Google | Gemini 4.0 Argon | closed | ✓ | ✗ | ✓ |
| Google | Gemini 3.8 Flash | closed | ✓ | ✗ | ✓ |
| Google | Gemini 3.7 Flash | closed | ✓ | ✗ | ✓ |
| Google | Gemini 3.6 Flash | closed | ✓ | ✗ | ✓ |
| Anthropic | Claude Haiku 5.5 | closed | ✓ | ✗ | ✓ |
| Anthropic | Claude Haiku 4.5 | closed | ✓ | ✗ | ✓ |
| Mistral | Mistral Large 4.0 | closed | ✓ | ✗ | ✓ |
| OpenAI | GPT 6.1 Sol | closed | ✓ | ✗ | ✓ |
| OpenAI | GPT 6.1 Sol Pro | closed | ✓ | ✗ | ✓ |
| OpenAI | GPT 6.0 Astra | closed | ✓ | ✗ | ✓ |
| OpenAI | GPT 6.0 Astra Pro | closed | ✓ | ✗ | ✓ |
| Anthropic | Claude Sonnet 5.5 | closed | ✓ | ✗ | ✓ |
| Anthropic | Claude Sonnet 5.0 | closed | ✓ | ✓ | ✓ |
| Anthropic | Claude Sonnet 4.6 | closed | ✓ | ✓ | ✓ |
| Anthropic | Claude Sonnet 4.5 | closed | ✓ | ✗ | ✓ |
| Z.ai | GLM 5.3 | open | ✓ | ✗ | ✓ |
| Z.ai | GLM 5.3 Flash | open | ✓ | ✗ | ✓ |
| Z.ai | GLM 5.3 Flashx | closed | ✓ | ✗ | ✓ |
| Z.ai | GLM 5.3 Prime | closed | ✓ | ✗ | ✓ |
| Alibaba | Qwen 3.8 2.4t A95b | open | ✓ | ✗ | ✓ |
| Alibaba | Qwen 3.8 27B | open | ✓ | ✗ | ✓ |
| Alibaba | Qwen 3.8 Flash | open | ✓ | ✗ | ✓ |
| Alibaba | Qwen 3.8 Max | closed | ✓ | ✗ | ✓ |
| Anthropic | Claude Opus 5.5 | closed | ✓ | ✓ | ✓ |
| Anthropic | Claude Opus 5.0 | closed | ✓ | ✗ | ✓ |
| Anthropic | Claude Opus 4.8 | closed | ✓ | ✗ | ✓ |
| Anthropic | Claude Opus 4.7 | closed | ✓ | ✓ | ✓ |
| xAI | Grok 4.20 | closed | ✓ | ✗ | ✓ |
| xAI | Grok 4.20 Multi Agent | closed | ✓ | ✗ | ✓ |
| xAI | Grok 4.7 | closed | ✓ | ✗ | ✓ |
| xAI | Grok 4.6 | closed | ✓ | ✗ | ✓ |

### Embedding

| Maker | Model | Type | fal | replicate | openrouter |
|---|---|---|---|---|---|
| Voyage AI | Voyage 4.0 | closed | ✓ | ✗ | ✓ |
| Voyage AI | Voyage 4.0 Large | closed | ✓ | ✗ | ✓ |
| Voyage AI | Voyage 4.0 Lite | closed | ✓ | ✗ | ✓ |
| Voyage AI | Voyage 3.5 | closed | ✓ | ✗ | ✓ |
| Google | Gemini Embedding 2 | closed | ✓ | ✗ | ✓ |
| Google | Gemini Embedding 001 | closed | ✓ | ✗ | ✓ |
| BAAI | BGE M3 | open | ✓ | ✗ | ✓ |
| BAAI | BGE 1.5 | open | ✓ | ✗ | ✓ |
| OpenAI | OpenAI Embedding 3 Large | closed | ✓ | ✗ | ✓ |
| OpenAI | OpenAI Embedding 3 Small | closed | ✓ | ✗ | ✓ |
| OpenAI | OpenAI Embedding 002 | closed | ✓ | ✗ | ✓ |
| Alibaba | Qwen3 Embedding 4B | open | ✓ | ✗ | ✓ |
| Alibaba | Qwen3 Embedding 8B | open | ✓ | ✗ | ✓ |

## The grid: at least one model for every task and tool (9 empty cells)

| task or tool | fal | replicate | openrouter |
|---|---|---|---|
| text-to-image | C: GPT Image 2.5 Flare<br>O: FLUX 3 Klein<br>M: Seedream 5.0 Flash | C: GPT Image 2.5 Flare<br>O: FLUX 2 Dev | C: GPT Image 2.5 Flare<br>O: FLUX 3 Klein<br>M: Seedream 5.0 Flash |
| image-to-image | C: GPT Image 2.5 Flare<br>O: FLUX 3 Klein<br>M: Seedream 5.0 Flash | - | C: GPT Image 2.5 Flare<br>O: FLUX 3 Klein<br>M: Seedream 5.0 Flash |
| text-to-video | C: Hailuo H3 Max<br>O: LTX 2.5 Fast | C: Hailuo 2.3 | C: Hailuo 3.0 |
| image-to-video | C: Hailuo H3 Max<br>O: LTX 2.5 Fast | C: Hailuo 2.3<br>O: LTX 2.5 Fast | C: Hailuo 3.0 |
| reference-to-video | C: Hailuo H3 Max | C: Wan 2.7 | - |
| audio-text-to-speech | C: Eleven 4 | C: MiniMax Speech 2.8 HD | C: Eleven 4<br>O: Fish Audio 3<br>M: Voxtral TTS 3.0 |
| audio-text-to-music | C: Eleven Music 2.5<br>O: Stable Audio 3.0 Medium | C: Lyria 3.0<br>O: Stable Audio 2.5 | C: Lyria 3.0 Clip |
| audio-text-to-sfx | O: Stable Audio 3.0 Small Sfx | O: Stable Audio 2.5 | - |
| chat | C: Kimi K3.1 Pro<br>O: Kimi K3 | C: Claude Sonnet 5.0<br>O: Kimi K2.6 | C: Kimi K3.1 Pro<br>O: Kimi K3 |
| text-embedding | C: Voyage 4.0<br>O: BGE M3 | - | C: Voyage 4.0<br>O: BGE M3 |
| video-edit | C: Kling O3 | C: Kling 3.0 Omni | M: FLUX Video Edit |
| video-extend | C: FLUX 3<br>O: LTX Video-0.9.5 | C: Grok Imagine Video Extension | A: Seedance 2.5 |
| video-lip-sync | C: Dubbing<br>O: Ltx 2.3 Quality | C: Lipsync<br>O: Latentsync | C: Avatar IV |
| video-motion-transfer | C: Kling Video<br>M: Wan-2.2 Animate Replace | C: Kling v3 Motion Control<br>O: Wan 2.2 Animate Replace | A: Seedance 2.5 |
| video-upscale | C: Crystal Video Upscaler<br>O: SeedVR upscale<br>M: Bytedance Upscaler Upscale Video | C: Flux Video Upscale | C: Flux Video Upscale |
| video-slow-motion | C: Topaz Interpolate | A: Seedance 2.5 | A: Seedance 2.5 |
| video-denoise | C: Topaz Deblur<br>O: Ltx 2.3 Quality | A: Seedance 2.5 | A: Seedance 2.5 |
| video-remove-background | M: Bria Video Background Removal | A: Seedance 2.5 | A: Seedance 2.5 |
| video-remove-object | M: Bria Video Erase Keypoints | A: Seedance 2.5 | A: Seedance 2.5 |
| video-colorize | O: Ltx 2.3 Quality | A: Seedance 2.5 | A: Seedance 2.5 |
| video-relight | C: Hailuo H3 | A: Seedance 2.5 | A: Seedance 2.5 |
| video-restyle | C: Lucy Restyle | A: Seedance 2.5 | A: Seedance 2.5 |
| video-reframe | C: Ray 3.2<br>O: LTX 2.3<br>M: Wan 2.1 VACE Long Reframe | C: Reframe Video | A: Seedance 2.5 |
| video-dub | C: Dubbing | A: Seedance 2.5 | A: Seedance 2.5 |
| video-remove-fillers | - | - | - |
| video-sound-effects | C: Mirelo SFX2.0 | O: Hunyuanvideo Foley | A: Seedance 2.5 |
| video-music | A: FLUX 3 | A: Seedance 2.5 | A: Seedance 2.5 |
| audio-voice-isolation | C: Audio Isolation | A: Qwen3 Tts | A: GPT Audio |
| audio-noise-reduction | A: HeyGen Voice | A: Qwen3 Tts | A: GPT Audio |
| audio-stems | O: Sam Audio | - | - |
| audio-voice-changer | C: Voice Changer | A: Qwen3 Tts | A: GPT Audio |
| audio-transcribe | C: Scribe v2<br>O: Nemotron Asr Multilingual | O: Whisper | C: Scribe v2<br>O: Voxtral Small 24B 2507 STT<br>M: Voxtral Small Transcribe 3 |
| image-remove-background | C: Ideogram Remove Background<br>M: Bria Guided Remove Background | C: Recraft Remove Background<br>O: Remove Background | A: GPT Image 2.5 Sunburst |
| image-upscale | C: Topaz Upscale Image Transparent<br>O: SeedVR upscale<br>M: SeedVR2 | C: Recraft Creative Upscale | A: GPT Image 2.5 Sunburst |
| image-restore | C: Topaz Sharpen Image<br>O: Qwen Image Edit 2509 Lora Gallery<br>M: Qwen Image Edit Plus Lora Gallery | C: Dust And Scratch v2 | A: GPT Image 2.5 Sunburst |
| image-remove-object | C: Ideogram<br>M: Bria Eraser | O: Eraser | A: GPT Image 2.5 Sunburst |
| image-relight | M: Fibo Edit [Relight] | A: GPT Image 2.5 Flare | A: GPT Image 2.5 Sunburst |
| image-restyle | M: Fibo Edit [Restyle] | A: GPT Image 2.5 Flare | A: GPT Image 2.5 Sunburst |
| image-outpaint | O: Bria Expand<br>M: FLUX.1 [pro] Fill Fine-tuned | C: Flux Fill Pro<br>O: Bria Expand | A: GPT Image 2.5 Sunburst |
| image-colorize | M: Fibo Edit [Colorize] | C: Image Colorization | A: GPT Image 2.5 Sunburst |
| image-edit | C: GPT Image 2.5 Flare<br>O: FLUX 3 Klein<br>M: Seedream 5.0 Flash | C: Krea 3<br>O: Qwen Image Edit Plus Lora | C: Nano Banana 2.1<br>O: FLUX 3 Klein |

### Not offered by the provider (9)
- image-to-image is not offered on replicate: no model of the maker list's families for it
- reference-to-video is not offered on openrouter: no model of the maker list's families for it
- audio-text-to-sfx is not offered on openrouter: no model of the maker list's families for it
- text-embedding is not offered on replicate: no model of the maker list's families for it
- video-remove-fillers is not offered on fal: its list has no model for it
- video-remove-fillers is not offered on replicate: its list has no model for it
- video-remove-fillers is not offered on openrouter: its list has no model for it
- audio-stems on replicate: its 3 model(s) for it are community uploads, none from a verified maker
- audio-stems is not offered on openrouter: its list has no model for it

## Gaps (17) by kind
- parameters: 5
- grid: 9
- price: 3

## Every gap
- [parameters] gemini google/gemini-3.8-flash: gemini-3.8-flash: the provider lists no parameters
- [parameters] gemini google/gemini-3.6-flash: gemini-3.6-flash: the provider lists no parameters
- [parameters] openai openai/gpt-6.1-sol: gpt-6.1-sol: the provider lists no parameters
- [parameters] openai openai/gpt-6.0-astra: gpt-6-astra: the provider lists no parameters
- [grid] replicate image-to-image: image-to-image is not offered on replicate: no model of the maker list's families for it
- [grid] openrouter reference-to-video: reference-to-video is not offered on openrouter: no model of the maker list's families for it
- [grid] openrouter audio-text-to-sfx: audio-text-to-sfx is not offered on openrouter: no model of the maker list's families for it
- [grid] replicate text-embedding: text-embedding is not offered on replicate: no model of the maker list's families for it
- [parameters] fal bria/video-background-removal-realtime: bria/video/background-removal/realtime: the provider lists no parameters
- [grid] fal video-remove-fillers: video-remove-fillers is not offered on fal: its list has no model for it
- [grid] replicate video-remove-fillers: video-remove-fillers is not offered on replicate: its list has no model for it
- [grid] openrouter video-remove-fillers: video-remove-fillers is not offered on openrouter: its list has no model for it
- [grid] replicate audio-stems: audio-stems on replicate: its 3 model(s) for it are community uploads, none from a verified maker
- [grid] openrouter audio-stems: audio-stems is not offered on openrouter: its list has no model for it
- [price] fal stability/fast-sdxl-inpainting: stability/fast-sdxl-inpainting on fal: fal-ai/fast-sdxl/inpainting has no price published by the provider, its page or LiteLLM
- [price] fal stability/fast-lightning-sdxl-inpainting: stability/fast-lightning-sdxl-inpainting on fal: fal-ai/fast-lightning-sdxl/inpainting has no price published by the provider, its page or LiteLLM
- [price] fal stability/lora-inpaint: stability/lora-inpaint on fal: fal-ai/lora/inpaint has no price published by the provider, its page or LiteLLM