# Stack Research — v1.2 Speaker Intelligence & Templates

**Domain:** openNotes v1.2 — Speaker diarization, summary templates, interactive timeline, post-recording performance
**Researched:** 2026-03-04
**Confidence:** HIGH for diarization core and post-recording fix; MEDIUM for frontend timeline; HIGH for template architecture

> This file covers ONLY new stack needs for v1.2. The validated baseline stack (Tauri 2, React, SQLite/sqlx,
> cpal, sherpa-rs =0.6.8, Ollama/reqwest, rubato, libopusenc) is already in production. Do not re-research it.

---

## Area 1: Post-Recording UI Freeze

### Root Cause (Codebase Verified)

The `stop_session` Tauri command calls `spawn_blocking`, which runs `SessionCoordinator::stop`. Inside `stop`, the following sequential blocking operations happen on the calling thread:

1. `stop_transcription_worker` — joins two worker threads with up to **3 + 3 = 6 seconds** of timeout waits (via `join_with_timeout`)
2. `audio::stop_recording` — joins mixer thread and encoder thread (`.join()` — unbounded wait)
3. `std::thread::sleep(300ms)` — hardcoded delay before FTS upsert
4. Three `tauri::async_runtime::block_on()` calls for SQL updates while inside a blocking thread

The frontend awaits the `stop_session` command. Because all of this runs inside one `spawn_blocking` future that the frontend is awaiting, the frontend does not return to "stopped" state until all joins complete. On a slow machine or after a long recording (large Opus flush), the encoder join alone can take 1-2 seconds beyond the 6-second transcription timeout.

### Fix: Return Early, Process in Background

**Pattern:** Decouple UI acknowledgment from cleanup completion.

```
stop_session command
  ├── Phase 1 (fast, blocking OK): signal shutdown, drop audio streams, emit Stopping state → return meeting_id to frontend immediately
  └── Phase 2 (async background): tauri::async_runtime::spawn — join workers, flush FTS, finalize DB row, emit session-complete
```

The frontend receives the command result (meeting_id) as soon as audio streams are signaled to stop. The `session-complete` Tauri event arrives ~1-3 seconds later when cleanup finishes, and the frontend transitions to MeetingCompleteView at that point.

**Key change:** Convert `SessionCoordinator::stop` to split its work into two stages. The Tauri command returns as soon as the fast path completes. A detached `tauri::async_runtime::spawn` handles the rest.

**No new dependencies required.** `tauri::async_runtime::spawn` is already used in the codebase (see `transcription/mod.rs`).

### What NOT to do

- Do NOT add a progress spinner and extend the wait — the underlying cause is that the frontend is blocked, not that progress isn't shown
- Do NOT remove the thread join timeouts — they exist to prevent zombie threads on transcription model hangs
- Do NOT convert `SessionCoordinator::stop` to `async fn` — it holds a Mutex guard and async Mutex is not needed here; use `spawn` from outside the lock

---

## Area 2: Speaker Diarization (Local, Post-Processing)

### Approach: sherpa-rs Diarize Module (Already in Pinned Crate)

The project already pins `sherpa-rs = "=0.6.8"`. That exact version ships a `diarize` module (`crates/sherpa-rs/src/diarize.rs`) with a complete, production-ready Rust API. **No version bump required.**

**Key finding:** There is no `diarize` Cargo feature flag. The module is compiled unconditionally in all builds. To use it, simply call `sherpa_rs::diarize::Diarize::new(...)`.

#### Diarize API Surface (sherpa-rs 0.6.8)

```rust
// DiarizeConfig — all fields optional with sensible defaults
pub struct DiarizeConfig {
    pub num_clusters: Option<i32>,   // default: 4; set to None for auto-detect
    pub threshold: Option<f32>,      // default: 0.5; spectral clustering threshold
    pub min_duration_on: Option<f32>, // default: 0.0; min speech segment length (s)
    pub min_duration_off: Option<f32>,// default: 0.0; min silence gap length (s)
    pub provider: Option<String>,     // default: "cpu"
    pub debug: bool,
}

// Segment output
pub struct Segment {
    pub start: f32,   // seconds
    pub end: f32,     // seconds
    pub speaker: i32, // 0-indexed speaker ID
}

// Pipeline
let mut diarizer = sherpa_rs::diarize::Diarize::new(
    segmentation_model_path,   // str path to pyannote-segmentation-3-0 ONNX
    embedding_model_path,      // str path to NeMo TiTaNet small ONNX
    config,
)?;
let segments: Vec<Segment> = diarizer.compute(pcm_samples_f32, progress_cb)?;
```

