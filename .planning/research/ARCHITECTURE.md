# Architecture Research

**Domain:** Local-first AI meeting transcription and summarization desktop app
**Researched:** 2026-02-26
**Confidence:** MEDIUM-HIGH

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         React/TS Frontend (WebView)                     │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────┐  ┌──────────────┐   │
│  │ Recording UI │  │ Transcript   │  │ Notes     │  │ Settings     │   │
│  │ Controls     │  │ Live View    │  │ Library   │  │ Panel        │   │
│  └──────┬───────┘  └──────┬───────┘  └─────┬─────┘  └──────┬───────┘  │
│         │                 │                 │               │          │
├─────────┴─────────────────┴─────────────────┴───────────────┴──────────┤
│                    Tauri IPC Bridge (Commands + Channels + Events)      │
├────────────────────────────────────────────────────────────────────────┤
│                         Rust Backend (src-tauri)                       │
│                                                                        │
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐  │
│  │  Audio Pipeline   │    │  ASR Engine       │    │  LLM Service     │  │
│  │                   │    │                   │    │                  │  │
│  │  cpal + platform  │───>│  sherpa-onnx      │    │  Ollama HTTP /   │  │
│  │  APIs (SCK,       │    │  (Parakeet TDT)   │    │  Cloud API       │  │
│  │  WASAPI, Pulse)   │    │                   │    │                  │  │
│  └──────────────────┘    └────────┬──────────┘    └────────┬─────────┘  │
│         │                         │                        │           │
│         │    ringbuf (SPSC)       │   Tauri Channel        │           │
│         └─────────────────────────┘                        │           │
│                                                            │           │
│  ┌──────────────────┐    ┌──────────────────┐              │           │
│  │  Storage Layer    │    │  Model Manager    │              │           │
│  │  rusqlite + FTS5  │    │  Download, HW     │<─────────────┘           │
│  │  ~/.opennotes/    │    │  detect, select   │                         │
│  └──────────────────┘    └──────────────────┘                         │
│                                                                        │
│  ┌──────────────────┐    ┌──────────────────┐                         │
│  │  System Tray      │    │  App Lifecycle    │                         │
│  │  + Global Hotkey  │    │  + Config Mgmt    │                         │
│  └──────────────────┘    └──────────────────┘                         │
└────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| **Audio Pipeline** | Capture mic + system audio, resample to 16kHz 16-bit mono PCM, mix streams, feed to ASR | cpal for mic; ScreenCaptureKit (macOS), WASAPI loopback (Windows), PulseAudio/PipeWire monitor (Linux) for system audio. Lock-free ring buffer (ringbuf crate) bridges audio callback thread to ASR consumer thread. |
| **ASR Engine** | Consume audio chunks, run inference, produce transcript segments with timestamps | sherpa-onnx via sherpa-rs Rust bindings. Offline recognition with Parakeet TDT model. VAD (Voice Activity Detection) to segment silence. Consumes from ring buffer, produces TranscriptSegment structs. |
| **LLM Service** | Take completed transcript, generate structured meeting notes | HTTP client (reqwest) to Ollama localhost API or cloud LLM API. Streaming response via SSE/chunked transfer. Configurable provider with trait abstraction. |
| **Storage Layer** | Persist meetings, transcripts, notes; full-text search | rusqlite with FTS5 virtual table. Single SQLite file at ~/.opennotes/data.db. Migrations via embedded SQL. |
| **Model Manager** | First-run model download, hardware detection, model selection | Download Parakeet ONNX models (~640MB) with progress reporting. Detect CPU/GPU capabilities. Recommend INT8 (CPU), Core ML (Apple Silicon), CUDA (NVIDIA). |
| **Frontend (React/TS)** | Recording controls, live transcript display, notes library, settings | React 18+ with Zustand or similar lightweight state. Tauri IPC for all backend communication. Tailwind CSS 4.x for styling. |
| **System Tray** | Background presence, recording indicator, global start/stop shortcut | Tauri's tray plugin. Global shortcut plugin for hotkey. |
| **App Lifecycle** | Initialization, teardown, configuration management | Tauri setup hook. Config in tauri.conf.json + user preferences in SQLite. |

