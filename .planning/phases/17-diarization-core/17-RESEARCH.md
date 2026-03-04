# Phase 17: Diarization Core - Research

**Researched:** 2026-03-04
**Domain:** Speaker diarization — Rust backend (sherpa-rs diarize module), OGG/Opus decode, DB schema, Tauri commands, frontend transcript chat layout, speaker renaming popover, talk-time stats panel
**Confidence:** HIGH overall — all core APIs verified via prior codebase research (STACK.md + PITFALLS.md) and sherpa-rs Context7 docs; OGG/Opus decode is MEDIUM (no published integration example combining ogg + opus crates for diarization specifically)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Trigger and progress flow**
- Settings toggle for auto-diarize (default: off). When off, user triggers manually; when on, diarization runs automatically after transcription completes.
- Show diarization results even if only 1 speaker detected, with option to retry.
- No pre-analysis warning — just run and show whatever is found.

**Speaker labels in transcript**
- Sidebar column layout (chat-style) — speaker name in a left column alongside segments.
- Group consecutive segments from the same speaker under one label (chat bubble style).
- Each speaker gets a distinct color from a palette.
- No speaker column shown before diarization runs — transcript displays full-width as today; column appears after diarization completes and layout shifts to chat-style.

**Speaker renaming UX**
- Click speaker label opens a popover with: rename text field, speaker color swatch, talk-time percentage, segment count.
- Renaming is session-only — no cross-session speaker profiles or recognition.
- Instant propagation: type name, press Enter, all segments update immediately (no confirmation dialog).

**Talk-time statistics**
- Collapsible panel above the transcript showing all speakers.
- Expanded by default after diarization completes.
- Each speaker shown as a card: name, color, percentage, progress bar, and actual duration (e.g., "12m 34s").

### Claude's Discretion

- Diarize button placement in the meeting detail UI
- Progress indicator style while diarization runs
- Exact speaker color palette
- Error state handling and retry UI

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope. (Phase 18 covers: interactive speaker timeline, timeline click-to-seek, speaker-attributed summaries.)
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DIAR-01 | App downloads speaker diarization models on first use via existing model wizard pattern | Model download flow: reuse `download.rs` `DownloadEvent` channel pattern; add `check_diarization_model_ready()` and `download_diarization_model()` Tauri commands. Models: pyannote segmentation (6.64 MB tar.bz2) + nemo_en_titanet_small (~8 MB). |
| DIAR-02 | After recording stops, user can trigger speaker diarization on the recorded audio | Manual trigger: "Diarize" button in `MeetingCompleteView`. Auto trigger: toggle in settings (`autoDiarize: boolean`). Both invoke the same `start_diarization` Tauri command. |
| DIAR-03 | User sees diarization progress ("Analyzing speakers... 60%") | `start_diarization` returns immediately; a `Channel<DiarizationEvent>` emits `Progress { percent }`, `Complete`, or `Error`. Frontend shows progress indicator during compute. |
| DIAR-04 | Transcript segments display speaker labels (Speaker 1, Speaker 2, etc.) | Speaker labels stored in new `speakers` table + `speaker_id` column on `transcripts`. Frontend reads both in one joined query and renders chat-style layout. |
| DIAR-05 | User can rename speaker labels to real names within a session (click-to-edit) | Popover on speaker label click → text field + Enter key → `rename_speaker` Tauri command → `UPDATE speakers SET display_name = ? WHERE id = ?`. Frontend derives new labels from speakers state. |
| DIAR-06 | Renamed speaker labels propagate to all segments with that speaker in the session | The `display_name` is owned by the `speakers` table; transcript view reads `display_name` per speaker_id, so renaming one row propagates instantly across all segments sharing that id. No per-row UPDATE needed. |
| DIAR-09 | User can see per-speaker talk-time statistics (percentage of total) | Computed from `speaker_turns` table: `SUM(end_ms - start_ms) GROUP BY speaker_id`. No separate storage needed — computed on read. |
| DIAR-10 | Diarization runs on a dedicated thread without blocking Ollama or UI | Use `std::thread::spawn` (not `tokio::task::spawn_blocking`) so the diarization thread is isolated from Tauri's Tokio blocking pool used by the Ollama HTTP client. |
| DIAR-11 | Diarization works cross-platform (macOS, Windows, Linux) | sherpa-rs `=0.6.8` already cross-platform via `download-binaries` feature. Windows VCRUNTIME DLL bundling in NSIS installer must be verified on a clean VM before release. |
</phase_requirements>

---

## Summary

Phase 17 implements post-recording speaker diarization end-to-end: model download, audio decode, inference, DB storage, and a full-rework of the transcript display in `MeetingCompleteView`.

