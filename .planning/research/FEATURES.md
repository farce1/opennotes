# Feature Research

**Domain:** Local-first AI meeting transcription and summarization desktop app
**Researched:** 2026-02-26
**Confidence:** HIGH

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete. Every competitive meeting transcription app in 2026 has these.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| One-click recording start/stop | Every competitor has this. Users will not tolerate complex setup per meeting. Granola, Krisp, and Jamie all use a single button or hotkey. | LOW | Global keyboard shortcut essential. System tray icon for state visibility. |
| Real-time transcript display | Users need to see transcription working to trust it. Otter, Fireflies, Krisp, and Fathom all show live text during meetings. Granola is an exception (shows after). | MEDIUM | Stream partial results via IPC events. Buffer ~3 seconds per Parakeet latency. |
| System audio + microphone capture | Capturing only mic means missing remote participants. Every meeting tool captures both sides. Krisp, Jamie, and Granola all capture system audio directly. | HIGH | Platform-specific: ScreenCaptureKit (macOS 13+), WASAPI Loopback (Windows), PulseAudio/PipeWire (Linux). This is the hardest table-stakes feature. |
| Post-meeting structured summary | The core deliverable. Every competitor generates summaries with sections: overview, key points, decisions, action items. Otter, Fireflies, Fellow, Fathom, and Granola all do this. | MEDIUM | Requires LLM. Pluggable approach (Ollama local + cloud API fallback) is the right call per PROJECT.md. |
| Action item extraction | Users expect action items pulled out automatically with assignees when possible. 94% of top 10 AI notetakers include this. Otter, Fireflies, Fellow, and tl;dv all extract action items. | MEDIUM | Part of the summarization prompt. LLM identifies "who committed to what." Without speaker diarization, assignees will be approximate (by name mentioned, not by voice). |
| Full-text search across notes | Users accumulate hundreds of meeting notes. Search is how they find past decisions. Otter, Fireflies, Fellow, and Notion all offer cross-meeting search. | LOW | SQLite FTS5 handles this well. Already in PROJECT.md scope. |
| Export to common formats | Users need to get notes out. Markdown, plain text, and clipboard copy are minimum. Most tools offer PDF, DOCX, TXT, Markdown. Fathom and Meetily export Markdown. | LOW | Markdown as primary format (developer audience). Add copy-to-clipboard. PDF can wait for post-MVP. |
| Settings/preferences UI | Users need to select audio devices, configure LLM, manage models. Every desktop app has this. SuperWhisper has detailed model management. | MEDIUM | Audio device selection, model download/management, LLM configuration, keyboard shortcut customization. |
| First-run setup/onboarding | Model download (~640 MB) requires explanation. SuperWhisper pattern: ship small app, download model on first run with hardware-specific recommendations. | MEDIUM | Hardware detection (CPU/GPU/Apple Silicon), model recommendation, download progress, guided LLM setup. |
| Cross-platform support | Target audience uses macOS, Windows, and Linux. Tauri enables this. Krisp supports Mac + Windows. Jamie supports Mac + Windows. Meetily targets all three. | HIGH | Cumulative complexity across audio capture, model runtime, and UI. Each platform has different audio APIs. |

### Differentiators (Competitive Advantage)

