# Architecture Research

**Domain:** Desktop meeting recording app — speaker diarization, summary templates, interactive speaker timeline, post-recording performance fix
**Researched:** 2026-03-04
**Confidence:** HIGH (direct codebase inspection + verified external sources for all library APIs)

---

## Context: v1.2 Adds Four Distinct Concerns

This is not a greenfield document. The v1.1 architecture is fully shipped. v1.2 adds:

1. **Post-recording performance fix** — UI freezes after Stop button; root cause in `session.rs`
2. **Speaker diarization** — post-processing with sherpa-rs `diarize` module (already in pinned dependency)
3. **Summary templates** — user-selectable prompt styles; no new DB table required
4. **Interactive speaker timeline** — SVG visualization + speaker-attributed transcript display

All four features must integrate with the existing architecture rather than alongside it.

---

## Existing Architecture (v1.1 Baseline)

Precise understanding of the current system is required because every new touch point must be explicit.

```
┌──────────────────────────────────────────────────────────────────────┐
│                      React Frontend (TypeScript)                      │
│                                                                       │
│  RecordView          MeetingCompleteView     LibraryView              │
│  useSession          useSummary              useLibrary               │
│  useTranscript       SummaryGenerationCtx    useSettings              │
│                                                                       │
│  IPC: invoke() for commands, Channel<T> for streams, listen() events  │
├──────────────────────────────────────────────────────────────────────┤
│                     Tauri IPC Boundary                                │
│         #[tauri::command] functions in commands.rs                    │
├──────────────────────────────────────────────────────────────────────┤
│                      Rust Backend (src-tauri)                         │
│                                                                       │
│  SessionCoordinator (session.rs)                                      │
│    start / stop / pause / resume / recover                            │
│    Arc<Mutex<SessionCoordinator>> shared across all commands          │
│                                                                       │
│  audio/ (capture.rs, encoder.rs, mixer.rs)                           │
│    cpal → sync_channel<Vec<f32>> → Opus/OGG file                     │
│    ↓ transcription_tx/rx clone                                        │
│                                                                       │
│  transcription/ (worker.rs, mod.rs)                                  │
│    audio_rx → Silero VAD → Parakeet TDT → SegmentResult              │
│    forwarder thread → Channel<TranscriptEvent> → IPC                  │
│                     → INSERT INTO transcripts (SQLite checkpoint)     │
│                                                                       │
│  llm/ (mod.rs, detect.rs, setup.rs)                                  │
│    transcript text → Ollama /api/generate → streaming tokens          │
│    → summaries table (SQLite)                                         │
│                                                                       │
│  db.rs: SQLite WAL via sqlx, versioned migrations (001–003)           │
│  download.rs: model file download with progress Channel               │
│  commands.rs: all #[tauri::command] entry points                      │
└──────────────────────────────────────────────────────────────────────┘
                               │
                          SQLite (WAL)
                    ┌──────────────────────┐
                    │  meetings             │
                    │  transcripts          │
                    │  summaries            │
                    │  meetings_fts (FTS5)  │
                    └──────────────────────┘
                               │
                    settings.json (plugin-store)
                    ┌──────────────────────┐
                    │  theme, shortcuts     │
                    │  ollamaModel, etc.    │
                    └──────────────────────┘
```

### Structural Properties That Must Be Preserved

- `SessionCoordinator` is the Rust-authoritative lifecycle controller. Frontend never mutates session state directly; it calls commands and responds to events.
- `Channel<T>` is the correct mechanism for high-frequency streams (transcription segments, LLM tokens, download progress). Do not use `app.emit()` for streams — it goes through the global event bus.
- `block_on` inside a `#[tauri::command]` blocks the Tauri async runtime thread and freezes the UI. The existing `stop_session` command correctly uses `spawn_blocking` to avoid this. But the internal `block_on(fts_upsert)` inside `SessionCoordinator::stop()` is still happening in the blocking thread — see the freeze analysis below.
- All DB schema changes use numbered SQL migration files in `src-tauri/migrations/` and are registered in `db.rs`.
- Settings are stored in `settings.json` via `plugin-store`. New user preferences go here; meeting data goes in SQLite.
- `SummaryGenerationContext` is a cross-route lock preventing concurrent generation. Any new generation flow must acquire and release this lock.

---

## Feature 1: Post-Recording Performance Fix

### Root Cause (Identified from Source Code)

In `src-tauri/src/session.rs`, `SessionCoordinator::stop()` lines 271–276:

```rust
std::thread::sleep(std::time::Duration::from_millis(300));
tauri::async_runtime::block_on(async {
    if let Err(err) = crate::commands::fts_upsert(pool, active_session.meeting_id).await {
        eprintln!("[fts] upsert after session stop failed: {err}");
    }
});
```

