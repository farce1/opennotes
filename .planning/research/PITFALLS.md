# Pitfalls Research

**Domain:** Local-first AI meeting transcription and summarization desktop app
**Researched:** 2026-02-26
**Confidence:** HIGH (multiple sources verified across official docs, GitHub issues, and community reports)

## Critical Pitfalls

### Pitfall 1: Parakeet TDT Is an Offline Model -- Not a True Streaming Model

**What goes wrong:**
Developers assume that because Parakeet TDT delivers excellent WER scores and sherpa-onnx supports "streaming" ASR, they can wire up Parakeet TDT for real-time streaming transcription with word-by-word output. In reality, Parakeet TDT (both v2 and v3) is architecturally an **offline transducer model** -- it is not designed for chunked streaming input. The sherpa-onnx GitHub issue #2918 explicitly confirms this: "designed as an offline transducer model and isn't architected for true streaming scenarios." Pseudo-streaming (re-sending the entire growing buffer each decode cycle) degrades in performance as the buffer grows, making it unusable for meetings longer than a few minutes.

**Why it happens:**
The PROJECT.md references "real-time transcription via local NVIDIA Parakeet model (sherpa-onnx)" which conflates "low-latency offline inference on audio segments" with "true streaming ASR." Marketing materials describe Parakeet as "49x faster than real-time" which sounds streaming-capable but refers to batch throughput on pre-recorded audio.

**How to avoid:**
Use a **VAD + offline segment** pattern instead of true streaming:
1. Run Silero VAD continuously on the audio stream to detect speech segments (sherpa-onnx bundles Silero VAD natively)
2. When VAD detects end-of-speech (silence threshold), extract the completed speech segment
3. Send the completed segment to Parakeet TDT for offline transcription (fast -- sub-second for typical utterances)
4. Display the result as it completes -- giving a near-real-time feel with 1-3 second latency after speech ends

This is the pattern used by SuperWhisper and other local transcription apps. It produces accurate transcription with acceptable latency. For interim "typing indicator" UX while someone is still speaking, show an animated indicator based on VAD state rather than partial ASR results.

**Warning signs:**
- Latency increases proportionally with recording duration
- CPU/GPU usage climbs steadily during a meeting instead of remaining stable
- Memory usage grows unboundedly as the re-sent buffer accumulates
- Transcription of the same segment changes between decode cycles

**Phase to address:**
Phase 1 (Audio Capture + ASR Foundation). This is an architecture decision that must be correct from the start. Implementing true streaming and then discovering it doesn't work forces a rewrite of the entire ASR pipeline.

**Confidence:** HIGH -- verified via sherpa-onnx GitHub issue #2918, HuggingFace discussion on parakeet-tdt-0.6b-v2 streaming, and NVIDIA's own recommendation to use FastConformer Hybrid for true streaming.

---

### Pitfall 2: WASAPI Loopback Produces No Data When System Audio Is Silent

**What goes wrong:**
On Windows, WASAPI loopback capture only delivers audio data when something is actively playing to the audio endpoint. When the remote meeting participant is silent (or between speakers), WASAPI stops pushing data entirely -- no silence frames, no callbacks, nothing. This breaks audio mixing with the microphone stream because the two streams lose time synchronization. The mixed stream develops gaps, timing drift, and eventually the transcript desynchronizes from actual speech.

**Why it happens:**
WASAPI is designed to capture what the audio hardware is rendering. When nothing is rendering, there is nothing to capture. This is documented behavior, not a bug. Developers coming from macOS (where ScreenCaptureKit delivers continuous frames) or Linux (where PulseAudio monitor sources deliver silence) don't expect this Windows-specific behavior.

**How to avoid:**
- Generate synthetic silence frames when WASAPI reports no data for more than one audio buffer period (typically 10ms)
- Maintain a monotonic timestamp counter independent of WASAPI callbacks to detect gaps
- Use `IAudioCaptureClient::GetNextPacketSize` in a polling loop with a timeout, and inject zero-filled buffers when the timeout fires without data
- Alternatively, play an inaudible tone (e.g., 1Hz sine wave at minimum volume) to keep the render endpoint active -- but this is hacky and can interfere with other audio
- Consider using WASAPI "event mode" carefully: event mode does NOT work for loopback capture despite the initialize call succeeding (documented Microsoft limitation)

