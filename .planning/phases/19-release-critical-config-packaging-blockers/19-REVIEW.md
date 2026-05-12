---
phase: 19-release-critical-config-packaging-blockers
reviewed: 2026-05-12T00:00:00Z
depth: standard
files_reviewed: 24
files_reviewed_list:
  - .gitattributes
  - .github/workflows/ci.yml
  - .github/workflows/release.yml
  - docs/RELEASE_KEYS.md
  - package.json
  - scripts/release-bump.mjs
  - scripts/release-bump.test.mjs
  - src-tauri/Cargo.toml
  - src-tauri/src/commands.rs
  - src-tauri/src/download.rs
  - src-tauri/src/extract.rs
  - src-tauri/src/lib.rs
  - src-tauri/src/llm/setup.rs
  - src-tauri/tauri.conf.json
  - src-tauri/tests/extract_archive.rs
  - src-tauri/vendor/README.md
  - src-tauri/windows/hooks.nsh
  - src/components/OllamaConsentModal.tsx
  - src/contexts/ModelSetupContext.test.ts
  - src/contexts/ModelSetupContext.tsx
  - src/contexts/OllamaSetupContext.test.tsx
  - src/contexts/OllamaSetupContext.tsx
  - src/views/SetupView.tsx
  - vite.config.ts
findings:
  critical: 6
  warning: 9
  info: 6
  total: 21
status: issues_found
---

# Phase 19: Code Review Report

**Reviewed:** 2026-05-12
**Depth:** standard
**Files Reviewed:** 24
**Status:** issues_found

## Summary

Phase 19 ships infrastructure for release-critical packaging: pure-Rust tar.bz2
extraction with SHA256 verification, a version-bump script + CI preflight, NSIS
post-install hooks, a Tauri updater pubkey runbook, and a macOS Ollama consent
dialog. The extraction module (extract.rs) and consent guard (check_consent +
OllamaSetupContext flow) are well-structured with explicit test coverage.

Several BLOCKER issues remain that will either prevent a release from building
or punch a hole in the trust chain that Phase 19 was specifically supposed to
close:

1. **Build-time time-bomb (BLOCKER):** `tauri.conf.json` declares
   `bundle.resources: ["vendor/vc_redist.x64.exe"]`, but that file is not
   present in `src-tauri/vendor/` (only `README.md` is). Any release build will
   fail at bundle time on every platform (Tauri resolves bundle.resources
   regardless of installer target). The CI `REPLACE_WITH_` grep does not catch
   a missing file.
2. **Updater pubkey placeholder will pass the CI grep (BLOCKER):** The
   `release-config-check` job greps the *files* `tauri.conf.json`, `Cargo.toml`,
   `package.json`, `download.rs` — but on a real release, the pubkey will be
   replaced and the SHA256 constants (the two most security-critical
   placeholders) will be replaced. The remaining trust-chain hole is that the
   `model_archive_consts_tests` unit tests are the only gate, and those run only
   in the Rust `cargo test` step — not in the `release-config-check` quick gate
   listed on the release page. More urgently, `model::check_transcription_assets_ready`
   is referenced in download.rs but the model archive `compressed_size` /
   `uncompressed_size` are set to `0`, so `check_disk_space` is called with a
   `required_free_space()` of exactly 256 MiB (HEADROOM only) — far too small —
   and the pre-flight will silently pass for users who have nothing close to
   the actual ~3.6 GB needed. This persists until the maintainer fills the
   constants; until then the disk pre-check is functionally disabled but the
   `verify_sha256` will reject a download against a `REPLACE_WITH_...` literal.
3. **Ollama installer is downloaded over plain HTTPS with no SHA256 or
   Authenticode verification, then `cp -R`'d into `/Applications` (BLOCKER).**
   This is a TOFU supply-chain pattern: any attacker who can MITM ollama.com,
   compromise their CDN, or substitute the redirect target gets arbitrary code
   execution on the user's Mac (the bundle replaces an existing `/Applications/Ollama.app`).
   The consent modal shows the URL — but consent is not a substitute for an
   integrity check.
4. **NSIS hook silently swallows missing vc_redist binary (BLOCKER for
   Windows users).** When `$INSTDIR\resources\vendor\vc_redist.x64.exe` is not
   present, the hook only `DetailPrint`s a warning and jumps to
   `vcredist_done`. The user gets a "successful" install of an app that will
   then fail to launch with `VCRUNTIME140.dll missing`. Combined with finding
   #1, every Windows release built today produces exactly this state.
