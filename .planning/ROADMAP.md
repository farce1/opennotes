# Roadmap: openNotes

## Milestones

- ✅ **v1.0 MVP** — Phases 01-09 (shipped 2026-03-01)
- ✅ **v1.1 Hardening & Quality** — Phases 10-13 (shipped 2026-03-03)
- ✅ **v1.2 Speaker Intelligence & Templates** — Phases 14-18 (shipped 2026-03-05)
- 🚧 **v1.3 Release & Distribution** — Phases 19-23 (in progress, started 2026-05-11)

## v1.3 Overview

v1.3 takes a feature-complete Tauri 2 + React local-AI meeting recorder from "works on the dev's machine" to a publicly downloadable, install-validated release. **No new product features.** Five phases sequenced around hard release-engineering constraints:

1. Front-load the four pre-existing release blockers (bundle targets, updater pubkey, version drift, Ollama auto-install consent) plus VCRUNTIME bundling and pure-Rust archive extraction. Without these, tagging v1.3.0 produces broken or unsafe artifacts.
2. Re-run the v1.1 benchmark harness against live Ollama and wire the results into Settings.
3. Polish the existing first-run wizard (copy, error states, i18n) without adding screens.
4. Run rc.1 binaries against real clean VMs on macOS / Windows / Linux. The gating phase.
5. Rewrite README for end-users, capture validated screenshots, and tag the v1.3.0 public release.

**Hard ordering:** P19 + P20 + P21 must merge before P22's rc.1 tag is cut. P22 must pass before P23's v1.3.0 tag. **Soft ordering:** P20 and P21 are parallel-friendly with P19 once their dependencies (live Ollama for P20, merged backend for P21) are satisfied.

## Phases

**Phase Numbering:**
- Phases 01-18 belong to shipped milestones (v1.0 / v1.1 / v1.2).
- v1.3 continues from **Phase 19**. Integer phases are planned milestone work; decimals (e.g., 19.1) are reserved for urgent post-planning insertions.

### v1.3 Release & Distribution (Phases 19-23)

- [x] **Phase 19: Release-Critical Config & Packaging Blockers** — Fix bundle targets, updater pubkey, version drift, Ollama auto-install consent; bundle VC++ Redist via NSIS hook; replace shell-out tar with pure-Rust extraction + SHA256 + disk pre-check. (completed 2026-05-12)
- [ ] **Phase 20: Benchmark Rerun & Settings Recommendation UI** — Live-Ollama benchmark with warmup + N=5 + median + hardware-tier methodology; emit `src/data/model-benchmarks.json` as single source of truth; replace hard-coded Recommended badge with JSON lookup.
- [ ] **Phase 21: Onboarding Polish** — Tighten existing wizard copy, error messages, sensible defaults, Polish i18n parity, stalled-download fallback, distinguishable Ollama states. No new screens.
- [ ] **Phase 22: Clean-VM Install Validation (Gating)** — Tag v1.3.0-rc.1; validate DMG / NSIS / AppImage on real clean macOS Sonoma+, Windows 11 + Windows 10 LTSC, Ubuntu 22.04 + 24.04 + Fedora 41 VMs; fill `docs/RELEASE_VALIDATION.md` checklist.
- [ ] **Phase 23: Public v1.3.0 Release & End-User Documentation** — End-user-first README rewrite with download CTAs above the fold, screenshots from VALIDATE, inline unsigned-app workarounds, FAQ, benchmark table, system requirements; CHANGELOG.md; pre-written GitHub Release body; tag v1.3.0.

## Phase Details

### Phase 19: Release-Critical Config & Packaging Blockers
**Goal**: Tagging v1.3.0-rc.1 produces three valid platform installers — signed updater feed, version-correct binaries, Windows app launches without missing-DLL crash, diarization model extracts cleanly on every platform, and Ollama auto-install requires explicit user consent.
**Depends on**: Nothing (first v1.3 phase; the four pre-existing blockers must land before anything else ships)
**Requirements**: CONFIG-01, CONFIG-02, CONFIG-03, CONFIG-04, CONFIG-05, CONFIG-06, PKG-01, PKG-02, PKG-03, EXTRACT-01, EXTRACT-02, EXTRACT-03, EXTRACT-04, ONBOARD-04
**Success Criteria** (what must be TRUE):
  1. Running the release pipeline on a tagged commit produces three platform installers (DMG, NSIS .exe, AppImage) plus a `latest.json` updater feed with non-placeholder signatures; the feed references each platform's correct artifact URL.
  2. A clean Windows 10 LTSC VM with no Visual Studio history installs the NSIS .exe and launches the app without `VCRUNTIME140.dll`/`MSVCP140.dll` errors; the bundled `vc_redist.x64.exe` is invoked silently and skipped when already present.
  3. Diarization model download on every supported platform extracts the `.tar.bz2` archive via pure-Rust `tar` + `bzip2`, verifies SHA256 against a pinned hash before extraction, pre-checks disk space, and surfaces a structured cause (corrupt / disk full / permission denied) on failure — no "Failed to extract" generic error.
  4. Attempting to release with mismatched versions across `package.json` / `Cargo.toml` / `tauri.conf.json` or with any `REPLACE_WITH_*` placeholder still in committed config fails the CI pre-flight job before any artifact is built; `bun run release:bump` updates all three files atomically.
  5. Ollama auto-install (`src-tauri/src/llm/setup.rs`) presents an explicit consent dialog showing the source domain (`ollama.com`), the download URL, and the byte size before any binary is fetched or executed; declining the dialog leaves the user on the manual-install path.
