---
title: Transcription
description: Configure transcription settings for optimal accuracy
---

openNotes uses [Parakeet TDT](https://huggingface.co/nvidia/parakeet-tdt-0.6b-v2), a state-of-the-art speech recognition model that runs entirely on your device.

## How transcription works

When you start recording, openNotes:

1. **Captures audio** from your selected microphone using your system's audio API
2. **Detects speech** using Silero VAD (Voice Activity Detection) — only active speech segments are processed
3. **Transcribes speech** using the Parakeet TDT model running locally on your CPU
4. **Displays text** in real-time as each segment is recognized

All processing happens on your machine — no audio data is sent anywhere.

## Parakeet TDT model

Parakeet TDT (Token-and-Duration Transducer) is NVIDIA's speech recognition model optimized for accuracy and speed:

- **Size:** ~600 MB on disk
- **Languages:** Primarily English (best accuracy for English speech)
- **Speed:** Real-time transcription on modern CPUs
- **Quality:** State-of-the-art accuracy for general speech recognition

The model is bundled with the app — no separate download is required.

## Voice Activity Detection

openNotes uses Silero VAD to detect when someone is speaking. This means:

- **Silent periods are skipped** — No processing happens when nobody is talking
- **CPU usage stays low** — The transcription model only runs when speech is detected
- **Cleaner transcripts** — Background noise during silence doesn't generate false text

## Language settings

You can configure the transcription language in **Settings**. The default is English, which provides the best accuracy with the Parakeet TDT model.

:::note
Parakeet TDT is optimized for English. While it may produce partial results for other languages, accuracy will be significantly lower. Future versions may add support for additional language models.
:::

## Transcription quality tips

For the best transcription results:

- **Use a quality microphone** — Clear audio input is the biggest factor in transcription accuracy
- **Reduce background noise** — Close windows, turn off fans, mute other audio sources
- **Speak at a natural pace** — Avoid speaking too quickly or too slowly
- **Ensure adequate volume** — Speak loudly enough for the microphone to capture clearly
- **Position the microphone** — Keep it 6-12 inches from the speaker for optimal pickup

## Technical details

| Setting | Value |
|---------|-------|
| Audio format | 16kHz, mono, 16-bit PCM |
| VAD model | Silero VAD |
| ASR model | Parakeet TDT 0.6B |
| Processing | CPU-only (no GPU required) |
| Latency | Near real-time (~1-2 second delay) |

## Related guides

- [Recording](/guides/recording/) — How to start and manage recordings
- [AI Models](/guides/ai-models/) — Configure the summarization model