5. **Release-bump script's "atomic" claim is misleading (BLOCKER).** Tmp files
   are written one-at-a-time and renamed; if step 2 or 3 fails after step 1
   succeeded, the repo is left in a half-bumped state. The error message says
   "review git diff" but the user is being asked to recover from a partially
   committed state on a release branch — exactly when the cost of failure is
   highest.
6. **`auto_setup_ollama` `Ok(bytes) => bytes` discards return value (BLOCKER
   correctness).** In `download.rs`, the outer `match download_attempt` arm
   for whisper says `Ok(bytes) => bytes,` which compiles but the value is
   thrown away — `downloaded_so_far` is never updated for the model archive.
   This causes the diarization-archive download's progress bar to start from
   the wrong base, but more importantly, it's a code smell suggesting the
   author intended to track total bytes for downstream computation and forgot.

Warnings include: hard-coded "30 seconds" timeout string in error message that
drifts from the actual constant, a non-portable `awk`/`sed` pipeline in
`release.yml` that strips quotes but does not handle TOML quote escapes, the
`autoSetup` flow leaks the consent resolver if the component unmounts while
suspended (`consentResolverRef` is never cleaned up in unmount cleanup), and the
download `total_bytes` parameter ignores the case where the VAD download
completes between the HEAD request and the GET (the user sees backward progress).

Info items cover style/maintainability around magic numbers, naming
inconsistency, and a test fixture's `corrupt.tar.bz2` whose corruption mode is
undocumented.

## Critical Issues

### CR-01: Missing `vc_redist.x64.exe` will break every Windows release build

**File:** `src-tauri/tauri.conf.json:32`, `src-tauri/vendor/README.md:1-7`,
`src-tauri/windows/hooks.nsh:41-44`

**Issue:** `tauri.conf.json` declares
```json
"resources": ["vendor/vc_redist.x64.exe"]
```
but the file is not committed (the vendor directory contains only `README.md`).
Tauri's bundler resolves `bundle.resources` during the platform-agnostic
`tauri build` phase; a missing resource fails the build on every target (not
just Windows). Even if the build somehow proceeds on macOS/Linux (which it
will not), the NSIS hook silently `Goto vcredist_done`s without installing
anything, producing a Windows installer that ships an app that immediately
fails to launch with `VCRUNTIME140.dll missing`. The vendor README admits
this is a known TODO and points at "Plan 05 Task 1" — but the config file
and the CI release path do not gate on it.

**Fix:**
1. Either commit the binary (after SHA256 + Authenticode verification per the
   README procedure) before the next release tag, OR remove `"vendor/vc_redist.x64.exe"`
   from `tauri.conf.json` `bundle.resources` until it is committed.
2. Add a release.yml preflight step that asserts the file exists and matches a
   pinned SHA256 (similar to the REPLACE_WITH_ grep). Example:
```bash
EXPECTED_SHA="<pinned-lowercase-hex>"
ACTUAL=$(sha256sum src-tauri/vendor/vc_redist.x64.exe | cut -d' ' -f1)
[ "$ACTUAL" = "$EXPECTED_SHA" ] || { echo "::error::vc_redist.x64.exe hash mismatch"; exit 1; }
```
3. The NSIS hook's "skip on missing binary" branch (hooks.nsh:41-44) silently
   ships a broken app. Change `DetailPrint` to `MessageBox MB_ICONSTOP|MB_OK`
   and `Abort` so the install fails loudly instead of producing a non-launching
   install.

---

### CR-02: Ollama installer download has no integrity verification before installation to `/Applications`

**File:** `src-tauri/src/llm/setup.rs:159-216`, `253-275`

**Issue:** `download_ollama_zip` fetches `https://ollama.com/download/Ollama-darwin.zip`,
writes it to `/tmp`, and then `install_ollama_app` shell-outs to `cp -R` the
extracted `Ollama.app` into `/Applications/`. There is no SHA256 check, no
Authenticode/codesign verification (`codesign --verify --deep --strict
/Applications/Ollama.app` is not invoked), and no signature pinning. The
consent modal (CR-attested by the user) does not replace integrity: HTTPS
guarantees transport, not content. Any of (a) ollama.com CDN compromise, (b)
DNS hijack on the user's network combined with a substituted CA, or (c) an
upstream subdomain takeover yields arbitrary code execution as the user, with
a path written into `/Applications/Ollama.app` that the next macOS boot will
trust because the user just consented.