**Plans** (6 plans across 3 waves):
- [x] 19-01-pure-rust-archive-extraction-PLAN.md — Pure-Rust tar+bzip2 extraction module + Cargo deps + integration tests (EXTRACT-01..04 foundation; Wave 1)
- [x] 19-02-version-bump-and-ci-preflight-PLAN.md — scripts/release-bump.mjs + CI placeholder grep + release.yml version-sync assert + tauri-action@v0.6.2 pin (CONFIG-03/04/05; Wave 1)
- [x] 19-03-wire-download-extraction-PLAN.md — Replace tar shell-outs in download.rs with the Plan 01 module + ModelArchive SHA256 consts + DownloadEvent kind field + frontend i18n mapping (EXTRACT-01..04 wiring; Wave 2)
- [x] 19-04-tauri-config-bundle-and-updater-PLAN.md — bundle.targets, plugins.updater.pubkey, endpoints verification + docs/RELEASE_KEYS.md (CONFIG-01/02/06; Wave 2)
- [x] 19-05-nsis-vcredist-bundling-PLAN.md — Vendor vc_redist.x64.exe + NSIS hooks.nsh + tauri.conf.json resources/installerHooks (PKG-01/02/03; Wave 3)
- [x] 19-06-ollama-consent-dialog-PLAN.md — Custom React consent modal + backend user_consented guard + get_ollama_download_metadata command (ONBOARD-04; Wave 3)

### Phase 20: Benchmark Rerun & Settings Recommendation UI
**Goal**: A user opening Settings → Summary sees a "★ Recommended" badge driven by real benchmark data, with at least one alternate model providing comparison context; README has a verifiable benchmark table sourced from the same JSON.
**Depends on**: Phase 19 (release-critical fixes merged; benchmark runs against the same backend the user will run)
**Requirements**: BENCH-01, BENCH-02, BENCH-03, BENCH-04, BENCH-05
**Success Criteria** (what must be TRUE):
  1. `.planning/milestones/v1.1-phases/13-llm-quality-tuning/BENCHMARK.md` no longer contains PENDING rows for phi4-mini; each row carries a hardware-tier stamp (CPU model, RAM, GPU presence) and methodology metadata (warmup + N=5 + median).
  2. At least one alternate model beyond phi4-mini (e.g., llama3.2:3b or qwen2.5:3b) has scored rows in the benchmark output so users see a real comparison rather than a one-row "table".
  3. `src/data/model-benchmarks.json` exists in-repo, ships as a Vite static import, is versioned with a `generated` timestamp, and contains the same scores referenced by both the Settings UI and README — single source of truth.
  4. `src/components/settings/SummarySection.tsx` renders the "★ Recommended" badge for the JSON's `verdict: "recommended"` row(s); removing or renaming the recommended row in JSON changes the badge without a code change. No hard-coded `phi4-mini` literal remains as the badge predicate.
  5. The benchmark JSON is dependency-free (no Python evaluator, no fixtures, no Ollama runtime requirement at user-install time); benchmarks are produced once on the maintainer's machine and shipped as static data.
**Plans** (5 plans across 3 waves):
- [ ] 20-01-PLAN.md — Schema types + validator + Vitest tests + JSON skeleton (BENCH-04/05 foundation; Wave 1)
- [ ] 20-02-PLAN.md — SummarySection.tsx predicate rewire to JSON-driven badge with i18n (BENCH-05; Wave 2)
- [ ] 20-03-PLAN.md — scripts/benchmark-models.mjs harness orchestrator + package.json benchmark script + runs/.gitignore (BENCH-01/02/03 mechanism; Wave 2)
- [ ] 20-04-PLAN.md — scripts/render-benchmark-readme.mjs generator + README marker block + package.json render entry (BENCH-04 forward dep; Wave 2)
- [ ] 20-05-PLAN.md — Maintainer-machine harness execution + live JSON + BENCHMARK.md backfill + audit-set commit (BENCH-01/02/03/04 data; Wave 3, autonomous: false)
**UI hint**: yes