This runs inside a `spawn_blocking` task (in `commands.rs stop_session`). The `stop_session` command awaits that task and returns the meeting_id to the frontend. So the frontend is blocked for: transcription worker join (up to 3s) + 300ms sleep + FTS upsert time (~50–200ms depending on transcript length). During this entire window, the frontend renders a frozen "Saving..." state.

The 300ms sleep appears to be a guard giving the transcription forwarder thread time to write its last segment. This is a race condition workaround, not a proper synchronization point.

### Fix Architecture

The fix splits `stop()` into a fast synchronous phase (return meeting_id immediately) and a detached background phase (FTS indexing + event emission).

**Modified: `src-tauri/src/session.rs` — `SessionCoordinator::stop()`**

```rust
pub fn stop(...) -> Result<i64, String> {
    // Phase 1: synchronous — stop audio and transcription, update DB status
    // stop_transcription_worker() — waits for worker join (up to 3s, unavoidable)
    // stop_recording() — closes audio stream
    // UPDATE meetings SET status='completed', ended_at=..., duration_seconds=?
    // Return meeting_id immediately — DO NOT call fts_upsert here
    Ok(active_session.meeting_id)
}
```

**Modified: `src-tauri/src/commands.rs` — `stop_session`**

```rust
pub async fn stop_session(...) -> Result<i64, String> {
    let meeting_id = tokio::task::spawn_blocking(move || {
        let mut coordinator = session_handle.lock()...;
        coordinator.stop(&app, &pool, &recording_state, &transcription_state)
    }).await...?;

    // Detached background task — not awaited
    let pool_bg = pool.inner().clone();
    let app_bg = app.clone();
    tokio::spawn(async move {
        // Wait briefly for the transcription forwarder to flush its last write
        tokio::time::sleep(std::time::Duration::from_millis(300)).await;
        if let Err(err) = fts_upsert(&pool_bg, meeting_id).await {
            eprintln!("[fts] post-stop upsert failed: {err}");
        }
        let _ = app_bg.emit("session-complete", meeting_id);
    });

    Ok(meeting_id)
}
```

The 300ms sleep moves to the async Tokio context where it is non-blocking. The frontend receives `meeting_id` as soon as the transcription worker joins, navigates immediately, and the library refreshes when `session-complete` fires.

**Modified: `src/hooks/useSession.ts`**

The `stopSession()` function already awaits the IPC call and navigates. The `session-complete` event listener needs to trigger a library cache invalidation (or the library can re-fetch on mount, which it already does).

**Files modified:** `session.rs`, `commands.rs`, `useSession.ts` (minor). No schema changes.

---

## Feature 2: Speaker Diarization

### Library Decision: sherpa-rs `diarize` module (zero new dependencies)

`Cargo.toml` already pins `sherpa-rs = { version = "=0.6.8", features = ["download-binaries"] }`. The `sherpa_rs::diarize` module is confirmed present in v0.6.8 (verified via docs.rs). No additional crate is needed.

**API surface (confirmed from docs.rs + diarize.rs example):**

```rust
use sherpa_rs::diarize::{Diarize, DiarizeConfig, Segment};

let config = DiarizeConfig {
    num_clusters: None,   // None = auto-detect speaker count
    ..Default::default()
};

let sd = Diarize::new(
    segmentation_model_path,   // path to pyannote segmentation model.onnx
    embedding_model_path,      // path to 3dspeaker embedding model.onnx
    config,
)?;

let segments: Vec<Segment> = sd.compute(
    samples,               // &[f32] at 16kHz mono
    Some(progress_cb),     // Option<Box<dyn Fn(computed, total) -> bool>>
)?;

// Segment { start: f32 (seconds), end: f32 (seconds), speaker: u32 (0-based) }
```

**Required models (downloaded separately, same pattern as Parakeet):**

| Model | Size | Source |
|-------|------|--------|
| `sherpa-onnx-pyannote-segmentation-3-0/model.onnx` | ~5.4 MB (compressed) | k2-fsa/sherpa-models on HuggingFace |
| `3dspeaker_speech_eres2net_base_sv_zh-cn_3dspeaker_16k.onnx` | ~25–35 MB | sherpa-onnx GitHub releases |

Total model download: approximately 35–40 MB. Acceptable for a local-only desktop tool.

**Diarization is post-processing, not real-time.** Running diarization during recording would require 10–30s audio buffers (pyannote segmentation window), block the transcription CPU thread, and significantly increase recording-time resource usage. The correct approach is: trigger diarization after recording completes, either automatically or on user request.

### New Rust Module: `src-tauri/src/diarization/`

Mirrors the existing `transcription/` module structure exactly.

