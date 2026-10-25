# Knowledge database: what was found and what is missing

Built 2026-10-24T03:22:36.030Z. 263 models, 451 provider lines. The gate found 0 problems.

## Replicate collections not read
video-to-text, ai-face-generator, text-recognition-ocr, detect-nsfw-content, text-classification, speaker-diarization, face-swap, sketch-to-image, generate-emoji, generate-anime, vision-models, image-to-text, 3d-models, official, language-models, try-for-free, control-net, embedding-models, ai-detect-objects, flux-fine-tunes, flux-kontext-fine-tunes, utilities, qwen-image-fine-tunes

## What changed since the last build
- fal: 1321 models read (last time 1321), read on 2026-10-24
- openai: 51 models read (last time 51), read on 2026-10-24
- gemini: 14 models read (last time 14), read on 2026-10-24
- openrouter: 607 models read (last time 606), read on 2026-10-24
- replicate: 852 models read (last time 852), read on 2026-10-24
- New in the database (0): none
- No longer in the database (0): none

## New versions found beyond the maker list (2), added automatically
- Kling V3 -> Kling 4.0 Text to Video on fal (kling/v4/text-to-video)
- Kling V3 -> Kling 4.0 Image to Video on fal (kling/v4/image-to-video)

## Lines per provider
- fal: 182
- replicate: 114
- openrouter: 100
- openai: 29
- gemini: 26

## Models per provider for each job (blank = the provider has none complete)

| job | fal | replicate | openrouter | openai | gemini |
|---|---|---|---|---|---|
| video-edit | 4 | 4 |  |  |  |
| video-extend | 4 |  |  |  |  |
| video-lip-sync | 9 | 4 | 1 |  |  |
| video-motion-transfer | 4 |  |  |  |  |
| video-upscale | 4 | 2 | 1 |  |  |
| video-slow-motion | 3 | 1 |  |  |  |
| video-denoise | 3 | 1 |  |  |  |
| video-remove-background | 4 | 3 |  |  |  |
| video-remove-object | 4 |  |  |  |  |
| video-colorize | 1 |  |  |  |  |
| video-relight | 3 |  |  |  |  |
| video-restyle | 1 |  |  |  |  |
| video-reframe | 4 | 1 |  |  |  |
| video-dub | 1 |  |  |  |  |
| video-remove-fillers |  |  |  |  |  |
| video-sound-effects | 3 |  |  |  |  |
| video-music | 1 |  |  |  |  |
| audio-voice-isolation | 1 |  |  |  |  |
| audio-noise-reduction | 2 |  |  |  |  |
| audio-stems | 3 |  |  |  |  |
| audio-voice-changer | 1 | 4 |  |  |  |
| audio-transcribe | 3 | 4 | 9 | 4 | 1 |
| image-remove-background | 2 | 4 |  |  |  |
| image-upscale | 4 | 4 |  |  |  |
| image-restore | 4 | 4 |  |  |  |
| image-remove-object | 4 | 4 | 4 | 4 | 4 |
| image-relight | 4 | 4 | 4 | 4 | 4 |
| image-restyle | 4 | 4 | 4 | 4 | 4 |
| image-outpaint | 4 | 4 | 4 | 4 | 4 |
| image-colorize | 1 | 1 |  |  |  |
| image-edit | 11 | 4 | 14 |  |  |
| text-to-image | 17 | 18 | 7 | 6 | 4 |
| image-to-image | 4 |  | 4 |  |  |
| text-to-video | 13 | 4 | 15 |  | 1 |
| image-to-video | 23 | 17 | 15 |  | 1 |
| reference-to-video | 9 | 1 |  |  |  |
| audio-text-to-speech | 7 | 13 | 16 | 3 | 3 |
| audio-text-to-music | 5 | 4 | 2 |  |  |
| audio-text-to-sfx | 3 |  |  |  |  |

## Gaps (469) by kind
- endpoint: 308
- price: 7
- settings: 2
- backups: 152

