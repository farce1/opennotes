# Phase 10: Dependency Risk Closure - Context

**Gathered:** 2026-03-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Lock the sherpa-rs dependency at a known-good version, cache CI binaries for all three platforms, and document the upgrade escape hatch for v1.2. Covers requirements DEPS-01, DEPS-02, DEPS-03. No new features or dependency migrations — just risk closure and documentation.

</domain>

<decisions>
## Implementation Decisions

### Upgrade path document
- Decision brief format: 1-2 page doc listing both options (chobits-sherpa-rs fork and direct FFI fallback), with a pros/cons table, recommended path, and a "when to revisit" trigger
- Include specific revisit triggers (e.g., "when sherpa-onnx publishes native Rust crate to crates.io, or if sherpa-rs 0.6.8 breaks on a new OS release")
- Lives at `.planning/research/` per success criteria
- Cargo.toml gets a brief one-liner comment pointing to the upgrade doc (e.g., `# Pinned: sherpa-rs-sys binary compat; see .planning/research/sherpa-upgrade-path.md`)

### CI caching strategy
- Cache sherpa-rs-sys pre-built binaries only — not the full Cargo build cache
- Cache key includes the pinned version and platform (e.g., `sherpa-rs-0.6.8-{platform}`) for automatic invalidation on version change
- Claude to inspect existing CI workflows to determine which platform jobs exist and add caching to each
- Cache miss logs a warning but does not fail the build — slower build is acceptable, blocking PRs is not

### Pin scope & hygiene
- Pin sherpa-rs only — no broad dependency audit (keep phase focused)
- Pin sherpa-rs top-level; sherpa-rs-sys locked transitively via Cargo.lock (no explicit sys pin needed)
- Claude to verify Cargo.lock is committed (expected yes for a Tauri app) and leave as-is
- No opportunistic cleanup — pin, cache, document, done

### Claude's Discretion
- Exact cache action/step configuration in GitHub Actions
- Whether to add a CI step that logs cache hit/miss status
- Formatting and structure of the upgrade-path document beyond the decision brief requirements
- Any minor Cargo.toml formatting adjustments needed for the pin

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. The success criteria are already well-defined in the roadmap.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 10-dependency-risk-closure*
*Context gathered: 2026-03-02*