```
src-tauri/src/diarization/
├── mod.rs       — public API, DiarizationState handle, new Tauri commands
├── worker.rs    — blocking sherpa_rs::diarize computation + timestamp matching
└── model.rs     — model path resolution, download availability check
```

**New Tauri commands (all in `commands.rs`):**

- `diarize_meeting(meeting_id, on_progress: Channel<DiarizationEvent>)` — triggers diarization, streams progress
- `get_speaker_segments(meeting_id)` — returns `Vec<SpeakerSegmentRow>`
- `get_speaker_labels(meeting_id)` — returns map of `{speaker_id → display_name}`
- `rename_speaker(meeting_id, speaker_id, display_name)` — upserts to `speaker_labels`
- `check_diarization_models_ready()` — returns bool, used by frontend to conditionally show diarization UI

### Data Flow: Diarization

```
MeetingCompleteView mounts with meetingId
    ↓
invoke('check_diarization_models_ready')  — are models present?
    ↓ YES: invoke('get_speaker_segments', meetingId) — prior run?
           → if empty: show "Analyze Speakers" button
           → if populated: render SpeakerTimeline immediately
    ↓ NO: show "Download diarization model" prompt
           (same model wizard pattern as Parakeet)

User clicks "Analyze Speakers"
    ↓
Rust: tokio::task::spawn_blocking {
    1. SELECT audio_path FROM meetings WHERE id = ?
    2. Decode OGG to Vec<f32> at 16kHz (existing resampler infrastructure)
    3. Diarize::new(segmentation_path, embedding_path, config)
    4. sd.compute(samples, progress_cb)
       → progress_cb sends DiarizationEvent::Progress { percent: u8 }
    5. assign_speakers_to_segments(diarize_output, transcript_segments)
    6. Batch INSERT INTO speaker_segments
    7. Batch UPDATE transcripts SET speaker_id = ?
    8. Send DiarizationEvent::Complete
}
    ↓
Frontend: re-fetch speaker_segments + transcript → render SpeakerTimeline
```

**Speaker-to-transcript matching algorithm:**

```rust
fn assign_speakers(
    transcript_rows: &[TranscriptRow],   // have start_time_ms: i64
    diarize_segs: &[Segment],            // have start/end: f32 (seconds)
) -> Vec<(i64 /* segment_id */, u32 /* speaker_id */)> {
    transcript_rows.iter().filter_map(|seg| {
        let mid_sec = seg.start_time_ms as f32 / 1000.0;
        diarize_segs.iter()
            .find(|s| s.start <= mid_sec && mid_sec <= s.end)
            .map(|s| (seg.id, s.speaker))
    }).collect()
}
```

Using the midpoint of each transcript segment reliably falls within a single speaker's turn. Segments at speaker boundaries (rare) are assigned to whichever turn contains the midpoint.

### New Database Schema (Migration 004)

```sql
-- Speaker diarization results (time ranges per speaker)
CREATE TABLE IF NOT EXISTS speaker_segments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    speaker_id INTEGER NOT NULL,       -- 0-based, as assigned by diarize model
    start_ms INTEGER NOT NULL,
    end_ms INTEGER NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_speaker_segments_meeting ON speaker_segments(meeting_id);

-- Per-session user-editable speaker display names
CREATE TABLE IF NOT EXISTS speaker_labels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    speaker_id INTEGER NOT NULL,
    display_name TEXT NOT NULL,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(meeting_id, speaker_id)
);

-- Nullable speaker attribution on transcript segments
ALTER TABLE transcripts ADD COLUMN speaker_id INTEGER DEFAULT NULL;

-- Template used for each summary generation (see Feature 3)
ALTER TABLE summaries ADD COLUMN template_id TEXT DEFAULT NULL;
```

Both `ALTER TABLE` changes add nullable columns — safe additive migrations with no data migration required.

### Diarization Model Download

The existing `download.rs` module and model download wizard handle Parakeet model acquisition. Diarization models follow the same `Channel<DownloadEvent>` pattern with a separate `download_diarization_models` command. The model wizard gains a new optional "Diarization Models" step, shown only when diarization models are absent.

The diarization feature is **opt-in**: if models are not downloaded, the `MeetingCompleteView` shows a "Download speaker analysis model (~35 MB)" prompt instead of the diarization UI.

---

## Feature 3: Summary Templates

### Architecture: Prompt Registry in Rust, User Templates in Settings

Templates do not belong in SQLite. They are user configuration (like shortcuts or model selection), not meeting data. The `plugin-store` (`settings.json`) already handles arbitrary JSON including arrays.

**New Rust file: `src-tauri/src/llm/templates.rs`**