This is exactly the trust-chain problem that the Whisper/diarization model
download solves (D-17: pinned SHA256 in code, `verify_sha256` before
extraction). It is inconsistent that the Ollama path skips it.

**Fix:** Either:
1. Pin Ollama by SHA256 (preferred, matching the model archive pattern):
```rust
const OLLAMA_DARWIN_ZIP_SHA256: &str = "<pinned-lowercase-hex>";
// after download_ollama_zip:
if let Err(err) = crate::extract::verify_sha256(&zip_path, OLLAMA_DARWIN_ZIP_SHA256) {
    cleanup_tmp(&zip_path);
    send_error(on_event, "verifying_ollama", &err.message());
    return Err(err.message());
}
```
2. OR verify Apple codesign signature post-extraction before `cp -R`:
```rust
let status = std::process::Command::new("/usr/bin/codesign")
    .arg("--verify").arg("--deep").arg("--strict")
    .arg(&extracted_app).status()?;
if !status.success() { return Err("Ollama.app codesign verification failed".into()); }
```
3. Document the threat model: if the team consciously accepts TOFU because
   Ollama upstream rotates the binary frequently and pinning would force
   maintenance every release, then state that in `docs/SECURITY.md` and
   surface "This installer is verified by HTTPS only" in the consent modal copy.

---

### CR-03: Disk pre-check is silently bypassed while archive size constants are zero

**File:** `src-tauri/src/download.rs:40-52, 266-272, 486-495`,
`src-tauri/src/extract.rs:35-37`

**Issue:** `WHISPER_TURBO_ARCHIVE` and `DIARIZATION_SEGMENTATION_ARCHIVE` are
both declared with `compressed_size: 0, uncompressed_size: 0`. The
`required_free_space()` helper computes `compressed_size + uncompressed_size +
HEADROOM_BYTES`, so until the maintainer fills these in, `check_disk_space` is
called with `0 + 0 + 256 MiB = 256 MiB`. A user with 300 MiB free will pass the
pre-check and then fail mid-extraction with a generic I/O error (the typed
`DiskFull` error never fires because the actual disk-full condition surfaces
inside `tar::Archive::unpack`, which the `extract_tar_bz2` code maps to
`CorruptArchive`, NOT `DiskFull`).

The unit test gate `whisper_archive_sha256_is_filled_in` asserts
`compressed_size > 0 && uncompressed_size > 0`, so the CI `cargo test` step
fails until placeholders are replaced — but the CI grep gate (release-config-check)
only inspects `download.rs` for the string `REPLACE_WITH_`, which matches the
sha256 placeholder but NOT the `0` integer literals. Two of the three gates
miss this regression mode.

**Fix:**
1. Add a Rust compile-time assertion that fails the build (not just tests) when
   the sizes are zero. Example using `const _: () = assert!(...)`:
```rust
const _: () = assert!(
    WHISPER_TURBO_ARCHIVE.compressed_size > 0
    && WHISPER_TURBO_ARCHIVE.uncompressed_size > 0,
    "WHISPER_TURBO_ARCHIVE sizes must be set before release; see plan 03"
);
```
   This will fail `cargo check` in CI, not just `cargo test`.
2. In `extract_tar_bz2`, distinguish disk-full from corrupt by inspecting the
   io::ErrorKind: `ErrorKind::StorageFull` (nightly) or string-match `"No space
   left on device"` / `errno == ENOSPC` to emit a typed `DiskFull` even mid-extraction.
3. Add a runtime check at the start of `download_model` / `download_diarization_model`:
```rust
if WHISPER_TURBO_ARCHIVE.compressed_size == 0 {
    return Err("model archive size constants not configured — this is a build bug".to_string());
}
```

---

### CR-04: NSIS hook silently ships a broken Windows install when vc_redist binary is missing

**File:** `src-tauri/windows/hooks.nsh:40-44`

