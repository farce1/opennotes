# Feature Research

**Domain:** openNotes v1.2 — Speaker Intelligence & Templates
**Researched:** 2026-03-04
**Confidence:** HIGH (codebase read directly; domain research via WebSearch + official sources)

---

## Context: Milestone Scope

v1.2 adds four new capability clusters on top of the existing v1.1 codebase:

1. **Post-recording performance fix** — UI freeze when stopping recording
2. **Speaker diarization** — Post-processing the audio file with a local model; tagging transcript segments with speaker IDs; per-session speaker renaming
3. **Summary templates** — Built-in templates for common meeting types; custom user-defined templates; re-generate with different template
4. **Interactive speaker timeline** — Visual representation of who spoke when during the meeting

**Existing architecture understood from source reads:**
- Transcript stored as flat `TranscriptRow { segment_index, text, start_time_ms }` — no speaker field yet
- Summaries stored in `summaries` table with `content`, `format`, `llm_model`, `llm_provider` — no template reference
- Summary prompt is hardcoded in `build_summary_prompt()` in `src-tauri/src/llm/mod.rs`
- `MeetingCompleteView` already has Summary + Transcript tabs; transcript renders segments as `timestamp + text` rows
- Session lifecycle managed by `SessionCoordinator` in `session.rs` — `stopping` phase is the freeze window
- LLM chunking already handles long meetings (>96K chars) via map-reduce in `generate_summary_chunked()`

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume will exist given the milestone description. Missing these makes the release feel incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Speaker labels in transcript ("Speaker 1:", "Speaker 2:") | Any app that claims "speaker diarization" must show speaker attribution in the transcript; it is the minimum proof the feature works | MEDIUM | Requires adding `speaker_label` column to `transcript_segments` table; diarization results must be joined to segments by timestamp; existing transcript view must render the label |
| Per-session speaker renaming (Speaker 1 → "Alice") | Every competitor (Fireflies, Descript, Otter, Reduct) supports inline rename; users expect to replace generic labels with real names | MEDIUM | Rename must propagate to ALL segments with that speaker label in the session; stored as a session-level speaker name map in DB; re-render transcript after rename |
| Non-freezing stop recording | v1.0 freezes when stopping because the `stopping` phase triggers blocking finalization on the main thread; this is a known Tauri issue — any command without `async` runs on the main thread | MEDIUM | Move post-recording finalization (audio flush, session DB update, transcription drain) to `spawn_blocking` or ensure the stop command is declared `async`; emit a progress event while UI shows "Processing..." |
| Template selection before generating summary | Users expect to choose what kind of summary they want (general, standup, 1:1, etc.) before (or instead of) generating; Granola, Otter, Fireflies all have this | MEDIUM | Template picker UI in `MeetingCompleteView`; templates contain the system prompt used in `build_summary_prompt()`; the current default prompt becomes the "General Meeting" template |
| Re-generate summary with different template | Users will generate a summary, decide the template was wrong, and want to try another without starting over | LOW | The existing regenerate button + `generate()` hook already handles this; the addition is passing the selected template's prompt instead of the hardcoded one |
| Speaker-attributed action items ("@Alice: send report by Friday") | The existing summary prompt already produces `@[person]: [task]` action items; with speaker diarization, the LLM prompt can include speaker names, making the attribution more accurate | LOW (if diarization works) | Augment the summary prompt to include a speaker list when diarization data is available; the rest of the pipeline handles it |

### Differentiators (Competitive Advantage)