```rust
#[derive(Clone, Serialize, Deserialize)]
pub struct SummaryTemplate {
    pub id: String,           // "default", "standup", "research", custom uuid
    pub name: String,
    pub description: String,
    pub prompt: String,       // Full prompt with {transcript} and {language_instruction} placeholders
    pub is_builtin: bool,
}

pub fn builtin_templates() -> Vec<SummaryTemplate> {
    vec![
        // "default" — current 4-section prompt; backward compat alias
        // "standup" — Yesterday / Today / Blockers
        // "research" — Findings, Hypotheses Tested, Open Questions
        // "interview" — Candidate, Strengths, Concerns, Recommendation
        // "sales" — Customer Pain Points, Next Steps, Deal Status
    ]
}
```

Built-in templates are compiled into the binary. User templates are stored in `settings.json` as `userSummaryTemplates: SummaryTemplate[]`.

### Modified: `generate_summary` Command

```rust
pub async fn generate_summary(
    meeting_id: i64,
    server_url: Option<String>,
    model: Option<String>,
    language: Option<String>,
    template_id: Option<String>,    // NEW — None defaults to "default" (backward compat)
    on_token: Channel<LlmTokenEvent>,
) -> Result<(), String>
```

The command resolves `template_id` → `SummaryTemplate` (builtin map or from user templates passed via invocation), substitutes `{transcript}` and `{language_instruction}` placeholders, then passes the resulting prompt string to the existing `run_generate_stream`. The entire context-length, chunking, and streaming machinery is unchanged.

**Prompt substitution:**

```rust
fn build_prompt_from_template(template: &SummaryTemplate, transcript: &str, language: &str) -> String {
    template.prompt
        .replace("{transcript}", transcript)
        .replace("{language_instruction}", build_language_instruction(language))
}
```

**Important:** Built-in templates must include the `TITLE:` instruction line so that `extract_title()` continues to work. Custom templates should document this requirement.

### New Tauri Commands

- `list_summary_templates(user_templates: Vec<SummaryTemplate>)` — merges builtin + user-supplied templates, returns full list
- `save_user_template(template: SummaryTemplate)` — frontend handles persistence in `settings.json`; Rust only needs to validate the template is well-formed
- (User template CRUD otherwise handled entirely in `settings.json` via `plugin-store` — no Rust command needed for save/delete)

### Settings Schema Additions

```typescript
interface AppSettings {
  // ... all existing fields
  defaultSummaryTemplate: string;           // template id, default "default"
  userSummaryTemplates: SummaryTemplate[];  // custom user-created templates
}
```

### Frontend Changes

**Modified: `src/hooks/useSummary.ts`**
- `generate(meetingId, templateId?)` — accepts optional template ID
- Passes `templateId` to `invoke('generate_summary', ...)`

**Modified: `src/components/SummaryPanel.tsx`**
- Add template selector dropdown (shown when regenerating)
- "Regenerate with template" — triggers `generate()` with selected template ID
- Must acquire `SummaryGenerationContext` lock same as existing regeneration flow

**New: `src/components/SummaryTemplateEditor.tsx`**
- Form for creating/editing custom templates
- Template name, description, prompt textarea with `{transcript}` placeholder guidance
- Save → `setSetting('userSummaryTemplates', [...updated])`

**New: `src/hooks/useTemplates.ts`**
- `listTemplates()` — returns builtin + user templates
- `saveTemplate()`, `deleteTemplate()` — read/write `userSummaryTemplates` in settings

**Modified: `src/views/SettingsView.tsx`**
- "Summary Templates" section under the Summary tab
- Lists user-created templates with edit/delete, "New Template" button

**FTS impact:** Templates produce different section structures but the FTS upsert concatenates raw summary content — it is template-agnostic. No FTS changes needed.

---

## Feature 4: Interactive Speaker Timeline Visualization

### Architecture: Custom SVG in React, No New Library Dependency

The timeline visualization is a `<svg>` element rendered by React using `useMemo` to compute layout from `speaker_segments` data. Adding a chart library (Recharts, Visx, Nivo) for this use case would increase bundle size ~100–200 KB for a component that requires no zoom, no animation, and no axes. Inline SVG with React is sufficient.

**What the timeline shows:**
- Horizontal time axis covering the full meeting duration
- One horizontal lane per unique speaker (identified by display name from `speaker_labels`)
- Colored `<rect>` elements for each speaker's talking blocks
- Speaker name labels on the left side (click-to-edit inline)
- Clicking a block scrolls the transcript to the corresponding time range

**New: `src/components/SpeakerTimeline.tsx`**

