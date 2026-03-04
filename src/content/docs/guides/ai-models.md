---
title: AI Models
description: Choose and manage Ollama models for meeting summaries
---

openNotes uses [Ollama](https://ollama.com) to run large language models (LLMs) locally on your machine for generating meeting summaries.

## How summarization works

After you stop a recording, openNotes sends the transcript to your selected Ollama model, which generates a structured summary containing:

- **Overview** — A brief summary of the meeting
- **Key Points** — Main topics discussed
- **Decisions Made** — Specific decisions reached
- **Action Items** — Tasks assigned or agreed upon
- **Title** — A concise meeting title

For longer meetings (over ~24,000 words), openNotes uses hierarchical summarization: the transcript is split into chunks, each chunk is summarized, and the partial summaries are combined into a final summary.

## Choosing a model

You can select your Ollama model in **Settings → Summary**. The dropdown shows all models currently installed in Ollama.

### Recommended models

| Model | Size | Context | Best for |
|-------|------|---------|----------|
| **phi4-mini** (default) | 3.8B (~2.5 GB) | 128K tokens | General use — good balance of quality and speed |
| **qwen2.5:7b** | 7B (~4.5 GB) | 128K tokens | Higher quality summaries — needs 8+ GB RAM |
| **mistral:7b** | 7B (~4.1 GB) | 32K tokens | Strong summarization — good alternative to qwen2.5 |
| **llama3.2:3b** | 3B (~2.0 GB) | 128K tokens | Fastest option — lower quality, suitable for quick notes |

:::tip
Start with **phi4-mini** (the default). It provides good results for most meetings while being small enough to run on machines with 4-8 GB of RAM. Upgrade to a 7B model if you have 8+ GB of RAM and want better quality.
:::

## Installing a model

You can install models directly from within openNotes:

1. Go to **Settings → Summary**
2. Type the model name in the **Pull Model** field (e.g., `qwen2.5:7b`)
3. Click **Pull** and wait for the download to complete

Alternatively, use the Ollama CLI:

```bash
ollama pull phi4-mini
ollama pull qwen2.5:7b
```

## Managing models

### List installed models

View your installed models in **Settings → Summary** or via the CLI:

```bash
ollama list
```

### Remove a model

To free up disk space, remove unused models via the CLI:

```bash
ollama rm model-name
```

### Disk space

Models can be large. Plan for:

- **3B models:** ~2 GB each
- **7B models:** ~4-5 GB each
- **13B+ models:** ~8+ GB each

## Ollama server configuration

By default, openNotes connects to Ollama at `http://localhost:11434`. If you run Ollama on a different machine or port, update the server URL in **Settings → Summary**.

:::note
Remote Ollama servers work too — just make sure the server is accessible from your machine and CORS is configured correctly if needed.
:::

## Troubleshooting

### Ollama not detected

- Make sure Ollama is installed and running: `ollama --version`
- Check that the server URL in Settings matches your Ollama instance
- Restart Ollama if it crashed or was stopped

### Model pull fails

- Check your internet connection (models download from Ollama's registry)
- Verify you have enough disk space for the model
- Try pulling from the CLI: `ollama pull model-name`

### Summary quality is poor

- Try a larger model (7B instead of 3B)
- Ensure the transcript quality is good — poor audio leads to poor transcriptions, which leads to poor summaries
- For very long meetings, the chunked summarization may lose some context — consider splitting very long sessions

## Related guides

- [Recording](/guides/recording/) — Capture better audio for better results
- [Transcription](/guides/transcription/) — Improve transcript quality
- [Export](/guides/export/) — Export your summaries
