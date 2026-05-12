---
phase: 19-release-critical-config-packaging-blockers
plan: 03
subsystem: backend/download + frontend/error-routing
one_liner: "Pure-Rust extraction wired into both Whisper + diarization download paths with SHA256 verify, disk pre-check, structured DownloadEvent::Error.kind, and i18n-keyed frontend mapping (placeholder SHA256s pending maintainer fill-in)"
tags:
  - rust
  - download
  - extraction
  - frontend
  - error-handling
  - i18n
  - tdd
requirements:
  - EXTRACT-01
  - EXTRACT-02
  - EXTRACT-03
  - EXTRACT-04
dependency_graph:
  requires:
    - "src-tauri/src/extract.rs (Plan 19-01: ExtractError, ModelArchive, extract_tar_bz2, verify_sha256, check_disk_space)"
  provides:
    - "src-tauri/src/download.rs::WHISPER_TURBO_ARCHIVE (ModelArchive const, placeholder SHA256)"
    - "src-tauri/src/download.rs::DIARIZATION_SEGMENTATION_ARCHIVE (ModelArchive const, placeholder SHA256)"
    - "src-tauri/src/download.rs::send_extract_error helper (typed error emission)"
    - "DownloadEvent::Error.kind: Option<String> JSON field (camelCase, skip-if-none for back-compat)"
    - "src/contexts/ModelSetupContext.tsx::resolveDownloadErrorCopy (export) — kind→i18n mapping with raw-message fallback"
  affects:
    - "Plan 19-04 (tauri.conf bundle/updater) — independent, no shared symbols"
    - "Phase 21 ONBOARD-01 — needs to register the five model_download_error_* i18n keys for full UX polish"
    - "Plan 02 CONFIG-04 PR gate — already greps for REPLACE_WITH_ in src-tauri/, will catch the placeholder ModelArchive SHA256s until maintainer fills them in"
tech_stack:
  added: []
  patterns:
    - "TDD RED→GREEN cycle for both Rust (compile-fail RED via missing consts) and TypeScript (import-fail RED via missing export)"
    - "tokio::task::spawn_blocking wrap around synchronous extract_tar_bz2 (D-16 + Pitfall 6)"
    - "JoinError → ExtractError::Unknown mapping with cleanup_tmp BEFORE error emit (T-19-03-04 mitigation)"
    - "#[serde(skip_serializing_if = \"Option::is_none\")] on the new kind field for backward-compatible JSON wire format"
    - "Loosely-typed TranslatorLike helper signature so resolveDownloadErrorCopy works under both i18next strict TFunction and unit-test mocks"
key_files:
  created:
    - "src/contexts/ModelSetupContext.test.ts (4 vitest cases for resolveDownloadErrorCopy)"
    - ".planning/phases/19-release-critical-config-packaging-blockers/deferred-items.md (out-of-scope vitest discovery issue logged)"
  modified:
    - "src-tauri/src/download.rs (both tar shell-outs replaced; new consts; new helper; placeholder-gate test module appended)"
    - "src/contexts/ModelSetupContext.tsx (resolveDownloadErrorCopy export + i18n key map; both error handlers wired)"
decisions:
  - "Used diarization_model::SEGMENTATION_ARCHIVE_URL (re-export from diarization/model.rs) for the diarization ModelArchive const URL — not the URL example in the PLAN (which referenced asr-models/ instead of speaker-segmentation-models/). Single source of truth avoids URL drift."
  - "Inserted the disk pre-check after `needs_transcription_assets` / `needs_segmentation` is determined and conditional on it, so a no-op invocation (model already present) does NOT run the fs2 check unnecessarily."
  - "Maintainer SHA256 fill-in: deferred per the plan's authorized 'defer' resume signal. Placeholders are named REPLACE_WITH_SHA256_* (per B1 revision) and the Plan 02 CONFIG-04 grep will catch them at PR time. The two new model_archive_consts_tests fail at run time with explicit messages naming Plan 03 Task 0."
  - "TranslatorLike type widens the t parameter to (key: any, opts?) to bridge i18next's namespace-strict TFunction and a plain unit-test mock; without this, tsc fails because the EXTRACT_ERROR_I18N_KEYS values are not in the 'setup' namespace's literal-typed key union."
  - "Suppressed clippy::absurd_extreme_comparisons + clippy::assertions_on_constants ONLY inside the model_archive_consts_tests module — these lints fire because the const placeholder values make the asserts constant-foldable; the suppression is per-module so the rest of the file remains under -D warnings."
  - "Moved the test module to the END of download.rs (after both pub async fn's) to satisfy clippy::items_after_test_module."