```typescript
interface SpeakerTimelineProps {
  segments: SpeakerSegment[];           // from speaker_segments table
  labels: Record<number, string>;       // speaker_id → display_name
  durationMs: number;                   // total meeting duration
  onSegmentClick?: (speakerId: number, startMs: number) => void;
  onLabelEdit?: (speakerId: number, newName: string) => void;
}
```

The component uses `useMemo` to group segments by `speaker_id`, compute SVG viewport (`width = 100%` with `viewBox` for responsive scaling), and produce the array of colored `<rect>` objects. Lane height is fixed (e.g., 24px). Total SVG height = `speakers.length * (24 + 4)` pixels.

**New: `src/components/SpeakerLabel.tsx`**
- Inline display of speaker name badge (e.g., "Speaker 1" or custom name)
- Click to show a rename input field
- On blur/enter: call `invoke('rename_speaker', { meetingId, speakerId, displayName })`

**Speaker-attributed transcript display:**

The existing `TranscriptSegment` type gains optional speaker fields:

```typescript
interface TranscriptSegment {
  text: string;
  elapsedMs: number;
  index: number;
  speakerId?: number;       // NEW — from transcripts.speaker_id (nullable)
  speakerName?: string;     // NEW — resolved from speaker_labels
}
```

The `get_transcript_page` command returns `speaker_id` from the transcripts table (existing column after migration 004). The `TranscriptRow` Rust type gains the nullable `speaker_id` field. Frontend resolves the name using the `speaker_labels` map.

**Click-to-scroll coordination between timeline and transcript:**

Lift state to `MeetingCompleteView`:

```typescript
const [highlightedMs, setHighlightedMs] = useState<number | null>(null);

// Timeline passes up: onSegmentClick → setHighlightedMs(startMs)
// Transcript list: useEffect watches highlightedMs → scroll to matching segment
```

One-directional data flow: timeline sets `highlightedMs`, transcript reads it. No cross-component refs.

**Speaker-attributed summaries:**

When diarization data is available and the user regenerates the summary, the transcript is pre-processed to prepend speaker labels:

```
[Alice]: Good morning everyone, let's review the agenda...
[Bob]: Before we start, I have a question about...
```

This pre-processing happens in `llm/mod.rs` at prompt build time, gated on whether `speaker_map: Option<HashMap<u32, String>>` is populated. The `generate_summary` command fetches `speaker_labels` for the meeting and passes the map to `build_summary_prompt`. No model changes, no prompt structure changes for the LLM output.

---

## System Overview: v1.2 Extended Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                     React Frontend (v1.2 additions)                   │
│                                                                       │
│  MeetingCompleteView (modified)                                       │
│  ├── SpeakerTimeline (new) ── SVG timeline, click-to-scroll          │
│  ├── SpeakerLabel (new) ──── inline speaker name editor              │
│  ├── SummaryPanel (modified) template picker for regeneration        │
│  └── SummaryTemplateEditor (new) custom template CRUD                │
│                                                                       │
│  useDiarization (new) ─── trigger, progress, speaker data            │
│  useTemplates (new) ───── list/save/delete templates                 │
│  useSummary (modified) ── templateId param                           │
│  useSession (modified) ── handle session-complete event              │
├──────────────────────────────────────────────────────────────────────┤
│                       Tauri IPC Boundary                              │
│  New commands: diarize_meeting, get_speaker_segments,                 │
│                get_speaker_labels, rename_speaker,                    │
│                check_diarization_models_ready                         │
│  Modified: generate_summary (+template_id), stop_session (fast path) │
├──────────────────────────────────────────────────────────────────────┤
│                       Rust Backend (v1.2 additions)                   │
│                                                                       │
│  session.rs (modified)                                                │
│    stop() fast path: return meeting_id after transcription join       │
│    background tokio::spawn: 300ms wait + fts_upsert + event          │
│                                                                       │
│  commands.rs (modified)                                               │
│    stop_session: spawn background finalization, return immediately    │
│    + all new diarization and template commands                        │
│                                                                       │
│  diarization/ (new module, mirrors transcription/ pattern)            │
│    mod.rs ─── DiarizationState, public commands                      │
│    worker.rs ─ sherpa_rs::diarize::Diarize::compute()                │
│    model.rs ── model path resolution, download check                 │
│                                                                       │
│  llm/templates.rs (new)                                               │
│    builtin_templates(), prompt substitution                           │
│                                                                       │
│  llm/mod.rs (modified)                                                │
│    build_summary_prompt() ── speaker_map param                        │
│    generate_summary ─────── template_id param                         │
└──────────────────────────────────────────────────────────────────────┘
                               │
                          SQLite (WAL) — Migration 004
                    ┌──────────────────────────────┐
                    │  meetings                     │
                    │  transcripts (+speaker_id)    │
                    │  summaries (+template_id)     │
                    │  speaker_segments (new)       │
                    │  speaker_labels (new)         │
                    │  meetings_fts                 │
                    └──────────────────────────────┘
                               │
                    settings.json (plugin-store)
                    ┌──────────────────────────────┐
                    │  ... all existing settings    │
                    │  defaultSummaryTemplate       │
                    │  userSummaryTemplates[]       │
                    └──────────────────────────────┘