Features that make openNotes meaningfully better than the local-only meeting notes status quo.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Fully local speaker diarization (no cloud) | Every competitor that does diarization (Otter, Fireflies, Grain) sends audio to cloud APIs; openNotes can be the only fully local option with speaker separation | HIGH | `pyannote-rs` crate provides ONNX-based diarization in Rust; CoreML on macOS, DirectML on Windows, CPU fallback; processes 1 hour in < 1 min on CPU; two ONNX model downloads required (segmentation-3.0 + wespeaker-voxceleb-resnet34-LM) |
| Interactive speaker timeline visualization | Color-coded horizontal bar showing each speaker's talk time across the meeting duration; click to jump to that transcript position | HIGH | Frontend-only feature once diarization data exists; no mainstream fully-local desktop meeting app has this; requires computing speaker segment spans from diarization output |
| Custom summary templates with system prompt editor | Users write their own prompt to shape the summary; Granola calls these "templates"; openNotes can go further with a textarea for the full prompt, variables for transcript/speaker list, and a reset-to-default | MEDIUM | Store templates in a `summary_templates` SQLite table; `built_in = 1` rows are factory defaults; user templates are `built_in = 0`; template picker in the summary tab selects which prompt is used |
| Built-in templates for common meeting types | Ship 5-6 curated templates researched from competitor analysis: General, One-on-One, Standup, Sales Call, Retrospective, Interview | LOW | Pure content work once the template infrastructure exists; each template is a different system prompt variant; no additional code beyond the template schema |
| Speaker talk-time stats per meeting | Show each speaker's percentage of total talk time; users in sales or coaching find this valuable for balance analysis | LOW | Derived from diarization output segments; simple aggregation; display as a bar or percentage next to speaker names in the rename UI |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Real-time speaker diarization during recording | Users assume diarization should happen live, like a live transcription subtitle feed | Real-time diarization is architecturally incompatible with the current pipeline: Parakeet TDT streams segments ~1-2 seconds of audio at a time, while pyannote-rs requires a full audio buffer to cluster speakers using embedding similarity. Real-time would require an entirely different model class (e.g., Streaming Sortformer, not available as an offline Rust crate). | Post-recording diarization with a clear UX message ("Analyzing speakers... this takes ~30 seconds") is the correct approach and what all offline tools do. |
| Speaker identification across meetings (persistent voice profiles) | Users want "Speaker 1" to auto-identify as "Alice" in future meetings based on voice matching | Requires a persistent speaker embedding database, cross-session similarity lookup, and user-controlled enrollment — essentially a biometric identity system. Privacy implications are significant. This is a v3+ feature, not v1.2. | Within a session, the speaker rename propagates to the summary. Cross-session: let users manually set a default participant list per meeting type — simpler and less privacy-invasive. |
| Transcript editor (correcting diarization errors inline) | Users will notice misattributed segments and want to fix them | A full inline editor (like Descript's approach) requires a rich text editing model with speaker-span awareness — enormously complex. Out of scope for v1.2. | Provide a "bulk rename" for all segments of a speaker label. This handles the 80% case (wrong speaker label applied to a whole block) without a full editor. |
| Automatic meeting type detection (auto-select template) | Users want the app to guess "this is a standup" and apply the right template | Requires either keyword matching (brittle) or a pre-processing LLM call (doubles latency + Ollama dependency before the main summary). User-selected template avoids both issues. | Persist the last-used template per user as the default for next meeting. "Smart default" without model inference. |
| Multiple simultaneous summaries (compare templates side-by-side) | Users want to see what the same meeting looks like under two different templates | Doubles Ollama invocations; requires a split-pane UI; store multiple summaries per meeting; significant DB schema change. V2+ feature. | Let users re-generate with a different template (already planned); keep only the most recent summary; this handles the comparison use case for 90% of users. |
| Export speaker-attributed transcript as SRT/VTT subtitle file | Power users transcribing video meetings want subtitle files | Out of scope — openNotes is audio-only. SRT/VTT require video timestamps. No video file to attach subtitles to. | Markdown export of speaker-attributed transcript already planned; covers the documentation use case. |

---

## Feature Dependencies

```
[Post-recording performance fix]
    └──fixes──> [SessionCoordinator.stop() blocking main thread in session.rs]
    └──no dependency on diarization or templates]

[Speaker diarization (post-processing)]
    └──requires──> [Recorded audio file (audio_path on Meeting)]
    └──requires──> [pyannote-rs Rust crate + two ONNX model downloads]
    └──requires──> [DB migration: speaker_label column on transcript_segments]
    └──requires──> [DB migration: speaker_names table (session-level name map)]
    └──produces──> [Diarization segments: { speaker_id, start_ms, end_ms }]
    └──used by──> [Speaker labels in transcript view]
    └──used by──> [Interactive speaker timeline]
    └──used by──> [Speaker-attributed summaries (speaker list injected into prompt)]

[Speaker renaming]
    └──requires──> [Speaker diarization completed first]
    └──reads/writes──> [speaker_names table in SQLite]
    └──triggers──> [Re-render of transcript with updated names]
    └──optionally triggers──> [Re-generate summary with updated speaker names]

[Interactive speaker timeline]
    └──requires──> [Speaker diarization completed]
    └──requires──> [Meeting total duration (already on meetings.duration_seconds)]
    └──frontend only after diarization data exists]
    └──enhances──> [Transcript navigation (click timeline → scroll transcript)]

[Summary templates (infrastructure)]
    └──requires──> [DB migration: summary_templates table]
    └──requires──> [Settings/UI: template picker component]
    └──modifies──> [build_summary_prompt() → accept template prompt string]
    └──enables──> [Built-in templates (content)]
    └──enables──> [Custom user templates (content + editor UI)]
    └──enables──> [Re-generate with different template (plumbing already exists)]

[Speaker-attributed summaries]
    └──requires──> [Speaker diarization completed]
    └──requires──> [Speaker renaming (names are better than Speaker 1/2)]
    └──requires──> [Summary template infrastructure]
    └──enhances──> [Existing summary prompt: inject speaker list]
```

### Dependency Notes

- **Diarization gates everything speaker-related:** Speaker labels in transcript, the timeline visualization, and speaker-attributed summaries all depend on diarization running successfully. The feature can degrade gracefully — if diarization fails or is unavailable, the app behaves exactly as v1.1.
- **Templates are independent of diarization:** The template system can ship without speaker diarization. Templates just change the prompt fed to Ollama. Ship these independently if diarization is delayed.
- **Post-recording fix is completely independent:** A pure Rust async fix in `session.rs`. No dependencies on any other v1.2 feature.
- **Speaker timeline is a pure frontend feature:** Once diarization data is in SQLite, the timeline is a React component reading from that data. No new Tauri commands needed beyond what diarization provides.

---

## MVP Definition (v1.2 Scope)

### Launch With (v1.2)

Minimum set to validate the milestone's value proposition.

- [ ] **Post-recording freeze fix** — Make `stop_recording` command async; emit a "processing" phase event the UI can show; measure that the window remains responsive during finalization. This is a bug fix and should ship first.
- [ ] **Speaker diarization (post-processing)** — Run `pyannote-rs` on the recorded audio file after recording stops; store diarization output as segment-level speaker labels in DB; show labels in transcript view ("Speaker 1:", "Speaker 2:").
- [ ] **Speaker renaming** — Click a speaker label in the transcript to rename it; rename propagates to all segments for that speaker in that session; persists in DB.
- [ ] **Built-in summary templates** — Ship 5 built-in templates (General, One-on-One, Standup, Sales Call, Retrospective); add a template picker to the summary generation UI; default is General.
- [ ] **Re-generate with different template** — Template picker is visible before and after generating; changing templates and clicking re-generate sends the new template prompt to Ollama.
- [ ] **Speaker-attributed summary prompt** — When diarization data exists, inject a speaker list (with renamed names if available) into the summary prompt so the LLM produces better `@speaker` attributions.

### Add After Validation (v1.2.x)

- [ ] **Interactive speaker timeline** — Color-coded horizontal timeline showing each speaker's talk segments; show after diarization completes; add click-to-jump-to-transcript later. Trigger: user feedback that they want visual overview of talk distribution.
- [ ] **Custom user-created templates** — Template editor UI with a textarea for the system prompt, variable hints (`{transcript}`, `{speakers}`), and save/delete/reset-to-default. Trigger: users asking for templates beyond the 5 built-ins.
- [ ] **Speaker talk-time percentage** — Show each speaker's share of total talk time in the rename UI. Trigger: user request for coaching/sales use cases.

### Future Consideration (v2+)

- [ ] **Cross-session speaker identification** — Persistent voice profiles that auto-identify speakers across meetings. Privacy-sensitive; requires embedded speaker profile storage and enrollment flow.
- [ ] **Transcript editor with speaker correction** — Rich text editor with speaker-span awareness for correcting diarization errors segment by segment (Descript-style).
- [ ] **Real-time diarization** — Requires a different model class not available as an offline Rust crate in 2026.

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Post-recording freeze fix | HIGH (bug fix, affects every user) | LOW-MEDIUM | P1 |
| Speaker diarization (post-processing) | HIGH (milestone centerpiece) | HIGH | P1 |
| Speaker renaming | HIGH (diarization is useless without it) | MEDIUM | P1 |
| Built-in summary templates (5 types) | HIGH (immediately useful without diarization) | MEDIUM | P1 |
| Re-generate with different template | HIGH (closes the feedback loop on templates) | LOW | P1 |
| Speaker-attributed summary prompt | MEDIUM (requires diarization to be useful) | LOW | P1 |
| Interactive speaker timeline | MEDIUM (delightful, but not core) | MEDIUM | P2 |
| Custom user templates | MEDIUM (power user feature) | MEDIUM | P2 |
| Speaker talk-time stats | LOW-MEDIUM (niche use case) | LOW | P2 |
| Cross-session speaker profiles | HIGH (long-term) | HIGH | P3 |
| Real-time diarization | MEDIUM | VERY HIGH | P3 |
| Transcript editor | MEDIUM | VERY HIGH | P3 |

**Priority key:**
- P1: Must ship in v1.2 core
- P2: Ship in v1.2 if time allows, otherwise v1.2.x
- P3: Future milestone

---

## Detailed Feature Analysis

### Feature 1: Post-Recording Performance Fix

**Current state (inferred from architecture):**
The `stop_recording` Tauri command triggers several sequential operations: stop audio capture, flush remaining audio to disk, drain in-flight transcription segments, update meeting status in DB, emit session state event. If `stop_recording` is not declared `async` in `commands.rs` (or if any of these operations run on the main thread), the entire window freezes until they complete.

**Standard Tauri fix (HIGH confidence from official docs):**
- Ensure `#[tauri::command]` handlers that do heavy work are `async fn`
- Any blocking I/O (file flush, DB writes) inside an async command should use `tokio::task::spawn_blocking()`
- Emit incremental events via Tauri event channel so the frontend can show "Processing..." spinner

**UX pattern:**
1. User clicks Stop
2. UI immediately transitions to "Stopping..." state (tray icon changes, floating widget shows spinner)
3. Backend finalizes asynchronously and emits a completion event
4. Frontend navigates to MeetingCompleteView on completion event

**Complexity:** MEDIUM. The fix itself is a few lines (add `async`, add `spawn_blocking` where needed). The risk is accidentally introducing race conditions in the session state machine.

---

### Feature 2: Speaker Diarization

**Technology decision: pyannote-rs (HIGH confidence)**

`pyannote-rs` is the only production-ready, fully local speaker diarization crate available for Rust in 2026:
- Published on crates.io at v0.3.0 (Dec 2024); actively maintained
- MIT licensed
- Uses ONNX Runtime — same inference backend family as sherpa-onnx
- Requires two downloadable models: `segmentation-3.0` (identifies when speech occurs) and `wespeaker-voxceleb-resnet34-LM` (identifies who is speaking)
- Processes 1 hour of audio in < 1 minute on CPU
- Supports CoreML acceleration on macOS and DirectML on Windows — aligns with openNotes' cross-platform targets
- DER ~11-19% on standard benchmarks (pyannote 3.1 lineage), competitive with pyannoteAI cloud API

**Model downloads:**
- `segmentation-3.0`: ONNX model, approximately 17 MB
- `wespeaker-voxceleb-resnet34-LM`: ONNX model, approximately 27 MB
- Total additional download: ~44 MB — acceptable alongside existing Parakeet TDT download
- Models must be downloadable on first use (consistent with existing download wizard pattern)

**Processing flow:**
1. Recording stops → audio file is finalized at `audio_path`
2. Diarization Tauri command is invoked with the meeting ID
3. `pyannote-rs` runs on the audio file → returns `Vec<{ speaker: String, start: f64, end: f64 }>`
4. Diarization output is aligned to transcript segments by timestamp (match each segment's `start_time_ms` to the nearest diarization span)
5. `speaker_label` is written to each `transcript_segment` row
6. Frontend is notified via event; transcript view re-renders with labels

**Speaker label alignment challenge (MEDIUM complexity):**
Diarization timestamps are in seconds (float); transcript segment timestamps are `start_time_ms` (integer milliseconds). The alignment is a range query: for each transcript segment, find the diarization span that contains `start_time_ms`. Handle overlaps conservatively (assign the speaker with the longest overlap with the segment's time window).

**Schema additions needed:**
```sql
-- Add to transcript_segments
ALTER TABLE transcript_segments ADD COLUMN speaker_label TEXT;

-- New table for per-session speaker names
CREATE TABLE speaker_names (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    meeting_id INTEGER NOT NULL REFERENCES meetings(id),
    speaker_label TEXT NOT NULL,  -- "SPEAKER_00", "SPEAKER_01", etc.
    display_name TEXT NOT NULL,   -- "Speaker 1", "Alice", etc.
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(meeting_id, speaker_label)
);
```

**UX pattern for diarization states:**
- While diarization runs: show "Identifying speakers..." in the transcript tab header
- On completion: transcript immediately updates with speaker labels
- If diarization fails: transcript shows without labels (graceful degradation); show a dismissable warning banner
- If models not downloaded: trigger the existing download wizard pattern

---

### Feature 3: Speaker Renaming

**Standard industry UX (HIGH confidence from Fireflies, Descript, Otter, Reduct research):**

1. User sees "Speaker 1:" labels in transcript
2. Click any speaker label → inline input or modal appears
3. User types a new name
4. Confirmation applies the rename to ALL instances of that label in the session
5. Transcript re-renders immediately with the new name
6. Summary re-generation is optionally suggested: "Speaker names updated. Regenerate summary to use new names?"

**Implementation simplicity:** The `speaker_names` table stores the mapping. All transcript rendering reads display names from this table at render time — no need to rewrite the `speaker_label` field on each segment.

---

### Feature 4: Summary Templates

**Built-in templates (research-based selections):**

| Template Name | Use Case | Key Prompt Differences |
|---------------|----------|------------------------|
| General Meeting | Default; covers any meeting | Overview + Key Points + Decisions + Action Items (current prompt) |
| One-on-One | Manager/report weekly sync | Focus on personal goals, blockers, feedback, and commitments; suppress "Decisions Made" section |
| Daily Standup | Team standup | Three sections only: Yesterday, Today, Blockers; very brief format |
| Sales Call | Customer/prospect calls | Sections: Client Needs, Objections Raised, Commitments Made, Follow-Up Actions; strip Overview |
| Retrospective | Sprint or project retro | Sections: What Went Well, What Could Improve, Action Items; no Overview |
| Interview | Candidate or user interview | Sections: Candidate/User Background, Key Insights, Follow-Up Questions, Recommendation |

**Template schema:**
```sql
CREATE TABLE summary_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    system_prompt TEXT NOT NULL,
    built_in INTEGER NOT NULL DEFAULT 0,  -- 1 = factory default, cannot delete
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

**UX for template selection (Granola/Otter pattern):**
- Template picker is a dropdown or button group above the "Generate Summary" button
- Default selection is "General Meeting" (or the last used template, persisted in settings)
- Selecting a different template and clicking "Generate" sends the template's `system_prompt` to Ollama
- If a summary already exists, a "Re-generate" confirmation appears: "This will replace your current summary."

**Custom template editor (P2 feature):**
- "Manage Templates" link in Settings → Templates tab
- Textarea for the system prompt with variable hints: `{transcript}`, `{speakers}`, `{language_instruction}`
- Save button creates a new row with `built_in = 0`
- Delete is blocked for `built_in = 1` rows
- A "Reset to default" button restores the built-in prompt

**Backend change:**
The current `build_summary_prompt(transcript, language)` function in `llm/mod.rs` must accept a third parameter: `template_prompt: Option<&str>`. If `None`, it uses the existing hardcoded prompt (backward compatible). If `Some(template)`, it substitutes `{transcript}` and other variables.

---

### Feature 5: Interactive Speaker Timeline

**UX pattern (synthesized from competitor analysis and visualization standards):**

- Horizontal bar spanning the full meeting duration
- Each speaker gets a distinct color (auto-assigned from a fixed palette)
- Speaker's segments are colored blocks within the bar
- Hovering a block shows: speaker name, start time, duration
- Clicking a block scrolls the transcript to that timestamp
- Timeline appears in a collapsible panel above or below the transcript (not replacing it)
- Speaker legend below the bar: colored dot + display name + talk time percentage

**Data source:** Diarization output (speaker_label, start_ms, end_ms per segment) + meeting duration. No new backend needed beyond what diarization provides.

**Rendering:** Pure SVG or CSS-based; no charting library needed. Each block is `(end_ms - start_ms) / total_duration_ms * 100%` width, positioned at `start_ms / total_duration_ms * 100%` left.

**Complexity:** MEDIUM for the visualization component itself; LOW for the data pipeline (data already exists after diarization).

---

## Competitor Feature Analysis

| Feature | Otter.ai | Fireflies.ai | Granola | openNotes v1.2 target |
|---------|----------|-------------|---------|----------------------|
| Speaker diarization | Cloud API | Cloud API | None | Local ONNX (pyannote-rs) |
| Speaker renaming | Click label → inline edit | Click label → dropdown | N/A | Click label → inline edit (same UX) |
| Speaker timeline | Visual waveform + colored segments | Talk-time stats chart | None | Color-coded horizontal timeline |
| Summary templates | "Meeting type" selector (5 types) | Custom AI Apps (prompt-based) | 29 built-in + custom prompt editor | 6 built-in + custom prompt editor |
| Re-generate with template | Yes, via template dropdown | Yes, via AI Apps | Yes, via "✨Auto" button → template menu | Yes |
| Fully local / offline | No | No | No (cloud) | Yes |

**Key insight:** openNotes v1.2 is the only fully local option in this comparison. The UX for speaker renaming, template selection, and re-generation closely follows Granola (the most polished UX in the group). The speaker timeline is inspired by Otter's waveform view but simplified — no audio waveform (openNotes doesn't display audio), just speaker segment bars.

---

## Sources

- `src-tauri/src/llm/mod.rs` — confirmed current prompt structure, MAX_SINGLE_PASS_CHARS, chunking, and summary prompt hardcoded value (HIGH confidence, direct source read)
- `src/views/MeetingCompleteView.tsx` — confirmed transcript rendering, Summary/Transcript tab layout, and regenerate flow (HIGH confidence, direct source read)
- `src/types/index.ts` — confirmed TranscriptRow schema (no speaker_label), Meeting schema, AppSettings (HIGH confidence, direct source read)
- `src-tauri/src/db.rs` — confirmed migration system and existing schema version (HIGH confidence, direct source read)
- `src-tauri/src/session.rs` — confirmed SessionCoordinator structure and stopping phase (HIGH confidence, direct source read)
- [pyannote-rs GitHub](https://github.com/thewh1teagle/pyannote-rs) — v0.3.0, MIT, ONNX Runtime, CoreML/DirectML support, < 1 min/hr on CPU (HIGH confidence, official repository)
- [pyannote-rs on crates.io](https://crates.io/crates/pyannote-rs) — confirmed published on crates.io (MEDIUM confidence, site requires JS)
- [Fireflies speaker label editing](https://guide.fireflies.ai/articles/4994477228-how-to-edit-speaker-labels-or-names-in-a-transcript) — "click Speaker 1, rename all instances" UX pattern (HIGH confidence, official Fireflies docs)
- [Granola templates docs](https://docs.granola.ai/help-center/taking-notes/customise-notes-with-templates) — template selection via ✨Auto button, regenerates notes on template change, custom prompt editor (HIGH confidence, official Granola docs)
- [Granola recipes (TechCrunch)](https://techcrunch.com/2025/09/30/ai-note-taking-app-granola-adds-a-repeatable-prompts-feature/) — repeatable prompts feature, 29 built-in templates (HIGH confidence, TechCrunch reporting)
- [Tauri async commands](https://v2.tauri.app/develop/calling-rust/) — async commands execute on separate task pool; blocking commands freeze UI (HIGH confidence, official Tauri v2 docs)
- [AssemblyAI speaker diarization guide 2026](https://www.assemblyai.com/blog/what-is-speaker-diarization-and-how-does-it-work) — DER benchmarks, pyannote 3.1 context, ONNX options (MEDIUM confidence, vendor blog)
- [pyannoteAI community-1 announcement](https://www.pyannote.ai/blog/community-1) — community-1 model performance context; exclusive diarization mode that simplifies ASR alignment (MEDIUM confidence, official pyannote blog)
- [LLM hierarchical summarization](https://galileo.ai/blog/llm-summarization-strategies) — map-reduce chunking strategy validated for long meetings (MEDIUM confidence, multiple corroborating sources)
- [Otter.ai custom templates](https://help.otter.ai/hc/en-us/articles/31402572907415-Custom-Meeting-Type-Templates) — template regenerates summary on selection (HIGH confidence, official Otter docs)

---

*Feature research for: openNotes v1.2 Speaker Intelligence & Templates*
*Researched: 2026-03-04*
*Supersedes: v1.1 feature research (2026-03-02)*
