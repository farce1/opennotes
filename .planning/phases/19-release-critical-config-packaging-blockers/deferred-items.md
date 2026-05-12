# Phase 19 — Deferred Items

Out-of-scope discoveries logged during plan execution per Get-Shit-Done SCOPE BOUNDARY rule.
Do NOT fix as part of the originating plan; surface for the planner to decide whether
they belong to a follow-up plan.

## From 19-03 execution (2026-05-12)

### `scripts/release-bump.test.mjs` is invisible to vitest

- **Discovered during:** Plan 19-03, Task 2 (running `bun run test` to verify frontend changes)
- **Symptom:** vitest reports `FAIL scripts/release-bump.test.mjs` with "No test suite found in file" — twice (the worktree path duplicates the report).
- **Root cause:** The file authored in Plan 19-02 uses `node:test` (`import { test } from 'node:test';`), not vitest. vitest discovers `*.test.mjs` files via its default include glob but cannot interpret the `node:test` API, so it counts the file as a failed suite.
- **Pre-existing:** Yes — predates Plan 19-03. Confirmed by `git log scripts/release-bump.test.mjs` (last touched in commit b8e15ad of 19-02).
- **In scope of 19-03:** No — Plan 19-03 modifies `src-tauri/src/download.rs` and `src/contexts/ModelSetupContext.tsx`. The release-bump script is unrelated.
- **Suggested fix path:** Either (a) port `scripts/release-bump.test.mjs` to use vitest's `describe`/`it` and run inside the same harness, or (b) exclude `scripts/**` from vitest's include glob and run `node --test scripts/` separately in CI.
- **Not done in 19-03 because:** SCOPE BOUNDARY — only fix issues directly caused by the current task's changes. The 19-03 success criteria (zero `Command::new("tar")` in download.rs; new `kind` field; backward-compat frontend) do not depend on this test file.