Features that set openNotes apart from the field. These are why users choose openNotes over Otter/Fireflies/Granola.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Fully local processing (no cloud required) | **The primary differentiator.** In 2026, users increasingly demand local processing for privacy (GDPR, HIPAA concerns). Krisp processes audio locally but sends to cloud for transcription on some plans. Granola transcribes in cloud ("computation too much locally"). openNotes runs Parakeet entirely on-device. Zero data leaves the machine unless user opts into cloud LLM. | HIGH | Parakeet via sherpa-onnx handles transcription. Ollama handles summarization. Both local. This is the core promise. |
| Zero cost, no subscription | Otter: $16.99/mo. Fireflies: $18/mo. Granola: $18/mo. Krisp: $8/mo. Fathom free tier limits AI summaries to 5/month. openNotes is free forever (MIT licensed, models are CC-BY-4.0). For users attending 10+ meetings/week, this saves $200+/year. | LOW | Open source eliminates ongoing cost. Model download is one-time. Ollama is free. |
| No meeting bot / invisible recording | Major user complaint in 2026: bots joining calls break flow and raise privacy concerns. Otter, Fireflies, Fathom, and tl;dv all send visible bots. Granola, Krisp, Jamie, and openNotes capture system audio directly -- no bot appears. This is a top-3 user requirement per multiple 2026 reviews. | N/A | Already inherent in the system audio capture architecture. Not a feature to build, but a feature to market. |
| Open source and auditable | No other major meeting notes tool is fully open source. Meetily is the closest competitor (also Tauri + Parakeet). Open source means users can verify privacy claims, audit code, and self-host. Enterprise security teams prefer auditable software. | LOW | MIT license. Code on GitHub. Privacy claims are verifiable, unlike Otter/Granola/Krisp. |
| Offline-capable | Works without internet. SuperWhisper pioneered this for dictation. With local Parakeet + local Ollama, openNotes can transcribe and summarize in airplane mode. No competitor except SuperWhisper (dictation only, not meetings) and Meetily offers true offline meeting notes. | LOW | Already inherent if using Ollama. Document as a feature. Test and verify offline workflow. |
| Speaker diarization (post-MVP) | Identifying "who said what" is critical for action item attribution and meeting usefulness. 94% accuracy is achievable per 2026 benchmarks. Otter, Fireflies, and tl;dv all have this. Granola struggles with it. pyannote-audio is the standard open-source approach. | HIGH | PROJECT.md correctly defers to v0.2.0. Requires separate audio channels (not mixed stream). This will be the single most requested feature after MVP launch. |
| Custom summary templates | Granola's "Recipes" feature is their key 2025-2026 innovation. Fellow, Otter, and tl;dv all offer custom templates for different meeting types (1:1, standup, sales call, retrospective). Users want summaries shaped to their meeting type. | MEDIUM | Implement as configurable prompt templates. Ship with 4-5 defaults (general, 1:1, standup, design review, customer call). Let users create custom templates. |
| AI chat with transcript | "Ask questions about this meeting" -- Granola, Otter, and Fireflies all offer this. Users want to query: "What did John say about the deadline?" or "Summarize the budget discussion." | MEDIUM | Send transcript + question to LLM. Straightforward with Ollama/cloud API. High user value for long meetings. Defer to post-MVP (v0.2.0 or v0.3.0). |
| Audio recording and playback | tl;dv's core feature: jump to any moment in the recording. Useful for verifying what was actually said vs. what the AI transcribed. Fathom and Otter also offer this. | MEDIUM | PROJECT.md lists as post-MVP. Store compressed audio alongside transcript. Link timestamps to audio positions. |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems -- especially for a local-first, privacy-focused, open-source project.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Cloud sync across devices | Users want notes on phone + laptop. Otter and Notion provide this. | Fundamentally conflicts with local-first privacy promise. Building sync infrastructure is a massive undertaking (conflict resolution, auth, server costs). Granola stores notes in AWS -- that is exactly the trust model openNotes rejects. | Export to Markdown files that users sync via their own tools (iCloud Drive, Dropbox, Syncthing, Git). Let users own their sync. |
| Meeting bot that joins calls | Otter, Fireflies, Fathom, and tl;dv use bots. Some users ask for this because it means "zero setup." | Bots are the #1 user complaint in 2026 meeting tools. They break meeting flow, raise consent issues, and get blocked by IT policies. This would negate openNotes' "invisible recording" differentiator. | System audio capture is strictly better. Educate users on the advantages. |
| Video recording | Users sometimes want to see the meeting, not just read it. tl;dv offers video clips. | Massive storage requirements (1 hour = 1-3 GB). Complex to implement cross-platform. Far outside core value prop of "structured meeting notes." Not what a note-taking app should do. | Link to the meeting platform's own recording if available. Focus on transcript + summary. |
| Real-time collaborative editing | Notion and Google Docs have this. Users may expect simultaneous editing of meeting notes. | openNotes is a personal tool, not a team workspace. Collaborative editing requires CRDT/OT algorithms, networking, and conflict resolution -- enormous complexity. Conflicts with local-first architecture. | Export and share completed notes. Each person runs their own openNotes instance. |
| CRM integration (Salesforce, HubSpot) | Sales-focused tools like Fathom, Fireflies, and Grain push notes to CRMs. | Requires maintaining integrations with third-party APIs that change frequently. Small open-source project cannot keep up with Salesforce API changes. Targets a narrow use case (sales teams) at high maintenance cost. | Export to Markdown/JSON. Provide a documented API or webhook that power users can connect to Zapier/n8n themselves. |
| Noise cancellation | Krisp's headline feature. Users with noisy environments want cleaner audio. | Requires sophisticated DSP pipeline (Krisp spent years on this). Increases CPU usage and latency. Parakeet already handles moderate noise well. Building noise cancellation is a product unto itself. | Document recommended microphone setups. Defer to post-MVP (v0.4.0 per PROJECT.md). Consider integrating RNNoise if demand is high -- it is open source and lightweight. |
| Multi-language simultaneous transcription | Some meetings mix languages. Users want transcription in both. | Parakeet v2 is English-only (6.05% WER). Parakeet v3 is multilingual but at 9.7% WER -- significantly worse. Mixing languages in a single stream further degrades accuracy. No tool handles this well. | Ship with English (Parakeet v2) as default. Offer Parakeet v3 as optional download for non-English meetings. Do not promise mixed-language support. |
| Auto-join from calendar | Otter, Fireflies, and Notta auto-join meetings from calendar. Users want "set and forget." | Requires calendar API integration (Google Calendar, Outlook), background daemon, and implicit consent from all participants. Privacy implications of recording without explicit action contradict the "privacy-first" positioning. | Manual one-click start is intentional. Consider calendar awareness (show upcoming meetings, pre-populate meeting title) without auto-recording. |

