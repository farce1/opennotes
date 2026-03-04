---
gsd_state_version: 1.0
milestone: v1.2
milestone_name: Speaker Intelligence & Templates
status: roadmap_ready
last_updated: "2026-03-04T21:35:30Z"
progress:
  total_phases: 5
  completed_phases: 4
  total_plans: 8
  completed_plans: 8
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-04)

**Core value:** One-click meeting recording that produces structured, actionable meeting notes — entirely local, entirely free.
**Current focus:** Phase 18 — Speaker Timeline & Attributed Summaries

## Current Position

Phase: 18 of 18 (Speaker Timeline & Attributed Summaries)
Plan: — (not yet planned)
Status: Ready to plan
Last activity: 2026-03-04 — Phase 17 executed and verified (2/2 plans)

Progress: [████████░░] 80%

## Performance Metrics

**Velocity:**
- Total plans completed: 8 (v1.2)
- Average duration: 11 min
- Total execution time: 85 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 14 | 2 | 20 min | 10 min |
| 15 | 2 | 21 min | 11 min |
| 16 | 2 | 4 min | 2 min |
| 17 | 2 | 40 min | 20 min |

*Updated after each plan completion*

## Accumulated Context

### Decisions

Full decision log in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Phase 14 stop flow now transitions to `processing` and returns immediately; DB finalization and FTS moved to async post-processing.
- Post-processing failures persist as `meetings.post_processing_status` and are surfaced on startup for retry UX.
- Phase 15 migrated ASR to Whisper Large V3 Turbo only; Parakeet and Whisper Tiny runtime paths were removed.
- Phase 15 persists `meetings.detected_language` and `meetings.asr_engine` on first detected Whisper segment.
- Phase 15 model download now supports resumable HTTP Range requests for Whisper Turbo archive downloads.
- Phase 15 frontend removed transcription language selection and now displays detected meeting language metadata.
- [Phase 16]: Kept default summary prompt behavior byte-identical when no template is selected — extracted existing base prompt into `DEFAULT_STANDARD_PROMPT` and only switched when `template_prompt` is provided.
- [Phase 16]: Template prompts are threaded end-to-end from frontend selection to Rust generation, including chunked synthesis path.
- [Phase 17]: Diarization computation runs on a dedicated `std::thread::Builder` worker path (not Tokio blocking pool) and persists `meetings.diarization_status` lifecycle states.
- [Phase 17]: Speaker model download/readiness uses first-use gating (`check_diarization_model_ready` + `download_diarization_model`) before start command invocation.
- [Phase 17]: Meeting transcript view remains full-width before diarization and switches to grouped speaker layout + stats only when diarization completes.

### Pending Todos

- BENCHMARK.md live phi4-mini scores are PENDING — Ollama was unavailable during Phase 13 execution; fixtures/evaluator ready for rerun.

### Blockers/Concerns

- Release gate: Windows VCRUNTIME DLL bundling with NSIS installer requires clean-VM test before shipping diarization features broadly.
- Release gate: Validate diarization model archive extraction (`tar -xjf`) behavior in packaged builds on macOS, Windows, and Linux.

## Session Continuity

Last session: 2026-03-04
Stopped at: Phase 17 complete — ready to plan Phase 18
Resume file: None
