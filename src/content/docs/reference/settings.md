---
title: Settings Reference
description: All openNotes configuration options
---

openNotes settings are accessible from the **Settings** tab in the app. All settings are stored locally on your machine.

## Summary settings

### Ollama server URL

The URL where Ollama is running.

| Property | Value |
|----------|-------|
| Default | `http://localhost:11434` |
| Location | Settings -> Summary |

Change this if you run Ollama on a different port or on a remote machine. The URL must include the protocol (`http://` or `https://`) and port number.

### AI model

The Ollama model used for generating meeting summaries.

| Property | Value |
|----------|-------|
| Default | `phi4-mini` |
| Location | Settings -> Summary |

The dropdown shows all models currently installed in Ollama. See the [AI Models guide](/guides/ai-models/) for recommended models and installation instructions.

### Pull model

Download a new Ollama model by name directly from the app.

| Property | Value |
|----------|-------|
| Location | Settings -> Summary |

Enter any model name from the [Ollama library](https://ollama.com/library) (e.g., `qwen2.5:7b`, `mistral:7b`). The model downloads in the background with progress indication.

## Recording settings

### Preferred microphone

The default audio input device for recordings.

| Property | Value |
|----------|-------|
| Default | System default microphone |
| Location | Settings -> Recording |

Select from all available audio input devices on your system. This saves your preference so you do not need to select the microphone each time you record. See the [Recording guide](/guides/recording/) for tips on microphone selection.

## Transcription settings

### Language

The language for speech-to-text transcription.

| Property | Value |
|----------|-------|
| Default | English |
| Location | Settings -> Transcription |

:::note
The bundled Parakeet TDT model is optimized for English. Other languages may produce lower accuracy. See the [Transcription guide](/guides/transcription/) for details.
:::

## Appearance

### Theme

Switch between light and dark mode.

| Property | Value |
|----------|-------|
| Default | System preference |
| Location | Settings -> Appearance |

Options: **Light**, **Dark**, or **System** (follows your OS setting).

## Data management

### Data storage location

openNotes stores all meeting data (recordings, transcripts, summaries) in a local SQLite database.

| Platform | Path |
|----------|------|
| macOS | `~/Library/Application Support/com.opennotes.app/` |
| Windows | `%APPDATA%\com.opennotes.app\` |
| Linux | `~/.local/share/com.opennotes.app/` |

### Trash

Deleted meetings are moved to trash before permanent removal. See the [Meeting Library guide](/guides/library/) for trash management.

## Configuration file

Settings are persisted in a JSON file managed by `tauri-plugin-store`:

| Platform | Path |
|----------|------|
| macOS | `~/Library/Application Support/com.opennotes.app/settings.json` |
| Windows | `%APPDATA%\com.opennotes.app\settings.json` |
| Linux | `~/.local/share/com.opennotes.app/settings.json` |

:::caution
Editing the settings file manually is not recommended. Use the Settings UI in the app instead. Invalid values may cause unexpected behavior.
:::