**Warning signs:**
- Transcript timestamps drift from wall clock time during meetings with long pauses
- Audio mixing tests work fine with music playback but fail with actual meeting audio (which has silences)
- Windows-only bugs in transcription timing that don't reproduce on macOS or Linux

**Phase to address:**
Phase 1 (Audio Capture). Must be handled in the initial platform-specific audio capture implementation. The silence-filling logic needs to be baked into the audio capture abstraction layer.

**Confidence:** HIGH -- verified via Microsoft Learn WASAPI documentation, multiple community reports, and Audacity forum discussions on WASAPI loopback behavior.

---

### Pitfall 3: macOS ScreenCaptureKit Requires Entitlements, Code Signing, and Notarization for Distribution

**What goes wrong:**
System audio capture works perfectly in development (unsigned local builds) but breaks completely when the app is distributed to users. On macOS 13+, ScreenCaptureKit requires the app to be properly code-signed and notarized with specific entitlements. Without correct entitlements, the app either crashes on launch, silently fails to capture audio, or gets rejected by Gatekeeper. Tauri's WebView also needs JIT and unsigned executable memory entitlements that conflict with some hardened runtime requirements.

**Why it happens:**
Development builds bypass many macOS security checks. The jump from "works on my machine" to "works when distributed" is massive on macOS because of TCC (Transparency, Consent, and Control), Gatekeeper, and notarization requirements. Tauri's sidecar binaries add complexity: notarization errors occur when externalBin sidecars are included (Tauri issue #11992).

**How to avoid:**
- Set up code signing and notarization CI/CD pipeline in Phase 1, not at the end
- Required entitlements for the Tauri app on macOS:
  - `com.apple.security.cs.allow-jit` (WebView)
  - `com.apple.security.cs.allow-unsigned-executable-memory` (WebView)
  - `com.apple.security.cs.allow-dyld-environment-variables` (WebView)
  - `com.apple.security.device.audio-input` (Microphone)
  - `com.apple.security.screen-capture` (ScreenCaptureKit) -- **if using App Sandbox**
- Add `NSScreenCaptureUsageDescription` and `NSMicrophoneUsageDescription` to Info.plist
- Test the signed and notarized build on a clean macOS machine (not the development machine) before every release
- If using sherpa-onnx as a sidecar rather than linked library, be aware that sidecar notarization is a known pain point -- prefer static linking into the Tauri binary

**Warning signs:**
- App works unsigned in development but crashes after code signing
- "App is damaged" errors on user machines
- ScreenCaptureKit returns empty audio buffers silently (no error thrown) when permissions are missing
- Users on macOS 13+ report "no permission prompt appeared"

**Phase to address:**
Phase 1 (Project Setup / Audio Capture). Code signing must be configured before the first user-facing build. Do not defer this to a "distribution phase."