## Recommended Project Structure

```
opennotes/
├── src/                        # React/TS frontend
│   ├── components/             # UI components
│   │   ├── recording/          # Recording controls, live indicator
│   │   ├── transcript/         # Live transcript view, segment display
│   │   ├── notes/              # Notes library, detail view, export
│   │   └── settings/           # Audio device, model, LLM config
│   ├── hooks/                  # Custom React hooks
│   │   ├── useRecording.ts     # Recording state management
│   │   ├── useTranscript.ts    # Live transcript stream consumer
│   │   └── useMeetings.ts      # Meeting CRUD operations
│   ├── stores/                 # Zustand stores
│   │   ├── recording.ts        # Recording state (idle/recording/processing)
│   │   └── app.ts              # Global app state (settings, theme)
│   ├── lib/                    # Shared utilities
│   │   ├── tauri.ts            # Typed IPC wrappers around invoke/listen
│   │   └── types.ts            # Shared TypeScript types
│   ├── App.tsx                 # Root component, routing
│   └── main.tsx                # Entry point
├── src-tauri/                  # Rust backend
│   ├── src/
│   │   ├── main.rs             # Desktop entry point
│   │   ├── lib.rs              # Shared entry (mobile compat)
│   │   ├── commands/           # Tauri command handlers
│   │   │   ├── mod.rs
│   │   │   ├── recording.rs    # start_recording, stop_recording
│   │   │   ├── meetings.rs     # list_meetings, get_meeting, delete, export
│   │   │   ├── settings.rs     # get/set audio devices, LLM config
│   │   │   └── models.rs       # download_model, get_model_status
│   │   ├── audio/              # Audio capture pipeline
│   │   │   ├── mod.rs
│   │   │   ├── capture.rs      # cpal mic capture
│   │   │   ├── system.rs       # Platform-specific system audio
│   │   │   ├── mixer.rs        # Mix mic + system into single stream
│   │   │   └── resample.rs     # Sample rate conversion to 16kHz
│   │   ├── asr/                # Speech recognition
│   │   │   ├── mod.rs
│   │   │   ├── engine.rs       # sherpa-onnx recognizer wrapper
│   │   │   ├── vad.rs          # Voice activity detection
│   │   │   └── segment.rs      # TranscriptSegment type + buffering
│   │   ├── llm/                # LLM summarization
│   │   │   ├── mod.rs
│   │   │   ├── provider.rs     # LlmProvider trait
│   │   │   ├── ollama.rs       # Ollama HTTP client
│   │   │   ├── cloud.rs        # Cloud API client (OpenAI-compat)
│   │   │   └── prompts.rs      # Meeting note generation prompts
│   │   ├── storage/            # Database layer
│   │   │   ├── mod.rs
│   │   │   ├── db.rs           # Connection pool, migrations
│   │   │   ├── meetings.rs     # Meeting CRUD queries
│   │   │   └── search.rs       # FTS5 search queries
│   │   ├── models/             # Model management
│   │   │   ├── mod.rs
│   │   │   ├── download.rs     # HTTP download with progress
│   │   │   └── hardware.rs     # CPU/GPU detection
│   │   ├── pipeline.rs         # Orchestrates audio -> ASR -> storage
│   │   └── state.rs            # AppState struct, shared state types
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── capabilities/           # Tauri permission capabilities
│   └── build.rs
├── package.json
├── vite.config.ts
└── tailwind.config.ts
```

### Structure Rationale

- **`src-tauri/src/commands/`:** Thin command handlers that validate input, call into service modules, and return results. Keeps the Tauri-specific `#[tauri::command]` surface minimal and testable.
- **`src-tauri/src/audio/`:** Platform-specific audio code isolated here. The `mixer` combines streams, `system.rs` uses `#[cfg(target_os)]` for platform branching.
- **`src-tauri/src/asr/`:** Wraps sherpa-onnx behind a clean Rust interface. The engine module owns the recognizer lifecycle; segment module handles buffering partial results into complete segments.
- **`src-tauri/src/llm/`:** Trait-based abstraction (`LlmProvider`) allows swapping Ollama for cloud APIs without changing the pipeline.
- **`src-tauri/src/pipeline.rs`:** The central orchestrator that wires audio capture to ASR to storage. Owns the recording session lifecycle. This is the most important file in the backend.
- **`src/stores/`:** Zustand for frontend state because it is minimal, has no boilerplate, and works well with Tauri's event-driven updates.