Source: direct inspection of `crates/sherpa-rs/src/diarize.rs` in the pinned repository.

#### Required Models

Two ONNX models must be downloaded. Both are available as official sherpa-onnx releases:

| Model | Role | Size (full) | Size (int8) | Source | Notes |
|-------|------|-------------|-------------|--------|-------|
| `sherpa-onnx-pyannote-segmentation-3-0` | Speaker segmentation (when/who changes) | 5.7 MB | 1.5 MB | GitHub release: `speaker-segmentation-models` | Converted from pyannote/segmentation-3.0 |
| `nemo_en_titanet_small.onnx` | Speaker embedding (who is speaking) | ~8 MB | — | GitHub release: `speaker-recognition-models` | NeMo TiTaNet Small, English-focused |

**Use the int8 quantized segmentation model in production.** At 1.5 MB vs 5.7 MB it is significantly smaller with negligible quality difference for standard meeting audio. The embedding model does not have a standard int8 variant — use the full model.

**Total model download footprint:** ~10 MB. This is acceptable for an on-demand download (same pattern as existing Parakeet/Silero models).

**Why these two models specifically:**
- pyannote segmentation-3-0 is the current SOTA open-source segmentation model and is what the sherpa-onnx documentation uses as its primary example
- NeMo TiTaNet Small is English-optimized and used in the official sherpa-onnx diarization example (`diarize.rs`). The "Small" variant (~8 MB) is preferred over TiTaNet Large (~90 MB) for desktop use

#### Audio Decoding: OGG/Opus → f32 PCM

The project records to `.ogg` using `libopusenc`. For diarization post-processing, the audio file must be decoded back to `Vec<f32>` PCM samples at 16 kHz mono.

