# Roadmap: openNotes

## Milestones

- ✅ **v1.0 MVP** — Phases 01-09 (shipped 2026-03-01)
- ✅ **v1.1 Hardening & Quality** — Phases 10-13 (shipped 2026-03-03)
- 🚧 **v1.2 Speaker Intelligence & Templates** — Phases 14-18 (in progress)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 01-09) — SHIPPED 2026-03-01</summary>

- [x] Phase 01: App Shell & Storage Foundation — completed 2026-02-26
- [x] Phase 02: Audio Capture Foundation (2/2 plans) — completed 2026-02-27
- [x] Phase 03: Transcription Engine Integration (3/3 plans) — completed 2026-02-27
- [x] Phase 04: Recording Orchestration (3/3 plans) — completed 2026-02-27
- [x] Phase 05: Notes/Summary Pipeline (3/3 plans) — completed 2026-02-27
- [x] Phase 06: Library + Data Workflows (3/3 plans) — completed 2026-02-28
- [x] Phase 07: Settings Surface Expansion (3/3 plans) — completed 2026-02-28
- [x] Phase 08: Cross-Platform Hardening (4/4 plans) — completed 2026-03-01
- [x] Phase 09: Polish & Tech Debt Cleanup (3/3 plans) — completed 2026-03-01

Full details: `.planning/milestones/v1.0-ROADMAP.md`

</details>

<details>
<summary>✅ v1.1 Hardening & Quality (Phases 10-13) — SHIPPED 2026-03-03</summary>

- [x] Phase 10: Dependency Risk Closure (1/1 plans) — completed 2026-03-02
- [x] Phase 11: LLM Model Selection End-to-End (2/2 plans) — completed 2026-03-02
- [x] Phase 12: Frontend Bundle Optimization (2/2 plans) — completed 2026-03-03
- [x] Phase 13: LLM Quality Tuning (1/1 plans) — completed 2026-03-03

Full details: `.planning/milestones/v1.1-ROADMAP.md`

</details>

### 🚧 v1.2 Speaker Intelligence & Templates (In Progress)

**Milestone Goal:** Add speaker diarization to transcripts, interactive speaker timeline, flexible summary templates, migrate ASR to Whisper, and fix post-recording performance.

- [x] **Phase 14: Post-Recording Performance** - Fix UI freeze on stop; async post-processing path (completed 2026-03-04)
- [x] **Phase 15: ASR Migration to Whisper** - Replace dual Parakeet TDT with single Whisper Large V3 Turbo (2 plans) (completed 2026-03-04)
- [ ] **Phase 16: Summary Templates** - Built-in and custom summary templates with re-generate support
- [ ] **Phase 17: Diarization Core** - Rust diarization backend, speaker labels, per-session renaming
- [ ] **Phase 18: Speaker Timeline & Attributed Summaries** - Interactive timeline, click-to-jump, speaker-attributed prompts

## Phase Details

### Phase 14: Post-Recording Performance
**Goal**: Users experience a responsive stop action — the UI unfreezes immediately and post-recording work completes quietly in the background
**Depends on**: Nothing (first v1.2 phase; fixes production regression)
**Requirements**: STOP-01, STOP-02, STOP-03, STOP-04, STOP-05
**Success Criteria** (what must be TRUE):
  1. User clicks Stop and the recording widget dismisses in under 500ms with no visible freeze
  2. User sees a processing indicator ("Finishing up...") while background work (audio flush, DB finalization, FTS update) completes
  3. User receives a session-complete notification when all post-recording work finishes, without having waited for it
  4. Triggering the 4-hour auto-stop produces the same immediate UI response as a manual stop
  5. No transcript data is lost compared to the previous blocking stop path
**Plans:** 2/2 plans complete
- [x] 14-01-PLAN.md — Non-blocking stop backend: Processing phase, background task, migration, retry command
- [x] 14-02-PLAN.md — Frontend processing UI: widget morph, sidebar indicator, notifications, error/retry

### Phase 15: ASR Migration to Whisper
**Goal**: Transcription runs on a single Whisper Large V3 Turbo model with automatic language detection, replacing the dual Parakeet TDT models
**Depends on**: Phase 14
**Requirements**: ASR-01, ASR-02, ASR-03, ASR-04, ASR-05, ASR-06
**Success Criteria** (what must be TRUE):
  1. User records a meeting and transcription completes using Whisper Large V3 Turbo (Parakeet TDT is no longer invoked)
  2. User sees the detected language (e.g., "English", "Polish") displayed on the meeting view for each recording
  3. First-run model download wizard offers the Whisper Large V3 Turbo model and completes successfully on all three platforms
  4. All previously recorded meetings remain accessible and display correctly (no DB schema breakage on upgrade)
  5. Transcription works on macOS, Windows, and Linux CI matrix
**Plans:** 2/2 plans complete
- [x] 15-01-PLAN.md — Whisper-only backend: DB migration, model/worker/download rewrite, Parakeet removal
- [x] 15-02-PLAN.md — Frontend: language display, wizard update, settings cleanup, type updates