## Architectural Patterns

### Pattern 1: Pipeline Thread Architecture (Producer-Consumer with Ring Buffer)

**What:** Three dedicated threads for the recording pipeline: (1) Audio Capture thread running cpal callbacks, (2) ASR Inference thread consuming audio and producing transcript segments, (3) Main Tauri async runtime for IPC, storage, and LLM. Audio flows from capture to ASR via a lock-free SPSC ring buffer. Transcript segments flow from ASR to the frontend via Tauri Channels.

**When to use:** Always during active recording. This is the core runtime architecture.

**Trade-offs:** Ring buffers are fast and lock-free (no mutex contention on the audio hot path), but require careful sizing. Too small = dropped audio. Too large = wasted memory and latency. The SPSC constraint means exactly one producer and one consumer, which fits the audio-to-ASR flow perfectly.

**Example:**
```rust
use ringbuf::HeapRb;
use std::thread;

// In pipeline.rs - start_recording
pub fn start_recording(app: AppHandle, config: RecordingConfig) -> Result<RecordingHandle> {
    // Ring buffer: ~2 seconds of 16kHz 16-bit mono audio
    // 16000 samples/sec * 2 bytes * 2 sec = 64KB
    let ring = HeapRb::<f32>::new(32000);
    let (producer, consumer) = ring.split();

    // Thread 1: Audio capture (high-priority, callback-driven)
    let capture_handle = thread::spawn(move || {
        audio::capture_loop(producer, &config)
    });

    // Thread 2: ASR inference (CPU/GPU bound)
    let asr_handle = thread::spawn(move || {
        asr::recognition_loop(consumer, transcript_tx)
    });

    // Tauri async task: Forward transcript segments to frontend
    tauri::async_runtime::spawn(async move {
        while let Some(segment) = transcript_rx.recv().await {
            channel.send(TranscriptEvent::NewSegment(segment))?;
            // Also persist to SQLite
            storage::insert_segment(&db, meeting_id, &segment)?;
        }
    });

    Ok(RecordingHandle { capture_handle, asr_handle })
}
```

### Pattern 2: Tauri Channel for Streaming Transcript to Frontend

**What:** Use Tauri's Channel API (not Events) to stream real-time transcript segments from Rust to the React frontend. Channels guarantee message ordering via an index-based system and are designed for high-throughput streaming. The frontend passes a Channel object when invoking the `start_recording` command, and the Rust side sends TranscriptEvent variants through it.

**When to use:** For all high-frequency frontend updates: live transcript segments, model download progress, recording duration ticks.

**Trade-offs:** Channels are faster than Events and preserve ordering, but they are tied to a single command invocation. Use Events for lifecycle notifications (recording-started, recording-stopped) that multiple UI components may need. Use Channels for the streaming data (transcript segments, progress updates).

**Example:**
```rust
#[derive(Clone, serde::Serialize)]
#[serde(tag = "type")]
enum TranscriptEvent {
    NewSegment { text: String, start_ms: u64, end_ms: u64 },
    PartialResult { text: String },
    RecordingComplete { meeting_id: String },
}

#[tauri::command]
async fn start_recording(
    app: AppHandle,
    on_transcript: Channel<TranscriptEvent>,
    device_config: DeviceConfig,
) -> Result<String, String> {
    let meeting_id = uuid::Uuid::new_v4().to_string();
    pipeline::start(app, meeting_id.clone(), on_transcript, device_config)
        .map_err(|e| e.to_string())?;
    Ok(meeting_id)
}
```