metrics:
  duration: "~25 minutes wall-clock (single Opus session, includes RED→GREEN for both Rust and TS)"
  tasks_completed: 2
  files_created: 2
  files_modified: 2
  commits: 4
  tests_added: "2 Rust unit tests (intentionally failing maintainer gate) + 4 vitest cases (all passing)"
  completed_date: "2026-05-12"
---

# Phase 19 Plan 03: Wire download.rs to Pure-Rust Extract Module — Summary

## What Was Built

Both `std::process::Command::new("tar")` invocations in `src-tauri/src/download.rs` (lines ~349 and ~498 pre-change) are gone. Each model download now runs the full structured pipeline:

```
HTTP download to .tmp
  → SHA256 verify on .tmp (verify_sha256)
  → tokio::task::spawn_blocking { extract_tar_bz2(.tmp, dst) }
  → cleanup_tmp(.tmp) [always, on success or any error variant]
```

Plus a disk-space pre-check (`check_disk_space` with `ModelArchive::required_free_space()` = compressed + uncompressed + 256 MiB headroom) that runs **before** the first `download_to_file` call, per CONTEXT.md D-19 — so the user is not asked to wait for a 1.5 GB download that cannot extract.

`DownloadEvent::Error` now carries an optional `kind: Option<String>` — the stable five-value discriminator from `ExtractError::kind()`. `#[serde(skip_serializing_if = "Option::is_none")]` keeps the JSON wire format unchanged for legacy network-error sites, so no frontend regression.

The frontend (`src/contexts/ModelSetupContext.tsx`) now reads the new `kind` field via the new exported `resolveDownloadErrorCopy(t, payload)` helper, which maps the five known kinds to i18n keys (`model_download_error_corrupt_archive`, `..._disk_full`, `..._permission_denied`, `..._hash_mismatch`, `..._unknown`) and falls through to the raw `message` when (a) `kind` is absent, (b) `kind` is unrecognized, or (c) the i18n table doesn't yet have the entry (Phase 21 ONBOARD-01 polish).

## Tasks Completed

| Task | Name                                                                              | Commit    | Files                                                       |
| ---- | --------------------------------------------------------------------------------- | --------- | ----------------------------------------------------------- |
| 1.RED | Add failing ModelArchive placeholder gate                                        | `39e483a` | `src-tauri/src/download.rs`                                 |
| 1.GREEN | Wire download.rs to pure-Rust extract module                                   | `fcc273a` | `src-tauri/src/download.rs`                                 |
| 2.RED | Add failing resolveDownloadErrorCopy tests                                       | `c5a3fcc` | `src/contexts/ModelSetupContext.test.ts` (new)              |
| 2.GREEN | Wire ModelSetupContext to ExtractError kind discriminator                      | `a8a06fc` | `src/contexts/ModelSetupContext.tsx`                        |

## Verification Results

### Source-level grep acceptance criteria (all passing)

| Check                                         | Want | Got |
| --------------------------------------------- | ---- | --- |
| `std::process::Command::new("tar")`           | 0    | 0   |
| `Command::new("tar"`                          | 0    | 0   |
| `use crate::extract::`                        | ≥1   | 1   |
| `extract_tar_bz2`                             | ≥2   | 3   |
| `verify_sha256`                               | ≥2   | 3   |
| `check_disk_space`                            | ≥2   | 3   |
| `spawn_blocking`                              | ≥2   | 4   |
| `kind: Option<String>`                        | 1    | 1   |
| `pub(crate) fn send_extract_error`            | 1    | 1   |
| `pub(crate) const WHISPER_TURBO_ARCHIVE`      | 1    | 1   |
| `pub(crate) const DIARIZATION_SEGMENTATION_ARCHIVE` | 1 | 1 |
| `model_archive_consts_tests`                  | ≥1   | 2   |
| `EXTRACT_ERROR_I18N_KEYS` (frontend)          | ≥1   | 4   |
| `export function resolveDownloadErrorCopy`    | 1    | 1   |
| Five kind literals in `ModelSetupContext.tsx` | 1 ea | 1 ea |