### Phase 21: Onboarding Polish
**Goal**: A first-run user on a fresh machine completes the setup wizard without jargon-induced confusion, sees five distinct Ollama states (not-installed / not-running / model-not-pulled / running-on-non-default-port / ready), gets a manual-download fallback when network stalls, and reads Polish copy at full parity with English.
**Depends on**: Phase 19 (Ollama consent flow already in place; wizard exercises real download/extract path; ONBOARD-04 is gated by P19)
**Requirements**: ONBOARD-01, ONBOARD-02, ONBOARD-03, ONBOARD-05, ONBOARD-06
**Success Criteria** (what must be TRUE):
  1. Every error message surfaced in `SetupView.tsx`, `ModelSetupContext.tsx`, and `OllamaSetupContext.tsx` includes a concrete next step (retry / install link / manual fallback / settings shortcut); no generic "Failed to..." strings remain.
  2. The Ollama setup flow visibly distinguishes five user-facing states — never collapsing model-not-pulled or non-default-port into an optimistic "Ready" toast; running the wizard on a VM in each of the five states renders a distinct headline + action button.
  3. A model download that receives no bytes for >30 seconds surfaces a "Connection stalled" UI state with a clickable manual-fallback link showing the direct k2-fsa download URL and target path.
  4. Polish (PL) i18n keys for setup + settings flows are at full parity with English; running the app in Polish locale shows no English fallback strings on the wizard or in the SummarySection.
  5. Wizard copy is reviewed for jargon — "Pull a model" is rephrased with user-readable context, and sensible defaults (phi4-mini, autoSummary: true, localhost:11434) are pre-selected so a user can advance without configuring anything.
**Plans**: TBD
**UI hint**: yes

### Phase 22: Clean-VM Install Validation (Gating)
**Goal**: Tagged `v1.3.0-rc.1` produces three platform artifacts that install cleanly and complete a full record→transcribe→diarize→summarize→export round-trip on real clean VMs — no dev-machine cross-contamination.
**Depends on**: Phase 19 + Phase 20 + Phase 21 (validation runs against the fully merged feature set; rc.1 tag is the artifact validated)
**Requirements**: VALIDATE-01, VALIDATE-02, VALIDATE-03, VALIDATE-04, VALIDATE-05, VALIDATE-06, RELEASE-02
**Success Criteria** (what must be TRUE):
  1. The `v1.3.0-rc.1` tag triggers the full release pipeline; all three platform artifacts (DMG, NSIS, AppImage) and a signed `latest.json` updater feed are uploaded to the draft GitHub Release with version `1.3.0-rc.1` correctly baked into every artifact name.
  2. `docs/RELEASE_VALIDATION.md` exists as a per-platform checklist filled in against the rc.1 artifacts, with screenshots / logs attached or referenced, and either pass marks or a documented known-limitation entry on every row (e.g., "no Mac VM available — validated on dev's spare Mac").
  3. NSIS installer succeeds on clean Windows 11 + Windows 10 LTSC VMs with no Visual Studio history; no VCRUNTIME140 missing-DLL crash; SmartScreen "More info → Run anyway" path is verified manually and captured for the docs phase.
  4. AppImage runs on Ubuntu 22.04 (libfuse2) + Ubuntu 24.04 (libfuse2t64) + Fedora 41 (or another non-Ubuntu Linux); the `chmod +x` step and FUSE dependency surface match what the docs phase will publish.
  5. On every validated platform, the diarization model archive downloads and extracts successfully (closes the v1.2 carry-over gate), and a full record → transcribe → diarize → summarize → export round-trip completes from clean state.
**Plans**: TBD