```typescript
// Frontend: hooks/useTranscript.ts
import { invoke, Channel } from '@tauri-apps/api/core';

export function useTranscript() {
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [partial, setPartial] = useState('');

  const startRecording = async (config: DeviceConfig) => {
    const onTranscript = new Channel<TranscriptEvent>();
    onTranscript.onmessage = (event) => {
      switch (event.type) {
        case 'NewSegment':
          setSegments(prev => [...prev, event]);
          setPartial('');
          break;
        case 'PartialResult':
          setPartial(event.text);
          break;
        case 'RecordingComplete':
          // Navigate to meeting detail
          break;
      }
    };
    const meetingId = await invoke('start_recording', {
      onTranscript,
      deviceConfig: config,
    });
    return meetingId;
  };

  return { segments, partial, startRecording };
}
```

### Pattern 3: Platform-Specific Audio via Conditional Compilation

**What:** Use Rust's `#[cfg(target_os = "...")]` to select the system audio capture implementation at compile time. Each platform gets its own module implementing a common `SystemAudioCapture` trait. cpal handles microphone input cross-platform, but system/desktop audio requires platform-specific APIs.

**When to use:** Always. System audio capture is fundamentally different on each platform.

**Trade-offs:** Conditional compilation means each platform path is only compiled for its target, keeping binary size small. But it means you cannot test macOS code on Linux. CI must build and test on all three platforms.

**Example:**
```rust
// audio/system.rs
pub trait SystemAudioCapture: Send {
    fn start(&mut self, producer: ringbuf::Producer<f32>) -> Result<()>;
    fn stop(&mut self) -> Result<()>;
}

#[cfg(target_os = "macos")]
mod macos {
    use screencapturekit::*;
    pub struct SCKCapture { /* ... */ }
    impl SystemAudioCapture for SCKCapture { /* ... */ }
}

#[cfg(target_os = "windows")]
mod windows {
    // WASAPI loopback: use output device as input device
    // cpal transparently enables loopback mode for WASAPI output devices
    pub struct WasapiLoopback { /* ... */ }
    impl SystemAudioCapture for WasapiLoopback { /* ... */ }
}

#[cfg(target_os = "linux")]
mod linux {
    // PipeWire or PulseAudio monitor source
    pub struct PipeWireCapture { /* ... */ }
    impl SystemAudioCapture for PipeWireCapture { /* ... */ }
}

pub fn create_system_capture() -> Box<dyn SystemAudioCapture> {
    #[cfg(target_os = "macos")]
    { Box::new(macos::SCKCapture::new()) }
    #[cfg(target_os = "windows")]
    { Box::new(windows::WasapiLoopback::new()) }
    #[cfg(target_os = "linux")]
    { Box::new(linux::PipeWireCapture::new()) }
}
```

### Pattern 4: Trait-Based LLM Provider Abstraction

**What:** Define an `LlmProvider` trait with a `summarize` method. Implement it for Ollama (local HTTP) and cloud APIs (OpenAI-compatible). The pipeline calls the trait without knowing which provider is active. Configuration determines which implementation is instantiated.

**When to use:** For the summarization step. Allows users to choose local vs. cloud without code changes.

**Trade-offs:** Adds indirection but keeps the pipeline clean. The trait is simple (one method), so the abstraction cost is minimal.

**Example:**
```rust
// llm/provider.rs
#[async_trait]
pub trait LlmProvider: Send + Sync {
    async fn summarize(
        &self,
        transcript: &str,
        on_chunk: &dyn Fn(String) -> Result<()>,
    ) -> Result<MeetingNotes>;
}

// llm/ollama.rs
pub struct OllamaProvider {
    base_url: String, // default: http://localhost:11434
    model: String,    // default: llama3.2
}

#[async_trait]
impl LlmProvider for OllamaProvider {
    async fn summarize(&self, transcript: &str, on_chunk: &dyn Fn(String) -> Result<()>) -> Result<MeetingNotes> {
        let response = reqwest::Client::new()
            .post(format!("{}/api/generate", self.base_url))
            .json(&OllamaRequest {
                model: &self.model,
                prompt: &format_meeting_prompt(transcript),
                stream: true,
            })
            .send().await?;
        // Stream chunks to on_chunk callback
        // Parse final response into MeetingNotes struct
    }
}
```