## Feature Dependencies

```
[System Audio Capture]
    └──requires──> [Audio Device Selection in Settings]
    └──enables──> [Real-time Transcription]
                      └──enables──> [Live Transcript Display]
                      └──enables──> [Post-meeting Summary]
                                        └──requires──> [LLM Configuration]
                                        └──enables──> [Action Item Extraction]
                                        └──enables──> [Custom Summary Templates]
                      └──enables──> [AI Chat with Transcript]

[Model Download Flow]
    └──requires──> [Hardware Detection]
    └──requires──> [Settings UI]
    └──enables──> [Real-time Transcription]

[Notes Library]
    └──requires──> [SQLite Storage]
    └──enables──> [Full-text Search (FTS5)]
    └──enables──> [Export (Markdown/Clipboard)]
    └──enables──> [Browse/Filter Notes]

[Speaker Diarization] ──requires──> [Separate Audio Channels (not mixed stream)]
    └──conflicts──> [Current mixed-stream architecture]
    └──NOTE: Requires architecture change from mixed to separate channels

[Audio Recording & Playback] ──enhances──> [Notes Library]
    └──enables──> [Timestamp-linked playback]

[Custom Summary Templates] ──enhances──> [Post-meeting Summary]
    └──requires──> [Template Management UI]

[Global Keyboard Shortcut] ──enhances──> [One-click Recording]
    └──requires──> [System Tray Integration]
```

### Dependency Notes