### Phase 23: Public v1.3.0 Release & End-User Documentation
**Goal**: A user landing on the openNotes GitHub repo sees a download CTA above the fold, an end-user-first README with inline unsigned-app workarounds and a benchmark table, supporting `docs/INSTALL.md` + `docs/FAQ.md`, and can install the tagged v1.3.0 release with screenshots that match the validated rc.1 UI.
**Depends on**: Phase 22 (README screenshots come from validated VM runs; FAQ entries reflect what actually broke on clean VMs; v1.3.0 tag must follow a passing rc.1)
**Requirements**: DOCS-01, DOCS-02, DOCS-03, DOCS-04, DOCS-05, DOCS-06, DOCS-07, DOCS-08, RELEASE-01, RELEASE-03, RELEASE-04
**Success Criteria** (what must be TRUE):
  1. `README.md` opens with end-user-first content: download CTAs pinned to `releases/latest` redirect URLs above the fold, screenshots, per-OS install steps with inline unsigned-app workarounds (macOS `xattr -dr com.apple.quarantine`, Windows SmartScreen "More info → Run anyway", Linux `libfuse2`/`libfuse2t64` install + `chmod +x`); the existing "build from source" content is demoted to the bottom.
  2. `docs/INSTALL.md`, `docs/FAQ.md`, and `docs/screenshots/*` exist; the FAQ addresses privacy / local-only verification, where user data lives, Ollama dependency reasoning, model recommendations, and how updates work; README links to all of them.
  3. README includes a "How to verify openNotes makes zero network calls" section with concrete tools/steps a user can run, system requirements (RAM / disk / supported OS versions), and a benchmark table sourced from `src/data/model-benchmarks.json` (no hand-maintained numbers in prose).
  4. `CHANGELOG.md` exists in Keep-a-Changelog format with a populated v1.3.0 entry dated the release day; phase-by-phase additions are merged into the v1.3.0 section, not written for the first time on release day.
  5. The `v1.3.0` tag is cut after rc.1 validation passes; the release pipeline runs and publishes the three platform artifacts with a pre-written GitHub Release body covering per-OS unsigned-app workarounds, Ollama install link, and hardware-tier model recommendations (no empty release body, no auto-generated commit log).
**Plans**: TBD
**UI hint**: yes

## Pitfall → Phase Mapping (from research/PITFALLS.md)

| # | Pitfall | Prevention Phase | Verification Phase |
|---|---------|------------------|--------------------|
| 1 | macOS "damaged" dialog | P23 (docs + workaround) | P22 (Safari download path) |
| 2 | Windows VCRUNTIME140.dll missing | P19 (bundle vc_redist via NSIS) | P22 (Win10 LTSC VM) |
| 3 | tar -xjf fails on Windows | P19 (pure-Rust tar+bz2) | P22 (Windows Sandbox) |
| 4 | AppImage libfuse2 missing | P23 (docs both package names) | P22 (Ubuntu 24.04 VM) |
| 5 | Ollama not installed/running | P21 (states + re-probe) + P23 (install link) | P22 (VM without Ollama) |
| 6 | First-run download cliff | P21 (stalled state, manual fallback) + P19 (SHA256, disk pre-check) | P22 (network drop sim) |
| 7 | BENCHMARK validity | P20 (warmup, N=5, hardware tiers) | P20 (self-verify) |
| 8 | Tag-triggered release mistakes | P19 (bump script + pre-flight) + P23 (rc.1 dry-run) | P22 (rc.1 artifacts) |
| 9 | bundle.targets misconfig | P19 (set targets explicitly) | P22 (artifact inventory) |
| 10 | Updater pubkey placeholder | P19 (generate keypair + set pubkey) | P22 (signed latest.json) |
| 11 | Windows SmartScreen | P23 (screenshot + click path) | P22 (Edge download) |
| 12 | Stale README screenshots | P23 (sequenced after P21 + P22) | P22 (capture during validation) |
| 13 | Polish hiding real errors | P21 (preserve state coverage) | P22 (each Ollama state) |

## Progress

**Execution Order:**
Phases execute in numeric order: 19 → 20 → 21 → 22 → 23.
- P19 must merge before P22's rc.1 tag is cut.
- P20 and P21 can run in parallel with P19 once their dependencies are satisfied (live Ollama for P20, merged backend for P21).
- P22 is gating; v1.3.0 (P23) does not tag until P22 passes.

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
| 16. Summary Templates | v1.2 | 2/2 | Complete | 2026-03-04 |
| 17. Diarization Core | v1.2 | 2/2 | Complete | 2026-03-04 |
| 18. Speaker Timeline & Attributed Summaries | v1.2 | 2/2 | Complete | 2026-03-05 |
| 19. Release-Critical Config & Packaging Blockers | v1.3 | 6/6 | Complete    | 2026-05-13 |
| 20. Benchmark Rerun & Settings Recommendation UI | v1.3 | 0/TBD | Not started | - |
| 21. Onboarding Polish | v1.3 | 0/TBD | Not started | - |
| 22. Clean-VM Install Validation (Gating) | v1.3 | 0/TBD | Not started | - |
| 23. Public v1.3.0 Release & End-User Documentation | v1.3 | 0/TBD | Not started | - |
