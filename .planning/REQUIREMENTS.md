# Requirements

## Foundation

- [x] FOUN-01
- [x] FOUN-02
- [x] FOUN-03
- [x] FOUN-04
- [x] FOUN-05
- [x] FOUN-06
- [x] FOUN-07

## Audio Capture

- [x] CAPT-01: Microphone + system audio capture via cpal (loopback on macOS 14.6+)
- [x] CAPT-02: Opus/OGG encoding at 48kHz stereo ~1MB/min
- [x] CAPT-03: Floating always-on-top recording widget (draggable, position memory, timer, waveform, controls)
- [x] CAPT-04: One-click recording from tray icon or global shortcut
- [x] CAPT-05: JIT macOS permissions with pre-explanation and denied guidance
- [x] CAPT-06: Recording lifecycle (pause/resume/stop, 2-hour soft warning)

## Transcription Engine

- [x] TRANS-01: Silero VAD segments speech from mic audio (16 kHz, 512-sample windows)
- [x] TRANS-02: Parakeet TDT transcribes completed speech segments offline on dedicated worker thread
- [x] TRANS-03: Transcript segments stream to React frontend via Tauri Channel (text, elapsed_ms, index)
- [x] TRANS-04: First-run model download (~640 MB Parakeet + ~2 MB Silero VAD) with streaming progress
- [x] TRANS-05: Atomic model file placement with .tmp cleanup on failure, retry support
- [x] TRANS-06: 48 kHz to 16 kHz resampling via rubato (1536 in -> 512 out, 3:1 ratio)
- [x] TRANS-07: Blocking setup wizard — user cannot record until model is downloaded
- [x] TRANS-08: Live transcript in main window with fade-in animation, elapsed timestamps, locked-to-bottom
- [x] TRANS-09: Pause flushes VAD buffer — no speech lost at pause boundary
- [x] TRANS-10: Widget shows "Transcribing" label when ASR is active
- [x] TRANS-11: Meeting complete view with full scrollable transcript, auto-generated title, copy/export
- [x] TRANS-12: Recording blocked without ready model — clear message directs to setup