**Issue:** When `$INSTDIR\resources\vendor\vc_redist.x64.exe` does not exist
(which is the current state — see CR-01), the hook executes:
```nsis
${IfNot} ${FileExists} "$INSTDIR\resources\vendor\vc_redist.x64.exe"
  DetailPrint "WARNING: bundled vc_redist.x64.exe not found ... — skipping; app may fail to launch with VCRUNTIME140.dll missing."
  Goto vcredist_done
${EndIf}
```
`DetailPrint` writes to the installer log window only. The user sees a
"successful" install. They launch the app, get a `VCRUNTIME140.dll missing`
Windows error dialog, and have no actionable error message. This is the
worst-case Windows UX.

**Fix:** Hard-fail the install when the binary is missing AND VC++ Redist is
not already installed:
```nsis
${IfNot} ${FileExists} "$INSTDIR\resources\vendor\vc_redist.x64.exe"
  MessageBox MB_ICONSTOP|MB_OK \
    "Installation cannot continue: the Visual C++ Redistributable installer is missing from this build, and your system does not have it installed.$\r$\n$\r$\nThis is a build defect. Please report at https://github.com/farce1/opennotes/issues and install VC++ Redist manually from:$\r$\nhttps://aka.ms/vs/17/release/vc_redist.x64.exe"
  Abort
${EndIf}
```
Alternatively, if you want to be permissive (allow install but warn loudly),
replace `DetailPrint` with `MessageBox MB_ICONEXCLAMATION|MB_OK` so the user
SEES the warning before clicking Finish.

---

### CR-05: release-bump.mjs is not atomic across files; failure leaves repo half-bumped

**File:** `scripts/release-bump.mjs:62-78`

**Issue:** The script header advertises "atomic version bump across three
files." Implementation is per-file `tmp+rename`, sequentially. If
`updateCargoToml` succeeds but `updateTauriConfJson` fails (disk full, file
locked by editor, permission flap), the repo state is `package.json:NEW,
Cargo.toml:NEW, tauri.conf.json:OLD`. The catch block prints "may be in an
inconsistent state — review git diff" and exits 1, which is correct
error-reporting but contradicts the "atomic" framing.

This matters because the release workflow's "Assert version files match
release tag" step (release.yml:64-100) is the safety net — IF the user
notices the script failed and re-runs. But if they don't notice (the dirty-
tree check then refuses re-run unless `--force`), they end up tagging from a
half-updated state.

**Fix:** Read all three files first, mutate them all in memory, write all tmp
files, then rename in a tight loop with a panic guard that attempts rollback:
```js
function main() {
  // ... existing validation ...

  // 1. READ all three files first (fail-fast on parse errors).
  const fileOps = [
    { path: PKG_JSON,   read: readPackageJsonVersion, build: () => buildPkgJsonContent(version) },
    { path: CARGO_TOML, read: readCargoVersion,       build: () => buildCargoTomlContent(version) },
    { path: TAURI_JSON, read: readTauriConfVersion,   build: () => buildTauriJsonContent(version) },
  ];

  // 2. Build all new contents in memory; fail before any disk write.
  const newContents = fileOps.map((op) => ({ ...op, oldText: readFileSync(op.path, 'utf8'), newText: op.build() }));

  // 3. Write all tmp files; if ANY fails, unlink all written tmps before throwing.
  const written = [];
  try {
    for (const op of newContents) {
      writeFileSync(op.path + '.bump.tmp', op.newText);
      written.push(op.path + '.bump.tmp');
    }
    for (const tmp of written) renameSync(tmp, tmp.replace(/\.bump\.tmp$/, ''));
  } catch (e) {
    for (const tmp of written) { try { unlinkSync(tmp); } catch {} }
    throw e;
  }
}
```
If you want true atomicity, do the writes in `git stash`/`git reset` paired
with a single `git commit` at the end — but the README explicitly says
"does NOT commit", so the tmp-rename-rollback shape above is the right fit.

---

### CR-06: `Ok(bytes) => bytes` in download.rs match arm discards a meaningful return value

**File:** `src-tauri/src/download.rs:348-395`

**Issue:** The outer match on `download_attempt` for the whisper archive has:
```rust
match download_attempt {
    Ok(bytes) => bytes,                              // <-- discarded
    Err(err) if err == "range_not_satisfiable" => { ... let bytes = ...; bytes  /* also discarded */ }
    Err(err) if err == "cancelled" => { ... return Err(err); }
    Err(err) => { ... return Err(err); }
};
```
The match expression's value is `()` from the surrounding `let _ = ...;` (no
let binding present — the `;` at line 395 discards). Compare to the
diarization-segmentation flow at line 573-575 which correctly does
`let segmentation_downloaded = match ...; downloaded_so_far = downloaded_so_far.saturating_add(segmentation_downloaded);`.
The whisper flow never updates `downloaded_so_far` for the archive, so any
subsequent download in the same invocation reports wrong total progress. In
the current `download_model` flow there is no subsequent download after the
whisper archive (extraction follows directly), so this is latent — but it is
the kind of inconsistency that breaks the next time someone adds a step.