### Build + lint

```
$ cargo check --manifest-path src-tauri/Cargo.toml --all-targets
    Finished `dev` profile [unoptimized + debuginfo]

$ cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
    Finished `dev` profile [unoptimized + debuginfo]

$ bunx tsc --noEmit
(no output — clean)
```

### Test results

```
$ cargo test --manifest-path src-tauri/Cargo.toml --test extract_archive --quiet
test result: ok. 6 passed; 0 failed   ← Plan 01 integration tests preserved

$ cargo test --manifest-path src-tauri/Cargo.toml --lib model_archive_consts_tests
test result: FAILED. 0 passed; 2 failed
  ⚠️  INTENTIONAL — fail-loud maintainer gate. See "Maintainer Follow-up" below.

$ bun run test
✓ src/contexts/ModelSetupContext.test.ts (4 tests)
Test Files: 7 passed | 2 failed (pre-existing, see Deferred Issues)
Tests: 32 passed
```

## Maintainer Follow-up (Required Before v1.3.0 Tag)

The two `ModelArchive` constants in `src-tauri/src/download.rs` ship with PLACEHOLDER values:

```rust
pub(crate) const WHISPER_TURBO_ARCHIVE: ModelArchive = ModelArchive {
    url: WHISPER_TURBO_URL,
    sha256: "REPLACE_WITH_SHA256_WHISPER_TURBO",   // ← maintainer must fill
    compressed_size: 0,                              // ← maintainer must fill
    uncompressed_size: 0,                            // ← maintainer must fill
};

pub(crate) const DIARIZATION_SEGMENTATION_ARCHIVE: ModelArchive = ModelArchive {
    url: diarization_model::SEGMENTATION_ARCHIVE_URL,
    sha256: "REPLACE_WITH_SHA256_DIARIZATION_SEGMENTATION",
    compressed_size: 0,
    uncompressed_size: 0,
};
```

The `model_archive_consts_tests::whisper_archive_sha256_is_filled_in` and `diarization_archive_sha256_is_filled_in` tests **fail at run time** with explicit messages naming Plan 03 Task 0. They will continue to fail until the maintainer:

```bash
SCRATCH=$(mktemp -d)

# --- Whisper turbo (URL: see WHISPER_TURBO_URL constant in download.rs)
curl -L -o "$SCRATCH/whisper.tar.bz2" \
  "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-whisper-turbo.tar.bz2"
sha256sum "$SCRATCH/whisper.tar.bz2"            # → WHISPER sha256 (lowercase hex, 64 chars)
stat -f%z "$SCRATCH/whisper.tar.bz2"            # macOS: WHISPER compressed_size (bytes)
# stat -c%s on Linux
mkdir -p "$SCRATCH/whisper_extract"
tar -xjf "$SCRATCH/whisper.tar.bz2" -C "$SCRATCH/whisper_extract"
du -sk "$SCRATCH/whisper_extract" | awk '{print $1 * 1024}'  # WHISPER uncompressed_size

# --- Diarization segmentation (URL is now the canonical
#     diarization_model::SEGMENTATION_ARCHIVE_URL — see Deviations below)
curl -L -o "$SCRATCH/diariz.tar.bz2" \
  "https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-segmentation-models/sherpa-onnx-pyannote-segmentation-3-0.tar.bz2"
sha256sum "$SCRATCH/diariz.tar.bz2"
stat -f%z "$SCRATCH/diariz.tar.bz2"
mkdir -p "$SCRATCH/diariz_extract"
tar -xjf "$SCRATCH/diariz.tar.bz2" -C "$SCRATCH/diariz_extract"
du -sk "$SCRATCH/diariz_extract" | awk '{print $1 * 1024}'

rm -rf "$SCRATCH"
```

Paste the six values into the two ModelArchive consts in `src-tauri/src/download.rs`. The lib tests will then pass and the Plan 02 CONFIG-04 PR grep will stop matching the `REPLACE_WITH_` literal.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Placeholder-gate tests required clippy lint suppression**
- **Found during:** Task 1 (running `cargo clippy --all-targets -- -D warnings` after wiring)
- **Issue:** Because `WHISPER_TURBO_ARCHIVE.compressed_size` and `.uncompressed_size` are const `0`, clippy's `absurd_extreme_comparisons` lint reports `> 0` as always-false; `assertions_on_constants` reports the entire `assert!` as constant-foldable. With `-D warnings` these are errors, so the test module would not compile.
- **Fix:** Added `#[allow(clippy::absurd_extreme_comparisons, clippy::assertions_on_constants)]` ONLY to the `mod model_archive_consts_tests` block. Lint suppression is intentional and temporary — once the maintainer fills in real non-zero sizes, clippy will no longer flag the comparisons (but the allow stays in place safely; clippy is a no-op on satisfied lints).
- **Files modified:** `src-tauri/src/download.rs`
- **Commit:** `fcc273a`