- **Real-time Transcription requires System Audio Capture:** Without audio, there is nothing to transcribe. Audio capture is the foundation of the entire app.
- **Post-meeting Summary requires LLM Configuration:** Summary generation needs either Ollama running locally or a cloud API key configured. Must gracefully degrade to raw transcript if no LLM is available.
- **Speaker Diarization conflicts with mixed-stream architecture:** PROJECT.md correctly identifies this. MVP uses a single mixed audio stream for simplicity. Diarization (v0.2.0) requires capturing mic and system audio as separate channels, then aligning them. This is a significant architectural change.
- **Custom Summary Templates enhance Post-meeting Summary:** Templates are an incremental feature on top of the summarization pipeline. Can be added without changing the core architecture.
- **Model Download Flow gates everything:** The app is non-functional without the ASR model. First-run experience must handle this gracefully before any other feature works.

## MVP Definition

### Launch With (v0.1.0)

Minimum viable product -- what is needed to validate "one-click meeting recording that produces structured meeting notes, entirely local."

- [ ] **System audio + microphone capture** -- The hardest feature, but without it the app does nothing. Platform-specific (ScreenCaptureKit, WASAPI, PulseAudio). Must work reliably on at least macOS + Windows for launch.
- [ ] **Real-time transcription via Parakeet** -- Core value. User sees text appearing during the meeting. Via sherpa-onnx with hardware-appropriate backend (Core ML, ONNX INT8, CUDA).
- [ ] **Live transcript display** -- Show transcription in real time so users know it is working. Simple scrolling text view.
- [ ] **First-run model download** -- App ships at ~10 MB. On first launch, detect hardware, recommend model variant, download ~640 MB model with progress indication.
- [ ] **Post-meeting structured summary** -- When recording stops, send transcript to LLM (Ollama or cloud API). Generate: summary, key points, decisions, action items. This is the deliverable users came for.
- [ ] **Notes library with search** -- SQLite + FTS5. Browse past meetings, search across all notes. Basic but functional.
- [ ] **Export to Markdown and clipboard** -- Users need to get notes out of the app and into Slack, email, Notion, or their own files.
- [ ] **Settings UI** -- Audio device selection, LLM configuration (Ollama endpoint or API key), model management, global shortcut configuration.
- [ ] **System tray with recording indicator** -- Users need to know recording is active without keeping the app window open. Global shortcut to start/stop.
- [ ] **Graceful LLM fallback** -- If no LLM is configured or available, save the raw transcript. Do not lose the meeting. Prompt user to configure LLM for summaries.

### Add After Validation (v0.2.0 - v0.3.0)

Features to add once the core recording-to-summary pipeline is solid and users are providing feedback.

- [ ] **Speaker diarization** -- The most requested feature after basic transcription. Requires pyannote-audio integration and separate audio channels. Triggers architectural change from mixed to separate streams. Add when: users consistently report "I need to know who said what."
- [ ] **Audio recording and playback** -- Save audio files alongside transcripts. Timestamp-linked playback for verification. Add when: users report transcription errors they cannot verify.
- [ ] **Custom summary templates** -- Different meeting types need different summary formats. Ship 4-5 defaults (general, 1:1, standup, design review, customer call). Add when: users report summaries do not match their meeting style.
- [ ] **AI chat with transcript** -- "What did we decide about the budget?" Query the meeting transcript conversationally. Add when: users report difficulty finding specific information in long meeting notes.
- [ ] **Calendar awareness** -- Read Google Calendar / Outlook to show upcoming meetings and auto-populate meeting titles. NOT auto-record. Add when: users report friction in naming/organizing meetings.
- [ ] **Multilingual support** -- Offer Parakeet v3 as optional model for non-English meetings (25 languages). Add when: non-English users request it.

### Future Consideration (v0.4.0+)

Features to defer until product-market fit is established.