### Pattern 5: Tauri Managed State for Shared Application State

**What:** Use Tauri's built-in state management (`app.manage()`) with `Mutex<AppState>` for mutable shared state. Tauri wraps managed state in `Arc` internally, so you do not need to add `Arc` yourself. For state needed in spawned threads, clone the `AppHandle` (which is cheap) and retrieve state via `app_handle.state::<T>()`.

**When to use:** For the database connection, recording state machine, and user configuration.

**Trade-offs:** Standard `Mutex` is fine for most state access (short critical sections). Use `tokio::sync::Mutex` only if you need to hold the lock across `.await` points. Never hold the lock while doing audio processing or network I/O.

**Example:**
```rust
// state.rs
pub struct AppState {
    pub db: rusqlite::Connection,
    pub recording: RecordingState,
    pub config: UserConfig,
}

pub enum RecordingState {
    Idle,
    Recording { meeting_id: String, started_at: Instant },
    Processing { meeting_id: String }, // Summarization in progress
}

// In main.rs setup
app.manage(Mutex::new(AppState {
    db: storage::open_database()?,
    recording: RecordingState::Idle,
    config: storage::load_config(&db)?,
}));
```

## Data Flow

### Recording Flow (Core Pipeline)

```
┌────────────┐     ┌────────────┐
│ Microphone │     │ System     │
│ (cpal)     │     │ Audio      │
│            │     │ (platform) │
└─────┬──────┘     └─────┬──────┘
      │                   │
      │  f32 samples      │  f32 samples
      │  @ device rate    │  @ device rate
      ▼                   ▼
┌─────────────────────────────────┐
│         Audio Mixer             │
│  Resample both to 16kHz mono   │
│  Mix into single f32 stream    │
└──────────────┬──────────────────┘
               │
               │  f32 samples @ 16kHz mono
               ▼
┌──────────────────────────────────┐
│     Ring Buffer (SPSC, ringbuf)  │
│     ~2 seconds, lock-free        │
│     Producer ──── Consumer       │
└──────────────┬───────────────────┘
               │
               ▼
┌──────────────────────────────────┐
│         ASR Engine               │
│  sherpa-onnx (Parakeet TDT)     │
│  Read chunks from ring buffer    │
│  VAD → segment silence           │
│  Produce TranscriptSegments      │
└──────────────┬───────────────────┘
               │
               │  TranscriptSegment { text, start_ms, end_ms }
               │  via tokio::mpsc channel
               ▼
┌──────────────────────────────────┐
│     Pipeline Coordinator         │      ┌──────────────────┐
│     (Tauri async task)           │─────>│  SQLite Storage   │
│                                  │      │  INSERT segment   │
│     Forward to frontend          │      └──────────────────┘
│     via Tauri Channel            │
└──────────────┬───────────────────┘
               │
               │  TranscriptEvent (JSON)
               │  via Tauri Channel (ordered)
               ▼
┌──────────────────────────────────┐
│     React Frontend               │
│     Live transcript display      │
│     Partial + confirmed segments │
└──────────────────────────────────┘
```

### Summarization Flow (Post-Recording)

```
Recording stops
       │
       ▼
┌──────────────────────────┐
│  Load full transcript     │
│  from SQLite              │
└────────────┬─────────────┘
             │
             ▼
┌──────────────────────────┐        ┌──────────────────┐
│  LLM Provider            │───────>│  Ollama (local)  │
│  Format prompt            │   OR   │  Cloud API       │
│  Stream response          │        └──────────────────┘
└────────────┬─────────────┘
             │
             │  Structured JSON (streamed)
             ▼
┌──────────────────────────┐        ┌──────────────────┐
│  Parse MeetingNotes       │───────>│  SQLite Storage   │
│  summary, key_points,     │        │  UPDATE meeting   │
│  decisions, action_items  │        └──────────────────┘
└────────────┬─────────────┘
             │
             │  Tauri Event: "meeting-notes-ready"
             ▼
┌──────────────────────────┐
│  React Frontend           │
│  Navigate to notes view   │
└──────────────────────────┘
```

### Key Data Flows

