<p align="center">
  <img src="src-tauri/icons/128x128@2x.png" width="128" height="128" alt="openNotes logo" />
</p>

<h1 align="center">openNotes</h1>

<p align="center">
  <strong>One-click meeting notes. Local-first. Free forever.</strong>
</p>

<p align="center">
  Record, transcribe, and summarize your meetings — entirely on your machine.<br />
  No cloud. No bots. No subscriptions. No data leaves your device.
</p>

<p align="center">
  <a href="https://github.com/farce1/opennotes/actions/workflows/ci.yml"><img src="https://github.com/farce1/opennotes/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/farce1/opennotes/releases/latest"><img src="https://img.shields.io/github/v/release/farce1/opennotes?color=blue&label=latest" alt="Latest Release" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="MIT License" /></a>
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey" alt="Platforms" />
</p>

---

<!-- TODO: Replace with actual screenshot or demo GIF -->
<!-- <p align="center">
  <img src="docs/demo.gif" width="720" alt="openNotes demo" />
</p> -->

## Why openNotes?

Most meeting tools send your audio to the cloud, charge monthly fees, and drop bots into your calls. **openNotes does none of that.**

- **Private by design** — All transcription and summarization run on your hardware. Zero network calls for processing.
- **Truly free** — Open-source under MIT. No tiers, no trials, no limits.
- **One-click workflow** — Hit record, finish your meeting, get structured notes. That's it.

## Features

**Recording**
- Capture microphone + system audio simultaneously
- Floating widget overlay — control recordings without leaving your meeting
- Global shortcuts (`Cmd+Shift+R` to record, `Cmd+Shift+P` to pause)
- Opus encoding for compact, high-quality audio

**Transcription**
- Real-time on-device transcription powered by [Sherpa ONNX](https://github.com/k2-fsa/sherpa-onnx) (Silero VAD + Parakeet TDT)
- Guided model download on first launch — no manual setup
- Multi-language support

**AI Summarization**
- Local LLM integration via [Ollama](https://ollama.com) — pick any model you like
- Streaming output so you see results as they generate
- Auto-summarize option for hands-free workflow

**Library & Export**
- Searchable meeting library with full-text search
- Card and list views with filters by date, duration, and status
- Export to PDF, ZIP, or Markdown
- Soft delete with trash and recovery

**Customization**
- Light, dark, and system themes
- English and Polish localization
- Configurable audio sources, shortcuts, and data directory

## Quick Start

### Prerequisites

| Dependency | Purpose |
|---|---|
| [Node.js](https://nodejs.org) (LTS) | Frontend tooling |
| [Rust](https://rustup.rs) (stable) | Backend compilation |
| [Bun](https://bun.sh) | Package manager |
| [Ollama](https://ollama.com) | Local LLM for summarization |

### Install & Run

```bash
git clone https://github.com/farce1/opennotes.git
cd opennotes
bun install --frozen-lockfile
bun run tauri dev
```

The app will guide you through downloading transcription models on first launch.

### Build for Production

```bash
bun run tauri build
```

Produces native installers: `.dmg` (macOS), `.msi` / `.exe` (Windows), `.AppImage` / `.deb` (Linux).

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | [Tauri 2](https://tauri.app) |
| Frontend | React 19, TypeScript, Tailwind CSS 4, Vite 7 |
| Backend | Rust, SQLite (via SQLx) |
| Audio | cpal + libopusenc (Opus encoding) |
| Transcription | sherpa-rs (Silero VAD + Parakeet TDT) |
| Summarization | Ollama (local LLM) |
| CI/CD | GitHub Actions — lint, typecheck, build on all platforms |

## Project Structure

```
opennotes/
├── src/                  # React frontend
│   ├── components/       # UI components (layout, library, settings, widget)
│   ├── views/            # Page-level views
│   ├── hooks/            # Custom React hooks
│   ├── contexts/         # React context providers
│   ├── lib/              # Utilities (db, export, settings)
│   ├── i18n/             # Translations (en, pl)
│   └── types/            # TypeScript definitions
├── src-tauri/            # Rust backend
│   ├── src/              # Core modules (audio, transcription, session, llm)
│   ├── migrations/       # SQLite schema migrations
│   └── icons/            # App icons (all platforms)
└── .github/workflows/    # CI + release pipelines
```

## Contributing

Contributions are welcome! Whether it's a bug fix, new feature, translation, or documentation improvement — all contributions are appreciated.

1. Fork the repository
2. Create your branch (`git checkout -b feature/my-feature`)
3. Commit your changes
4. Push and open a Pull Request

Please open an issue first for larger changes so we can discuss the approach.

## Roadmap

- [ ] Speaker diarization (who said what)
- [ ] Meeting templates and custom prompts
- [ ] Calendar integration
- [ ] More languages for transcription and UI
- [ ] Plugin system for custom post-processing

Have an idea? [Open an issue](https://github.com/farce1/opennotes/issues) — we'd love to hear it.

## License

[MIT](LICENSE) — use it however you like.

---

<p align="center">
  Built with <a href="https://tauri.app">Tauri</a>, <a href="https://react.dev">React</a>, and <a href="https://www.rust-lang.org">Rust</a>.
</p>