**2. [Rule 3 - Blocking] Test module placement after items**
- **Found during:** Task 1 (clippy run)
- **Issue:** `clippy::items_after_test_module` errored because the initial test module landed BEFORE `download_diarization_model`. The `-D warnings` policy denies it.
- **Fix:** Moved the entire `model_archive_consts_tests` module to the bottom of the file, after both `pub async fn` definitions.
- **Files modified:** `src-tauri/src/download.rs`
- **Commit:** `fcc273a`

**3. [Rule 1 - Bug] Initial doc comments leaked the literal `client.get` into the function body**
- **Found during:** Task 1 (running the structural awk gate from the plan's acceptance criteria)
- **Issue:** My first draft of the disk-pre-check comment block named the literal `client.get` to explain what the gate guards. The plan's acceptance-criteria awk gate searches for `/client\.get/` inside each function body and would falsely match those comment lines, breaking the ordering check.
- **Fix:** Reworded both comment blocks to mention only `download_to_file` (the actual download abstraction in this codebase), not the lower-level `client.get` literal that lives inside `download_to_file`.
- **Files modified:** `src-tauri/src/download.rs`
- **Commit:** `fcc273a`

**4. [Rule 1 - Bug] TranslatorLike widening for tsc strictness**
- **Found during:** Task 2 (running `bunx tsc --noEmit` after exporting `resolveDownloadErrorCopy`)
- **Issue:** `useTranslation('setup')` returns a `TFunction<"setup">` whose first arg is a strict literal-union of the 'setup' namespace's known keys. Passing the EXTRACT_ERROR_I18N_KEYS values (which are NOT in the 'setup' namespace at compile time — they're tracked under Phase 21) failed `tsc`.
- **Fix:** Introduced a `TranslatorLike = (key: any, opts?: { defaultValue?: string }) => string` type alias that accepts both i18next's strict TFunction and the unit-test mock. This is the minimum widening that preserves correctness; the runtime behavior is identical because i18next routes unknown keys to the missing-key handler which honors `defaultValue`.
- **Files modified:** `src/contexts/ModelSetupContext.tsx`
- **Commit:** `a8a06fc`

**5. [Rule 1 - Plan-vs-reality URL fix] Diarization archive URL**
- **Found during:** Task 1 Step 5 (verifying URL before pasting into ModelArchive const)
- **Issue:** The plan's example URL string for `DIARIZATION_SEGMENTATION_ARCHIVE.url` was `https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/...` but the actual constant in `src-tauri/src/diarization/model.rs::SEGMENTATION_ARCHIVE_URL` uses `releases/download/speaker-segmentation-models/...`. The plan explicitly told me to "verify exact URL in existing diarization download fn" — I did, and used the canonical existing constant `diarization_model::SEGMENTATION_ARCHIVE_URL` instead of pasting a hardcoded string. Single source of truth, no URL drift.
- **Files modified:** `src-tauri/src/download.rs`
- **Commit:** `fcc273a`

### Plan acceptance-criteria deviation (documented, not auto-fixed)

**6. [Plan ↔ code architecture mismatch] Structural awk gate uses an unsatisfiable proxy**

The plan specifies:
```bash
awk '/fn download_model[ (]/,/^}/ {if(/check_disk_space/) ds=NR; if(/client\.get/) cg=NR}
     END{exit !(ds && cg && ds<cg)}' src-tauri/src/download.rs
```
to assert that `check_disk_space` precedes the first `client.get(` call in each function. **However, neither `download_model` nor `download_diarization_model` directly calls `client.get(` in this codebase — that literal lives only at line 145 inside the `download_to_file` helper.** The functions delegate to `download_to_file`, so the literal-grep awk gate cannot pass without invasive refactoring (Rule 4 territory).

