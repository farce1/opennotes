# Project: openNotes

## Identity

**Name:** openNotes
**Tagline:** Open-source AI meeting notes. Local-first. No cloud. No bots. No cost.
**Type:** Desktop application (Tauri 2 + React + Rust) with documentation/marketing website
**Repository (app):** opennotes (main)
**Repository (docs):** opennotes-docs

## Core Value

One-click meeting recording that produces structured, actionable meeting notes — entirely local, entirely free.

## Tech Stack

### App (v1.1 — shipped)
- **Frontend:** React 19, TypeScript 5.8, Vite 7, Tailwind CSS 4
- **Desktop:** Tauri 2.10
- **Backend:** Rust 2021, cpal 0.17 (audio), sherpa-rs 0.6.8 (transcription), reqwest (Ollama LLM)
- **Storage:** SQLite via sqlx + tauri-plugin-sql

### Docs Site (v1.2 — shipped)
- **Framework:** Astro 5.6 + Starlight 0.37.x
- **Styling:** Tailwind CSS 4 (via @astrojs/starlight-tailwind) + custom CSS
- **Interactive:** React components via Astro Islands
- **Hosting:** Vercel (static, zero-config)
- **Search:** Pagefind (built-in)
- **CI:** GitHub Actions build check on PRs

## Milestone History

| Milestone | Phases | Status | Shipped |
|-----------|--------|--------|---------|
| v1.0 MVP | 01-09 | Complete | 2026-03-01 |
| v1.1 Hardening & Quality | 10-13 | Complete | 2026-03-03 |
| v1.2 Documentation Site | 14-18 | Complete | 2026-03-04 |

## Key Decisions

| Decision | Date | Rationale |
|----------|------|-----------|
| Tauri 2 over Electron | 2026-02-26 | Smaller binary, Rust backend, native feel |
| sherpa-rs for transcription | 2026-02-26 | Offline, no API keys, Parakeet TDT quality |
| Ollama for LLM | 2026-02-26 | Local-first, any model, established ecosystem |
| SQLite for storage | 2026-02-26 | Single-file, no server, portable |
| Astro Starlight for docs | 2026-03-04 | Purpose-built for docs, built-in search, static output, marketing page flexibility |
| Vercel for docs hosting | 2026-03-04 | Free tier, auto-deploys from git, great Astro support |
| Replace app code in docs repo | 2026-03-04 | Clean separation — app code in main repo, docs in docs repo |

## Current State

All planned milestones complete. The openNotes project now has:
- **v1.0 MVP:** Fully functional desktop app with recording, transcription, AI summarization, meeting library, and export
- **v1.1 Hardening:** Dependency risk closure, model selection, bundle optimization, LLM quality tuning
- **v1.2 Docs Site:** Marketing landing page, 12 documentation pages, branding/SEO, CI, Vercel deployment-ready

**Next steps:** Deploy to Vercel (import repo in dashboard), then define next milestone via `/gsd:new-milestone`.
