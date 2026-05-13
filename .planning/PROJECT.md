# Project

openNotes: a cross-platform desktop app for one-click meeting recording with fully local transcription, speaker diarization, and AI-powered meeting notes. Runs on macOS, Windows, and Linux.

## Core Value

One-click meeting recording that produces structured, actionable meeting notes — entirely local, entirely free.

## Current Milestone: v1.3 Release & Distribution

**Goal:** Take openNotes from "works on the dev's machine" to a publicly downloadable, install-validated release — feature-complete product reaches real users.

**Target features:**
- Clean-VM install validation on Windows / macOS / Linux (closes Windows VCRUNTIME bundling gate, diarization model archive extraction gate)
- BENCHMARK rerun with live Ollama scores → model recommendations surfaced in Settings UI + README
- Onboarding polish — tighten existing model download wizard, Ollama setup, error states, sensible defaults (no new screens)
- End-user README rewrite (screenshots, per-OS install steps, unsigned-app workarounds, model recs, FAQ) + versioned GitHub Release page
- Public release shipped — unsigned binaries with clear workaround instructions; code signing/notarization deferred

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
- ✓ STOP-01 through STOP-05: Non-blocking stop, async post-processing, processing indicators, retry — v1.2
- ✓ ASR-01 through ASR-06: Whisper Large V3 Turbo migration, auto language detection, backward-compatible DB — v1.2
- ✓ TMPL-01 through TMPL-08: Built-in and custom summary templates, re-generate, map-reduce support, speaker attribution — v1.2
- ✓ DIAR-01 through DIAR-11: Speaker diarization, labels, renaming, timeline, click-to-jump, talk-time stats, dedicated thread — v1.2

### Active

<!-- v1.3 Release & Distribution — refined into REQ-IDs in REQUIREMENTS.md -->

- Phase 19 (Release-Critical Config & Packaging Blockers) — partial: 9/14 closed (CONFIG-01/03/04/05/06, EXTRACT-01/04, PKG-02, ONBOARD-04). 5 maintainer-fill deferrals tracked: CONFIG-02 (pubkey), PKG-01 (vc_redist binary), PKG-03 (NSIS hardening — partial), EXTRACT-02/03 (model SHA256 + sizes). All guarded by CI grep + failing unit tests.
- [ ] Cross-platform install validation on clean VMs (Windows / macOS / Linux)
- [ ] BENCHMARK rerun with live Ollama → in-app model recommendations
- [ ] Onboarding polish (existing wizard + Ollama setup flow)
- [ ] End-user-focused README with screenshots, install guide, FAQ, unsigned-app workarounds
- [ ] Public v1.3 GitHub Release shipped

### Out of Scope

- Mobile app — desktop-first approach, Tauri 2 is desktop-only
- Cloud sync — local-only is a core value proposition
- Real-time collaboration — single-user product
- Video recording — audio-only focus
- Custom model backends (llama.cpp, LM Studio, vLLM) — Ollama abstraction is sufficient
- Quantization-aware hardware recommendations — defer to v2+
- Real-time diarization during recording — requires streaming diarization model; post-processing is standard approach
- Persistent speaker voice profiles — biometric identity system with privacy implications; v2+ feature
- Inline transcript editor — rich text editing with speaker-span awareness; enormous complexity
- Code signing & notarization (Apple Developer ID, Windows code signing cert) — v1.3 ships unsigned with install workaround instructions; defer to a later release milestone
- Telemetry / usage analytics — local-only is a core value; user feedback solicited through GitHub issues, not in-app collection
- Landing site / dedicated marketing pages — README on GitHub is sufficient for v1.3 distribution

## Context

**Shipped:** v1.0 MVP (2026-03-01), v1.1 Hardening & Quality (2026-03-03), v1.2 Speaker Intelligence & Templates (2026-03-05)
**Current:** v1.3 Release & Distribution — started 2026-05-11
**Tech stack:** Tauri 2 (Rust backend) + React (TypeScript frontend), SQLite (sqlx), cpal audio, sherpa-rs =0.6.8 (Silero VAD + Whisper Large V3 Turbo), sherpa-rs diarization, Ollama (phi4-mini default, user-selectable)
**Platforms:** macOS (DMG), Windows (NSIS), Linux (AppImage)
**Codebase:** ~17,635 LOC across ~115 files (TypeScript + Rust)
**CI/CD:** GitHub Actions multi-platform release on version tags, with sherpa-rs binary cache and bundle size warning
**Bundle:** Initial JS chunk 351 KB (84.3% reduction from v1.0 baseline), PDF/ZIP lazy-loaded
**DB migrations:** 6 migrations (004: post-processing status, 005: whisper/language, 006: diarization/speakers)

## Key Decisions

| Decision | Phase | Outcome |
|----------|-------|---------|
| HashRouter for Tauri protocol compatibility | 01 | ✓ Good |
| cpal with sync_channel for non-blocking audio callbacks | 02 | ✓ Good |
| sherpa-rs for on-device VAD + ASR | 03 | ✓ Good — pinned to =0.6.8, migrated to Whisper in v1.2 |
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
| Async post-processing with persistent lifecycle status | 14 | ✓ Good — eliminates UI freeze on stop |
| Whisper Large V3 Turbo as single ASR model | 15 | ✓ Good — simplifies model management, adds language detection |
| Optional template_prompt threaded via Option<&str> | 16 | ✓ Good — backward-compatible, no behavior change when null |
| Dedicated std::thread for diarization (not Tokio pool) | 17 | ✓ Good — prevents blocking Ollama and UI |
| Speaker roster as optional prompt enrichment | 18 | ✓ Good — works across standard and chunked paths |

## Constraints

- All transcription and summarization must run locally — no cloud APIs
- Tauri 2 is the application framework (Rust backend, web frontend)
- SQLite is the single data store
- Models must be downloadable on first run (no bundled weights)
- macOS, Windows 10+, and Linux are supported platforms

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-05-13 after Phase 19 (Release-Critical Config & Packaging Blockers) closed 9/14 must-haves*