```

---

## Component Inventory: New vs Modified

### New Rust Files

| File | Purpose |
|------|---------|
| `src-tauri/src/diarization/mod.rs` | Module public API, DiarizationState, new commands |
| `src-tauri/src/diarization/worker.rs` | Blocking sherpa_rs::diarize computation + timestamp matching |
| `src-tauri/src/diarization/model.rs` | Diarization model path resolution, download check |
| `src-tauri/src/llm/templates.rs` | Built-in template definitions, prompt substitution |
| `src-tauri/migrations/004_diarization_templates.sql` | speaker_segments, speaker_labels, transcripts.speaker_id, summaries.template_id |

### Modified Rust Files

| File | Change |
|------|--------|
| `src-tauri/src/session.rs` | Remove `block_on(fts_upsert)` + 300ms sleep from `stop()` |
| `src-tauri/src/commands.rs` | `stop_session` spawns background finalization; add diarization commands; extend `generate_summary` |
| `src-tauri/src/llm/mod.rs` | `build_summary_prompt` gains `speaker_map` param; `save_summary` gains `template_id` param |
| `src-tauri/src/db.rs` | Register migration 004 |
| `src-tauri/src/lib.rs` | Register new diarization + template commands |

### New Frontend Files

| File | Purpose |
|------|---------|
| `src/components/SpeakerTimeline.tsx` | SVG speaker timeline visualization |
| `src/components/SpeakerLabel.tsx` | Inline speaker name display + edit |
| `src/components/SummaryTemplateEditor.tsx` | Create/edit custom summary templates |
| `src/hooks/useDiarization.ts` | Trigger diarization, receive progress, fetch speaker data |
| `src/hooks/useTemplates.ts` | Load, save, delete summary templates |

### Modified Frontend Files

| File | Change |
|------|--------|
| `src/views/MeetingCompleteView.tsx` | SpeakerTimeline tab, speaker-attributed transcript, template picker |
| `src/hooks/useSummary.ts` | Accept optional `templateId` in `generate()` |
| `src/hooks/useSession.ts` | Handle `session-complete` event for library refresh |
| `src/components/SummaryPanel.tsx` | Template selector dropdown, regenerate-with-template flow |
| `src/types/index.ts` | Add `TranscriptSegment.speakerId`, `SpeakerSegment`, `SummaryTemplate` types |
| `src/views/SettingsView.tsx` | Summary Templates section under Summary tab |
| `src/lib/constants.ts` | `DEFAULT_SETTINGS` additions for template preferences |

---

## Integration Points

### Boundaries That New Features Cross

| Existing Boundary | How v1.2 Crosses It | Risk |
|-------------------|---------------------|------|
| `SessionCoordinator::stop()` | FTS upsert moved out; existing error paths (mark_meeting_failed) must still fire | Medium — test all stop error paths |
| `transcription/mod.rs` forwarder thread | Writes `transcripts.speaker_id = NULL`; diarization later updates it — sequential, no race | Low |
| `llm/mod.rs build_summary_prompt()` | New `speaker_map` param; `None` must preserve exact existing behavior | Low — backward compat by design |
| `summaries` table | Add `template_id TEXT DEFAULT NULL` — nullable, no migration data loss | Low |
| `transcripts` table | Add `speaker_id INTEGER DEFAULT NULL` — nullable, no migration data loss | Low |
| `commands.rs generate_summary` | Add `template_id: Option<String>` param — None = current behavior | Low |
| `SummaryGenerationContext` | Template-based regeneration must acquire + release the lock | Low — same code path |
| `download.rs` + model wizard | Diarization models use same Channel pattern; wizard gains optional step | Low |

### Data Produced and Consumed by Feature

| Feature | Produces | Consumed By |
|---------|----------|-------------|
| Diarization (Rust) | `speaker_segments` rows, `transcripts.speaker_id` updates | SpeakerTimeline, attributed transcript, attributed summary |
| Speaker labels | `speaker_labels` rows | SpeakerTimeline labels, SpeakerLabel editor |
| Templates (Rust) | `summaries.template_id` column value | Settings UI, future filtering |
| Post-recording fix | `session-complete` event timing changes | Library refresh, MeetingCompleteView load |

---

## Recommended Build Order

Dependencies between features determine safe implementation order:

**Phase 1: Post-recording performance fix**
- No dependencies. Unblocks user experience for all subsequent testing.
- Files: `session.rs`, `commands.rs`, `useSession.ts`
- No schema changes. Self-contained.

**Phase 2: Summary templates**
- No dependency on diarization.
- Requires: `llm/templates.rs`, migration 004 (partial — just `summaries.template_id`), `useTemplates.ts`, `SummaryPanel` template picker, `SummaryTemplateEditor`, settings additions.
- Users can test different prompt styles immediately while diarization is built.

**Phase 3: Diarization core (Rust)**
- No frontend dependency, but frontend features depend on it.
- Requires: migration 004 (full — speaker_segments, speaker_labels, transcripts.speaker_id), `diarization/` module, model download integration, new commands.
- Build and integration-test in isolation before frontend work: verify `diarize_meeting` produces correct segment data on known test audio.

**Phase 4: Speaker timeline + attributed transcript (Frontend)**
- Depends on Phase 3 commands being available.
- Build: `SpeakerTimeline`, `SpeakerLabel`, `useDiarization`, wire into `MeetingCompleteView`.

**Phase 5: Speaker-attributed summaries**
- Depends on Phase 3 (speaker data) and Phase 2 (template prompt system).
- Modify `build_summary_prompt` to accept `speaker_map`. Wire speaker label fetch into `generate_summary`.

---

## Architectural Patterns

### Pattern 1: Post-Processing Worker

**What:** Heavy CPU work (decode + neural inference) runs in `tokio::task::spawn_blocking`. The Tauri command returns a `Channel<Event>` immediately, and the background task streams progress events then emits a final `Complete` or `Error` event.

**When to use:** Any operation taking >500ms that benefits from progress reporting. Diarization (60–120s on long meetings), model download, and summary generation all use this pattern.

**Code shape:**

```rust
#[tauri::command]
pub async fn diarize_meeting(
    meeting_id: i64,
    pool: tauri::State<'_, SqlitePool>,
    data_dir: tauri::State<'_, DataDir>,
    on_progress: Channel<DiarizationEvent>,
) -> Result<(), String> {
    let pool = pool.inner().clone();
    let data_dir = data_dir.inner().0.clone();
    tokio::task::spawn_blocking(move || {
        diarization::run_diarization(meeting_id, &pool, &data_dir, &on_progress)
    })
    .await
    .map_err(|e| format!("diarization task failed: {e}"))?
}
```

### Pattern 2: Timestamp Matching for Speaker Attribution

**What:** Align diarization output (float-second timestamps) to transcript segments (integer millisecond timestamps). Use midpoint containment: for each transcript segment, find the diarization segment containing its `start_time_ms` midpoint.

**Why midpoint:** VAD-detected speech segments have a stable center that reliably falls within a single speaker's turn. Boundary segments (where two speakers overlap) are rare and acceptable to assign to whichever turn contains the midpoint.

### Pattern 3: Template Prompt Injection

**What:** Templates store a full prompt string with `{transcript}` placeholder. At generation time, the placeholder is substituted. The existing LLM pipeline (context length calculation, chunking, streaming) sees the final string and is unchanged.

**Trade-off:** The `extract_title()` function in `llm/mod.rs` parses a `TITLE:` prefix line from LLM output. Built-in templates must include this instruction. Custom templates should document the requirement; if absent, title extraction silently fails (returns `None`), which is a graceful degradation, not an error.

### Pattern 4: Lifted State for Timeline-Transcript Coordination

**What:** `MeetingCompleteView` holds `highlightedMs: number | null`. The `SpeakerTimeline` calls `onSegmentClick(startMs)` which sets this state. The transcript list reads it via `useEffect` to scroll to the matching segment.

**Why lifted:** The timeline and transcript are sibling components. The timeline does not need a ref to the transcript DOM — it only needs to signal "here is a time." The transcript handles its own scroll behavior. This is clean unidirectional data flow.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Real-Time Speaker Diarization

**What people try:** Running diarization concurrently with transcription to show live speaker labels during recording.

**Why it's wrong:** Pyannote segmentation requires ~10–30s audio windows to detect speaker change points. Running it during recording would consume significant CPU competing with Parakeet transcription, add unacceptable latency, and require buffering large audio chunks. The transcription worker is already CPU-bound on a dedicated thread.

**Do this instead:** Post-process after recording completes. Show "Analyzing speakers..." state while diarization runs. The UX is acceptable because users can view the transcript immediately; speaker attribution enhances it.

### Anti-Pattern 2: Storing Summary Templates in SQLite

**What people try:** Creating a `summary_templates` table in the database.

**Why it's wrong:** Templates are user configuration, not meeting data. SQLite is for meeting content that needs queries, relationships, and FTS indexing. Templates need none of this. Putting them in SQLite creates unnecessary migration overhead and inconsistency with how all other user preferences are stored.

**Do this instead:** Store user templates in `settings.json` as `userSummaryTemplates: SummaryTemplate[]`. Built-in templates are compiled into the Rust binary in `llm/templates.rs`.

### Anti-Pattern 3: Blocking the IPC Call During Diarization

**What people try:** Making `diarize_meeting` a blocking command that returns only when complete.

**Why it's wrong:** Diarization on a 2-hour meeting takes 60–120s on CPU. A blocking IPC call for this duration freezes the frontend's invoke queue and makes the app unresponsive. This is exactly the same problem as the post-recording freeze being fixed in Feature 1.

**Do this instead:** `Channel<DiarizationEvent>` for streaming progress (0–100%), return `Ok(())` from the command promptly, background task emits `DiarizationEvent::Complete { meeting_id }` when done.

### Anti-Pattern 4: Tight Coupling Between Speaker Timeline and Transcript Scroll

**What people try:** Passing `TranscriptSegment[]` and a ref to the transcript DOM into `SpeakerTimeline`, letting the timeline manage scroll.

**Why it's wrong:** The timeline becomes responsible for the transcript DOM, creating a bidirectional coupling that makes both components harder to test and reason about.

**Do this instead:** Lift `highlightedMs` state to `MeetingCompleteView`. Timeline writes it; transcript reads it. Clean boundary.

---

## Scaling Considerations (Local Desktop App)

"Scaling" here means handling large meetings on constrained hardware, not multi-user load.

| Concern | With v1.2 Features |
|---------|-------------------|
| 2-hour meeting diarization | ~2–4 min on modern CPU. sherpa-onnx/pyannote processes at ~8x real-time on CPU (MEDIUM confidence). Acceptable as a one-time post-processing step. |
| Memory during diarization | Full OGG decode to f32 samples: 2h × 16kHz × 4 bytes ≈ 460 MB peak. Acceptable for a desktop app targeting modern hardware. |
| SVG timeline with 500+ speaker segments | Use `useMemo` to batch-compute SVG paths. No virtualization needed — speaker count is bounded (typically 2–8) and segments per speaker fit within a single `<svg>`. |
| Template prompt length | Built-in templates add ~500 chars overhead to existing prompt. No impact on the 96,000 char single-pass threshold. |
| Speaker labels in FTS | Speaker names live in `speaker_labels` table, not `meetings_fts`. FTS searches raw transcript text. No FTS changes required. |
| Long-meeting summary with speaker map | Speaker-prefixed transcript text is ~5–10% longer than unspeaker transcript. Slightly increases token estimate but stays within chunking thresholds for all realistic meeting lengths. |

---

## Sources

- Codebase ground truth: `src-tauri/src/session.rs` (stop() lines 256–290), `transcription/mod.rs`, `transcription/worker.rs`, `llm/mod.rs`, `commands.rs`, `db.rs`, migrations 001–003, `src/types/index.ts`, `src/hooks/useSummary.ts`, `src/views/MeetingCompleteView.tsx` — HIGH confidence
- sherpa-rs v0.6.8 diarize module: [https://docs.rs/sherpa-rs/latest/sherpa_rs/](https://docs.rs/sherpa-rs/latest/sherpa_rs/) — diarize module confirmed present — HIGH confidence
- sherpa-rs diarize.rs example: [https://github.com/thewh1teagle/sherpa-rs/blob/main/examples/diarize.rs](https://github.com/thewh1teagle/sherpa-rs/blob/main/examples/diarize.rs) — DiarizeConfig, Segment fields confirmed — HIGH confidence
- Pyannote segmentation model (k2-fsa distribution): [https://huggingface.co/k2-fsa/sherpa-models](https://huggingface.co/k2-fsa/sherpa-models) — ~5.4 MB compressed — HIGH confidence
- sherpa-onnx speaker diarization docs: [https://k2-fsa.github.io/sherpa/onnx/speaker-diarization/rust.html](https://k2-fsa.github.io/sherpa/onnx/speaker-diarization/rust.html) — MEDIUM confidence (points to example)
- Tauri async runtime: [https://docs.rs/tauri/latest/tauri/async_runtime/index.html](https://docs.rs/tauri/latest/tauri/async_runtime/index.html) — HIGH confidence (official)
- pyannote-rs CPU performance ("1 hour in under a minute"): [https://github.com/thewh1teagle/pyannote-rs](https://github.com/thewh1teagle/pyannote-rs) — MEDIUM confidence (README claim, benchmark not independently verified)

---

*Architecture research for: openNotes v1.2 — Speaker Intelligence & Templates*
*Researched: 2026-03-04*