More importantly, the `let _embedding_downloaded = match ...` at line 630 in
the diarization path uses the same pattern but with `let _ =` prefix to
silence the unused-variable warning. The whisper match at 348 has no `let`
binding at all, meaning the `bytes` identifier on line 349 is *currently
unbindable to anything* — `clippy` should flag this. Verify with
`cargo clippy --all-targets --all-features -- -D warnings`; if it doesn't
trigger, that's an additional bug in clippy or in the lint config.

**Fix:** Either bind and use it, or silence intentionally:
```rust
let _whisper_archive_bytes = match download_attempt {
    Ok(bytes) => bytes,
    Err(err) if err == "range_not_satisfiable" => {
        // ... inner match ...
        match inner_result {
            Ok(bytes) => bytes,
            // ...
        }
    }
    // ...
};
// If the value is genuinely unused, prefer:
// let _ = download_attempt;  // intent: download for side-effect (tmp file written)
```
Or, if total progress is supposed to be tracked downstream:
```rust
let whisper_bytes = match download_attempt { ... };
downloaded_so_far = downloaded_so_far.saturating_add(whisper_bytes);
```

---

## Warnings

### WR-01: Hardcoded "30 seconds" in Ollama-startup error message drifts from the timeout constant

**File:** `src-tauri/src/llm/setup.rs:22, 310, 317`

**Issue:** The constant is `OLLAMA_START_TIMEOUT_SECS: u64 = 30`. The error
message at line 317 is hardcoded as `"Ollama did not start within 30 seconds"`.
Changing the constant to e.g. 45 leaves the message lying to the user.

**Fix:**
```rust
Err(format!("Ollama did not start within {OLLAMA_START_TIMEOUT_SECS} seconds"))
```

---

### WR-02: Consent resolver is never cleaned up on unmount, leaking a hanging promise

**File:** `src/contexts/OllamaSetupContext.tsx:236-251, 324-330`

**Issue:** `autoSetup` does `await new Promise((resolve) => { consentResolverRef.current = resolve; })`.
If `OllamaSetupProvider` unmounts while the modal is open (e.g., user
navigates to a different route via the React Router that wraps SetupView),
the promise never resolves. The dangling promise pins React state setters
behind it, which subsequent code calls (`setConsentModalOpen(false)`,
`setSetupPhase('not_installed')`) on an unmounted component — React 19 will
log a warning. Worse, the `invoke('auto_setup_ollama', ...)` IPC never fires,
so backend state and frontend state diverge.

The cleanup `useEffect` at line 324-330 only clears the poll timer and
`pullChannelRef`; it does not resolve a pending consent.

**Fix:** Resolve as "declined" on unmount:
```ts
useEffect(
  () => () => {
    stopPolling();
    pullChannelRef.current = null;
    // Resolve any in-flight consent as decline so the awaiter unwinds.
    if (consentResolverRef.current) {
      const r = consentResolverRef.current;
      consentResolverRef.current = null;
      r(false);
    }
  },
  [stopPolling],
);
```

---

### WR-03: release.yml awk/sed pipeline does not handle quoted values containing escaped quotes

**File:** `.github/workflows/release.yml:75-76`

**Issue:**
```bash
CARGO_VER=$(awk '/^\[package\]/{p=1;next}/^\[/{p=0}p && /^version[[:space:]]*=/{print;exit}' src-tauri/Cargo.toml | sed -E 's/.*"([^"]+)".*/\1/')
```
The `sed -E 's/.*"([^"]+)".*/\1/'` is greedy on the leading `.*`, so a value
like `version = "1.0.0"  # "previous": "0.9.0"` (someone added a comment with
embedded quotes) will match the LAST quoted span and return `"0.9.0"`. The
release-bump script wouldn't produce this state, but a human edit to
Cargo.toml could. The TOML spec also allows literal strings (`version = '1.0.0'`)
and multiline strings, which this sed misses entirely.