- [ ] **Noise cancellation** -- RNNoise integration for challenging audio environments. Defer because: Parakeet handles moderate noise; this is a separate engineering challenge.
- [ ] **Slack/PM tool push** -- Send summaries and action items to Slack channels or project management tools. Defer because: requires API integrations that need ongoing maintenance.
- [ ] **Mobile companion** -- Read notes on phone. Defer because: Tauri mobile is not production-ready; export to Markdown covers this use case via file sync.
- [ ] **Team/org features** -- Self-hosted server for team sharing. Defer because: openNotes is a personal tool first; team features require auth, permissions, and server infrastructure.
- [ ] **Webhooks/API for integrations** -- Let power users connect openNotes to their own automation. Defer because: core product must work first; this is an extensibility feature.

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| System audio + mic capture | HIGH | HIGH | P1 |
| Real-time transcription (Parakeet) | HIGH | HIGH | P1 |
| Live transcript display | HIGH | LOW | P1 |
| First-run model download | HIGH | MEDIUM | P1 |
| Post-meeting structured summary | HIGH | MEDIUM | P1 |
| Notes library with FTS5 search | HIGH | LOW | P1 |
| Export (Markdown, clipboard) | MEDIUM | LOW | P1 |
| Settings UI | MEDIUM | MEDIUM | P1 |
| System tray + global shortcut | MEDIUM | LOW | P1 |
| LLM fallback (raw transcript) | HIGH | LOW | P1 |
| Speaker diarization | HIGH | HIGH | P2 |
| Audio recording & playback | MEDIUM | MEDIUM | P2 |
| Custom summary templates | MEDIUM | LOW | P2 |
| AI chat with transcript | MEDIUM | MEDIUM | P2 |
| Calendar awareness | LOW | MEDIUM | P2 |
| Multilingual (Parakeet v3) | MEDIUM | LOW | P2 |
| Noise cancellation | LOW | HIGH | P3 |
| Slack/PM push | LOW | MEDIUM | P3 |
| Mobile companion | MEDIUM | HIGH | P3 |
| Team/org deployment | LOW | HIGH | P3 |
| Webhooks/API | LOW | MEDIUM | P3 |

**Priority key:**
- P1: Must have for launch (MVP v0.1.0)
- P2: Should have, add in v0.2.0-v0.3.0 based on user feedback
- P3: Nice to have, future consideration v0.4.0+

## Competitor Feature Analysis

| Feature | Otter.ai | Fireflies | Granola | Krisp | Fathom | tl;dv | Jamie | openNotes (planned) |
|---------|----------|-----------|---------|-------|--------|-------|-------|---------------------|
| Real-time transcription | Yes | Yes (2026) | No (post-meeting) | Yes | Yes | Yes | No | **Yes** |
| Bot-free recording | No (bot) | No (bot) | **Yes** | **Yes** | No (bot) | No (bot) | **Yes** | **Yes** |
| Local processing | No | No | Partial (audio local, transcription cloud) | Partial (audio local) | No | No | Partial | **Fully local** |
| Offline capable | No | No | No | No | No | No | No | **Yes** |
| Speaker diarization | Yes | Yes | Limited | Yes | Yes | Yes | Yes | Post-MVP (v0.2.0) |
| Custom templates | Yes | Yes | Yes (Recipes) | No | No | Yes | No | Post-MVP (v0.2.0) |
| AI chat with notes | Yes | Yes | Yes | No | No | No | No | Post-MVP |
| Action items | Yes | Yes | Yes | Yes | Yes | Yes | Yes | **Yes (MVP)** |
| Cross-meeting search | Yes | Yes | Limited | Limited | Limited | Yes | Limited | **Yes (MVP, FTS5)** |
| Export Markdown | No | Yes | Yes | No | Yes | Yes | Yes | **Yes (MVP)** |
| Calendar integration | Yes (auto-join) | Yes (auto-join) | Yes (titles only) | No | Yes | Yes | Yes (titles) | Post-MVP (awareness only) |
| Video recording | No | No | No | No | No | **Yes** | No | No (anti-feature) |
| CRM integration | Yes | Yes | No | No | Yes | Yes | No | No (anti-feature) |
| Free tier | 300 min/mo | 800 min storage | 25 meetings lifetime | 50 min/day | Unlimited (5 AI summaries) | Unlimited (limited AI) | Limited | **Unlimited, forever** |
| Price (paid) | $16.99/mo | $18/mo | $18/mo | $8/mo | $19/mo | $25/mo | $24/mo | **$0 (MIT)** |
| Open source | No | No | No | No | No | No | No | **Yes** |
| Languages | 3 | 100+ | ~10 | ~20 | ~20 | 30+ | 100+ | 1 (EN), 25 post-MVP |

