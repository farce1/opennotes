---
title: Contributing
description: Build from source and contribute to openNotes
---

openNotes is open-source and welcomes contributions. This guide covers how to set up a development environment, build from source, and submit changes.

## Repository structure

openNotes has two repositories:

| Repository | Purpose | URL |
|------------|---------|-----|
| **opennotes** | Desktop application (Tauri + React + Rust) | [github.com/nicodeforge/opennotes](https://github.com/nicodeforge/opennotes) |
| **opennotes-docs** | Documentation and marketing site (Astro Starlight) | [github.com/nicodeforge/opennotes-docs](https://github.com/nicodeforge/opennotes-docs) |

## Building the app from source

### Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| [Node.js](https://nodejs.org) | 22+ | Frontend build tooling |
| [Bun](https://bun.sh) | Latest | Package manager and task runner |
| [Rust](https://rustup.rs) | 2021 edition (1.70+) | Backend compilation |
| [Ollama](https://ollama.com) | Latest | Required at runtime for summaries |

**Platform-specific requirements:**

- **macOS:** Xcode Command Line Tools (`xcode-select --install`)
- **Windows:** Visual Studio Build Tools with C++ workload, WebView2
- **Linux:** `libwebkit2gtk-4.1-dev`, `libappindicator3-dev`, `librsvg2-dev`, `patchelf`

### Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/nicodeforge/opennotes.git
   cd opennotes
   ```

2. Install frontend dependencies:
   ```bash
   bun install
   ```

3. Start the development server:
   ```bash
   bun run tauri dev
   ```

This starts both the Vite dev server (frontend) and the Tauri development build (Rust backend). The app opens automatically.

### Building for production

```bash
bun run tauri build
```

The output binary is in `src-tauri/target/release/bundle/`.

## Tech stack overview

| Layer | Technology | Key files |
|-------|------------|-----------|
| Frontend | React 19, TypeScript 5.8, Vite 7, Tailwind CSS 4 | `src/` |
| Desktop shell | Tauri 2.10 | `src-tauri/` |
| Audio capture | cpal 0.17 | `src-tauri/src/audio/` |
| Transcription | sherpa-rs 0.6.8 (Parakeet TDT) | `src-tauri/src/transcription/` |
| LLM integration | reqwest -> Ollama API | `src-tauri/src/llm/` |
| Storage | SQLite via sqlx + tauri-plugin-sql | `src-tauri/src/db/` |

## Building the docs site

### Prerequisites

| Tool | Version |
|------|---------|
| [Node.js](https://nodejs.org) | 22+ |
| [Bun](https://bun.sh) | Latest |

### Setup

1. Clone the docs repository:
   ```bash
   git clone https://github.com/nicodeforge/opennotes-docs.git
   cd opennotes-docs
   ```

2. Install dependencies:
   ```bash
   bun install
   ```

3. Start the dev server:
   ```bash
   bun run dev
   ```

4. Build for production:
   ```bash
   bun run build
   ```

## Submitting changes

### Pull request process

1. **Fork** the repository on GitHub
2. **Create a branch** from `main` for your changes:
   ```bash
   git checkout -b feature/your-feature-name
   ```
3. **Make your changes** - keep commits focused and descriptive
4. **Test your changes:**
   - For the app: run `bun run tauri dev` and verify functionality
   - For docs: run `bun run build` and check for build errors
5. **Push** your branch and open a **Pull Request** against `main`
6. Describe your changes in the PR description - include what you changed and why

### Guidelines

- **Keep PRs focused** - one feature or fix per pull request
- **Write clear commit messages** - describe what changed and why
- **Test before submitting** - make sure the app builds and the feature works
- **Follow existing patterns** - match the code style and conventions already in the codebase

## Reporting issues

Found a bug or have a feature request?

1. Search [existing issues](https://github.com/nicodeforge/opennotes/issues) to avoid duplicates
2. Open a [new issue](https://github.com/nicodeforge/opennotes/issues/new) with:
   - A clear title describing the problem or request
   - Steps to reproduce (for bugs)
   - Your operating system and openNotes version
   - Screenshots if applicable

## License

openNotes is licensed under the [MIT License](https://github.com/nicodeforge/opennotes/blob/main/LICENSE). By contributing, you agree that your contributions will be licensed under the same license.