**Fix:** Use a TOML-aware parser. Bun and Node 22+ both have one. Or:
```bash
CARGO_VER=$(grep -m1 -A0 '^version[[:space:]]*=' src-tauri/Cargo.toml | head -1 | sed -E 's/^version[[:space:]]*=[[:space:]]*"([^"]+)".*$/\1/')
```
Or invoke `cargo metadata --format-version=1 --no-deps | jq -r '.packages[0].version'`,
which is the actual canonical source of truth and matches what `tauri build`
will embed.

---

### WR-04: `total_bytes` computed once before downloads can decrease mid-flight, causing backward progress bar

**File:** `src-tauri/src/download.rs:274-284`

**Issue:** `vad_total + model_total` is computed via HEAD requests BEFORE any
download begins. If the VAD file is already partially downloaded as a `.tmp`
in `models_dir` (the directory is never cleaned), and `needs_vad` is true,
the first call to `download_to_file` deletes the partial because `resumable:
false` for VAD. The `total_bytes` parameter passed into the inner function
still includes both VAD and model, so the user sees progress at
`(0 + existing_partial) / (vad_total + model_total)` momentarily, then drops
back to `0 / total` after the cleanup. Minor UX, but a regression check is
warranted.

Separately: if the HEAD request to the server returns 0 (server doesn't
advertise Content-Length, which is true for some CDN setups), `total_bytes` is
0 and the frontend's `progressPercent` calc falls back to 0% for the duration.
The downloaded bar will show "0 / 0" until completion.

**Fix:** Allow `total_bytes` to be re-anchored from the actual response's
Content-Length when the original HEAD returned 0 — already partially done at
line 192-198. Document this in the comment.

---

### WR-05: `cancel_download` deletes `.tmp` files in `models_dir` but does NOT clean the diarization subdirectory

**File:** `src-tauri/src/commands.rs:623-641`

**Issue:** `cancel_download` reads `data_dir/models/` and removes `.tmp` files
there. The diarization download (download_diarization_model) writes its
archive tmp into `diarization_models_dir(data_dir)` which is (per the model
module) a subdirectory like `data_dir/diarization-models/` — NOT
`data_dir/models/`. So cancelling a diarization download leaves an orphan
multi-hundred-MB `.tmp` file on disk forever.

The download flow itself handles `cancelled` via `cleanup_tmp(&archive_tmp)`
inside `download_diarization_model`, so for the in-flight worker case this is
handled. But if the user clicks cancel after `cancel_flag` is set but before
the worker observes it (rare but possible), the cmd helper's selective cleanup
will miss the diarization path.

**Fix:** Recurse or iterate over all known model subdirectories:
```rust
let dirs = [
    data_dir.inner().0.join("models"),
    diarization_model::diarization_models_dir(data_dir.inner().0.as_path()),
];
for dir in &dirs {
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) == Some("tmp") {
                let _ = std::fs::remove_file(&path);
            }
        }
    }
}
```

---

### WR-06: `extract_tar_bz2` does NOT enforce a decompression-bomb ceiling

**File:** `src-tauri/src/extract.rs:146-163`

**Issue:** The function relies entirely on `tar 0.4` default behavior for path
sanitization (which is fine — and is documented). However, it does NOT impose
any cap on the *total uncompressed size* of the archive. A maliciously crafted
.tar.bz2 (or a corrupted one that decompresses pathologically) can fill the
disk: bzip2 routinely achieves 100:1 ratio for repetitive content, and tar
itself has no internal ceiling. The pre-flight `check_disk_space` uses
`uncompressed_size` from `ModelArchive` — but the actual write loop inside
`Archive::unpack` happens AFTER the pre-check and trusts the archive.

The SHA256 verification before extraction (line 400 in download.rs) is the
primary defense — it pins the exact bytes — so for the model-archive path
this is mitigated. BUT: `extract_tar_bz2` is `pub` and now part of the public
crate surface (`pub mod extract` in lib.rs:6), so future callers that
extract un-pinned tarballs (e.g., a future user-import feature) inherit this
risk silently.