1. **Audio Capture to ASR:** Lock-free SPSC ring buffer (ringbuf crate). Audio callback pushes f32 samples; ASR thread pulls chunks. No mutex, no allocation on the hot path. Buffer sized for ~2 seconds to absorb jitter.

2. **ASR to Frontend:** tokio::mpsc channel from ASR thread to Tauri async task, then Tauri Channel to frontend. Two-hop but decoupled: ASR thread never blocks on IPC serialization.

3. **Frontend to Backend (Commands):** Standard Tauri `invoke()` for request-response operations (start/stop recording, list meetings, change settings). JSON-RPC serialization. All commands are async on the Rust side.

4. **Backend to Frontend (Events):** Tauri global events for lifecycle changes (recording-started, recording-stopped, meeting-notes-ready) that multiple components may observe. Fire-and-forget, no ordering guarantee.

5. **Backend to Frontend (Channels):** Tauri Channels for high-frequency ordered data (transcript segments, download progress). Tied to a single command invocation, faster than events.

6. **Model Download:** HTTP GET with streaming body (reqwest). Progress reported via Tauri Channel. Model files stored in platform-specific app data directory.

## Scaling Considerations

This is a single-user desktop app, so "scaling" means handling longer meetings and larger data, not more users.

| Scale | Architecture Adjustments |
|-------|--------------------------|
| Short meetings (< 30 min) | Base architecture handles this easily. Full transcript fits in memory. Summarization < 30 seconds. |
| Medium meetings (1-2 hours) | Ring buffer and streaming architecture handles this. SQLite FTS5 search remains fast. Summarization may need chunked prompt strategy (split transcript, summarize chunks, then summarize summaries). |
| Heavy usage (1000+ meetings) | SQLite FTS5 handles this well with proper indexing. Add pagination to meeting list queries. Consider WAL mode for concurrent read/write (WAL is default in modern SQLite). |
| Very long meetings (4+ hours) | Memory budget (< 500MB) may be tight. Consider flushing transcript to disk periodically rather than accumulating in memory. Ring buffer size does not change (still ~2 sec). |

### Scaling Priorities

1. **First bottleneck: LLM summarization latency.** Long transcripts produce long prompts. Ollama with a 7B model on CPU can be slow for 2-hour transcripts. Mitigation: chunked summarization (process in 15-min windows, then combine). This is a prompt engineering problem, not an architecture problem.

2. **Second bottleneck: Model download UX.** First-run downloads a ~640MB model. On slow connections this is painful. Mitigation: clear progress UI, resume support (HTTP Range headers), background download while showing app intro.

## Anti-Patterns

### Anti-Pattern 1: Sharing Audio Data Through Tauri IPC

**What people do:** Capture audio in Rust, serialize it to JSON, send it to the frontend via events, then send it back to Rust for ASR processing. Or worse, trying to do ASR in the WebView via WASM.

**Why it's wrong:** Tauri IPC serializes everything to JSON. Audio data at 16kHz is 32,000 bytes/second of f32 samples. JSON-encoding that would be catastrophically slow and would saturate the IPC bridge. The WebView is not designed for real-time audio processing.

**Do this instead:** Keep the entire audio pipeline (capture, mix, resample, ASR) in Rust threads. Only send the text results (TranscriptSegment) to the frontend. Audio data never crosses the IPC boundary.

### Anti-Pattern 2: Using Mutex on the Audio Callback Thread

**What people do:** Wrap the ring buffer or shared state in a `Mutex` and lock it inside the cpal audio callback.

**Why it's wrong:** cpal audio callbacks run on a high-priority, real-time thread. Mutex contention causes audio glitches (pops, dropouts) because the audio thread blocks waiting for the lock. Even brief contention is audible.

**Do this instead:** Use a lock-free SPSC ring buffer (ringbuf crate). The producer (audio callback) and consumer (ASR thread) never block each other. If the consumer falls behind, samples are dropped rather than causing a deadlock.

### Anti-Pattern 3: Running ASR on the Main Tauri Async Runtime

**What people do:** Call sherpa-onnx inference inside a `#[tauri::command]` handler or a `tauri::async_runtime::spawn` task.