**Confidence:** HIGH -- verified via Tauri official documentation, Apple Developer Forums, and multiple Tauri GitHub issues (#11992, #4415).

---

### Pitfall 4: Ollama Default Context Window (2048-4096 Tokens) Silently Truncates Meeting Transcripts

**What goes wrong:**
A 30-minute meeting transcript is approximately 4,000-8,000 words (~5,000-10,000 tokens). Ollama's default context window is 2048-4096 tokens depending on the model. When you send a full meeting transcript to Ollama for summarization, it silently drops the beginning of the transcript to fit the context window. The resulting summary only covers the last few minutes of the meeting, missing the introduction, agenda, and early discussion points. Users get confidently-wrong summaries without any error or warning.

**Why it happens:**
Ollama does not return an error when context is exceeded -- it silently truncates by discarding the oldest tokens. Developers test with short transcripts during development and never encounter the issue. The first real 30-minute meeting produces a garbage summary and the developer has no idea why.

**How to avoid:**
- Always set `num_ctx` explicitly when calling Ollama API. For meeting summarization, use at minimum 16384 tokens, ideally 32768
- Implement a **token counting pre-check** before sending to Ollama: estimate token count (~0.75 tokens per word for English), and if it exceeds 80% of the configured context window, use chunked summarization
- For transcripts exceeding context: use **hierarchical summarization** -- split transcript into chunks at natural boundaries (VAD-detected pauses, topic shifts), summarize each chunk, then summarize the summaries
- Show the user a warning if the transcript is very long and summarization quality may be affected
- Include a fallback: if Ollama is not available or context is too small, present the raw transcript with timestamp markers instead of a bad summary

**Warning signs:**
- Summaries consistently miss information from the first half of meetings
- Summary quality degrades noticeably for longer meetings
- No errors in logs but summaries feel "incomplete"
- Users report "the summary only covered the last topic we discussed"

**Phase to address:**
Phase 2 (LLM Summarization). Must be addressed when implementing the summarization pipeline. Token counting and chunking strategy should be designed before writing the Ollama integration.

**Confidence:** HIGH -- verified via Ollama official documentation on context-length, multiple GitHub issues (#2204, #6026), and community reports.

---

### Pitfall 5: CPAL Audio Callback Thread Blocking Causes Silent Audio Drops

**What goes wrong:**
The cpal audio callback runs on a high-priority real-time audio thread. If ANY blocking operation occurs inside the callback -- mutex lock, memory allocation, channel send that can block, file I/O, logging -- the audio driver drops frames. On macOS, CoreAudio will terminate the audio unit entirely if the callback takes too long. On Windows, WASAPI will report discontinuities. The result is gaps in the audio that produce garbled or missing transcription with no obvious error.

**Why it happens:**
Rust's type system encourages patterns like `Mutex<T>` and `mpsc::Sender` that are perfectly safe but involve blocking operations. Developers naturally reach for these in audio callbacks. The `ringbuf` crate's producer, when used inside a cpal callback on Windows, has been reported to stop the callback from firing entirely (cpal issue #970). Even `try_send` on some channel types can allocate internally.

**How to avoid:**
- Use ONLY lock-free, allocation-free data structures in the audio callback
- Use `ringbuf` crate (or `rtrb`) for lock-free SPSC ring buffers -- but write to the producer ONLY (never read in the callback)
- The callback should do ONE thing: copy samples into the ring buffer. Nothing else.
- Perform ALL processing (resampling, mixing, format conversion) on a separate processing thread that reads from the ring buffer
- Never log inside the audio callback, not even debug logs
- Never allocate (`Vec::push`, `String::new`, `Box::new`) inside the callback
- Test with `#[cfg(debug_assertions)]` guards that panic if the callback takes longer than the buffer duration

**Warning signs:**
- Intermittent "pops" or "clicks" in captured audio
- Transcription has random missing words or garbled segments
- Audio works fine for short tests but develops issues after 5-10 minutes
- Problems appear only under CPU load (when the system is busy with ASR inference)

**Phase to address:**
Phase 1 (Audio Capture). The audio callback architecture must be lock-free from day one. Retrofitting lock-free patterns into a blocking callback is a rewrite.

**Confidence:** HIGH -- verified via cpal documentation, cpal GitHub issues (#970, #787, #907), and Rust audio programming community patterns.

---

### Pitfall 6: Cross-Platform Audio Format Mismatch Silently Degrades Transcription

**What goes wrong:**
Each platform delivers audio in different formats: macOS ScreenCaptureKit provides 48kHz float32 stereo, WASAPI provides the endpoint's native format (commonly 48kHz/44.1kHz, 16/24/32-bit, stereo), PulseAudio/PipeWire varies by configuration. Parakeet requires 16kHz 16-bit mono PCM. If resampling is done incorrectly (wrong algorithm, no anti-aliasing filter, integer truncation) or format conversion loses precision, the WER jumps dramatically. A naive `sample as i16` cast from float32 will clip and distort. Downsampling from 48kHz to 16kHz without a proper low-pass anti-aliasing filter introduces aliasing artifacts that confuse the ASR model.

**Why it happens:**
Developers hard-code one platform's format during initial development and assume others match. Or they implement resampling that works but produces poor quality (nearest-neighbor interpolation instead of sinc interpolation). The app "works" -- it produces transcription -- but the WER is significantly worse than Parakeet's published benchmarks, and nobody realizes the audio pipeline is the bottleneck.

**How to avoid:**
- Build an explicit audio format normalization layer that sits between platform capture and ASR input
- Use the `rubato` crate for high-quality async resampling (sinc interpolation with configurable quality)
- Convert float32 to i16 correctly: `(sample * 32767.0).clamp(-32768.0, 32767.0) as i16`
- Mix stereo to mono correctly: `(left + right) / 2.0` (not just taking one channel)
- Always request the capture format from the platform API rather than assuming -- use `cpal::Device::default_input_config()` and handle whatever format it returns
- Write an integration test that compares WER on a reference audio file processed through your pipeline vs. the same file fed directly to Parakeet

**Warning signs:**
- Transcription quality is noticeably worse than expected from Parakeet benchmarks
- Quality differs between platforms (e.g., great on macOS, poor on Windows)
- Audio sounds "tinny," "muffled," or has high-frequency artifacts when played back
- WER testing shows numbers significantly above the published 6.05%

**Phase to address:**
Phase 1 (Audio Capture). Audio format normalization should be implemented as a testable, isolated component during initial audio pipeline work.

**Confidence:** HIGH -- verified via NVIDIA NeMo documentation on audio format requirements, Google Cloud Speech-to-Text optimization guide, and whisper/ASR community discussions.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Hard-code single audio device | Faster initial development | Users with USB mics, DACs, or multi-output setups can't use the app. Must refactor device selection. | Never -- enumerate devices from day one, even if you default to system default |
| Skip resumable model downloads | Simpler download code | 640MB model download fails on flaky connections, user must restart from zero. Frustration → uninstall. | MVP only if download has retry logic. Must add resume before public release. |
| Single SQLite connection for all threads | Avoids connection pooling complexity | "Database is locked" errors under concurrent writes from audio capture, ASR results, and UI queries | Never -- use a connection pool (r2d2-sqlite or deadpool-sqlite) with WAL mode from the start |
| Concatenate all transcript text before summarization | Simple to implement | Exceeds context window on long meetings, silent truncation, bad summaries | Only if transcript is pre-checked against token limit and chunking fallback exists |
| Ship without auto-update | Faster initial release | Users stuck on buggy versions, no way to push critical fixes | MVP only. Must add Tauri updater before second release. |
| Skip VAD, transcribe continuously | Simpler pipeline | Wastes compute transcribing silence, produces garbage tokens from background noise, higher latency | Never -- VAD is essential for the offline-model-as-pseudo-streaming pattern |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| sherpa-onnx native library | Linking sherpa-onnx as a Rust dependency and expecting cross-compilation to work | sherpa-onnx provides pre-built binaries per platform/arch. Download and link platform-specific binaries in build.rs. Use CI/CD with native runners (macOS on macOS, Windows on Windows) -- Tauri cannot meaningfully cross-compile. |
| Ollama API | Assuming Ollama is always running and available | Check Ollama availability on app startup. Provide clear "Ollama not detected" UX with installation instructions. Implement timeout handling -- summarization of long transcripts can take 30+ seconds. Provide a "skip summarization" escape hatch. |
| ScreenCaptureKit (macOS) | Using deprecated CGDisplayStream or AVCaptureScreenInput for audio | Use SCShareableContent + SCStream with audio-only configuration. Requires macOS 13+. Implement permission checking via SCShareableContent.current() before attempting capture. Handle the case where user grants "Screen Recording" but not "System Audio" separately (macOS 15+ splits these). |
| PipeWire/PulseAudio (Linux) | Assuming PulseAudio monitor sources work the same way on PipeWire | Use the PulseAudio compatibility layer (pipewire-pulse) but test on both PulseAudio and PipeWire systems. On PipeWire, monitor sources may not be exposed the same way. Consider using PipeWire native API as primary on modern distros. |
| Tauri IPC (events) | Streaming transcript updates as rapid individual events (one per word) | Batch transcript updates. Tauri IPC serializes to JSON; rapid small events cause overhead. Use Tauri's Channel API for streaming data. Batch updates to ~200ms intervals for UI rendering. |
| ONNX Runtime sessions | Creating and destroying sessions per transcription segment | Create the ONNX session once at startup, reuse for all inference. Session creation loads the model into memory (~640MB) and is expensive (seconds). Destroying and recreating leaks memory in some ONNX Runtime versions (GitHub issues #11118, #22271). |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Unbounded transcript storage in memory | RAM usage grows linearly during meeting, eventually OOM on 2+ hour meetings | Write completed transcript segments to SQLite incrementally. Keep only the last N segments in memory for UI display. | Meetings >1 hour on machines with <8GB RAM |
| JSON serialization of large transcripts over IPC | UI freezes when loading meeting history, slow scroll through long transcripts | Use pagination for transcript display. Send only visible segments to frontend. Use Tauri raw request API for large data. | Meetings >30 minutes (~50KB+ JSON per meeting) |
| ONNX inference blocking the audio pipeline | Audio drops during ASR inference on CPU, causing gaps in the next segment | Run ASR inference on a dedicated thread pool, completely decoupled from audio capture. Use ring buffer backpressure to queue segments. | On machines without GPU, during CPU-intensive inference |
| Ollama cold start latency | First summarization takes 30-60 seconds as Ollama loads model into VRAM/RAM | Pre-warm Ollama on app startup with a small prompt. Show clear loading state. Allow user to cancel and get raw transcript. | Every app restart if Ollama model is not cached |
| Resampling on every audio chunk | High CPU usage from real-time resampling 48kHz->16kHz | Use rubato with pre-allocated buffers. Process in chunks matching the audio callback buffer size. Consider requesting 16kHz directly from the platform if supported (some devices support it). | Sustained CPU load on low-power machines |
| SQLite FTS5 index rebuild on every insert | Slow inserts as the meeting library grows | Use triggers or batch FTS5 updates. Insert meeting notes as complete documents, not word-by-word. | >100 meetings in the library |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Storing meeting transcripts in plain text without encryption | Sensitive meeting content (HR discussions, strategy, financials) exposed if laptop is stolen or shared | Use SQLCipher for encrypted-at-rest SQLite database. Derive encryption key from user password or system keychain. Document security model clearly. |
| Ollama API exposed on localhost without auth | Any local process can query/poison the LLM, or exfiltrate meeting data via crafted prompts | Verify Ollama is listening on 127.0.0.1 only (default). Do not proxy Ollama through the Tauri webview. Send transcripts directly from Rust backend to Ollama. |
| Logging transcript content | Debug logs contain full meeting transcripts, potentially committed to crash reports or shared in bug reports | Never log transcript text in production. Use structured logging with content-free metadata only (segment count, word count, timestamps). |
| Model download over HTTP without integrity verification | Man-in-the-middle could replace the ASR model with a malicious or degraded version | Download models over HTTPS only. Verify SHA-256 checksum after download. Pin expected checksums in the application code. |
| Tauri CSP too permissive | XSS in the webview could access the Rust backend and exfiltrate data | Use strict CSP. Tauri 2 defaults are good but verify: no `unsafe-eval`, no `unsafe-inline` for scripts. Use Tauri's permission system to restrict IPC commands to only what the frontend needs. |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| No feedback during first-run 640MB model download | User thinks app is broken, quits, or force-quits mid-download corrupting the file | Show download progress with percentage, speed, and ETA. Make download resumable (HTTP Range headers). Allow "Skip for now, use cloud API" option. |
| Permission prompts without explanation | macOS shows "openNotes wants to record your screen" -- user denies because they don't understand why a note-taking app needs screen recording | Show a pre-permission explanation screen: "openNotes needs Screen Recording permission to capture meeting audio from apps like Zoom and Teams. No video is recorded." Then trigger the system prompt. |
| No indication of recording state | User forgets recording is active, captures unintended conversations | Always-visible recording indicator: system tray icon changes color (red), menu bar shows duration, optional desktop notification every 30 minutes. |
| Transcription errors shown without correction ability | User sees wrong transcription but can't fix it, loses trust | Allow inline editing of transcript segments. Show confidence indicators for uncertain words (lower opacity, underline). |
| Summarization takes too long with no progress | User clicks "End Meeting," expects instant notes, stares at spinner for 30+ seconds | Show the raw transcript immediately. Generate summary in background with progress indication. Allow the user to read/export the raw transcript while summary generates. |
| No graceful degradation without Ollama | User without Ollama installed sees "Summarization failed" and gets nothing | Detect Ollama absence at startup. Offer three paths: (1) install Ollama, (2) configure cloud API, (3) use raw transcript only. Never show an error for a missing optional dependency. |

## "Looks Done But Isn't" Checklist

- [ ] **Audio capture:** Often missing silence handling on Windows WASAPI loopback -- verify capture continues producing data during remote speaker silence
- [ ] **Audio mixing:** Often missing time-alignment between mic and system audio streams -- verify mixed output doesn't have echo or drift over a 1-hour recording
- [ ] **Resampling:** Often missing anti-aliasing filter -- verify no high-frequency artifacts in downsampled audio by comparing spectrograms
- [ ] **VAD configuration:** Often using default thresholds that trigger on keyboard typing or fan noise -- verify VAD only triggers on actual speech in a real meeting environment
- [ ] **Transcript persistence:** Often only keeping transcript in memory -- verify a crash during a 1-hour meeting doesn't lose the entire transcript
- [ ] **Model download:** Often not resumable -- verify killing the app mid-download and restarting picks up where it left off
- [ ] **macOS permissions:** Often only tested on development machine -- verify the signed+notarized build prompts correctly on a clean macOS installation
- [ ] **Linux audio:** Often only tested on one distro -- verify audio capture works on both PulseAudio and PipeWire systems
- [ ] **Long meetings:** Often only tested with 5-minute recordings -- verify 2-hour meeting stays within 500MB RAM and transcript quality doesn't degrade
- [ ] **Ollama context:** Often only tested with short transcripts -- verify summarization of a 30-minute meeting (5000+ words) produces a complete summary covering all topics

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Wrong ASR streaming architecture (true streaming with offline model) | HIGH | Rewrite ASR pipeline to VAD+segment pattern. Audio capture layer can be preserved. Estimated 1-2 weeks. |
| WASAPI silence gap handling missing | LOW | Add silence frame injection to Windows audio capture. Isolated fix, ~1 day. |
| macOS entitlements wrong | MEDIUM | Fix entitlements, re-sign, re-notarize, re-test. But debugging entitlement issues can take days of trial-and-error. |
| Ollama context truncation | LOW | Add token counting + chunked summarization. ~2-3 days to implement and test hierarchical summarization. |
| Audio callback blocking | HIGH | Requires rewriting the callback to be lock-free and moving all processing to separate threads. May require changing data structures throughout the audio pipeline. 1-2 weeks. |
| Audio format mismatch | MEDIUM | Add proper resampling/conversion layer. Isolated change but requires re-testing transcription quality on all platforms. 3-5 days. |
| No resumable model download | LOW | Switch to HTTP Range-based downloads. 1-2 days. But users who already had corrupted downloads need a "re-download" button. |
| SQLite locking errors | MEDIUM | Switch to WAL mode + connection pool. Requires audit of all database access patterns. 2-3 days. |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Parakeet TDT is offline, not streaming | Phase 1: Audio + ASR Foundation | Transcription latency stays constant regardless of meeting duration |
| WASAPI silence gaps | Phase 1: Audio Capture | Audio capture produces continuous frames during a 5-minute silence test on Windows |
| macOS entitlements and notarization | Phase 1: Project Setup + CI/CD | Signed build runs correctly on clean macOS VM/machine |
| Ollama context truncation | Phase 2: LLM Summarization | Summary of 8000-word transcript covers topics from beginning, middle, and end |
| CPAL callback blocking | Phase 1: Audio Capture | 2-hour recording shows no audio drops under simultaneous ASR load |
| Audio format mismatch | Phase 1: Audio Capture | WER on pipeline-processed audio within 1% of direct-file Parakeet benchmark |
| SQLite concurrent access | Phase 1: Storage Foundation | Simultaneous write (from ASR) and read (from UI) produce no "database locked" errors |
| Tauri IPC bottleneck | Phase 1: App Shell + IPC | Transcript updates render at 60fps with no UI jank during active transcription |
| ONNX Runtime memory leaks | Phase 1: ASR Foundation | Memory usage stays stable (within 50MB variance) across 10 consecutive meetings |
| Model download UX | Phase 1: First-Run Experience | Interrupted download resumes correctly; progress bar is accurate |
| Permission prompt UX | Phase 1: First-Run Experience | Clean-install user grants permissions on first attempt without confusion |
| Linux PulseAudio/PipeWire compat | Phase 2: Cross-Platform Hardening | Audio capture verified on Ubuntu (PipeWire), Fedora (PipeWire), and Debian (PulseAudio) |

## Sources

- [sherpa-onnx GitHub issue #2918 -- Parakeet TDT streaming limitations](https://github.com/k2-fsa/sherpa-onnx/issues/2918) (HIGH confidence)
- [HuggingFace parakeet-tdt-0.6b-v2 streaming discussion](https://huggingface.co/nvidia/parakeet-tdt-0.6b-v2/discussions/3) (HIGH confidence)
- [Microsoft Learn -- WASAPI Loopback Recording](https://learn.microsoft.com/en-us/windows/win32/coreaudio/loopback-recording) (HIGH confidence)
- [Microsoft Learn -- WASAPI Audio Discontinuity](https://learn.microsoft.com/en-us/answers/questions/1188388/persistent-audio-discontinuity-in-wasapi-loopback) (HIGH confidence)
- [Tauri macOS Code Signing Documentation](https://v2.tauri.app/distribute/sign/macos/) (HIGH confidence)
- [Tauri GitHub issue #11992 -- Sidecar notarization bug](https://github.com/tauri-apps/tauri/issues/11992) (HIGH confidence)
- [Ollama Context Length Documentation](https://docs.ollama.com/context-length) (HIGH confidence)
- [cpal GitHub issue #970 -- Windows callback thread blocking](https://github.com/RustAudio/cpal/issues/970) (HIGH confidence)
- [cpal Documentation -- Real-time callback constraints](https://docs.rs/cpal) (HIGH confidence)
- [ONNX Runtime GitHub issues #11118, #22271 -- Memory leaks](https://github.com/microsoft/onnxruntime/issues/11118) (HIGH confidence)
- [Tauri GitHub discussion #7146 -- IPC high-rate data transfer](https://github.com/tauri-apps/tauri/discussions/7146) (HIGH confidence)
- [Tauri GitHub issue #12724 -- Memory leak when emitting events](https://github.com/tauri-apps/tauri/issues/12724) (MEDIUM confidence)
- [Electron GitHub issue #47490 -- ScreenCaptureKit audio capture](https://github.com/electron/electron/issues/47490) (MEDIUM confidence)
- [Apple Developer Forums -- Screen Recording TCC permission](https://developer.apple.com/forums/thread/760483) (HIGH confidence)
- [SQLite Concurrent Writes analysis](https://tenthousandmeters.com/blog/sqlite-concurrent-writes-and-database-is-locked-errors/) (HIGH confidence)
- [Deepchecks -- LLM Token Limit Strategies](https://www.deepchecks.com/5-approaches-to-solve-llm-token-limits/) (MEDIUM confidence)
- [tauri-plugin-macos-permissions crate](https://crates.io/crates/tauri-plugin-macos-permissions) (MEDIUM confidence)
- [OBS Studio GitHub issue #10401 -- macOS audio capture permissions](https://github.com/obsproject/obs-studio/issues/10401) (MEDIUM confidence)

---
*Pitfalls research for: Local-first AI meeting transcription and summarization desktop app (openNotes)*
*Researched: 2026-02-26*