### Key Competitive Insights

1. **Bot-free is the new table stakes.** In 2026, user complaints about meeting bots are pervasive. Granola, Krisp, Jamie, and Tactiq all market "no bot" as a primary feature. openNotes inherently has this -- it must be front-and-center in positioning.

2. **"Local processing" claims are often exaggerated.** Granola processes audio locally but transcribes in the cloud. Krisp processes audio locally for noise cancellation but uses cloud for transcription on some plans. openNotes with Parakeet via sherpa-onnx is genuinely fully local. This is a real and rare differentiator.

3. **Speaker diarization is the biggest gap for MVP.** Every competitor except early-stage open-source tools has it. Users will ask for it immediately. The v0.2.0 timeline in PROJECT.md is correct -- ship without it, but plan the architecture to support it.

4. **Custom templates are table stakes for power users.** Granola's "Recipes" drove significant adoption in 2025-2026. This should be early in the post-MVP roadmap.

5. **Cross-meeting search/knowledge base is the emerging battleground.** Otter, Fireflies, and Notion are all investing heavily in "chat with all your meetings." For openNotes, FTS5 is a solid foundation; AI-powered cross-meeting chat is a strong v0.3.0 feature.

6. **Meetily is the closest direct competitor.** Also Tauri + Parakeet, also open source, also local-first. openNotes must differentiate on polish, UX, and completeness. Meetily is at v0.2.1 and rough around the edges.

## Sources

- [Otter.ai](https://otter.ai/) -- Official product page. Features and pricing verified.
- [Fireflies.ai](https://fireflies.ai) -- Official product page. 2026 features confirmed.
- [Granola](https://www.granola.ai/) -- Official product page. Bot-free and Recipes features confirmed.
- [Granola Security](https://www.granola.ai/security) -- Official security page. Cloud transcription, local note storage confirmed.
- [Krisp](https://krisp.ai/) -- Official product page. Bot-free, local audio processing confirmed.
- [Fathom](https://www.fathom.ai/) -- Official product page. Free tier limits confirmed.
- [tl;dv](https://tldv.io/) -- Official product page. Video clips and multi-language confirmed.
- [Jamie](https://www.meetjamie.ai/) -- Official product page. Bot-free, local capture confirmed.
- [Meetily](https://github.com/Zackriya-Solutions/meeting-minutes) -- GitHub repo. Tauri + Parakeet stack, v0.2.1 status confirmed.
- [AssemblyAI - Top AI Notetakers 2026](https://www.assemblyai.com/blog/top-ai-notetakers) -- Feature comparison across 10 tools. HIGH confidence (multiple data points).
- [Krisp - Best AI Note Taking Apps 2026](https://krisp.ai/blog/ai-note-taking-apps/) -- Feature comparison matrix. MEDIUM confidence (vendor source but comprehensive).
- [Fellow - AI Meeting Assistants Guide](https://fellow.ai/blog/ai-meeting-assistants-ultimate-guide/) -- 22 tools compared. MEDIUM confidence.
- [Notion AI Meeting Notes](https://www.notion.com/product/ai-meeting-notes) -- Official product page. Template types and pricing confirmed.
- [SuperWhisper](https://superwhisper.com/) -- Official product page. Local Whisper processing, model download pattern confirmed.

---
*Feature research for: local-first AI meeting transcription and summarization desktop app*
*Researched: 2026-02-26*
