# Contributing to openNotes

Thanks for your interest in contributing! Whether it's a bug fix, new feature, translation, or documentation improvement — every contribution helps.

## Getting Started

### Prerequisites

| Tool | Version | Install |
|---|---|---|
| [Node.js](https://nodejs.org) | LTS | [Download](https://nodejs.org) |
| [Rust](https://rustup.rs) | Stable | `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh` |
| [Bun](https://bun.sh) | Latest | `curl -fsSL https://bun.sh/install \| bash` |
| [Ollama](https://ollama.com) | Latest | [Download](https://ollama.com/download) |

### Setup

```bash
git clone https://github.com/farce1/opennotes.git
cd opennotes
bun install --frozen-lockfile
bun run tauri dev
```

On first launch the app will prompt you to download the transcription models (~1 GB). Ollama must be running for summarization to work.

## Development

### Commands

| Command | Description |
|---|---|
| `bun run tauri dev` | Run the full app in development mode |
| `bun run dev` | Frontend only (Vite dev server on port 1420) |
| `bun run build` | TypeScript check + Vite production build |
| `bun run test` | Run frontend tests (Vitest) |
| `bun run tauri build` | Build native installers |
| `cd src-tauri && cargo test` | Run Rust backend tests |
| `cd src-tauri && cargo clippy` | Lint Rust code |

### Project Layout

```
src/                  → React frontend (TypeScript)
  components/         → UI components
  views/              → Page-level views
  hooks/              → Custom React hooks
  contexts/           → React context providers
  lib/                → Utilities (db, export, settings)
  i18n/locales/       → Translations (en, pl)

src-tauri/            → Rust backend
  src/                → Core modules (audio, transcription, session, llm)
  migrations/         → SQLite schema migrations
```

### Tech Stack at a Glance

- **Frontend:** React 19 + TypeScript + Tailwind CSS 4 + Vite 7
- **Backend:** Rust + Tauri 2 + SQLite (SQLx)
- **Audio:** cpal + libopusenc
- **Transcription:** sherpa-rs (Silero VAD + Parakeet TDT)
- **Summarization:** Ollama (local LLM)

## How to Contribute

### Reporting Bugs

Open an [issue](https://github.com/farce1/opennotes/issues/new) with:

- Steps to reproduce
- Expected vs actual behavior
- OS and app version
- Relevant logs (if any)

### Suggesting Features

Open an [issue](https://github.com/farce1/opennotes/issues/new) describing:

- The problem you're trying to solve
- Your proposed solution
- Any alternatives you've considered

### Submitting Code

1. **Fork** the repository
2. **Create a branch** from `main`:
   ```bash
   git checkout -b feature/my-feature
   ```
3. **Make your changes** — keep commits focused and atomic
4. **Test your changes:**
   ```bash
   bun run test
   cd src-tauri && cargo test && cargo clippy
   ```
5. **Push** and open a **Pull Request** against `main`

For larger changes, please open an issue first so we can discuss the approach before you invest significant effort.

### Adding Translations

Translations live in `src/i18n/locales/`. To add a new language:

1. Copy `src/i18n/locales/en/` to a new folder (e.g., `de/` for German)
2. Translate the JSON values (keep the keys unchanged)
3. Register the new locale in the i18n config
4. Add the language option to the settings UI

## Code Guidelines

- **TypeScript** — strict mode is enabled; no `any` unless absolutely necessary
- **Rust** — code must pass `cargo clippy` without warnings
- **Components** — use the design-system dropdown (`src/components/ui/Dropdown.tsx`) instead of native `<select>` elements
- **Styling** — Tailwind CSS utility classes; avoid inline styles
- **Commits** — write clear, concise commit messages describing *what* and *why*

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