**Why it's wrong:** sherpa-onnx inference is CPU-bound (or GPU-bound). Running it on the Tokio runtime blocks other async tasks, including IPC message handling. The UI becomes unresponsive during inference.

**Do this instead:** Run ASR inference on a dedicated `std::thread::spawn` thread. Use `tokio::mpsc` to send results back to the async runtime for IPC forwarding. The ASR thread is free to block on inference without affecting the rest of the application.

### Anti-Pattern 4: Polling for Transcript Updates

**What people do:** Frontend polls the backend every 100ms asking "any new transcript segments?" via `invoke()`.

**Why it's wrong:** Wasteful (most polls return nothing), adds latency (up to 100ms delay), and creates unnecessary IPC traffic.

**Do this instead:** Push-based via Tauri Channels. The backend sends transcript segments the instant they are available. Zero polling, minimal latency, and the frontend only processes actual data.

### Anti-Pattern 5: Single Monolithic AppState Mutex

**What people do:** Put all application state (db connection, recording state, user config, audio devices) in one `Mutex<AppState>` struct.

**Why it's wrong:** Any command that needs any piece of state locks the entire struct. A long-running database query blocks access to recording state. Reduces concurrency.

**Do this instead:** Split state into independent managed state items. `Mutex<DbPool>`, `Mutex<RecordingState>`, `Mutex<UserConfig>` as separate `app.manage()` calls. Each lock is independent and held briefly.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| **Ollama** | HTTP API (localhost:11434) via reqwest | Check if Ollama is running before summarization. Graceful fallback to raw transcript if unavailable. User must install Ollama separately. |
| **Cloud LLM APIs** | HTTPS REST API via reqwest | OpenAI-compatible API format. User provides API key in settings. Optional, opt-in only. |
| **Model CDN** | HTTPS download via reqwest | HuggingFace or custom CDN for Parakeet ONNX models. Support HTTP Range for resume. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Audio callback thread to ASR thread | Lock-free SPSC ring buffer (ringbuf) | No allocation, no locking. Producer in audio callback, consumer in ASR thread. Must handle overflow (drop oldest samples). |
| ASR thread to Tauri async runtime | tokio::mpsc channel | TranscriptSegment structs. Bounded channel (backpressure if frontend falls behind). |
| Tauri async runtime to Frontend | Tauri Channel (for streaming) + Events (for lifecycle) | JSON serialization. Channel for transcript data; Events for state transitions. |
| Frontend to Tauri backend | Tauri Commands via invoke() | Request-response. JSON-RPC. All commands async. |
| Pipeline coordinator to Storage | Direct function calls (same thread/async context) | rusqlite is not Send, so either use a dedicated DB thread with message passing, or use rusqlite within a single async task. Consider r2d2-sqlite for a connection pool if needed. |
| Pipeline coordinator to LLM | async HTTP calls | Run in Tauri async runtime. Stream response chunks via Channel to frontend for progress indication. |

### Platform-Specific Integration Points

| Platform | System Audio API | Crate/Approach | Permission Required |
|----------|------------------|----------------|---------------------|
| macOS 13+ | ScreenCaptureKit | screencapturekit-rs crate | Screen Recording permission (user prompt) |
| Windows 10+ | WASAPI Loopback | cpal (use output device as input) | None (transparent loopback) |
| Linux | PipeWire / PulseAudio monitor | libpulse-binding or pipewire-rs | None (monitor sources are accessible) |

## Build Order Implications

Components have dependencies that dictate build order:

