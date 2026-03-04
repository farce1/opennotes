# Project

openNotes: a cross-platform desktop app for one-click meeting recording with fully local transcription and AI-powered meeting notes. Runs on macOS, Windows, and Linux.

## Core Value

One-click meeting recording that produces structured, actionable meeting notes — entirely local, entirely free.

## Requirements

### Validated

- ✓ FOUN-01 through FOUN-07: App shell, SQLite storage, tray, sidebar, global shortcut — v1.0
- ✓ CAPT-01 through CAPT-06: Mic + system audio capture, Opus encoding, floating widget, permissions — v1.0
- ✓ TRANS-01 through TRANS-12: Silero VAD, Parakeet TDT, streaming transcription, model download wizard — v1.0
- ✓ ORCH-01 through ORCH-18: SessionCoordinator, crash recovery, checkpointing, 4-hour limit — v1.0
- ✓ SUMM-01 through SUMM-12: Ollama integration, streaming summaries, tab layout, editing, export — v1.0
- ✓ XPLAT-01 through XPLAT-13: Cross-platform paths, Windows/Linux audio, CI/CD, auto-updater — v1.0
- ✓ DEPS-01 through DEPS-03: sherpa-rs pinned, CI binary cache, upgrade path documented — v1.1
- ✓ LLM-01 through LLM-08: End-to-end model selection, dynamic num_ctx, structured errors, benchmark harness, prompt tuning — v1.1
- ✓ PERF-01 through PERF-06: Lazy-loaded exports, vendor chunking, bundle audit, CI size warning — v1.1

### Active

#### Current Milestone: v1.2 Speaker Intelligence & Templates

**Goal:** Add speaker diarization to transcripts, interactive speaker timeline, flexible summary templates, and fix post-recording performance.

**Target features:**
- Post-recording performance fix (UI freeze on stop)
- Speaker diarization (post-processing, local model)
- Speaker labels + per-session renaming
- Speaker-attributed summaries
- Interactive speaker timeline visualization
- Built-in summary templates (research-informed selection)
- Custom user-created summary templates
- Re-generate summary with different template
- Improved long-meeting handling (2+ hours)
- Migrate ASR from dual Parakeet TDT models to single Whisper Large V3 Turbo with auto language detection (research needed)

### Out of Scope

- Mobile app — desktop-first approach, Tauri 2 is desktop-only
- Cloud sync — local-only is a core value proposition
- Real-time collaboration — single-user product
- Custom model training — use pre-trained Parakeet and Ollama models
- Video recording — audio-only focus
- Custom model backends (llama.cpp, LM Studio, vLLM) — Ollama abstraction is sufficient
- Quantization-aware hardware recommendations — defer to v2+
- sherpa-rs → sherpa-onnx migration — native Rust crate not yet on crates.io; evaluate in v1.2

## Context

**Shipped:** v1.0 MVP on 2026-03-01, v1.1 Hardening & Quality on 2026-03-03
**Current:** v1.2 Speaker Intelligence & Templates (started 2026-03-04)
**Tech stack:** Tauri 2 (Rust backend) + React (TypeScript frontend), SQLite (sqlx), cpal audio, sherpa-rs =0.6.8 (Silero VAD + Parakeet TDT), Ollama (phi4-mini default, user-selectable)
**Platforms:** macOS (DMG), Windows (NSIS), Linux (AppImage)
**Codebase:** ~24,000 LOC across ~115 files (TypeScript + Rust)
**CI/CD:** GitHub Actions multi-platform release on version tags, with sherpa-rs binary cache and bundle size warning
**Bundle:** Initial JS chunk 351 KB (84.3% reduction from v1.0 baseline), PDF/ZIP lazy-loaded

## Key Decisions

| Decision | Phase | Outcome |
|----------|-------|---------|
| HashRouter for Tauri protocol compatibility | 01 | ✓ Good |
| cpal with sync_channel for non-blocking audio callbacks | 02 | ✓ Good |
| sherpa-rs for on-device VAD + ASR | 03 | ✓ Good — pinned to =0.6.8 in v1.1, upgrade path documented |
| SessionCoordinator as Rust-authoritative lifecycle controller | 04 | ✓ Good |
| Ollama localhost:11434 for fully local LLM summaries | 05 | ✓ Good — model selection + quality benchmarked in v1.1 |
| FTS5 for library search with snippet rendering | 06 | ✓ Good |
| Tauri PathResolver for cross-platform data paths | 08 | ✓ Good |
| WASAPI loopback (Windows) / monitor-source (Linux) | 08 | ✓ Good |
| Rust-only shortcut mutation (no JS register calls) | 09 | ✓ Good — eliminated double-registration |
| Self-healing FTS backfill on startup | 09 | ✓ Good |
| Exact sherpa-rs pin (=0.6.8) with CI binary cache | 10 | ✓ Good — eliminates version drift risk |
| Dynamic num_ctx from /api/show context length | 11 | ✓ Good — adapts to any Ollama model |
| Structured Ollama error classification (OOM/connection/generation) | 11 | ✓ Good — actionable UX recovery |
| SummaryGenerationContext for cross-route generation lock | 11 | ✓ Good — prevents settings race |
| Shared lazy PDF module (pdf-renderer.ts) for chunk boundary | 12 | ✓ Good — single async boundary for both export paths |
| Non-blocking CI bundle warning at 1400KB threshold | 12 | ✓ Good — regression visibility without blocking releases |
| num_predict: -1 for unlimited Ollama output | 13 | ✓ Good — eliminates truncation on long meetings |
| Ground-truth-first LLM benchmarking with reproducible fixtures | 13 | ✓ Good — enables future prompt iteration measurement |

## Constraints

- All transcription and summarization must run locally — no cloud APIs
- Tauri 2 is the application framework (Rust backend, web frontend)
- SQLite is the single data store
- Models must be downloadable on first run (no bundled weights)
- macOS, Windows 10+, and Linux are supported platforms

---
*Last updated: 2026-03-04 after v1.2 milestone start*