### Phase 16: Summary Templates
**Goal**: Users can select a meeting type before generating notes and create their own prompt templates — and regenerate with a different template anytime
**Depends on**: Phase 14
**Requirements**: TMPL-01, TMPL-02, TMPL-03, TMPL-04, TMPL-05, TMPL-06, TMPL-08
**Success Criteria** (what must be TRUE):
  1. User sees a template picker in the summary panel with at least 5 built-in templates (Standard Meeting Notes, Action Items Focus, Executive Summary, Technical Discussion, Interview/1:1)
  2. User selects a template, generates a summary, and the output reflects the chosen template's structure
  3. User clicks "Regenerate" with a different template selected and receives a new summary in that template's format
  4. User creates a custom template by typing a prompt in a textarea, saves it, and uses it to generate a summary
  5. User can edit or delete a custom template; built-in templates cannot be deleted but display a "Reset to default" option
  6. Long meetings (2+ hours) summarized with any template complete without truncation (template works with map-reduce chunking)
**Plans:** 2 plans
- [ ] 16-01-PLAN.md — Backend template_prompt threading, built-in template constants, template store module and hook
- [ ] 16-02-PLAN.md — TemplatePicker UI, create/manage modals, SummaryPanel integration, i18n

### Phase 17: Diarization Core
**Goal**: After a recording finishes, users can run speaker diarization to identify who said what — with speaker labels on every transcript segment and the ability to rename speakers to real names
**Depends on**: Phase 14
**Requirements**: DIAR-01, DIAR-02, DIAR-03, DIAR-04, DIAR-05, DIAR-06, DIAR-09, DIAR-10, DIAR-11
**Success Criteria** (what must be TRUE):
  1. User opens a completed recording and triggers diarization; a progress indicator shows (e.g., "Analyzing speakers... 60%")
  2. After diarization completes, every transcript segment displays a speaker label ("Speaker 1:", "Speaker 2:", etc.)
  3. User clicks a speaker label and renames it to a real name; the new name propagates immediately to all segments with that speaker in the session
  4. User sees per-speaker talk-time statistics showing each speaker's percentage of total speaking time
  5. Diarization models download on first use via the existing model wizard, and the wizard completes on macOS, Windows, and Linux
  6. Running diarization does not stall an in-progress Ollama summary generation (dedicated thread, not Tokio pool)
**Plans**: TBD

### Phase 18: Speaker Timeline & Attributed Summaries
**Goal**: Users can visualize who spoke when on an interactive timeline, jump to any moment in the transcript by clicking the timeline, and get summaries that name speakers directly
**Depends on**: Phase 16, Phase 17
**Requirements**: DIAR-07, DIAR-08, TMPL-07
**Success Criteria** (what must be TRUE):
  1. User sees a color-coded horizontal speaker timeline on the completed meeting view showing each speaker's talk segments across the recording duration
  2. User clicks a segment on the timeline and the transcript scrolls to the corresponding position
  3. When diarization data and speaker names are present, the generated summary includes speaker-attributed content (e.g., "@Alice: assigned to follow up on...") instead of generic references
  4. Speaker-attributed summaries work with all built-in templates and with the map-reduce chunking path for long meetings
**Plans**: TBD

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 01. App Shell & Storage Foundation | v1.0 | 3/3 | Complete | 2026-02-26 |
| 02. Audio Capture Foundation | v1.0 | 2/2 | Complete | 2026-02-27 |
| 03. Transcription Engine Integration | v1.0 | 3/3 | Complete | 2026-02-27 |
| 04. Recording Orchestration | v1.0 | 3/3 | Complete | 2026-02-27 |
| 05. Notes/Summary Pipeline | v1.0 | 3/3 | Complete | 2026-02-27 |
| 06. Library + Data Workflows | v1.0 | 3/3 | Complete | 2026-02-28 |
| 07. Settings Surface Expansion | v1.0 | 3/3 | Complete | 2026-02-28 |
| 08. Cross-Platform Hardening | v1.0 | 4/4 | Complete | 2026-03-01 |
| 09. Polish & Tech Debt Cleanup | v1.0 | 3/3 | Complete | 2026-03-01 |
| 10. Dependency Risk Closure | v1.1 | 1/1 | Complete | 2026-03-02 |
| 11. LLM Model Selection End-to-End | v1.1 | 2/2 | Complete | 2026-03-02 |
| 12. Frontend Bundle Optimization | v1.1 | 2/2 | Complete | 2026-03-03 |
| 13. LLM Quality Tuning | v1.1 | 1/1 | Complete | 2026-03-03 |
| 14. Post-Recording Performance | v1.2 | 2/2 | Complete | 2026-03-04 |
| 15. ASR Migration to Whisper | v1.2 | 2/2 | Complete | 2026-03-04 |
| 16. Summary Templates | v1.2 | 0/2 | Planned | - |
| 17. Diarization Core | v1.2 | 0/TBD | Not started | - |
| 18. Speaker Timeline & Attributed Summaries | v1.2 | 0/TBD | Not started | - |