## Every gap
- [endpoint] replicate bytedance/seedance-2-5/text-to-video: replicate lists no Seedance 2.5 for text-to-video
- [endpoint] openai bytedance/seedance-2-5/text-to-video: openai lists no Seedance 2.5 for text-to-video
- [endpoint] gemini bytedance/seedance-2-5/text-to-video: gemini lists no Seedance 2.5 for text-to-video
- [endpoint] openai bytedance/seedance-2-5/image-to-video: openai lists no Seedance 2.5 for image-to-video
- [endpoint] gemini bytedance/seedance-2-5/image-to-video: gemini lists no Seedance 2.5 for image-to-video
- [endpoint] fal bytedance/seedance-2-5/reference-to-video: fal lists no Seedance 2.5 for reference-to-video
- [endpoint] replicate bytedance/seedance-2-5/reference-to-video: replicate lists no Seedance 2.5 for reference-to-video
- [endpoint] openrouter bytedance/seedance-2-5/reference-to-video: openrouter lists no Seedance 2.5 for reference-to-video
- [endpoint] openai bytedance/seedance-2-5/reference-to-video: openai lists no Seedance 2.5 for reference-to-video
- [endpoint] gemini bytedance/seedance-2-5/reference-to-video: gemini lists no Seedance 2.5 for reference-to-video
- [endpoint] openrouter bytedance/seedream-5/text-to-image: openrouter lists no Seedream 5 for text-to-image
- [endpoint] openai bytedance/seedream-5/text-to-image: openai lists no Seedream 5 for text-to-image
- [endpoint] gemini bytedance/seedream-5/text-to-image: gemini lists no Seedream 5 for text-to-image
- [endpoint] replicate bytedance/seedream-5/image-to-image: replicate lists no Seedream 5 for image-edit
- [endpoint] openrouter bytedance/seedream-5/image-to-image: openrouter lists no Seedream 5 for image-edit
- [endpoint] openai bytedance/seedream-5/image-to-image: openai lists no Seedream 5 for image-edit
- [endpoint] gemini bytedance/seedream-5/image-to-image: gemini lists no Seedream 5 for image-edit
- [endpoint] replicate alibaba/wan-3-0/text-to-video: replicate lists no Wan 3.0 for text-to-video
- [endpoint] openai alibaba/wan-3-0/text-to-video: openai lists no Wan 3.0 for text-to-video
- [endpoint] gemini alibaba/wan-3-0/text-to-video: gemini lists no Wan 3.0 for text-to-video
- [endpoint] openai alibaba/wan-3-0/image-to-video: openai lists no Wan 3.0 for image-to-video
- [endpoint] gemini alibaba/wan-3-0/image-to-video: gemini lists no Wan 3.0 for image-to-video
- [endpoint] replicate alibaba/wan-3-0/reference-to-video: replicate lists no Wan 3.0 for reference-to-video
- [endpoint] openrouter alibaba/wan-3-0/reference-to-video: openrouter lists no Wan 3.0 for reference-to-video
- [endpoint] openai alibaba/wan-3-0/reference-to-video: openai lists no Wan 3.0 for reference-to-video
- [endpoint] gemini alibaba/wan-3-0/reference-to-video: gemini lists no Wan 3.0 for reference-to-video
- [endpoint] openai alibaba/qwen-image-3/text-to-image: openai lists no Qwen Image 3 for text-to-image
- [endpoint] gemini alibaba/qwen-image-3/text-to-image: gemini lists no Qwen Image 3 for text-to-image
- [endpoint] replicate alibaba/qwen-image-3/image-to-image: replicate lists no Qwen Image 3 for image-edit
- [endpoint] openrouter alibaba/qwen-image-3/image-to-image: openrouter lists no Qwen Image 3 for image-edit
- [endpoint] openai alibaba/qwen-image-3/image-to-image: openai lists no Qwen Image 3 for image-edit
- [endpoint] gemini alibaba/qwen-image-3/image-to-image: gemini lists no Qwen Image 3 for image-edit
- [endpoint] replicate kuaishou/kling-v3/text-to-video: replicate lists no Kling V3 for text-to-video
- [endpoint] openai kuaishou/kling-v3/text-to-video: openai lists no Kling V3 for text-to-video
- [endpoint] gemini kuaishou/kling-v3/text-to-video: gemini lists no Kling V3 for text-to-video
- [endpoint] openai kuaishou/kling-v3/image-to-video: openai lists no Kling V3 for image-to-video
- [endpoint] gemini kuaishou/kling-v3/image-to-video: gemini lists no Kling V3 for image-to-video
- [endpoint] replicate kuaishou/kling-v3/video-to-video/motion-transfer: replicate lists no Kling V3 for video-motion-transfer
- [endpoint] openrouter kuaishou/kling-v3/video-to-video/motion-transfer: openrouter lists no Kling V3 for video-motion-transfer
- [endpoint] openai kuaishou/kling-v3/video-to-video/motion-transfer: openai lists no Kling V3 for video-motion-transfer
- [endpoint] gemini kuaishou/kling-v3/video-to-video/motion-transfer: gemini lists no Kling V3 for video-motion-transfer
- [endpoint] replicate kuaishou/kling-o3/reference-to-video: replicate lists no Kling O3 for reference-to-video
- [endpoint] openrouter kuaishou/kling-o3/reference-to-video: openrouter lists no Kling O3 for reference-to-video
- [endpoint] openai kuaishou/kling-o3/reference-to-video: openai lists no Kling O3 for reference-to-video
- [endpoint] gemini kuaishou/kling-o3/reference-to-video: gemini lists no Kling O3 for reference-to-video
- [endpoint] replicate kuaishou/kling-o3/video-to-video/edit: replicate lists no Kling O3 for video-edit
- [endpoint] openrouter kuaishou/kling-o3/video-to-video/edit: openrouter lists no Kling O3 for video-edit
- [endpoint] openai kuaishou/kling-o3/video-to-video/edit: openai lists no Kling O3 for video-edit
- [endpoint] gemini kuaishou/kling-o3/video-to-video/edit: gemini lists no Kling O3 for video-edit
- [endpoint] replicate minimax/hailuo-h3/text-to-video: replicate lists no Hailuo H3 for text-to-video
- [endpoint] openrouter minimax/hailuo-h3/text-to-video: openrouter lists no Hailuo H3 for text-to-video
- [endpoint] openai minimax/hailuo-h3/text-to-video: openai lists no Hailuo H3 for text-to-video
- [endpoint] gemini minimax/hailuo-h3/text-to-video: gemini lists no Hailuo H3 for text-to-video
- [endpoint] replicate minimax/hailuo-h3/image-to-video: replicate lists no Hailuo H3 for image-to-video
- [endpoint] openrouter minimax/hailuo-h3/image-to-video: openrouter lists no Hailuo H3 for image-to-video
- [endpoint] openai minimax/hailuo-h3/image-to-video: openai lists no Hailuo H3 for image-to-video
- [endpoint] gemini minimax/hailuo-h3/image-to-video: gemini lists no Hailuo H3 for image-to-video
- [endpoint] replicate minimax/hailuo-h3/reference-to-video: replicate lists no Hailuo H3 for reference-to-video
- [endpoint] openrouter minimax/hailuo-h3/reference-to-video: openrouter lists no Hailuo H3 for reference-to-video
- [endpoint] openai minimax/hailuo-h3/reference-to-video: openai lists no Hailuo H3 for reference-to-video
- [endpoint] gemini minimax/hailuo-h3/reference-to-video: gemini lists no Hailuo H3 for reference-to-video
- [endpoint] replicate minimax/hailuo-h3/video-to-video/extend: replicate lists no Hailuo H3 for video-extend
- [endpoint] openrouter minimax/hailuo-h3/video-to-video/extend: openrouter lists no Hailuo H3 for video-extend
- [endpoint] openai minimax/hailuo-h3/video-to-video/extend: openai lists no Hailuo H3 for video-extend
- [endpoint] gemini minimax/hailuo-h3/video-to-video/extend: gemini lists no Hailuo H3 for video-extend
- [endpoint] replicate minimax/hailuo-h3/video-to-video/relight: replicate lists no Hailuo H3 for video-relight
- [endpoint] openrouter minimax/hailuo-h3/video-to-video/relight: openrouter lists no Hailuo H3 for video-relight
- [endpoint] openai minimax/hailuo-h3/video-to-video/relight: openai lists no Hailuo H3 for video-relight
- [endpoint] gemini minimax/hailuo-h3/video-to-video/relight: gemini lists no Hailuo H3 for video-relight
- [endpoint] openai minimax/speech-2-8/text-to-speech: openai lists no Speech 2.8 for audio-text-to-speech
- [endpoint] gemini minimax/speech-2-8/text-to-speech: gemini lists no Speech 2.8 for audio-text-to-speech
- [endpoint] replicate minimax/music-3/text-to-audio: replicate lists no Music 3 for audio-text-to-music
- [endpoint] openrouter minimax/music-3/text-to-audio: openrouter lists no Music 3 for audio-text-to-music
- [endpoint] openai minimax/music-3/text-to-audio: openai lists no Music 3 for audio-text-to-music
- [endpoint] gemini minimax/music-3/text-to-audio: gemini lists no Music 3 for audio-text-to-music
- [endpoint] replicate luma/ray-3-2/text-to-video: replicate lists no Ray 3.2 for text-to-video
- [endpoint] openrouter luma/ray-3-2/text-to-video: openrouter lists no Ray 3.2 for text-to-video
- [endpoint] openai luma/ray-3-2/text-to-video: openai lists no Ray 3.2 for text-to-video
- [endpoint] gemini luma/ray-3-2/text-to-video: gemini lists no Ray 3.2 for text-to-video
- [endpoint] openrouter luma/ray-3-2/image-to-video: openrouter lists no Ray 3.2 for image-to-video
- [endpoint] openai luma/ray-3-2/image-to-video: openai lists no Ray 3.2 for image-to-video
- [endpoint] gemini luma/ray-3-2/image-to-video: gemini lists no Ray 3.2 for image-to-video
- [endpoint] replicate luma/ray-3-2/video-to-video/edit: replicate lists no Ray 3.2 for video-edit
- [endpoint] openrouter luma/ray-3-2/video-to-video/edit: openrouter lists no Ray 3.2 for video-edit
- [endpoint] openai luma/ray-3-2/video-to-video/edit: openai lists no Ray 3.2 for video-edit
- [endpoint] gemini luma/ray-3-2/video-to-video/edit: gemini lists no Ray 3.2 for video-edit
- [endpoint] replicate luma/ray-3-2/video-to-video/reframe: replicate lists no Ray 3.2 for video-reframe
- [endpoint] openrouter luma/ray-3-2/video-to-video/reframe: openrouter lists no Ray 3.2 for video-reframe
- [endpoint] openai luma/ray-3-2/video-to-video/reframe: openai lists no Ray 3.2 for video-reframe
- [endpoint] gemini luma/ray-3-2/video-to-video/reframe: gemini lists no Ray 3.2 for video-reframe
- [endpoint] replicate luma/uni-1/text-to-image: replicate lists no Uni-1 for text-to-image
- [endpoint] openrouter luma/uni-1/text-to-image: openrouter lists no Uni-1 for text-to-image
- [endpoint] openai luma/uni-1/text-to-image: openai lists no Uni-1 for text-to-image
- [endpoint] gemini luma/uni-1/text-to-image: gemini lists no Uni-1 for text-to-image
- [endpoint] replicate luma/uni-1/image-to-image: replicate lists no Uni-1 for image-edit
- [endpoint] openrouter luma/uni-1/image-to-image: openrouter lists no Uni-1 for image-edit
- [endpoint] openai luma/uni-1/image-to-image: openai lists no Uni-1 for image-edit
- [endpoint] gemini luma/uni-1/image-to-image: gemini lists no Uni-1 for image-edit
- [endpoint] replicate xai/grok-imagine-video-1-5/text-to-video: replicate lists no Grok Imagine Video 1.5 for text-to-video
- [endpoint] openai xai/grok-imagine-video-1-5/text-to-video: openai lists no Grok Imagine Video 1.5 for text-to-video
- [endpoint] gemini xai/grok-imagine-video-1-5/text-to-video: gemini lists no Grok Imagine Video 1.5 for text-to-video
- [endpoint] openai xai/grok-imagine-video-1-5/image-to-video: openai lists no Grok Imagine Video 1.5 for image-to-video
- [endpoint] gemini xai/grok-imagine-video-1-5/image-to-video: gemini lists no Grok Imagine Video 1.5 for image-to-video
- [endpoint] replicate xai/grok-imagine-video-1-5/reference-to-video: replicate lists no Grok Imagine Video 1.5 for reference-to-video
- [endpoint] openrouter xai/grok-imagine-video-1-5/reference-to-video: openrouter lists no Grok Imagine Video 1.5 for reference-to-video
- [endpoint] openai xai/grok-imagine-video-1-5/reference-to-video: openai lists no Grok Imagine Video 1.5 for reference-to-video
- [endpoint] gemini xai/grok-imagine-video-1-5/reference-to-video: gemini lists no Grok Imagine Video 1.5 for reference-to-video
- [endpoint] openai xai/grok-imagine-image-2-0/text-to-image: openai lists no Grok Imagine Image 2.0 for text-to-image
- [endpoint] gemini xai/grok-imagine-image-2-0/text-to-image: gemini lists no Grok Imagine Image 2.0 for text-to-image
- [endpoint] replicate xai/grok-imagine-image-2-0/image-to-image: replicate lists no Grok Imagine Image 2.0 for image-edit
- [endpoint] openrouter xai/grok-imagine-image-2-0/image-to-image: openrouter lists no Grok Imagine Image 2.0 for image-edit
- [endpoint] openai xai/grok-imagine-image-2-0/image-to-image: openai lists no Grok Imagine Image 2.0 for image-edit
- [endpoint] gemini xai/grok-imagine-image-2-0/image-to-image: gemini lists no Grok Imagine Image 2.0 for image-edit
- [endpoint] replicate lightricks/ltx-2-5/text-to-video: replicate lists no LTX 2.5 for text-to-video
- [endpoint] openrouter lightricks/ltx-2-5/text-to-video: openrouter lists no LTX 2.5 for text-to-video
- [endpoint] openai lightricks/ltx-2-5/text-to-video: openai lists no LTX 2.5 for text-to-video
- [endpoint] gemini lightricks/ltx-2-5/text-to-video: gemini lists no LTX 2.5 for text-to-video
- [endpoint] openrouter lightricks/ltx-2-5/image-to-video: openrouter lists no LTX 2.5 for image-to-video
- [endpoint] openai lightricks/ltx-2-5/image-to-video: openai lists no LTX 2.5 for image-to-video
- [endpoint] gemini lightricks/ltx-2-5/image-to-video: gemini lists no LTX 2.5 for image-to-video
- [endpoint] replicate lightricks/ltx-2-5/audio-to-video: replicate lists no LTX 2.5 for video-lip-sync
- [endpoint] openrouter lightricks/ltx-2-5/audio-to-video: openrouter lists no LTX 2.5 for video-lip-sync
- [endpoint] openai lightricks/ltx-2-5/audio-to-video: openai lists no LTX 2.5 for video-lip-sync
- [endpoint] gemini lightricks/ltx-2-5/audio-to-video: gemini lists no LTX 2.5 for video-lip-sync
- [endpoint] replicate lightricks/ltx-2-3/video-to-video/reframe: replicate lists no LTX 2.3 for video-reframe
- [endpoint] openrouter lightricks/ltx-2-3/video-to-video/reframe: openrouter lists no LTX 2.3 for video-reframe
- [endpoint] openai lightricks/ltx-2-3/video-to-video/reframe: openai lists no LTX 2.3 for video-reframe
- [endpoint] gemini lightricks/ltx-2-3/video-to-video/reframe: gemini lists no LTX 2.3 for video-reframe
- [endpoint] replicate vidu/vidu-q4/image-to-video: replicate lists no Vidu Q4 for image-to-video
- [endpoint] openrouter vidu/vidu-q4/image-to-video: openrouter lists no Vidu Q4 for image-to-video
- [endpoint] openai vidu/vidu-q4/image-to-video: openai lists no Vidu Q4 for image-to-video
- [endpoint] gemini vidu/vidu-q4/image-to-video: gemini lists no Vidu Q4 for image-to-video
- [endpoint] replicate vidu/vidu-q4/reference-to-video: replicate lists no Vidu Q4 for reference-to-video
- [endpoint] openrouter vidu/vidu-q4/reference-to-video: openrouter lists no Vidu Q4 for reference-to-video
- [endpoint] openai vidu/vidu-q4/reference-to-video: openai lists no Vidu Q4 for reference-to-video
- [endpoint] gemini vidu/vidu-q4/reference-to-video: gemini lists no Vidu Q4 for reference-to-video
- [endpoint] replicate pixverse/pixverse-c1/text-to-video: replicate lists no PixVerse C1 for text-to-video
- [endpoint] openrouter pixverse/pixverse-c1/text-to-video: openrouter lists no PixVerse C1 for text-to-video
- [endpoint] openai pixverse/pixverse-c1/text-to-video: openai lists no PixVerse C1 for text-to-video
- [endpoint] gemini pixverse/pixverse-c1/text-to-video: gemini lists no PixVerse C1 for text-to-video
- [endpoint] replicate pixverse/pixverse-c1/image-to-video: replicate lists no PixVerse C1 for image-to-video
- [endpoint] openrouter pixverse/pixverse-c1/image-to-video: openrouter lists no PixVerse C1 for image-to-video
- [endpoint] openai pixverse/pixverse-c1/image-to-video: openai lists no PixVerse C1 for image-to-video
- [endpoint] gemini pixverse/pixverse-c1/image-to-video: gemini lists no PixVerse C1 for image-to-video
- [endpoint] replicate pixverse/pixverse-c1/reference-to-video: replicate lists no PixVerse C1 for reference-to-video
- [endpoint] openrouter pixverse/pixverse-c1/reference-to-video: openrouter lists no PixVerse C1 for reference-to-video
- [endpoint] openai pixverse/pixverse-c1/reference-to-video: openai lists no PixVerse C1 for reference-to-video
- [endpoint] gemini pixverse/pixverse-c1/reference-to-video: gemini lists no PixVerse C1 for reference-to-video
- [endpoint] fal google/veo-3-1/text-to-video: fal lists no Veo 3.1 for text-to-video
- [endpoint] replicate google/veo-3-1/text-to-video: replicate lists no Veo 3.1 for text-to-video
- [endpoint] openai google/veo-3-1/text-to-video: openai lists no Veo 3.1 for text-to-video
- [endpoint] gemini google/veo-3-1/text-to-video: gemini lists no Veo 3.1 for text-to-video
- [endpoint] replicate google/gemini-omni-flash-1-1/text-to-video: replicate lists no Gemini Omni Flash 1.1 for text-to-video
- [endpoint] openrouter google/gemini-omni-flash-1-1/text-to-video: openrouter lists no Gemini Omni Flash 1.1 for text-to-video
- [endpoint] openai google/gemini-omni-flash-1-1/text-to-video: openai lists no Gemini Omni Flash 1.1 for text-to-video
- [endpoint] replicate google/gemini-omni-flash-1-1/image-to-video: replicate lists no Gemini Omni Flash 1.1 for image-to-video
- [endpoint] openrouter google/gemini-omni-flash-1-1/image-to-video: openrouter lists no Gemini Omni Flash 1.1 for image-to-video
- [endpoint] openai google/gemini-omni-flash-1-1/image-to-video: openai lists no Gemini Omni Flash 1.1 for image-to-video
- [endpoint] replicate google/gemini-omni-flash-1-1/reference-to-video: replicate lists no Gemini Omni Flash 1.1 for reference-to-video
- [endpoint] openrouter google/gemini-omni-flash-1-1/reference-to-video: openrouter lists no Gemini Omni Flash 1.1 for reference-to-video
- [endpoint] openai google/gemini-omni-flash-1-1/reference-to-video: openai lists no Gemini Omni Flash 1.1 for reference-to-video
- [endpoint] gemini google/gemini-omni-flash-1-1/reference-to-video: gemini lists no Gemini Omni Flash 1.1 for reference-to-video
- [endpoint] replicate google/gemini-omni-flash-1-1/video-to-video/edit: replicate lists no Gemini Omni Flash 1.1 for video-edit
- [endpoint] openrouter google/gemini-omni-flash-1-1/video-to-video/edit: openrouter lists no Gemini Omni Flash 1.1 for video-edit
- [endpoint] openai google/gemini-omni-flash-1-1/video-to-video/edit: openai lists no Gemini Omni Flash 1.1 for video-edit
- [endpoint] gemini google/gemini-omni-flash-1-1/video-to-video/edit: gemini lists no Gemini Omni Flash 1.1 for video-edit
- [endpoint] openai google/nano-banana-2-1/text-to-image: openai lists no Nano Banana 2.1 for text-to-image
- [endpoint] replicate google/nano-banana-2-1/image-to-image: replicate lists no Nano Banana 2.1 for image-edit
- [endpoint] openrouter google/nano-banana-2-1/image-to-image: openrouter lists no Nano Banana 2.1 for image-edit
- [endpoint] openai google/nano-banana-2-1/image-to-image: openai lists no Nano Banana 2.1 for image-edit
- [endpoint] gemini google/nano-banana-2-1/image-to-image: gemini lists no Nano Banana 2.1 for image-edit
- [endpoint] replicate google/gemini-3-8-tts/text-to-speech: replicate lists no Gemini 3.8 TTS for audio-text-to-speech
- [endpoint] openai google/gemini-3-8-tts/text-to-speech: openai lists no Gemini 3.8 TTS for audio-text-to-speech
- [endpoint] replicate google/lyria-3-5/text-to-audio: replicate lists no Lyria 3.5 for audio-text-to-music
- [endpoint] openrouter google/lyria-3-5/text-to-audio: openrouter lists no Lyria 3.5 for audio-text-to-music
- [endpoint] openai google/lyria-3-5/text-to-audio: openai lists no Lyria 3.5 for audio-text-to-music
- [endpoint] gemini google/lyria-3-5/text-to-audio: gemini lists no Lyria 3.5 for audio-text-to-music
- [endpoint] gemini openai/gpt-image-2-5/text-to-image: gemini lists no GPT Image 2.5 for text-to-image
- [endpoint] replicate openai/gpt-image-2-5/image-to-image: replicate lists no GPT Image 2.5 for image-edit
- [endpoint] openrouter openai/gpt-image-2-5/image-to-image: openrouter lists no GPT Image 2.5 for image-edit
- [endpoint] openai openai/gpt-image-2-5/image-to-image: openai lists no GPT Image 2.5 for image-edit
- [endpoint] gemini openai/gpt-image-2-5/image-to-image: gemini lists no GPT Image 2.5 for image-edit
- [endpoint] openai bfl/flux-3/text-to-image: openai lists no FLUX 3 for text-to-image
- [endpoint] gemini bfl/flux-3/text-to-image: gemini lists no FLUX 3 for text-to-image
- [endpoint] replicate bfl/flux-3/image-to-image: replicate lists no FLUX 3 for image-edit
- [endpoint] openrouter bfl/flux-3/image-to-image: openrouter lists no FLUX 3 for image-edit
- [endpoint] openai bfl/flux-3/image-to-image: openai lists no FLUX 3 for image-edit
- [endpoint] gemini bfl/flux-3/image-to-image: gemini lists no FLUX 3 for image-edit
- [endpoint] openai bfl/flux-3/image-to-video: openai lists no FLUX 3 for image-to-video
- [endpoint] gemini bfl/flux-3/image-to-video: gemini lists no FLUX 3 for image-to-video
- [endpoint] replicate bfl/flux-3/video-to-video/edit: replicate lists no FLUX 3 for video-edit
- [endpoint] openrouter bfl/flux-3/video-to-video/edit: openrouter lists no FLUX 3 for video-edit
- [endpoint] openai bfl/flux-3/video-to-video/edit: openai lists no FLUX 3 for video-edit
- [endpoint] gemini bfl/flux-3/video-to-video/edit: gemini lists no FLUX 3 for video-edit
- [endpoint] replicate bfl/flux-3/video-to-video/extend: replicate lists no FLUX 3 for video-extend
- [endpoint] openrouter bfl/flux-3/video-to-video/extend: openrouter lists no FLUX 3 for video-extend
- [endpoint] openai bfl/flux-3/video-to-video/extend: openai lists no FLUX 3 for video-extend
- [endpoint] gemini bfl/flux-3/video-to-video/extend: gemini lists no FLUX 3 for video-extend
- [endpoint] openai recraft/recraft-v4-1/text-to-image: openai lists no Recraft V4.1 for text-to-image
- [endpoint] gemini recraft/recraft-v4-1/text-to-image: gemini lists no Recraft V4.1 for text-to-image
- [endpoint] replicate ideogram/ideogram-4-5/text-to-image: replicate lists no Ideogram 4.5 for text-to-image
- [endpoint] openrouter ideogram/ideogram-4-5/text-to-image: openrouter lists no Ideogram 4.5 for text-to-image
- [endpoint] openai ideogram/ideogram-4-5/text-to-image: openai lists no Ideogram 4.5 for text-to-image
- [endpoint] gemini ideogram/ideogram-4-5/text-to-image: gemini lists no Ideogram 4.5 for text-to-image
- [endpoint] replicate ideogram/ideogram-4-5/image-to-image: replicate lists no Ideogram 4.5 for image-edit
- [endpoint] openrouter ideogram/ideogram-4-5/image-to-image: openrouter lists no Ideogram 4.5 for image-edit
- [endpoint] openai ideogram/ideogram-4-5/image-to-image: openai lists no Ideogram 4.5 for image-edit
- [endpoint] gemini ideogram/ideogram-4-5/image-to-image: gemini lists no Ideogram 4.5 for image-edit
- [endpoint] replicate ideogram/ideogram/image-to-image/remove-object: replicate lists no Ideogram for image-remove-object
- [endpoint] openrouter ideogram/ideogram/image-to-image/remove-object: openrouter lists no Ideogram for image-remove-object
- [endpoint] openai ideogram/ideogram/image-to-image/remove-object: openai lists no Ideogram for image-remove-object
- [endpoint] gemini ideogram/ideogram/image-to-image/remove-object: gemini lists no Ideogram for image-remove-object
- [endpoint] openrouter krea/krea-v3/text-to-image: openrouter lists no Krea V3 for text-to-image
- [endpoint] openai krea/krea-v3/text-to-image: openai lists no Krea V3 for text-to-image
- [endpoint] gemini krea/krea-v3/text-to-image: gemini lists no Krea V3 for text-to-image
- [endpoint] replicate krea/krea-v3/image-to-image: replicate lists no Krea V3 for image-edit
- [endpoint] openrouter krea/krea-v3/image-to-image: openrouter lists no Krea V3 for image-edit
- [endpoint] openai krea/krea-v3/image-to-image: openai lists no Krea V3 for image-edit
- [endpoint] gemini krea/krea-v3/image-to-image: gemini lists no Krea V3 for image-edit
- [endpoint] replicate elevenlabs/eleven-v4/text-to-speech: replicate lists no Eleven v4 for audio-text-to-speech
- [endpoint] openai elevenlabs/eleven-v4/text-to-speech: openai lists no Eleven v4 for audio-text-to-speech
- [endpoint] gemini elevenlabs/eleven-v4/text-to-speech: gemini lists no Eleven v4 for audio-text-to-speech
- [endpoint] replicate elevenlabs/eleven-music-2-5/text-to-audio: replicate lists no Eleven Music 2.5 for audio-text-to-music
- [endpoint] openrouter elevenlabs/eleven-music-2-5/text-to-audio: openrouter lists no Eleven Music 2.5 for audio-text-to-music
- [endpoint] openai elevenlabs/eleven-music-2-5/text-to-audio: openai lists no Eleven Music 2.5 for audio-text-to-music
- [endpoint] gemini elevenlabs/eleven-music-2-5/text-to-audio: gemini lists no Eleven Music 2.5 for audio-text-to-music
- [endpoint] replicate elevenlabs/scribe-v2/speech-to-text/transcribe: replicate lists no Scribe v2 for audio-transcribe
- [endpoint] openai elevenlabs/scribe-v2/speech-to-text/transcribe: openai lists no Scribe v2 for audio-transcribe
- [endpoint] gemini elevenlabs/scribe-v2/speech-to-text/transcribe: gemini lists no Scribe v2 for audio-transcribe
- [endpoint] replicate elevenlabs/audio-isolation/audio-to-audio/isolate-voice: replicate lists no Audio Isolation for audio-voice-isolation
- [endpoint] openrouter elevenlabs/audio-isolation/audio-to-audio/isolate-voice: openrouter lists no Audio Isolation for audio-voice-isolation
- [endpoint] openai elevenlabs/audio-isolation/audio-to-audio/isolate-voice: openai lists no Audio Isolation for audio-voice-isolation
- [endpoint] gemini elevenlabs/audio-isolation/audio-to-audio/isolate-voice: gemini lists no Audio Isolation for audio-voice-isolation
- [endpoint] replicate elevenlabs/voice-changer/audio-to-audio/voice-change: replicate lists no Voice Changer for audio-voice-changer
- [endpoint] openrouter elevenlabs/voice-changer/audio-to-audio/voice-change: openrouter lists no Voice Changer for audio-voice-changer
- [endpoint] openai elevenlabs/voice-changer/audio-to-audio/voice-change: openai lists no Voice Changer for audio-voice-changer
- [endpoint] gemini elevenlabs/voice-changer/audio-to-audio/voice-change: gemini lists no Voice Changer for audio-voice-changer
- [endpoint] replicate elevenlabs/dubbing/audio-to-video/dub: replicate lists no Dubbing for video-dub
- [endpoint] openrouter elevenlabs/dubbing/audio-to-video/dub: openrouter lists no Dubbing for video-dub
- [endpoint] openai elevenlabs/dubbing/audio-to-video/dub: openai lists no Dubbing for video-dub
- [endpoint] gemini elevenlabs/dubbing/audio-to-video/dub: gemini lists no Dubbing for video-dub
- [endpoint] replicate stability/stable-audio-3/text-to-audio: replicate lists no Stable Audio 3 for audio-text-to-music
- [endpoint] openrouter stability/stable-audio-3/text-to-audio: openrouter lists no Stable Audio 3 for audio-text-to-music
- [endpoint] openai stability/stable-audio-3/text-to-audio: openai lists no Stable Audio 3 for audio-text-to-music
- [endpoint] gemini stability/stable-audio-3/text-to-audio: gemini lists no Stable Audio 3 for audio-text-to-music
- [endpoint] replicate topaz/topaz-upscale/video-to-video/upscale: replicate lists no Topaz Upscale for video-upscale
- [endpoint] openrouter topaz/topaz-upscale/video-to-video/upscale: openrouter lists no Topaz Upscale for video-upscale
- [endpoint] openai topaz/topaz-upscale/video-to-video/upscale: openai lists no Topaz Upscale for video-upscale
- [endpoint] gemini topaz/topaz-upscale/video-to-video/upscale: gemini lists no Topaz Upscale for video-upscale
- [endpoint] replicate topaz/topaz-upscale/image-to-image/upscale: replicate lists no Topaz Upscale for image-upscale
- [endpoint] openrouter topaz/topaz-upscale/image-to-image/upscale: openrouter lists no Topaz Upscale for image-upscale
- [endpoint] openai topaz/topaz-upscale/image-to-image/upscale: openai lists no Topaz Upscale for image-upscale
- [endpoint] gemini topaz/topaz-upscale/image-to-image/upscale: gemini lists no Topaz Upscale for image-upscale
- [endpoint] replicate topaz/topaz-interpolate/video-to-video/interpolate: replicate lists no Topaz Interpolate for video-slow-motion
- [endpoint] openrouter topaz/topaz-interpolate/video-to-video/interpolate: openrouter lists no Topaz Interpolate for video-slow-motion
- [endpoint] openai topaz/topaz-interpolate/video-to-video/interpolate: openai lists no Topaz Interpolate for video-slow-motion
- [endpoint] gemini topaz/topaz-interpolate/video-to-video/interpolate: gemini lists no Topaz Interpolate for video-slow-motion
- [endpoint] replicate topaz/topaz-deblur/video-to-video/restore: replicate lists no Topaz Deblur for video-denoise
- [endpoint] openrouter topaz/topaz-deblur/video-to-video/restore: openrouter lists no Topaz Deblur for video-denoise
- [endpoint] openai topaz/topaz-deblur/video-to-video/restore: openai lists no Topaz Deblur for video-denoise
- [endpoint] gemini topaz/topaz-deblur/video-to-video/restore: gemini lists no Topaz Deblur for video-denoise
- [endpoint] replicate topaz/topaz-restore/image-to-image/restore: replicate lists no Topaz Restore for image-restore
- [endpoint] openrouter topaz/topaz-restore/image-to-image/restore: openrouter lists no Topaz Restore for image-restore
- [endpoint] openai topaz/topaz-restore/image-to-image/restore: openai lists no Topaz Restore for image-restore
- [endpoint] gemini topaz/topaz-restore/image-to-image/restore: gemini lists no Topaz Restore for image-restore
- [endpoint] replicate bria/bria-video-background-removal/video-to-video/remove-background: replicate lists no Bria Video Background Removal for video-remove-background
- [endpoint] openrouter bria/bria-video-background-removal/video-to-video/remove-background: openrouter lists no Bria Video Background Removal for video-remove-background
- [endpoint] openai bria/bria-video-background-removal/video-to-video/remove-background: openai lists no Bria Video Background Removal for video-remove-background
- [endpoint] gemini bria/bria-video-background-removal/video-to-video/remove-background: gemini lists no Bria Video Background Removal for video-remove-background
- [endpoint] replicate bria/bria-expand/image-to-image/fill: replicate lists no Bria Expand for image-outpaint
- [endpoint] openrouter bria/bria-expand/image-to-image/fill: openrouter lists no Bria Expand for image-outpaint
- [endpoint] openai bria/bria-expand/image-to-image/fill: openai lists no Bria Expand for image-outpaint
- [endpoint] gemini bria/bria-expand/image-to-image/fill: gemini lists no Bria Expand for image-outpaint
- [endpoint] replicate clarity/crystal-video-upscaler/video-to-video/upscale: replicate lists no Crystal Video Upscaler for video-upscale
- [endpoint] openrouter clarity/crystal-video-upscaler/video-to-video/upscale: openrouter lists no Crystal Video Upscaler for video-upscale
- [endpoint] openai clarity/crystal-video-upscaler/video-to-video/upscale: openai lists no Crystal Video Upscaler for video-upscale
- [endpoint] gemini clarity/crystal-video-upscaler/video-to-video/upscale: gemini lists no Crystal Video Upscaler for video-upscale
- [endpoint] replicate clarity/crystal-upscaler/image-to-image/upscale: replicate lists no Crystal Upscaler for image-upscale
- [endpoint] openrouter clarity/crystal-upscaler/image-to-image/upscale: openrouter lists no Crystal Upscaler for image-upscale
- [endpoint] openai clarity/crystal-upscaler/image-to-image/upscale: openai lists no Crystal Upscaler for image-upscale
- [endpoint] gemini clarity/crystal-upscaler/image-to-image/upscale: gemini lists no Crystal Upscaler for image-upscale
- [price] fal opensource/birefnet-video: opensource/birefnet-video on fal: fal-ai/birefnet/v2/video has no price published by the provider, its page or LiteLLM
- [endpoint] replicate opensource/birefnet-video/video-to-video/remove-background: replicate lists no BiRefNet video for video-remove-background
- [endpoint] openrouter opensource/birefnet-video/video-to-video/remove-background: openrouter lists no BiRefNet video for video-remove-background
- [endpoint] openai opensource/birefnet-video/video-to-video/remove-background: openai lists no BiRefNet video for video-remove-background
- [endpoint] gemini opensource/birefnet-video/video-to-video/remove-background: gemini lists no BiRefNet video for video-remove-background
- [price] fal opensource/birefnet: opensource/birefnet on fal: fal-ai/birefnet/v2 has no price published by the provider, its page or LiteLLM
- [endpoint] openrouter opensource/birefnet/image-to-image/remove-background: openrouter lists no BiRefNet for image-remove-background
- [endpoint] openai opensource/birefnet/image-to-image/remove-background: openai lists no BiRefNet for image-remove-background
- [endpoint] gemini opensource/birefnet/image-to-image/remove-background: gemini lists no BiRefNet for image-remove-background
- [endpoint] replicate opensource/seedvr-upscale/video-to-video/upscale: replicate lists no SeedVR upscale for video-upscale
- [endpoint] openrouter opensource/seedvr-upscale/video-to-video/upscale: openrouter lists no SeedVR upscale for video-upscale
- [endpoint] openai opensource/seedvr-upscale/video-to-video/upscale: openai lists no SeedVR upscale for video-upscale
- [endpoint] gemini opensource/seedvr-upscale/video-to-video/upscale: gemini lists no SeedVR upscale for video-upscale
- [endpoint] replicate opensource/seedvr-upscale/image-to-image/upscale: replicate lists no SeedVR upscale for image-upscale
- [endpoint] openrouter opensource/seedvr-upscale/image-to-image/upscale: openrouter lists no SeedVR upscale for image-upscale
- [endpoint] openai opensource/seedvr-upscale/image-to-image/upscale: openai lists no SeedVR upscale for image-upscale
- [endpoint] gemini opensource/seedvr-upscale/image-to-image/upscale: gemini lists no SeedVR upscale for image-upscale
- [endpoint] replicate opensource/rife/video-to-video/interpolate: replicate lists no RIFE for video-slow-motion
- [endpoint] openrouter opensource/rife/video-to-video/interpolate: openrouter lists no RIFE for video-slow-motion
- [endpoint] openai opensource/rife/video-to-video/interpolate: openai lists no RIFE for video-slow-motion
- [endpoint] gemini opensource/rife/video-to-video/interpolate: gemini lists no RIFE for video-slow-motion
- [endpoint] replicate opensource/deepfilternet-3/audio-to-audio/noise-reduction: replicate lists no DeepFilterNet 3 for audio-noise-reduction
- [endpoint] openrouter opensource/deepfilternet-3/audio-to-audio/noise-reduction: openrouter lists no DeepFilterNet 3 for audio-noise-reduction
- [endpoint] openai opensource/deepfilternet-3/audio-to-audio/noise-reduction: openai lists no DeepFilterNet 3 for audio-noise-reduction
- [endpoint] gemini opensource/deepfilternet-3/audio-to-audio/noise-reduction: gemini lists no DeepFilterNet 3 for audio-noise-reduction
- [endpoint] replicate opensource/demucs/audio-to-audio/separate-audio: replicate lists no Demucs for audio-stems
- [endpoint] openrouter opensource/demucs/audio-to-audio/separate-audio: openrouter lists no Demucs for audio-stems
- [endpoint] openai opensource/demucs/audio-to-audio/separate-audio: openai lists no Demucs for audio-stems
- [endpoint] gemini opensource/demucs/audio-to-audio/separate-audio: gemini lists no Demucs for audio-stems
- [settings] fal kotoba-streaming-stt/kotoba-realtime-speech-to-text: kotoba-technologies/kotoba-streaming-stt/v1/realtime: the provider lists no settings
- [price] fal wizper/wizper-whisper-v3-fal.ai-edition: wizper/wizper-whisper-v3-fal.ai-edition on fal: fal-ai/wizper has no price published by the provider, its page or LiteLLM
- [backups] openrouter video-edit: openrouter has 0 complete model(s) for video-edit, 4 wanted
- [backups] openai video-edit: openai has 0 complete model(s) for video-edit, 4 wanted
- [backups] gemini video-edit: gemini has 0 complete model(s) for video-edit, 4 wanted
- [backups] replicate video-extend: replicate has 0 complete model(s) for video-extend, 4 wanted
- [backups] openrouter video-extend: openrouter has 0 complete model(s) for video-extend, 4 wanted
- [backups] openai video-extend: openai has 0 complete model(s) for video-extend, 4 wanted
- [backups] gemini video-extend: gemini has 0 complete model(s) for video-extend, 4 wanted
- [backups] openrouter video-lip-sync: openrouter has 1 complete model(s) for video-lip-sync, 4 wanted
- [backups] openai video-lip-sync: openai has 0 complete model(s) for video-lip-sync, 4 wanted
- [backups] gemini video-lip-sync: gemini has 0 complete model(s) for video-lip-sync, 4 wanted
- [backups] replicate video-motion-transfer: replicate has 0 complete model(s) for video-motion-transfer, 4 wanted
- [backups] openrouter video-motion-transfer: openrouter has 0 complete model(s) for video-motion-transfer, 4 wanted
- [backups] openai video-motion-transfer: openai has 0 complete model(s) for video-motion-transfer, 4 wanted
- [backups] gemini video-motion-transfer: gemini has 0 complete model(s) for video-motion-transfer, 4 wanted
- [backups] replicate video-upscale: replicate has 2 complete model(s) for video-upscale, 4 wanted
- [backups] openrouter video-upscale: openrouter has 1 complete model(s) for video-upscale, 4 wanted
- [backups] openai video-upscale: openai has 0 complete model(s) for video-upscale, 4 wanted
- [backups] gemini video-upscale: gemini has 0 complete model(s) for video-upscale, 4 wanted
- [backups] fal video-slow-motion: fal has 3 complete model(s) for video-slow-motion, 4 wanted
- [backups] replicate video-slow-motion: replicate has 1 complete model(s) for video-slow-motion, 4 wanted
- [backups] openrouter video-slow-motion: openrouter has 0 complete model(s) for video-slow-motion, 4 wanted
- [backups] openai video-slow-motion: openai has 0 complete model(s) for video-slow-motion, 4 wanted
- [backups] gemini video-slow-motion: gemini has 0 complete model(s) for video-slow-motion, 4 wanted
- [backups] fal video-denoise: fal has 3 complete model(s) for video-denoise, 4 wanted
- [backups] replicate video-denoise: replicate has 1 complete model(s) for video-denoise, 4 wanted
- [backups] openrouter video-denoise: openrouter has 0 complete model(s) for video-denoise, 4 wanted
- [backups] openai video-denoise: openai has 0 complete model(s) for video-denoise, 4 wanted
- [backups] gemini video-denoise: gemini has 0 complete model(s) for video-denoise, 4 wanted
- [backups] replicate video-remove-background: replicate has 3 complete model(s) for video-remove-background, 4 wanted
- [backups] openrouter video-remove-background: openrouter has 0 complete model(s) for video-remove-background, 4 wanted
- [backups] openai video-remove-background: openai has 0 complete model(s) for video-remove-background, 4 wanted
- [backups] gemini video-remove-background: gemini has 0 complete model(s) for video-remove-background, 4 wanted
- [backups] replicate video-remove-object: replicate has 0 complete model(s) for video-remove-object, 4 wanted
- [backups] openrouter video-remove-object: openrouter has 0 complete model(s) for video-remove-object, 4 wanted
- [backups] openai video-remove-object: openai has 0 complete model(s) for video-remove-object, 4 wanted
- [backups] gemini video-remove-object: gemini has 0 complete model(s) for video-remove-object, 4 wanted
- [backups] fal video-colorize: fal has 1 complete model(s) for video-colorize, 4 wanted
- [backups] replicate video-colorize: replicate has 0 complete model(s) for video-colorize, 4 wanted
- [backups] openrouter video-colorize: openrouter has 0 complete model(s) for video-colorize, 4 wanted
- [backups] openai video-colorize: openai has 0 complete model(s) for video-colorize, 4 wanted
- [backups] gemini video-colorize: gemini has 0 complete model(s) for video-colorize, 4 wanted
- [backups] fal video-relight: fal has 3 complete model(s) for video-relight, 4 wanted
- [backups] replicate video-relight: replicate has 0 complete model(s) for video-relight, 4 wanted
- [backups] openrouter video-relight: openrouter has 0 complete model(s) for video-relight, 4 wanted
- [backups] openai video-relight: openai has 0 complete model(s) for video-relight, 4 wanted
- [backups] gemini video-relight: gemini has 0 complete model(s) for video-relight, 4 wanted
- [backups] fal video-restyle: fal has 1 complete model(s) for video-restyle, 4 wanted
- [backups] replicate video-restyle: replicate has 0 complete model(s) for video-restyle, 4 wanted
- [backups] openrouter video-restyle: openrouter has 0 complete model(s) for video-restyle, 4 wanted
- [backups] openai video-restyle: openai has 0 complete model(s) for video-restyle, 4 wanted
- [backups] gemini video-restyle: gemini has 0 complete model(s) for video-restyle, 4 wanted
- [backups] replicate video-reframe: replicate has 1 complete model(s) for video-reframe, 4 wanted
- [backups] openrouter video-reframe: openrouter has 0 complete model(s) for video-reframe, 4 wanted
- [backups] openai video-reframe: openai has 0 complete model(s) for video-reframe, 4 wanted
- [backups] gemini video-reframe: gemini has 0 complete model(s) for video-reframe, 4 wanted
- [backups] fal video-dub: fal has 1 complete model(s) for video-dub, 4 wanted
- [backups] replicate video-dub: replicate has 0 complete model(s) for video-dub, 4 wanted
- [backups] openrouter video-dub: openrouter has 0 complete model(s) for video-dub, 4 wanted
- [backups] openai video-dub: openai has 0 complete model(s) for video-dub, 4 wanted
- [backups] gemini video-dub: gemini has 0 complete model(s) for video-dub, 4 wanted
- [backups] fal video-remove-fillers: fal has 0 complete model(s) for video-remove-fillers, 4 wanted
- [backups] replicate video-remove-fillers: replicate has 0 complete model(s) for video-remove-fillers, 4 wanted
- [backups] openrouter video-remove-fillers: openrouter has 0 complete model(s) for video-remove-fillers, 4 wanted
- [backups] openai video-remove-fillers: openai has 0 complete model(s) for video-remove-fillers, 4 wanted
- [backups] gemini video-remove-fillers: gemini has 0 complete model(s) for video-remove-fillers, 4 wanted
- [backups] fal video-sound-effects: fal has 3 complete model(s) for video-sound-effects, 4 wanted
- [backups] replicate video-sound-effects: replicate has 0 complete model(s) for video-sound-effects, 4 wanted
- [backups] openrouter video-sound-effects: openrouter has 0 complete model(s) for video-sound-effects, 4 wanted
- [backups] openai video-sound-effects: openai has 0 complete model(s) for video-sound-effects, 4 wanted
- [backups] gemini video-sound-effects: gemini has 0 complete model(s) for video-sound-effects, 4 wanted
- [backups] fal video-music: fal has 1 complete model(s) for video-music, 4 wanted
- [backups] replicate video-music: replicate has 0 complete model(s) for video-music, 4 wanted
- [backups] openrouter video-music: openrouter has 0 complete model(s) for video-music, 4 wanted
- [backups] openai video-music: openai has 0 complete model(s) for video-music, 4 wanted
- [backups] gemini video-music: gemini has 0 complete model(s) for video-music, 4 wanted
- [backups] fal audio-voice-isolation: fal has 1 complete model(s) for audio-voice-isolation, 4 wanted
- [backups] replicate audio-voice-isolation: replicate has 0 complete model(s) for audio-voice-isolation, 4 wanted
- [backups] openrouter audio-voice-isolation: openrouter has 0 complete model(s) for audio-voice-isolation, 4 wanted
- [backups] openai audio-voice-isolation: openai has 0 complete model(s) for audio-voice-isolation, 4 wanted
- [backups] gemini audio-voice-isolation: gemini has 0 complete model(s) for audio-voice-isolation, 4 wanted
- [backups] fal audio-noise-reduction: fal has 2 complete model(s) for audio-noise-reduction, 4 wanted
- [backups] replicate audio-noise-reduction: replicate has 0 complete model(s) for audio-noise-reduction, 4 wanted
- [backups] openrouter audio-noise-reduction: openrouter has 0 complete model(s) for audio-noise-reduction, 4 wanted
- [backups] openai audio-noise-reduction: openai has 0 complete model(s) for audio-noise-reduction, 4 wanted
- [backups] gemini audio-noise-reduction: gemini has 0 complete model(s) for audio-noise-reduction, 4 wanted
- [backups] fal audio-stems: fal has 3 complete model(s) for audio-stems, 4 wanted
- [backups] replicate audio-stems: replicate has 0 complete model(s) for audio-stems, 4 wanted
- [backups] openrouter audio-stems: openrouter has 0 complete model(s) for audio-stems, 4 wanted
- [backups] openai audio-stems: openai has 0 complete model(s) for audio-stems, 4 wanted
- [backups] gemini audio-stems: gemini has 0 complete model(s) for audio-stems, 4 wanted
- [settings] fal dia-tts/dia-tts: fal-ai/dia-tts/voice-clone: the provider lists no settings
- [backups] fal audio-voice-changer: fal has 1 complete model(s) for audio-voice-changer, 4 wanted
- [backups] openrouter audio-voice-changer: openrouter has 0 complete model(s) for audio-voice-changer, 4 wanted
- [backups] openai audio-voice-changer: openai has 0 complete model(s) for audio-voice-changer, 4 wanted
- [backups] gemini audio-voice-changer: gemini has 0 complete model(s) for audio-voice-changer, 4 wanted
- [backups] fal audio-transcribe: fal has 3 complete model(s) for audio-transcribe, 4 wanted
- [backups] gemini audio-transcribe: gemini has 1 complete model(s) for audio-transcribe, 4 wanted
- [price] fal birefnet/birefnet-background-removal-v2: birefnet/birefnet-background-removal-v2 on fal: fal-ai/birefnet/v2 has no price published by the provider, its page or LiteLLM
- [price] fal imageutils/remove-background: imageutils/remove-background on fal: fal-ai/imageutils/rembg has no price published by the provider, its page or LiteLLM
- [price] fal birefnet/birefnet-background-removal: birefnet/birefnet-background-removal on fal: fal-ai/birefnet has no price published by the provider, its page or LiteLLM
- [backups] fal image-remove-background: fal has 2 complete model(s) for image-remove-background, 4 wanted
- [backups] openrouter image-remove-background: openrouter has 0 complete model(s) for image-remove-background, 4 wanted
- [backups] openai image-remove-background: openai has 0 complete model(s) for image-remove-background, 4 wanted
- [backups] gemini image-remove-background: gemini has 0 complete model(s) for image-remove-background, 4 wanted
- [backups] openrouter image-upscale: openrouter has 0 complete model(s) for image-upscale, 4 wanted
- [backups] openai image-upscale: openai has 0 complete model(s) for image-upscale, 4 wanted
- [backups] gemini image-upscale: gemini has 0 complete model(s) for image-upscale, 4 wanted
- [backups] openrouter image-restore: openrouter has 0 complete model(s) for image-restore, 4 wanted
- [backups] openai image-restore: openai has 0 complete model(s) for image-restore, 4 wanted
- [backups] gemini image-restore: gemini has 0 complete model(s) for image-restore, 4 wanted
- [backups] replicate image-remove-object: replicate has 0 complete model(s) for image-remove-object, 4 wanted
- [backups] openrouter image-remove-object: openrouter has 0 complete model(s) for image-remove-object, 4 wanted
- [backups] openai image-remove-object: openai has 0 complete model(s) for image-remove-object, 4 wanted
- [backups] gemini image-remove-object: gemini has 0 complete model(s) for image-remove-object, 4 wanted
- [backups] fal image-relight: fal has 2 complete model(s) for image-relight, 4 wanted
- [backups] replicate image-relight: replicate has 0 complete model(s) for image-relight, 4 wanted
- [backups] openrouter image-relight: openrouter has 0 complete model(s) for image-relight, 4 wanted
- [backups] openai image-relight: openai has 0 complete model(s) for image-relight, 4 wanted
- [backups] gemini image-relight: gemini has 0 complete model(s) for image-relight, 4 wanted
- [backups] fal image-restyle: fal has 3 complete model(s) for image-restyle, 4 wanted
- [backups] replicate image-restyle: replicate has 0 complete model(s) for image-restyle, 4 wanted
- [backups] openrouter image-restyle: openrouter has 0 complete model(s) for image-restyle, 4 wanted
- [backups] openai image-restyle: openai has 0 complete model(s) for image-restyle, 4 wanted
- [backups] gemini image-restyle: gemini has 0 complete model(s) for image-restyle, 4 wanted
- [price] fal fast-lcm-diffusion/latent-consistency-models-v1.5-xl: fast-lcm-diffusion/latent-consistency-models-v1.5-xl on fal: fal-ai/fast-lcm-diffusion/inpainting has no price published by the provider, its page or LiteLLM
- [backups] replicate image-outpaint: replicate has 0 complete model(s) for image-outpaint, 4 wanted
- [backups] openrouter image-outpaint: openrouter has 0 complete model(s) for image-outpaint, 4 wanted
- [backups] openai image-outpaint: openai has 0 complete model(s) for image-outpaint, 4 wanted
- [backups] gemini image-outpaint: gemini has 0 complete model(s) for image-outpaint, 4 wanted
- [backups] fal image-colorize: fal has 1 complete model(s) for image-colorize, 4 wanted
- [backups] replicate image-colorize: replicate has 1 complete model(s) for image-colorize, 4 wanted
- [backups] openrouter image-colorize: openrouter has 0 complete model(s) for image-colorize, 4 wanted
- [backups] openai image-colorize: openai has 0 complete model(s) for image-colorize, 4 wanted
- [backups] gemini image-colorize: gemini has 0 complete model(s) for image-colorize, 4 wanted
- [backups] openai image-edit: openai has 0 complete model(s) for image-edit, 4 wanted
- [backups] gemini image-edit: gemini has 0 complete model(s) for image-edit, 4 wanted
- [backups] replicate image-to-image: replicate has 0 complete model(s) for image-to-image, 4 wanted
- [backups] openai image-to-image: openai has 0 complete model(s) for image-to-image, 4 wanted
- [backups] gemini image-to-image: gemini has 0 complete model(s) for image-to-image, 4 wanted
- [backups] openai text-to-video: openai has 0 complete model(s) for text-to-video, 4 wanted
- [backups] gemini text-to-video: gemini has 1 complete model(s) for text-to-video, 4 wanted
- [backups] openai image-to-video: openai has 0 complete model(s) for image-to-video, 4 wanted
- [backups] gemini image-to-video: gemini has 1 complete model(s) for image-to-video, 4 wanted
- [backups] replicate reference-to-video: replicate has 1 complete model(s) for reference-to-video, 4 wanted
- [backups] openrouter reference-to-video: openrouter has 0 complete model(s) for reference-to-video, 4 wanted
- [backups] openai reference-to-video: openai has 0 complete model(s) for reference-to-video, 4 wanted
- [backups] gemini reference-to-video: gemini has 0 complete model(s) for reference-to-video, 4 wanted
- [backups] openai audio-text-to-speech: openai has 3 complete model(s) for audio-text-to-speech, 4 wanted
- [backups] gemini audio-text-to-speech: gemini has 3 complete model(s) for audio-text-to-speech, 4 wanted
- [backups] openrouter audio-text-to-music: openrouter has 2 complete model(s) for audio-text-to-music, 4 wanted
- [backups] openai audio-text-to-music: openai has 0 complete model(s) for audio-text-to-music, 4 wanted
- [backups] gemini audio-text-to-music: gemini has 0 complete model(s) for audio-text-to-music, 4 wanted
- [backups] fal audio-text-to-sfx: fal has 3 complete model(s) for audio-text-to-sfx, 4 wanted
- [backups] replicate audio-text-to-sfx: replicate has 0 complete model(s) for audio-text-to-sfx, 4 wanted
- [backups] openrouter audio-text-to-sfx: openrouter has 0 complete model(s) for audio-text-to-sfx, 4 wanted
- [backups] openai audio-text-to-sfx: openai has 0 complete model(s) for audio-text-to-sfx, 4 wanted
- [backups] gemini audio-text-to-sfx: gemini has 0 complete model(s) for audio-text-to-sfx, 4 wanted