```
Phase 1: Foundation
  ├── Tauri project scaffold (src-tauri + React frontend)
  ├── SQLite storage layer (rusqlite, migrations, CRUD)
  └── Basic UI shell (navigation, layout, settings page)

Phase 2: Audio Capture
  ├── Microphone capture via cpal (cross-platform)
  ├── System audio capture (start with ONE platform, likely macOS)
  ├── Audio mixer + resampler (16kHz mono)
  └── Ring buffer pipeline (ringbuf)
      Depends on: Phase 1 (Tauri scaffold)

Phase 3: ASR Integration
  ├── sherpa-onnx / sherpa-rs integration
  ├── Model manager (download, hardware detect)
  ├── Recognition pipeline (ring buffer consumer → segments)
  └── Live transcript display (Tauri Channel → React)
      Depends on: Phase 2 (audio pipeline feeding data)

Phase 4: Summarization
  ├── LLM provider trait + Ollama implementation
  ├── Meeting notes generation (prompts, structured output)
  ├── Notes library UI (list, search, detail, export)
  └── Cloud LLM provider (optional)
      Depends on: Phase 3 (transcript data to summarize)

Phase 5: Polish
  ├── System tray + global hotkey
  ├── Second/third platform system audio
  ├── First-run onboarding flow
  └── Error handling, edge cases, performance tuning
      Depends on: Phase 4 (complete feature set)
```

**Critical path:** Audio Capture (Phase 2) is the riskiest phase because platform-specific system audio APIs have the most unknowns (permissions, edge cases, format differences). Start with macOS ScreenCaptureKit because screencapturekit-rs has the most mature Rust bindings. Windows WASAPI loopback via cpal is relatively straightforward. Linux PipeWire is the least mature option.

**Parallelizable work:** Frontend UI (React components) can be built in parallel with backend pipeline work using mock data. Storage layer can be built independently and tested with fake transcript data.

## Sources

- [Tauri 2 IPC Concepts](https://v2.tauri.app/concept/inter-process-communication/) -- HIGH confidence (official docs)
- [Tauri 2 Calling Frontend from Rust (Events + Channels)](https://v2.tauri.app/develop/calling-frontend/) -- HIGH confidence (official docs)
- [Tauri 2 State Management](https://v2.tauri.app/develop/state-management/) -- HIGH confidence (official docs)
- [Tauri 2 Architecture Overview](https://v2.tauri.app/concept/architecture/) -- HIGH confidence (official docs)
- [Tauri 2 Project Structure](https://v2.tauri.app/start/project-structure/) -- HIGH confidence (official docs)
- [Tauri 2 Calling Rust from Frontend](https://v2.tauri.app/develop/calling-rust/) -- HIGH confidence (official docs)
- [sherpa-onnx GitHub (k2-fsa)](https://github.com/k2-fsa/sherpa-onnx) -- HIGH confidence (official repo)
- [sherpa-rs Rust bindings](https://github.com/thewh1teagle/sherpa-rs) -- MEDIUM confidence (community crate, active)
- [screencapturekit-rs crate](https://github.com/svtlabs/screencapturekit-rs) -- MEDIUM confidence (community crate)
- [ringbuf crate (lock-free SPSC)](https://github.com/agerasev/ringbuf) -- HIGH confidence (well-established crate)
- [cpal (cross-platform audio I/O)](https://github.com/RustAudio/cpal) -- HIGH confidence (RustAudio org)
- [Vibe (Tauri transcription app, reference architecture)](https://github.com/thewh1teagle/vibe) -- MEDIUM confidence (reference implementation)
- [Long-running async tasks in Tauri v2](https://sneakycrow.dev/blog/2024-05-12-running-async-tasks-in-tauri-v2) -- MEDIUM confidence (community tutorial)
- [Tauri + Async Rust Process pattern](https://rfdonnelly.github.io/posts/tauri-async-rust-process/) -- MEDIUM confidence (community tutorial)
- [WASAPI Loopback in cpal](https://github.com/RustAudio/cpal/issues/251) -- MEDIUM confidence (issue discussion, confirmed working)
- [ScreenCaptureKit Apple Docs](https://developer.apple.com/documentation/screencapturekit/) -- HIGH confidence (official docs)
- [PipeWire audio capture with Rust](https://acalustra.com/playing-with-pipewire-audio-streams-and-rust.html) -- LOW confidence (single blog post)
- [Building Local LM Desktop Apps with Tauri](https://medium.com/@dillon.desilva/building-local-lm-desktop-applications-with-tauri-f54c628b13d9) -- LOW confidence (single blog post)

---
*Architecture research for: openNotes -- local-first AI meeting transcription desktop app*
*Researched: 2026-02-26*