**Fix:** Add a `max_uncompressed_bytes` parameter and enforce during
extraction by wrapping the decoder in a counting reader:
```rust
struct CountingReader<R: Read> { inner: R, count: u64, max: u64 }
impl<R: Read> Read for CountingReader<R> {
    fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
        let n = self.inner.read(buf)?;
        self.count = self.count.saturating_add(n as u64);
        if self.count > self.max {
            return Err(std::io::Error::new(std::io::ErrorKind::InvalidData, "decompression bomb"));
        }
        Ok(n)
    }
}

pub fn extract_tar_bz2(src: &Path, dst: &Path, max_uncompressed: u64) -> Result<(), ExtractError> {
    let file = File::open(src).map_err(...)?;
    let decoder = DecoderReader::new(file);
    let bounded = CountingReader { inner: decoder, count: 0, max: max_uncompressed };
    let mut archive = Archive::new(bounded);
    archive.unpack(dst).map_err(...)
}
```
For known archives, pass `uncompressed_size * 1.05` as the cap. Document in
the doc-comment that callers MUST pass a real cap, never `u64::MAX`.

---

### WR-07: `format!("{:x}", hasher.finalize())` for SHA256 — verify alignment with Tauri signing tooling

**File:** `src-tauri/src/extract.rs:116-122`

**Issue:** Using `{:x}` format on a GenericArray produces a debug-style output
that varies between sha2 versions. In `sha2 = "=0.10.9"`, `{:x}` on
`GenericArray<u8, U32>` is documented to produce a lowercase hex string of
the digest. This works currently; the test fixture's stored SHA matches
`shasum -a 256` output. Should `sha2` change `Display`/`LowerHex` behavior in
a future patch, this could silently produce wrong-format output and fail
verification against existing fixtures.

The pin `=0.10.9` mitigates this — good. But the doc comment doesn't mention
that the format is contractually tied to the sha2 version.

**Fix:** Comment why the version is pinned and consider using
`hex::encode(&hasher.finalize())` (adds a `hex` crate dep but documents the
intent explicitly). Less ambiguous formatter:
```rust
let digest = hasher.finalize();
let actual = digest.iter().map(|b| format!("{:02x}", b)).collect::<String>();
```

---

### WR-08: NSIS hook does not handle the `--silent` / non-interactive install case

**File:** `src-tauri/windows/hooks.nsh:57-60`

**Issue:** The `MessageBox MB_ICONEXCLAMATION|MB_OK` on a non-zero exit code
will block forever on a silent / scripted / SCCM-style installation. Per
NSIS docs, `MB_ICONEXCLAMATION` displays modally; in silent mode the user
cannot click OK, and the install hangs indefinitely.

**Fix:** Check `${Silent}` or `IfSilent`:
```nsis
${If} $0 != 0
${AndIf} $0 != 1638
${AndIf} $0 != 3010
  IfSilent +3
    MessageBox MB_ICONEXCLAMATION|MB_OK "Visual C++ Redistributable install returned exit code $0. ..."
  Goto +2
    DetailPrint "Visual C++ Redistributable install returned exit code $0 (silent install — see log)."
${EndIf}
```

---

### WR-09: `consentResolverRef` not guarded against double-resolve

**File:** `src/contexts/OllamaSetupContext.tsx:332-336`

**Issue:** `resolveConsent` reads `consentResolverRef.current`, clears it, and
calls the resolver. If the user double-clicks "Confirm" or simultaneously
triggers Escape + Confirm (e.g., via assistive tech), the second call has
`consentResolverRef.current === null` and is a no-op — that part is fine.

But the modal `onConfirm={() => resolveConsent(true)}` and the bg-button
`onClick={onDecline}` (which calls `resolveConsent(false)`) can race: a user
might click confirm and then immediately mouse-click the dimmed backdrop
button. The first wins because the ref is nulled, but the consent state
already transitioned. No correctness bug, but the UI doesn't immediately
close the modal because `setConsentModalOpen(false)` happens after the
`await` returns. During the gap the modal is visible with confirmed state.

**Fix:** Set `consentModalOpen` to false synchronously inside `resolveConsent`:
```ts
const resolveConsent = useCallback((consented: boolean) => {
  const resolver = consentResolverRef.current;
  consentResolverRef.current = null;
  // Hide modal immediately to prevent double-click races.
  setConsentModalOpen(false);
  if (resolver) resolver(consented);
}, []);
```

---

## Info

### IN-01: `corrupt.tar.bz2` test fixture's corruption mode is undocumented

**File:** `src-tauri/tests/extract_archive.rs:22-24, 66-73`