The core technical stack is already present in the pinned `sherpa-rs = "=0.6.8"` crate, which ships a `diarize` module with the complete API (`Diarize::new`, `diarize.compute`, `Segment { start, end, speaker }`). Two new ONNX models must be downloaded: the pyannote-segmentation-3-0 segmentation model (6.64 MB archive) and the NeMo TiTaNet Small embedding model (~8 MB). The OGG/Opus decode step — reading the recorded `.ogg` file back to `Vec<f32>` PCM — requires two new Rust crates (`ogg` 0.9 + `opus` 0.3) because `libopusenc` (already in project) is encoder-only, and Symphonia does not yet implement Opus decoding.

The diarization run itself takes 5–30 seconds on CPU for a typical meeting. It **must** run on a `std::thread::spawn` thread (not the Tokio blocking pool) so Ollama summary streaming is not starved. The frontend receives progress via a `Channel<DiarizationEvent>`. The transcript view shifts from full-width text-only layout to a two-column chat-style layout (speaker column + text column) after diarization completes, grouped by consecutive same-speaker runs. Speaker renaming updates a single `speakers` table row; all segments with that `speaker_id` reflect the new name without per-segment `UPDATE`.

**Primary recommendation:** Implement in two Tauri commands (`check_diarization_model_ready` / `download_diarization_model` + `start_diarization` / `rename_speaker`) with a dedicated `diarization/` Rust module mirroring the `transcription/` module structure, a DB migration adding `speaker_turns` and `speakers` tables plus a nullable `speaker_id` on `transcripts`, and a frontend transcript layout switch gated on the presence of diarization data.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `sherpa-rs` | `=0.6.8` (already pinned) | `diarize::Diarize` — pyannote segmentation + speaker embedding clustering | Already in project; `diarize` module compiled unconditionally; no version bump needed |
| `ogg` | `0.9` | Parse OGG container, extract Opus packets from `.ogg` files | Pure Rust; RustAudio org; correct packet boundary handling |
| `opus` | `0.3` | Decode Opus packets to `f32` PCM via libopus (`decode_float`) | Safe libopus bindings (SpaceManiac/opus-rs); `opus_decode_float` produces f32 natively |
| `rubato` | `0.15` (already in project) | Resample decoded audio from 48 kHz to 16 kHz for diarization models | Already used for transcription resampling; reuse same `FftFixedIn<f32>` pattern |
| `sqlx` | `0.8` (already in project) | New tables + nullable column migration | Already used for all DB work |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `tauri::ipc::Channel` | Tauri 2 (already in project) | Stream `DiarizationEvent` (progress/complete/error) to frontend | Same pattern as `DownloadEvent` and `TranscriptEvent` in existing code |
| `std::thread::spawn` | stdlib | Run diarization on a dedicated OS thread isolated from Tokio pool | Required for CPU-bound ONNX inference — do NOT use `spawn_blocking` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `ogg` + `opus` | `symphonia` | Symphonia 0.5.5 does not implement Opus codec (confirmed — issue #8 open); ruled out |
| `ogg` + `opus` | `ogg-opus` 0.1.2 | Only i16 output, only compatible with its own encoded files, abandoned 2021; ruled out |
| `std::thread::spawn` | `tokio::task::spawn_blocking` | `spawn_blocking` shares Tauri's Tokio blocking thread pool with Ollama HTTP streams; diarization (10–30 s) starves them; use `std::thread::spawn` instead |
| `nemo_en_titanet_small` | `3dspeaker_speech_eres2net` | 3dspeaker is optimized for Mandarin; titanet_small is English-optimized and is the embedding model used in the official sherpa-rs `examples/diarize.rs` example |
| `nemo_en_titanet_small` | `nemo_en_titanet_large` | Large is ~90 MB vs ~8 MB; accuracy improvement is marginal for 2–8 speaker meetings on a desktop; use Small |

**Installation:**
```toml
# Add to [dependencies] in src-tauri/Cargo.toml
ogg = "0.9"
opus = "0.3"
```

```bash
# No npm packages needed — all frontend changes use React + Tailwind (already present)
```

---

## Architecture Patterns

### Recommended Project Structure

```
src-tauri/src/
├── diarization/              # New module (mirrors transcription/ pattern)
│   ├── mod.rs                # DiarizationState, start/stop/check commands, DiarizationEvent
│   ├── model.rs              # check_diarization_model_ready(), model path helpers
│   └── worker.rs             # run_worker(): decode OGG → resample → Diarize::compute()
└── commands.rs               # Add: start_diarization, rename_speaker, check_diarization_model_ready, download_diarization_model

src-tauri/migrations/
└── 006_phase17_diarization.sql   # speaker_turns, speakers tables + transcripts.speaker_id column

src/
├── views/
│   └── MeetingCompleteView.tsx   # Modified: transcript tab switches layout; new stats panel
├── components/
│   ├── SpeakerTranscript.tsx     # New: chat-style two-column transcript layout
│   ├── SpeakerStatsPanel.tsx     # New: collapsible talk-time statistics cards
│   └── SpeakerPopover.tsx        # New: rename + color swatch + stats popover
├── hooks/
│   └── useDiarization.ts         # New: start_diarization command, progress state, rename
└── types/
    └── index.ts                  # Add: DiarizationEvent, SpeakerRow, SpeakerTurn types
```

### Pattern 1: Diarization Worker Thread

**What:** Run `diarizer.compute()` on a `std::thread::spawn` thread, send progress events through an `AppHandle` clone, write results to SQLite when done.

**When to use:** Any CPU-bound ONNX inference that must not block Ollama streaming or the UI.

**Example:**
```rust
// Source: sherpa-rs Context7 docs + existing transcription/mod.rs pattern
#[tauri::command]
pub async fn start_diarization(
    app: AppHandle,
    pool: tauri::State<'_, SqlitePool>,
    data_dir: tauri::State<'_, DataDir>,
    meeting_id: i64,
    on_event: Channel<DiarizationEvent>,
) -> Result<(), String> {
    let pool = pool.inner().clone();
    let data_dir = data_dir.inner().0.clone();
    let app_clone = app.clone();

    // std::thread::spawn — NOT spawn_blocking — to isolate from Tokio pool
    std::thread::Builder::new()
        .name(format!("diarization-{meeting_id}"))
        .spawn(move || {
            // 1. Check models ready
            // 2. Load audio path from meetings table
            // 3. decode_ogg_opus_to_f32(&audio_path) -> Vec<f32> at 48 kHz
            // 4. resample_to_16k(samples) using rubato
            // 5. Diarize::new(seg_model, emb_model, config)
            // 6. diarizer.compute(samples_16k, Some(Box::new(progress_cb))) -> Vec<Segment>
            // 7. align_segments_to_transcripts(&segments, &transcript_rows) -> Vec<(row_id, speaker_id)>
            // 8. Write to speaker_turns + speakers + transcripts.speaker_id
            // 9. on_event.send(DiarizationEvent::Complete { meeting_id })
            let _ = app_clone.emit("diarization-complete", meeting_id);
        })
        .map_err(|e| format!("failed to spawn diarization thread: {e}"))?;

    Ok(()) // returns immediately; frontend listens for events via Channel
}
```

### Pattern 2: OGG/Opus Decode to f32 PCM

**What:** Read a `.ogg` file produced by `libopusenc`, decode Opus packets to `f32` samples at 48 kHz.

**When to use:** Any post-processing that requires the full audio waveform from a recorded meeting file.

**Example:**
```rust
// Source: ogg crate (RustAudio/ogg), opus crate (SpaceManiac/opus-rs)
use ogg::reading::PacketReader;
use opus::{Channels, Decoder};

fn decode_ogg_opus_to_f32(path: &std::path::Path) -> Result<Vec<f32>, String> {
    let file = std::fs::File::open(path)
        .map_err(|e| format!("failed to open audio file: {e}"))?;
    let mut reader = PacketReader::new(file);
    let mut decoder = Decoder::new(48_000, Channels::Mono)
        .map_err(|e| format!("failed to create Opus decoder: {e}"))?;
    let mut samples: Vec<f32> = Vec::new();

    while let Some(Ok(packet)) = reader.read_packet().transpose() {
        // Skip OGG Opus header packets (not audio data)
        if packet.data.starts_with(b"OpusHead") || packet.data.starts_with(b"OpusTags") {
            continue;
        }
        let mut buf = vec![0.0f32; 5760]; // max 120 ms at 48 kHz
        match decoder.decode_float(&packet.data, &mut buf, false) {
            Ok(n) => samples.extend_from_slice(&buf[..n]),
            Err(e) => eprintln!("[diarization] Opus decode error (skipping packet): {e}"),
        }
    }

    Ok(samples)
}
```

**Confidence note:** This pattern is sound (ogg + opus is the standard low-level approach for this in Rust), but there is no published integration example combining these two crates specifically for diarization input. A spike at the start of Phase 17-01 is recommended to confirm the packet boundary handling works correctly with `libopusenc`-produced files. See Open Questions.

### Pattern 3: sherpa-rs Diarize API

**What:** Initialize `Diarize` with two model paths, call `compute()` with a progress callback.

**When to use:** Post-processing any recorded meeting audio (`.ogg` decoded to f32 PCM).

**Example:**
```rust
// Source: sherpa-rs Context7 docs + examples/diarize.rs in thewh1teagle/sherpa-rs
use sherpa_rs::diarize::{Diarize, DiarizeConfig};

let config = DiarizeConfig {
    num_clusters: None,      // None = auto-detect speaker count
    threshold: Some(0.5),    // clustering threshold; lower = more distinct speakers
    min_duration_on: Some(0.3),
    min_duration_off: Some(0.5),
    provider: Some("cpu".to_string()),
    debug: false,
};

let mut diarizer = Diarize::new(
    seg_model_path,   // .../models/diarization/pyannote-segmentation-3-0/model.onnx
    emb_model_path,   // .../models/diarization/nemo_en_titanet_small.onnx
    config,
).map_err(|e| format!("failed to initialize diarizer: {e}"))?;

let progress_cb = move |computed: i32, total: i32| -> i32 {
    let percent = (computed * 100 / total.max(1)) as u8;
    let _ = on_event.send(DiarizationEvent::Progress { percent });
    0 // return 0 to continue; return non-0 to cancel
};

let segments = diarizer.compute(samples_16k, Some(Box::new(progress_cb)))
    .map_err(|e| format!("diarization failed: {e}"))?;

// segments: Vec<Segment { start: f32, end: f32, speaker: i32 }>
// start/end are in SECONDS — multiply by 1000 for ms comparison with transcripts
```

### Pattern 4: Segment-to-Transcript Alignment

**What:** Map diarization segments (in seconds) to transcript rows (in milliseconds) using midpoint-overlap matching.

**When to use:** After `diarizer.compute()` returns, before writing `speaker_id` to transcript rows.

**Example:**
```rust
// Source: established pattern (see PITFALLS.md Pitfall 3 — midpoint-overlap matching)
fn align_speakers_to_transcript(
    diar_segments: &[sherpa_rs::diarize::Segment],
    transcript_rows: &[(i64, i64, i64)], // (row_id, start_ms, end_ms)
) -> Vec<(i64, i32)> { // (row_id, speaker_id)
    transcript_rows.iter().map(|&(row_id, start_ms, end_ms)| {
        let best_speaker = diar_segments.iter()
            .max_by_key(|seg| {
                let seg_start_ms = (seg.start * 1000.0) as i64;
                let seg_end_ms = (seg.end * 1000.0) as i64;
                let overlap_start = start_ms.max(seg_start_ms);
                let overlap_end = end_ms.min(seg_end_ms);
                (overlap_end - overlap_start).max(0) // largest overlap wins
            })
            .map(|seg| seg.speaker)
            .unwrap_or(0);
        (row_id, best_speaker)
    }).collect()
}
```

### Pattern 5: Frontend Speaker Color Assignment

**What:** Assign a deterministic, visually distinct color to each speaker index.

**When to use:** Speaker label chips, popover color swatch, talk-time stats cards.

**Example:**
```typescript
// 8-color palette, perceptually distinct, works in both light and dark themes
const SPEAKER_COLORS = [
  '#3b82f6', // blue
  '#ef4444', // red
  '#22c55e', // green
  '#f59e0b', // amber
  '#8b5cf6', // violet
  '#06b6d4', // cyan
  '#f97316', // orange
  '#ec4899', // pink
];

function getSpeakerColor(speakerIndex: number): string {
  return SPEAKER_COLORS[speakerIndex % SPEAKER_COLORS.length];
}
```

### Pattern 6: Chat-Style Transcript Grouping

**What:** Group consecutive transcript segments from the same speaker into a single bubble block.

**When to use:** Rendering the post-diarization transcript view.

**Example:**
```typescript
interface GroupedSpeakerBlock {
  speakerId: number;
  speakerName: string;
  segments: TranscriptSegment[];
}

function groupBySpeaker(
  segments: TranscriptSegment[],  // ordered by segment_index
  speakerMap: Map<number, { name: string; speakerId: number }>,
): GroupedSpeakerBlock[] {
  const blocks: GroupedSpeakerBlock[] = [];

  for (const seg of segments) {
    const speakerInfo = speakerMap.get(seg.speakerId ?? -1);
    const lastBlock = blocks[blocks.length - 1];

    if (lastBlock && lastBlock.speakerId === (seg.speakerId ?? -1)) {
      lastBlock.segments.push(seg);
    } else {
      blocks.push({
        speakerId: seg.speakerId ?? -1,
        speakerName: speakerInfo?.name ?? 'Unknown',
        segments: [seg],
      });
    }
  }

  return blocks;
}
```

### Anti-Patterns to Avoid

- **Running diarization in `spawn_blocking`:** Uses Tauri's Tokio blocking pool; contends with Ollama HTTP streaming. Use `std::thread::spawn` instead.
- **Writing `speaker_label TEXT` directly on `transcripts` rows:** Every rename requires `UPDATE` on many rows; also tightly couples diarization schema to ASR schema. Store speaker names in a `speakers` table instead.
- **Returning diarization results synchronously from a Tauri command:** `diarizer.compute()` takes 5–30 s; the Tauri command must return immediately and use a `Channel` for progress + a `diarization-complete` event for completion.
- **Calling `Diarize::new()` once per meeting without caching:** Model initialization adds 2–5 s overhead per call. Consider whether caching the `Diarize` instance in managed Rust state is worth the complexity for Phase 17 (given diarization runs at most once per meeting in this phase, caching is optional).
- **Assuming transcript segments have symmetric `end_time_ms`:** The existing `transcripts` schema sets `end_time_ms = start_time_ms + 1000` (a placeholder in the forwarder). Use `start_time_ms` as the primary alignment anchor; treat the midpoint as `start_time_ms + 500` for overlap calculation.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Speaker segmentation (who speaks when) | Custom VAD + clustering logic | `sherpa_rs::diarize::Diarize` | pyannote-segmentation-3-0 is SOTA; custom approaches take months and produce worse results |
| Opus audio decode from OGG | Custom bitstream parser | `ogg` 0.9 + `opus` 0.3 | Opus is a complex codec; hand-rolled decode will fail on variable frame sizes and pre-skip |
| 48kHz → 16kHz resampling | Linear interpolation | `rubato` 0.15 (already in project) | Linear interpolation introduces aliasing; rubato uses polyphase filtering |
| Speaker count estimation | Elbow-method clustering | `DiarizeConfig { num_clusters: None }` | pyannote auto-estimation outperforms simple elbow methods on speech data |
| Model download with resume | Custom HTTP byte-range | Reuse `download.rs` pattern from existing codebase | The existing `download_to_file()` with `Range` header already handles resume, tmp files, and cancellation |

**Key insight:** The entire audio analysis pipeline (segmentation + embedding + clustering) is handled by the two ONNX models. The only custom logic needed is: (1) OGG/Opus decode, (2) resample, (3) segment-to-transcript alignment, and (4) speaker name storage. Everything else is model inference.

---

## Common Pitfalls

### Pitfall 1: OGG/Opus Decode Fails on `libopusenc`-Produced Files

**What goes wrong:** The `ogg` crate's `PacketReader` may choke on the specific OGG logical bitstream structure that `libopusenc` produces, particularly on: (a) the ordering of Opus header packets relative to audio packets, (b) granule position interpretation for stereo vs. mono streams, or (c) pre-skip values in the OpusHead header. If the decoder does not correctly handle pre-skip, the first few hundred milliseconds of audio are incorrect samples that produce garbage speaker embeddings.

**Why it happens:** `libopusenc` is the reference encoder and produces spec-compliant OGG/Opus files, but the `ogg` crate's packet boundary behavior has not been tested against `libopusenc`-encoded files in any published integration example. Pre-skip handling requires reading the OpusHead header and discarding the first N samples from the decoded output.

**How to avoid:**
- Implement a spike test as the **first task of Phase 17-01**: encode 30 seconds of test audio with `libopusenc`, decode with `ogg` + `opus`, and verify the sample count and waveform match a reference decode via `ffmpeg`.
- Implement pre-skip: parse the `OpusHead` packet to extract the `pre_skip` field (bytes 10–11, little-endian u16), discard the first `pre_skip` decoded samples before returning the PCM buffer.
- If the spike fails within 2 hours, fall back to an `ffmpeg` subprocess call (`ffmpeg -i input.ogg -f f32le -ar 16000 -ac 1 output.raw`) and read the raw f32 output. This is the escape hatch documented in STATE.md.

**Warning signs:**
- Diarization produces random speaker assignments on the first 1–2 minutes of every recording (pre-skip not handled).
- `PacketReader::read_packet()` returns `Err` on the first data packet (header parsing issue).
- Decoded sample count is significantly lower than expected (packets dropped at boundaries).

### Pitfall 2: Diarization Blocks Ollama Streaming

**What goes wrong:** If `start_diarization` uses `tokio::task::spawn_blocking`, it queues onto Tauri's Tokio blocking thread pool. When auto-diarize fires after transcription completes, it may coincide with auto-summary generation. The Ollama HTTP streaming in `generate_summary` uses the same Tokio runtime. If the blocking pool is saturated by ONNX inference, Ollama token events stop arriving mid-stream.

**Why it happens:** `spawn_blocking` has a configurable pool size, but Tauri's Tokio runtime uses default settings. One long-running blocking task (30-second diarization) consuming a pool thread while another thread streams Ollama responses causes latency spikes in the token channel.

**How to avoid:**
- Use `std::thread::Builder::new().name("diarization-N").spawn(...)` — this creates an OS thread entirely outside the Tokio pool.
- Use `AppHandle::emit` from the spawned thread to send the completion event (this is safe from any thread — confirmed by Tauri docs and existing pattern in the codebase).
- Do NOT pass the `Channel<DiarizationEvent>` reference into the thread — clone `AppHandle` and use `emit` for the completion event. For progress events during `compute()`, capture `on_event` in the progress callback closure (which runs synchronously inside `compute()` on the same thread).

**Warning signs:**
- Ollama summary token stream pauses or produces gaps of 5+ seconds during a simultaneous diarization run.
- CPU usage shows the diarization thread and Ollama tokens competing on the same core.

### Pitfall 3: Timestamp Misalignment Between Diarization and Transcripts

**What goes wrong:** `Segment.start` and `Segment.end` from sherpa-rs are in **floating-point seconds**; `transcripts.start_time_ms` is in **integer milliseconds**. The two pipelines compute timestamps independently. A naive "nearest start time" match will misassign speaker labels for short segments (< 2 s) near speaker turn boundaries.

**Why it happens:** ASR uses Silero VAD with `min_silence_duration: 1.2s`, producing compound segments up to 10 s long. Diarization uses pyannote's frame-level segmentation with a different internal clock. Drift of 500 ms–2 s at turn boundaries is normal.

**How to avoid:**
- Use midpoint-overlap matching (see Pattern 4 above) — not nearest-start matching.
- Multiply diarization seconds by 1000 before comparing with `start_time_ms` (unit conversion).
- For transcript segments where `end_time_ms == start_time_ms + 1000` (the placeholder value set in the forwarder), treat the segment as `[start_ms, start_ms + 1000]` for overlap calculation — do not assume the stored `end_time_ms` is accurate.

**Warning signs:**
- Segments near a speaker change boundary consistently get the wrong label.
- All segments in a 2-person conversation are assigned to "Speaker 1".

### Pitfall 4: Migration Breaks Existing Databases (NOT NULL Column)

**What goes wrong:** `ALTER TABLE transcripts ADD COLUMN speaker_id INTEGER NOT NULL` fails on any database with existing rows. SQLite does not allow `NOT NULL` columns added via `ALTER TABLE` unless a `DEFAULT` value is supplied.

**How to avoid:**
- Declare the column nullable: `ALTER TABLE transcripts ADD COLUMN speaker_id INTEGER DEFAULT NULL`.
- Do NOT use `DROP TABLE` + `CREATE TABLE` for this migration — SQLite requires `PRAGMA foreign_keys = OFF` + full table copy for schema changes beyond `ADD COLUMN`.
- Test the migration against a database seeded with phase 14/15/16 data (i.e., existing rows in all tables) before shipping.

### Pitfall 5: Windows VCRUNTIME DLL Failure

**What goes wrong:** On a clean Windows 10/11 installation without Visual Studio, the ONNX runtime shared library (`onnxruntime.dll`) bundled by `sherpa-rs-sys` depends on `VCRUNTIME140.dll` and `MSVCP140.dll`. If the Visual C++ Redistributable is absent, the diarization Tauri command panics with an opaque "failed to load dynamic library" error at runtime — not at build time.

**How to avoid:**
- Add the VC++ Redistributable to the NSIS installer (`tauri.conf.json` → `bundle.windows.nsis`).
- Test on a clean Windows 10 VM with no developer tools before the Phase 17 release gate.
- If the redistributable cannot be bundled, add a startup check: attempt a minimal `sherpa_rs::diarize::Diarize` initialization; on failure, surface "Speaker analysis requires Visual C++ 2019 Redistributable" with a download link.

**Warning signs:**
- Diarization works on dev machines (which have Visual Studio) but fails on end-user Windows installs.
- Error message on Windows contains "DLL not found" or "failed to load dynamic library".

### Pitfall 6: Auto-Diarize Setting Collides with Auto-Summary

**What goes wrong:** With both `autoSummary: true` and `autoDiarize: true`, the stop sequence triggers both diarization and Ollama summary generation simultaneously. Even with `std::thread::spawn` for diarization, both tasks compete for CPU on single-core or dual-core machines.

**How to avoid:**
- Store `autoDiarize` as a boolean in `settings.json` (via `plugin-store`), default `false`.
- In the frontend (`MeetingCompleteView` or `useSession`), check the setting after the `session-complete` event and trigger diarization only if enabled. Do NOT trigger it synchronously inside the Rust stop path.
- The user can manually trigger diarization at any time, independent of auto-summary.

---

## Code Examples

### DiarizationEvent channel type

```rust
// Source: mirrors DownloadEvent in download.rs — same pattern
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase", rename_all_fields = "camelCase", tag = "event", content = "data")]
pub enum DiarizationEvent {
    Progress { percent: u8 },
    Complete,
    Error { message: String },
}
```

### DB migration — migration 006

```sql
-- src-tauri/migrations/006_phase17_diarization.sql

-- Speaker turn segments (raw diarization output)
CREATE TABLE IF NOT EXISTS speaker_turns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    speaker_index INTEGER NOT NULL,    -- 0-indexed from diarizer output
    start_ms INTEGER NOT NULL,         -- (Segment.start * 1000.0) as i64
    end_ms INTEGER NOT NULL,           -- (Segment.end * 1000.0) as i64
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Speaker display names (one row per speaker per meeting)
CREATE TABLE IF NOT EXISTS speakers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    speaker_index INTEGER NOT NULL,    -- matches speaker_turns.speaker_index
    display_name TEXT NOT NULL DEFAULT '',  -- empty = "Speaker N" in frontend
    color_index INTEGER NOT NULL DEFAULT 0, -- index into SPEAKER_COLORS palette
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(meeting_id, speaker_index)
);

-- Link each transcript segment to its diarized speaker
ALTER TABLE transcripts ADD COLUMN speaker_id INTEGER DEFAULT NULL
    REFERENCES speakers(id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_speaker_turns_meeting ON speaker_turns(meeting_id);
CREATE INDEX IF NOT EXISTS idx_speakers_meeting ON speakers(meeting_id);
CREATE INDEX IF NOT EXISTS idx_transcripts_speaker ON transcripts(speaker_id);

-- diarization_status column on meetings (so frontend knows whether to show results)
ALTER TABLE meetings ADD COLUMN diarization_status TEXT DEFAULT NULL
    CHECK(diarization_status IN ('running', 'complete', 'failed'));
```

### rename_speaker Tauri command

```rust
// Source: pattern from existing update_meeting_title in commands.rs
#[tauri::command]
pub async fn rename_speaker(
    pool: tauri::State<'_, SqlitePool>,
    speaker_id: i64,
    display_name: String,
) -> Result<(), String> {
    let trimmed = display_name.trim().to_string();
    sqlx::query("UPDATE speakers SET display_name = ? WHERE id = ?")
        .bind(&trimmed)
        .bind(speaker_id)
        .execute(pool.inner())
        .await
        .map_err(|e| format!("failed to rename speaker: {e}"))?;
    Ok(())
}
```

### Frontend: useDiarization hook outline

```typescript
// Source: mirrors useSummary.ts pattern
export function useDiarization(meetingId: number | null) {
  const [status, setStatus] = useState<'idle' | 'running' | 'complete' | 'error'>('idle');
  const [percent, setPercent] = useState(0);
  const [speakers, setSpeakers] = useState<SpeakerRow[]>([]);
  const [speakerTurns, setSpeakerTurns] = useState<SpeakerTurnRow[]>([]);

  const startDiarization = useCallback(async () => {
    if (!meetingId) return;
    setStatus('running');
    setPercent(0);
    await invoke<void>('start_diarization', {
      meetingId,
      onEvent: new Channel<DiarizationEvent>((event) => {
        if (event.event === 'progress') setPercent(event.data.percent);
        if (event.event === 'complete') {
          setStatus('complete');
          void loadDiarizationData();
        }
        if (event.event === 'error') setStatus('error');
      }),
    });
  }, [meetingId]);

  const renameSpeaker = useCallback(async (speakerId: number, name: string) => {
    await invoke('rename_speaker', { speakerId, displayName: name });
    setSpeakers((prev) => prev.map((s) => s.id === speakerId ? { ...s, display_name: name } : s));
  }, []);

  return { status, percent, speakers, speakerTurns, startDiarization, renameSpeaker };
}
```

### Frontend: talk-time stats computation

```typescript
// Computed client-side from speakerTurns — no extra DB query needed
function computeTalkTime(
  turns: SpeakerTurnRow[],
  totalDurationMs: number,
): Map<number, { durationMs: number; percent: number }> {
  const map = new Map<number, number>();
  for (const turn of turns) {
    const dur = turn.end_ms - turn.start_ms;
    map.set(turn.speaker_index, (map.get(turn.speaker_index) ?? 0) + dur);
  }
  return new Map(
    Array.from(map.entries()).map(([idx, ms]) => [
      idx,
      { durationMs: ms, percent: Math.round((ms / totalDurationMs) * 100) },
    ]),
  );
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| pyannote-audio Python library | sherpa-rs `diarize` module (ONNX runtime, Rust) | 2024 (sherpa-rs 0.6.x) | Eliminates Python runtime; fully offline; embeds in Tauri app |
| Custom pyannote segmentation + sklearn clustering | pyannote-segmentation-3-0 ONNX + fast clustering | 2024 (pyannote v3) | Single-file model; higher accuracy with less configuration |
| WAV-based audio decode for post-processing | OGG/Opus decode via `ogg` + `opus` crates | Current best practice | Avoids transcoding step; uses the same file the recorder produces |

**Deprecated/outdated:**
- `ogg-opus` crate (0.1.2, 2021): i16 output only, abandoned, incompatible with arbitrary Opus files — do not use.
- Symphonia for Opus decode: Opus codec not implemented in Symphonia 0.5.5 (issue #8 still open as of 2026) — do not use.
- `pyannote-rs` crate on crates.io: separate from sherpa-rs; requires its own ONNX runtime; redundant since sherpa-rs 0.6.8 already includes the diarize module — do not add.

---

## Open Questions

1. **OGG/Opus decode spike: Does `ogg` 0.9 + `opus` 0.3 correctly decode `libopusenc`-produced files?**
   - What we know: Both crates are sound individually. `libopusenc` produces spec-compliant OGG/Opus files. The `opus` decoder implements `decode_float` for direct f32 output.
   - What's unclear: Whether the `ogg` crate's `PacketReader` correctly handles `libopusenc`'s specific OGG page structure and pre-skip header field. No published integration example exists combining these for diarization.
   - Recommendation: Make this spike the very first task of Phase 17-01, before any DB migration or Tauri command work. Timebox to 2 hours. If the decode is incorrect, fall back to `std::process::Command::new("ffmpeg")` with `-f f32le -ar 16000 -ac 1` output — this adds an `ffmpeg` dependency but is confirmed to work on all platforms.

2. **Which nemo_en_titanet_small model URL to use?**
   - What we know: STATE.md documents this as an open research flag. The sherpa-rs `examples/diarize.rs` uses `3dspeaker_speech_eres2net_base_sv_zh-cn_3dspeaker_16k.onnx` (optimized for Mandarin). For English meeting audio, `nemo_en_titanet_small.onnx` is preferred. Both are available on the `speaker-recongition-models` [sic] GitHub release.
   - What's unclear: The exact filename and download URL for `nemo_en_titanet_small.onnx` on the GitHub release page (the release page failed to load during research).
   - Recommendation: At the start of Phase 17-01, manually inspect `https://github.com/k2-fsa/sherpa-onnx/releases/tag/speaker-recongition-models` to confirm the exact filename and download URL. Both `nemo_en_titanet_small.onnx` and `nemo_en_titanet_small.int8.onnx` may be available — prefer the int8 quantized variant if available to reduce download size.

3. **Auto-diarize vs. manual trigger: where does the trigger live?**
   - What we know: CONTEXT.md locks the setting as a toggle with default off; manual trigger is the button in `MeetingCompleteView`.
   - What's unclear: Whether auto-trigger should fire in the Rust session coordinator (after the `session-complete` post-processing) or in the frontend (after `session-complete` event, conditioned on the `autoDiarize` setting).
   - Recommendation: Trigger from the frontend (read `autoDiarize` from settings, call `start_diarization` invoke after receiving `session-complete`). This keeps the Rust stop path thin and allows the frontend to gate on settings without adding a settings read to the Rust post-processing pipeline.

---

## Validation Architecture

> `workflow.nyquist_validation` is not present in `.planning/config.json`; this section is omitted per the research agent spec (skip if not enabled).

---

## Sources

### Primary (HIGH confidence)

- `/thewh1teagle/sherpa-rs` Context7 docs — `diarize` module API (`Diarize::new`, `DiarizeConfig`, `Segment { start, end, speaker }`), progress callback signature
- `.planning/research/STACK.md` (2026-03-04) — verified prior research: sherpa-rs 0.6.8 diarize API, model sizes, OGG decode approach, dedicated thread pattern
- `.planning/research/PITFALLS.md` (2026-03-04) — verified prior research: Tokio pool contention, timestamp alignment, NOT NULL migration, Windows DLL
- `src-tauri/src/transcription/mod.rs` — thread spawn pattern (`std::thread::Builder::new().name(...).spawn`), `TranscriptionState` struct as model for `DiarizationState`
- `src-tauri/src/download.rs` — `DownloadEvent` channel pattern to replicate for `DiarizationEvent`
- `src-tauri/src/audio/encoder.rs` — confirmed: recordings saved as OGG/Opus via `libopusenc` at 48 kHz
- `src-tauri/migrations/001_initial.sql` through `005_phase15_whisper.sql` — migration numbering: next is `006_phase17_diarization.sql`
- `src-tauri/Cargo.toml` — confirmed: `sherpa-rs = "=0.6.8"`, `rubato = "0.15"`, `libopusenc = "0.2"` present; `ogg` and `opus` absent
- GitHub releases: `sherpa-onnx/releases/expanded_assets/speaker-segmentation-models` — `sherpa-onnx-pyannote-segmentation-3-0.tar.bz2` = 6.64 MB

### Secondary (MEDIUM confidence)

- WebSearch: `ogg` 0.9 (RustAudio org) + `opus` 0.3 (SpaceManiac/opus-rs) as the standard low-level OGG/Opus decode pair in Rust — confirmed by multiple sources but no integration example with diarization specifically
- WebSearch: `nemo_en_titanet_small` vs `3dspeaker_speech_eres2net` — confirmed titanet_small is English-optimized; exact file URL on GitHub release not confirmed (page load failed)
- k2-fsa.github.io/sherpa/onnx/speaker-diarization/rust.html — Rust API example for diarization

### Tertiary (LOW confidence)

- Symphonia Opus support: search results indicate Opus SILK decoder was in development as of Oct 2024 but not in stable 0.5.x releases — LOW confidence on current state; do not rely on it.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — sherpa-rs diarize API verified via Context7 + prior STACK.md research; ogg/opus is MEDIUM (no integration test with libopusenc-produced files)
- Architecture: HIGH — mirrors existing transcription/ module structure which is proven; DB migration pattern is established
- Pitfalls: HIGH — all critical pitfalls verified against codebase (Tokio pool, migration constraints, timestamp units) and prior PITFALLS.md research

**Research date:** 2026-03-04
**Valid until:** 2026-04-03 (30 days — stable domain; sherpa-rs 0.6.8 is pinned, no version drift risk)