**Problem:** No existing dependency handles full OGG/Opus decode to f32.
- `libopusenc` (already in project) is an encoder only
- `symphonia` 0.5.5 does not yet implement Opus codec decoding (confirmed via GitHub issue #8)
- `ogg-opus` 0.1.2 (2021): only i16 output, only compatible with its own encoded files, abandoned

**Recommended approach: `ogg` (container) + `opus` (libopus decode)**

| Crate | Version | Role | Why |
|-------|---------|------|-----|
| `ogg` | 0.9.1 | Parse OGG container, extract Opus packets | Pure Rust, RustAudio organization, correct packet boundaries |
| `opus` | 0.3.0 | Decode Opus packets to f32 PCM | Safe libopus bindings (SpaceManiac), `opus_decode_float` available |

`rubato` (already in project at 0.15) handles the resample from Opus native rate (48 kHz) to 16 kHz needed by the sherpa-rs models.

```rust
// Pattern: OGG/Opus → f32 @48kHz → resample to 16kHz → diarize
use ogg::reading::PacketReader;
use opus::{Decoder, Channels};

fn decode_ogg_opus_to_f32(path: &Path) -> Result<Vec<f32>, String> {
    let file = std::fs::File::open(path)?;
    let mut reader = PacketReader::new(file);
    let mut decoder = Decoder::new(48_000, Channels::Mono)?;
    let mut samples: Vec<f32> = Vec::new();

    while let Some(packet) = reader.read_packet()? {
        // skip OGG header packets
        if packet.data.starts_with(b"OpusHead") || packet.data.starts_with(b"OpusTags") {
            continue;
        }
        let mut buf = vec![0.0f32; 5760]; // max 120ms at 48kHz
        let n = decoder.decode_float(&packet.data, &mut buf, false)?;
        samples.extend_from_slice(&buf[..n]);
    }
    // then resample 48kHz → 16kHz using existing rubato::FftFixedIn<f32>
    Ok(samples)
}
```

**Confidence:** MEDIUM — the `ogg` + `opus` combination is the standard low-level approach used by audio tools in Rust, but there are no published integration examples combining both specifically for diarization. The pattern is sound.

#### Diarization Execution: Blocking Thread

Speaker diarization on a 1-hour meeting runs for 10-20 seconds on CPU (RTF ~0.12-0.20 per the sherpa-onnx docs). This **must** run in `tauri::async_runtime::spawn_blocking` or a dedicated `std::thread`, not an async task.

Pattern:
```rust
#[tauri::command]
pub async fn run_diarization(
    app: AppHandle,
    meeting_id: i64,
    // ...
) -> Result<(), String> {
    let app_clone = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        // 1. decode audio
        // 2. resample to 16kHz
        // 3. run diarizer.compute()
        // 4. map segment start/end times to transcript rows
        // 5. write speaker_id to DB
        let _ = app_clone.emit("diarization-complete", meeting_id);
    })
    .await
    .map_err(|e| e.to_string())?
}
```

The command returns immediately after spawning; the frontend listens for the `diarization-complete` event.

#### Speaker-to-Transcript Alignment

Diarizer outputs `Vec<Segment { start_f32, end_f32, speaker_i32 }]`. Transcript segments already have `start_time_ms` and `end_time_ms` in SQLite. Alignment is a simple interval overlap: for each transcript segment, find the diarization segment with the largest overlap by time. No additional library needed — this is pure Rust logic on sorted arrays.

#### Database Changes: New Migration

```sql
-- Migration 004_v1_2_speaker.sql
ALTER TABLE transcripts ADD COLUMN speaker_id INTEGER DEFAULT NULL;

CREATE TABLE IF NOT EXISTS speakers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    speaker_index INTEGER NOT NULL,  -- 0-indexed from diarizer
    display_name TEXT NOT NULL DEFAULT '',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(meeting_id, speaker_index)
);

CREATE INDEX IF NOT EXISTS idx_transcripts_speaker ON transcripts(speaker_id);
CREATE INDEX IF NOT EXISTS idx_speakers_meeting ON speakers(meeting_id);
```

No new Rust dependencies for the DB work — `sqlx 0.8` already in project.

### What NOT to Use for Diarization

| Avoid | Why |
|-------|-----|
| pyannote-audio (Python) | Requires Python runtime, not embeddable in Tauri |
| whisperX | Python-only, cloud inference option, not local-first |
| Upgrading sherpa-rs beyond 0.6.8 | Diarize module already present in pinned version; upgrade risk outweighs benefit until v1.3 evaluation |
| chobits-sherpa-rs fork | Non-canonical, unstable; the pinned version has what we need |
| Real-time diarization (during recording) | Requires speaker tracking state machine; complexity > value for v1.2; post-processing is simpler and sufficient |

---

## Area 3: Summary Templates

### Architecture: Template as Prompt Wrapper (No New Dependencies)

Summary templates are **system prompt variants** passed to the existing Ollama integration. The current `build_summary_prompt` hardcodes one format. Templates parameterize the format instruction while keeping the transcript injection and title extraction logic unchanged.

**Template storage: SQLite (in-app) + JSON (built-in seeds)**

Built-in templates are seeded from a JSON file embedded at compile time (`include_str!`). User templates are stored in a new `summary_templates` table. This keeps templates queryable and editable without requiring a separate file system.

#### Database Schema Addition

```sql
-- Part of Migration 004_v1_2_speaker.sql
CREATE TABLE IF NOT EXISTS summary_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    prompt_template TEXT NOT NULL,  -- the format instruction block; {transcript} placeholder
    is_builtin INTEGER NOT NULL DEFAULT 0,
    is_default INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Ensure only one default at a time (enforced in application logic, not constraint)
CREATE INDEX IF NOT EXISTS idx_templates_default ON summary_templates(is_default);
```

The `prompt_template` field contains the format instruction with a `{transcript}` placeholder. The Rust side substitutes the transcript text and adds the anti-hallucination preamble before sending to Ollama.

#### Built-In Templates (Research-Informed)

Five templates cover the main meeting types identified in competitive analysis:

| Template | Target Use Case | Key Sections |
|----------|-----------------|--------------|
| **Standard Meeting Notes** (default) | General / all-hands | Overview, Key Points, Decisions, Action Items |
| **Action Items Focus** | Sprint planning, standups | Action Items (primary), Brief context, Blockers |
| **Executive Summary** | Leadership briefings | 1-para summary, Decisions, Financial/risk implications |
| **Technical Discussion** | Engineering, architecture | Problem statement, Options discussed, Decision + rationale, TODOs |
| **Interview / 1:1** | HR, performance, feedback | Discussion topics, Feedback given, Follow-up commitments |

These five are seeded in migration 004 as builtin rows (not deletable by user). The user can create additional custom templates.

#### Prompt Variable Substitution

The template system uses `{transcript}` as the only substitution variable. Speaker-attributed transcripts use `{transcript}` too — the Rust formatting layer handles adding speaker labels before substitution. This avoids any templating library dependency.

```rust
fn build_summary_prompt_from_template(
    template: &str,
    transcript: &str,
    language: &str,
) -> String {
    let lang_instruction = build_language_instruction(language);
    let with_transcript = template.replace("{transcript}", transcript);
    format!(
        "You are a meeting notes assistant. Summarize ONLY what is explicitly said in the transcript below. \
         Do NOT invent, assume, or hallucinate any information not present in the transcript.\n\n\
         {with_transcript}\n\n\
         Also generate a concise meeting title (max 10 words) on the very first line as: TITLE: [title]\n\n\
         {lang_instruction}Transcript:\n{transcript}",
    )
}
```

**No new Rust crates.** String substitution via `str::replace` is sufficient for `{transcript}`. Complex handlebars-style templates are not needed — the use case is formatting instructions, not conditional logic.

#### Template Editor UI

The template editor is a React `<textarea>` with syntax highlighting via CSS (no library). The editor needs:
- Multi-line editable textarea (native HTML)
- Character count / validation feedback
- Preview button that shows the template with example transcript inserted
- Save/cancel controls

**No new npm packages for template editing.** The existing Tailwind CSS + React patterns handle this UI. A simple `<textarea>` with `onChange` is appropriate — users writing prompt templates are comfortable with plain text.

| Avoid | Why |
|-------|-----|
| Monaco Editor | 2+ MB bundle, overkill for plain text prompt editing |
| CodeMirror | ~250 KB, still overkill for single-field prompt editing |
| @uiw/react-md-editor | Adds markdown preview features not needed for prompt templates |

#### Re-generate with Different Template

The existing `generate_summary` Tauri command already accepts a `meeting_id`. Add a `template_id: Option<i64>` parameter. If provided, load that template from SQLite and use `build_summary_prompt_from_template` instead of `build_summary_prompt`. The streaming channel and storage path remain unchanged.

**No new dependencies.** This is a parameter addition to existing command surface.

---

## Area 4: Interactive Speaker Timeline Visualization

### Approach: Custom SVG Component (No Library)

The speaker timeline is a horizontal bar chart showing colored speaker segments over meeting duration. It needs:
- Colored horizontal bars per speaker, proportional to duration
- Click/hover to jump to transcript position
- Responsive width (fits sidebar/panel)
- 2-6 speakers max (realistic meeting size)

**Decision: Custom React SVG component, no library.**

Rationale:
- react-svg-timeline, Planby, react-calendar-timeline — all designed for scheduling/Gantt use cases with pan/zoom; the feature needs a simple, fixed-width bar read-only visualization
- The data is a flat `Vec<{ start, end, speakerId }>` — trivially mapped to SVG `<rect>` elements
- Adding any timeline library would be 50-200 KB for what is achievable in ~80 lines of React + SVG
- The project already reduced bundle from 1.2 MB to 351 KB in v1.1; protecting that is a priority

**Component design:**

```tsx
// SpeakerTimeline.tsx — ~80 lines, no dependencies beyond React + Tailwind
interface SpeakerSegment {
  startMs: number;
  endMs: number;
  speakerIndex: number;
}

interface Props {
  segments: SpeakerSegment[];
  durationMs: number;
  onSeek?: (positionMs: number) => void;
}

export function SpeakerTimeline({ segments, durationMs, onSeek }: Props) {
  const SPEAKER_COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6', '#06b6d4'];

  return (
    <svg width="100%" height="32" aria-label="Speaker timeline">
      {segments.map((seg, i) => {
        const x = `${(seg.startMs / durationMs) * 100}%`;
        const w = `${((seg.endMs - seg.startMs) / durationMs) * 100}%`;
        return (
          <rect
            key={i}
            x={x} y={0} width={w} height={32}
            fill={SPEAKER_COLORS[seg.speakerIndex % SPEAKER_COLORS.length]}
            opacity={0.85}
            onClick={() => onSeek?.(seg.startMs)}
            style={{ cursor: onSeek ? 'pointer' : 'default' }}
          />
        );
      })}
    </svg>
  );
}
```

**Bundle impact:** 0 KB (pure React + SVG, no import). Correct choice.

**Confidence:** HIGH — SVG-based timeline visualization is a well-established pattern; the data model is simple; no library limitations to work around.

### What NOT to Use for Timeline

| Avoid | Why |
|-------|-----|
| react-calendar-timeline | ~150 KB, designed for drag-drop scheduling, overkill for read-only visualization |
| Planby | Commercial/freemium, optimized for EPG guides |
| react-chrono | Vertical/horizontal event list, not audio segment bar |
| d3 | 90 KB, powerful but far exceeds requirements for 6-color SVG bar |

---

## Net-New Dependencies for v1.2

### Rust (src-tauri/Cargo.toml)

| Crate | Version | Purpose | Confidence |
|-------|---------|---------|-----------|
| `ogg` | `0.9` | Parse OGG container to extract Opus packets for diarization input | MEDIUM |
| `opus` | `0.3` | Decode Opus packets to f32 PCM via libopus (SpaceManiac/opus-rs) | MEDIUM |

```toml
# Add to [dependencies] in src-tauri/Cargo.toml
ogg = "0.9"
opus = "0.3"
```

`sherpa-rs` (already pinned =0.6.8) — no version change. The diarize module is included unconditionally.
`rubato` (already 0.15) — reuse for 48kHz → 16kHz resample of decoded Opus audio.
`sqlx` (already 0.8) — new migration for speakers and templates tables.

### npm (package.json)

**Zero new npm packages.** All frontend additions use:
- Custom SVG component (no library)
- Native `<textarea>` for template editor (no library)
- Existing Tailwind CSS for styling
- Existing `lucide-react` for icons (already in project, tree-shakeable)
- Existing React 19 primitives

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `ogg` 0.9 | Rust stable 2021 | Pure Rust, no C FFI, no platform concerns |
| `opus` 0.3 | macOS, Windows 10+, Linux (requires libopus via pkg-config or bundled) | SpaceManiac/opus-rs uses bundled libopus by default on Windows/macOS; Linux links dynamically — same behavior as `libopusenc` already in project |
| sherpa-rs =0.6.8 diarize module | Existing project setup | No feature flag needed; module compiled unconditionally |
| SQLite migration 004 | sqlx 0.8, existing migration runner | Follows existing pattern in `db.rs::run_migrations` |

**Critical compatibility note on `opus` crate on Linux:** The `opus` crate (SpaceManiac) dynamically links libopus on non-musl Linux, same as `libopusenc`. Since the project already ships with a working `libopusenc` build on all platforms, the `opus` decoder crate will compile under the same conditions. The AppImage build likely already bundles or assumes libopus — verify during CI.

---

## Integration Points

### 1. Rust: New Tauri Commands (summary)

```
run_diarization(app, meeting_id, data_dir) -> Result<(), String>
  → spawns blocking thread
  → decodes OGG/Opus → f32 PCM
  → resamples 48kHz → 16kHz
  → runs sherpa_rs::diarize::Diarize::compute()
  → aligns segments to transcript rows
  → writes speaker_id to transcripts table
  → writes display_name = "Speaker N" to speakers table
  → emits "diarization-complete" event

get_diarization_status(meeting_id) -> Result<DiarizationStatus>
  → checks if any transcript rows have speaker_id set

rename_speaker(meeting_id, speaker_index, display_name) -> Result<()>
  → updates speakers.display_name

list_summary_templates() -> Result<Vec<SummaryTemplate>>
create_summary_template(name, description, prompt_template) -> Result<SummaryTemplate>
update_summary_template(id, name, description, prompt_template) -> Result<()>
delete_summary_template(id) -> Result<()>  // builtin = false only
set_default_template(id) -> Result<()>
```

### 2. Rust: Modified Command

```
generate_summary(meeting_id, ..., template_id: Option<i64>) -> Result<(), String>
  → if template_id is Some, load from summary_templates table
  → build prompt using build_summary_prompt_from_template()
  → rest of pipeline unchanged
```

### 3. Frontend: New Components

```
src/components/SpeakerTimeline.tsx    — SVG bar, no imports beyond React
src/components/SpeakerLabel.tsx       — colored chip with editable name
src/views/TemplateEditorView.tsx      — textarea + preview + save/cancel
```

### 4. Database: Migration 004

File: `src-tauri/migrations/004_v1_2_speaker.sql`
- `ALTER TABLE transcripts ADD COLUMN speaker_id INTEGER`
- `CREATE TABLE speakers (...)`
- `CREATE TABLE summary_templates (...)`
- Seed 5 built-in templates as INSERT statements

---

## What NOT to Add

| Do NOT Add | Why |
|------------|-----|
| Any Python runtime dependency | Breaks local-only principle; diarization must be native Rust via sherpa-rs |
| sherpa-rs version bump to >0.6.8 | Diarize module is already in =0.6.8; upgrade risk outweighs benefit; defer to v1.3 evaluation |
| Real-time diarization during recording | Requires speaker state tracking, higher latency, not warranted for v1.2 scope |
| Timeline charting library (d3, Planby, etc.) | Custom 80-line SVG component is sufficient; no bundle cost |
| Monaco/CodeMirror for template editor | Plain textarea is appropriate for prompt template editing |
| Handlebars/Mustache npm package | `str::replace("{transcript}", ...)` is sufficient; templates use one variable |
| `ollama-rs` crate | Already excluded in v1.1; reqwest direct integration is simpler |
| Symphonia for audio decoding | Opus codec not yet implemented in Symphonia 0.5.5 |
| ogg-opus crate | Only i16 output, only compatible with its own encoded files, abandoned 2021 |
| pyannote-audio Python package | No Python runtime in Tauri desktop app |

---

## Sources

- sherpa-rs `crates/sherpa-rs/src/diarize.rs` — direct source inspection, diarize API confirmed (HIGH confidence)
- sherpa-rs `crates/sherpa-rs/Cargo.toml` — no diarize feature flag, module compiled unconditionally (HIGH confidence)
- sherpa-rs `examples/diarize.rs` — model usage: pyannote segmentation-3-0 + nemo titanet_small (HIGH confidence)
- [sherpa-onnx speaker diarization models docs](https://k2-fsa.github.io/sherpa/onnx/speaker-diarization/models.html) — pyannote 5.7 MB / 1.5 MB int8, reverb 9.1 MB / 2.3 MB (HIGH confidence)
- [sherpa-onnx speaker diarization index](https://k2-fsa.github.io/sherpa/onnx/speaker-diarization/index.html) — pipeline architecture (HIGH confidence)
- [Tauri CPU-bound blocking discussion #10329](https://github.com/tauri-apps/tauri/discussions/10329) — spawn_blocking is correct for CPU-bound work (HIGH confidence)
- [ogg crate — docs.rs](https://docs.rs/ogg) — pure Rust OGG container parsing (MEDIUM confidence)
- [opus crate — docs.rs](https://docs.rs/opus) — libopus safe Rust bindings (MEDIUM confidence)
- [Symphonia issue #8](https://github.com/pdeljanov/Symphonia/issues/8) — Opus codec not yet implemented (HIGH confidence)
- [ogg-opus lib.rs](https://lib.rs/crates/ogg-opus) — only i16, only self-compatible, abandoned 2021 (HIGH confidence)
- openNotes v1.2 codebase — `src-tauri/src/session.rs`, `src-tauri/src/transcription/mod.rs`, `src-tauri/src/audio/mod.rs`, `src-tauri/src/llm/mod.rs`, `src-tauri/migrations/` (direct inspection, HIGH confidence)

---
*Stack research for: openNotes v1.2 — Speaker Intelligence & Templates*
*Researched: 2026-03-04*