**Issue:** The test asserts `Err(ExtractError::CorruptArchive(_))` for the
`corrupt.tar.bz2` fixture, but the test file does not describe HOW the fixture
is corrupted (bzip2 stream truncation? tar header munge? both?). A future
maintainer regenerating fixtures may inadvertently produce a file that fails
at a different layer (e.g., decompressing successfully but failing tar parse),
which still satisfies the assertion but no longer covers what it was meant to
cover.

**Fix:** Add a comment near the fixture path:
```rust
// corrupt.tar.bz2 was generated by truncating valid.tar.bz2 at byte 64
// (mid-bzip2-stream). This exercises the DecoderReader error path; if the
// fixture is regenerated, ensure the corruption hits bzip2_rs, not tar.
fn corrupt_bz2() -> PathBuf { ... }
```
Or add a `README.md` to `tests/fixtures/` documenting generation commands.

---

### IN-02: `head_size_with_timeout` uses 5s but `resolve_download_metadata` doc-comment says "5s"

**File:** `src-tauri/src/llm/setup.rs:122-126, 132`

**Issue:** Doc-comment is consistent with code (good). But the constant is
inlined rather than named. If another HEAD call site (e.g., `content_length`
at line 80) uses a different default, a maintainer must hunt for the value.

**Fix:**
```rust
const HEAD_REQUEST_TIMEOUT: Duration = Duration::from_secs(5);
// ... use everywhere ...
```

---

### IN-03: `formatBytes` duplicated between OllamaConsentModal.tsx and SetupView.tsx

**File:** `src/components/OllamaConsentModal.tsx:21-27`, `src/views/SetupView.tsx:22-28`

**Issue:** Identical helper defined twice. If one is updated (e.g., to add KB
or to use binary prefix `MiB`), the other will drift.

**Fix:** Extract to `src/lib/format.ts` or similar.

---

### IN-04: `Cargo.toml` pins three crates with `=0.x.y` but lacks a comment cross-referencing the supply-chain rationale

**File:** `src-tauri/Cargo.toml:46-50`

**Issue:** Line 46 has the rationale comment; `bzip2-rs = "=0.1.2"`,
`sha2 = "=0.10.9"`, `fs2 = "=0.4.3"` are pinned but the comment only covers
"pure-Rust archive extraction + integrity check." For example, `fs2` is for
disk-space queries (not directly extraction or integrity), and `sha2` 0.10.x
has had multiple security advisories — a pin needs explicit justification.

**Fix:** Add inline comments:
```toml
# Pinned: stream-decompression for tar.bz2 model archives. Hash output format
# is part of our test contract (see extract.rs WR-07 review note).
sha2 = "=0.10.9"
# Pinned: only used for cross-platform disk-space query (data_dir free space).
# 0.4.3 supports macOS/Linux/Windows; newer releases (none as of pin date)
# would require re-validation.
fs2 = "=0.4.3"
```

---

### IN-05: `OllamaSetupContext.tsx` consent flow does not handle `get_ollama_download_metadata` returning `null`

**File:** `src/contexts/OllamaSetupContext.tsx:222-235`

**Issue:** The `try { metadata = await invoke ... } catch { metadata = { ... fallback ... } }` block
handles the throw case. But the backend `resolve_download_metadata` on
non-macOS returns `{ source_domain: "ollama.com", download_url: "", size_bytes: None }`
(empty string, not null). The frontend's `setConsentModalData(metadata)` then
shows the modal with an empty download URL. The OllamaConsentModal at
line 100-112 has defense-in-depth for `!downloadUrl` and renders "Not
available on this platform" — good. But the consent flow on non-macOS is
already gated by `if (isMacOS())` at line 217, so this path is unreachable
in normal operation. Defensive but not wired.

**Fix:** Either remove the fallback in OllamaConsentModal (since unreachable),
or document the defense-in-depth more clearly in OllamaSetupContext:
```ts
// Non-macOS reaches the modal only if isMacOS() lies (e.g., headless tests
// stub it). OllamaConsentModal handles empty downloadUrl gracefully.
```

---

### IN-06: `Cargo.toml` has `authors = ["you"]` placeholder

**File:** `src-tauri/Cargo.toml:5`

**Issue:** `authors = ["you"]` is a leftover from `cargo new` template. Not
release-blocking but visible in `cargo metadata` and may surface in crates.io
or in bundle metadata.

**Fix:** Replace with maintainer attribution:
```toml
authors = ["openNotes maintainers"]
```

---

_Reviewed: 2026-05-12_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