The structural intent of the gate (D-19: pre-check before HTTP download begins) IS preserved and verifiable with the semantically-correct equivalent:

```bash
awk '/fn download_model[ (]/,/^}/ {if(/check_disk_space/) ds=NR; if(/download_to_file/) cg=NR} END{exit !(ds && cg && ds<cg)}' src-tauri/src/download.rs
# exit 0 — check_disk_space at line 266 < first download_to_file at line 352

awk '/fn download_diarization_model[ (]/,/^}/ {if(/check_disk_space/) ds=NR; if(/download_to_file/) cg=NR} END{exit !(ds && cg && ds<cg)}' src-tauri/src/download.rs
# exit 0 — check_disk_space at line 487 < first download_to_file at line 647
```

Both pass. The plan's literal awk gate is a real defect in the plan (it assumed `client.get` would be inline), not a defect in the implementation. Recommend updating the plan or its acceptance script in a future Plan 03.5 / planning-tools cleanup.

### Authentication Gates

None encountered — fully autonomous within the executor's scope.

### Maintainer-checkpoint deferral

Task 0 (the human checkpoint for SHA256 + size capture) was deferred per the plan's authorized `defer` resume signal. The two-layer defense remains intact:

- **Test-time gate:** `model_archive_consts_tests` (run-time fail until placeholders are replaced)
- **CI gate (Plan 02 CONFIG-04):** PR-time grep for `REPLACE_WITH_` in `src-tauri/`

Both must pass before v1.3.0 can ship. This matches the plan's explicit defense-in-depth design (per `<checkpoint_handling>` and Step 5 sub-step (c) of Task 1).

## Deferred Issues

Two pre-existing test-file failures observed during `bun run test`:

```
FAIL scripts/release-bump.test.mjs                                       (No test suite found in file)
FAIL .claude/worktrees/agent-aec4453020c066cf2/scripts/release-bump.test.mjs  (duplicate of the above)
```

The file uses `node:test` (Node's built-in test runner), not vitest, so vitest reports it as an empty suite. Pre-existing from Plan 19-02; out of scope per SCOPE BOUNDARY rule. Logged to `.planning/phases/19-release-critical-config-packaging-blockers/deferred-items.md` for the planner.

## Threat Surface Coverage

The plan's `<threat_model>` is fully addressed:

| Threat ID | Status | Evidence |
|-----------|--------|----------|
| T-19-03-01 (placeholder SHA256 ships in release) | mitigated | Two layers: failing unit tests + Plan 02 CONFIG-04 grep |
| T-19-03-02 (TOCTOU on disk_full) | accepted | Concurrent disk-fill becomes CorruptArchive instead of DiskFull — still typed |
| T-19-03-03 (frontend trusts kind for i18n) | accepted | In-process trust boundary; key→string mapping has no code-execution path |
| T-19-03-04 (spawn_blocking panic leaks .tmp) | mitigated | Err(join_err) branch always calls cleanup_tmp BEFORE emitting error |
| T-19-03-05 (paths in error messages) | accepted | Local-only desktop app |
| T-19-03-06 (back-compat regression) | mitigated | `skip_serializing_if = "Option::is_none"` + `payload.kind ?? undefined` + 4 vitest cases covering absent/unknown/known-translated/known-missing |

No new threat surface introduced.

## Self-Check: PASSED

- File `src-tauri/src/download.rs` modified — `Command::new("tar")` count: **0**
- File `src/contexts/ModelSetupContext.tsx` modified — `EXTRACT_ERROR_I18N_KEYS` defined: **yes**
- File `src/contexts/ModelSetupContext.test.ts` created: **FOUND**
- Commit `39e483a` (test 19-03 RED ModelArchive gate): **FOUND**
- Commit `fcc273a` (feat 19-03 wire download.rs): **FOUND**
- Commit `c5a3fcc` (test 19-03 RED frontend): **FOUND**
- Commit `a8a06fc` (feat 19-03 wire frontend): **FOUND**
- `cargo check --all-targets`: clean
- `cargo clippy --all-targets -- -D warnings`: silent
- `cargo test --test extract_archive`: 6/6 pass (Plan 01 preserved)
- `bunx tsc --noEmit`: clean
- `bun run test` ModelSetupContext.test.ts: 4/4 new tests pass; 32/32 total tests pass
- `model_archive_consts_tests`: FAILS as designed (maintainer gate)

All claims independently verified.
