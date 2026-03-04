---
title: FAQ
description: Frequently asked questions about openNotes
---

Answers to the most commonly asked questions about openNotes.

## Privacy & Data

### Is my data sent to the cloud?

**No.** Everything in openNotes runs locally on your machine:

- Audio is captured and processed on your device
- Transcription uses a local model (Parakeet TDT) - no audio leaves your machine
- Summarization uses Ollama running locally - no transcripts are sent to external servers
- Meeting data is stored in a local SQLite database

The only network activity is downloading AI models from the Ollama registry when you install them.

### Where is my data stored?

All meeting data is stored in a local SQLite database:

| Platform | Path |
|----------|------|
| macOS | `~/Library/Application Support/com.opennotes.app/` |
| Windows | `%APPDATA%\com.opennotes.app\` |
| Linux | `~/.local/share/com.opennotes.app/` |

See the [Settings Reference](/reference/settings/) for more details.

### Can I back up my data?

Yes. You can:

- **Export meetings** as PDF, Markdown, or bulk ZIP from the [Meeting Library](/guides/library/)
- **Copy the database file** from the data storage location listed above

## AI Models

### What models work best for meeting summaries?

The default model (**phi4-mini**) works well for most meetings. For better quality on longer or more complex meetings, try a 7B model like **qwen2.5:7b** or **mistral:7b**.

See the [AI Models guide](/guides/ai-models/) for a full comparison table.

### How much disk space do models need?

| Model size | Disk space |
|------------|------------|
| 3B models | ~2 GB each |
| 7B models | ~4-5 GB each |
| 13B+ models | ~8+ GB each |

Plan for at least 3 GB for the app plus your chosen model.

### Can I use a remote Ollama server?

Yes. Change the Ollama server URL in **Settings -> Summary** to point to any reachable Ollama instance (e.g., `http://192.168.1.100:11434`). The remote server must have models installed and be accessible from your network.

### Can I use models other than the recommended ones?

Yes. openNotes works with any model available in Ollama. The recommended models are tested and known to produce good meeting summaries, but you can experiment with any model from the [Ollama library](https://ollama.com/library).

## Transcription

### What languages are supported?

openNotes bundles the Parakeet TDT model, which is optimized for **English**. It may produce partial results for other languages, but accuracy will be significantly lower.

### Does transcription require internet?

**No.** The transcription model (Parakeet TDT) is bundled with the app and runs entirely offline. No internet connection is needed for recording or transcription.

### Can I transcribe pre-recorded audio files?

Not currently. openNotes is designed for live meeting recording. Transcription of pre-recorded audio files is not supported in this version.

## General

### What operating systems are supported?

openNotes runs on:

- **macOS** 12+ (Apple Silicon and Intel)
- **Windows** 10+
- **Linux** (x86_64, via AppImage)

### Is openNotes free?

Yes. openNotes is completely free and open-source under the [MIT License](https://github.com/nicodeforge/opennotes/blob/main/LICENSE). There are no paid tiers, subscriptions, or hidden costs.

### How do I update openNotes?

Download the latest release from [GitHub Releases](https://github.com/nicodeforge/opennotes/releases) and install it over your existing installation. Your meeting data is preserved - it is stored separately from the app.

### Can I use openNotes without Ollama?

You can record and transcribe meetings without Ollama, but **AI-powered summaries require Ollama**. Without it, you will have access to the raw transcript but no structured summary.

### Does openNotes work offline?

**Mostly yes.** Recording, transcription, and summarization all work offline once you have:

- The app installed
- Ollama installed with at least one model downloaded

The only step that requires internet is the initial download of Ollama and AI models.
