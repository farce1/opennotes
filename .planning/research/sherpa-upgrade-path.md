# sherpa-rs Upgrade Path (v1.2 Planning Reference)

**Written:** 2026-03-02  
**Current pin:** `sherpa-rs = "=0.6.8"`  
**Decision scope:** What to do if `0.6.8` is no longer viable

## Background

openNotes uses `sherpa-rs` for offline speech recognition (Whisper via sherpa-onnx ONNX runtime).
The `download-binaries` feature fetches pre-built sherpa-onnx shared libraries at build time.
We pin to `0.6.8` because binary ABI compatibility is version-specific; floating to a newer
minor version could pull incompatible binaries and silently break local or CI builds.

As of 2026-03-02:
- `sherpa-rs` `0.6.8` is the latest published release on crates.io (released October 2024).
- `k2-fsa/sherpa-onnx` has no first-party Rust crate on crates.io.
- Official Rust support is effectively delegated to the external `sherpa-rs` ecosystem.

## Option A: Upgrade via chobits-sherpa-rs Fork

`chobits-sherpa-rs` (crates.io package `chobits-sherpa-rs`, latest `0.7.0`) is a faster-moving
fork of `thewh1teagle/sherpa-rs` intended to track sherpa-onnx changes more aggressively.

**Migration path**
- Swap crate name in `Cargo.toml` (`sherpa-rs` -> `chobits-sherpa-rs`).
- Update imports and verify feature flags remain equivalent.
- Run full app smoke tests and CI across macOS/Windows/Linux.

**Risk profile**
- Maintainer risk: release cadence depends on the fork author.
- API-compatibility risk: near drop-in replacement is likely, but compatibility with the current
  `sherpa-rs 0.6.8` integration has not yet been validated by test build.
- Operational benefit: fastest path to unblocking upgrades when upstream crates stall.

## Option B: Direct FFI Against sherpa-onnx C API

Implement a direct Rust binding layer using `bindgen` against `sherpa-onnx/c-api/c-api.h`.
This bypasses external Rust wrappers and talks directly to the C API that upstream maintains.

**Migration path**
- Add a `sherpa-onnx-sys` crate or module with `build.rs` invoking `bindgen`.
- Replace current `sherpa-rs` API calls with wrappers over generated FFI symbols.
- Build integration tests around model loading, streaming decode, and teardown semantics.

**Risk profile**
- Initial effort is materially higher than Option A.
- Ongoing maintenance of binding generation and wrapper ergonomics is required.
- Benefit is long-term control and reduced dependence on third-party wrapper release cadence.

## Comparison

| Criterion | Option A (chobits fork) | Option B (direct FFI) |
|-----------|---------------------------|------------------------|
| Migration effort | Low - swap crate + verify | High - build binding layer + replace call sites |
| Time to first usable upgrade | Hours | Days to weeks |
| Control over API surface | Low | Full |
| Dependency risk | Medium (fork health) | Low (direct upstream C API) |
| Ongoing maintenance | Low to medium | Medium |
| Escape-hatch quality | Good short-term | Best long-term |

## Recommended Path

Use **Option A (`chobits-sherpa-rs`)** as the v1.2 default if an upgrade is required.
It is the fastest way to regain motion with minimal rewrite risk.

Escalate to **Option B (direct FFI)** only if one or more of the following occur:
- The fork appears unmaintained (no releases for 6+ months).
- API behavior diverges from current expectations in breaking ways.
- Product requirements demand deeper control than the wrapper exposes.

## When to Revisit

- **Trigger 1:** sherpa-onnx publishes an official first-party Rust crate to crates.io.
- **Trigger 2:** `sherpa-rs 0.6.8` stops building on a new macOS, Windows, or Linux release.
- **Trigger 3:** `chobits-sherpa-rs` demonstrates at least 6 months of stable updates without regressions.
- **Trigger 4:** A security issue is disclosed in `sherpa-rs 0.6.8` or a critical transitive dependency.

## Open Item

- Validate `chobits-sherpa-rs` API compatibility against the current integration by running a
  dedicated test build and smoke run before adopting Option A.
