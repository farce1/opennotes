# Phase 20 — Deferred Items

Items discovered during phase 20 execution that are **out of scope** for the current plan but should be addressed separately.

## scripts/release-bump.test.mjs — Vitest cannot discover `node:test` suite

- **Discovered during:** Plan 20-02 execution (Wave 2)
- **Symptom:** `bun run test` reports `Error: No test suite found in file scripts/release-bump.test.mjs`. The file uses `import { test } from 'node:test';` rather than Vitest's `import { test } from 'vitest';`, so Vitest's collector sees no registered tests.
- **Pre-existing:** Yes — verified by re-running `bun run test` with Plan 20-02 changes stashed. Failure is identical on the base commit `e1c27c6`. Not introduced by Plan 20-02.
- **Impact on plan 20-02:** None. All 37 vitest-discovered tests pass (including `benchmarks.test.ts` from Plan 20-01 and the contexts/hooks/lib suites that touch settings). The release-bump script tests use `node --test` runner-style assertions and would need either (a) exclusion from the vitest test glob, (b) a port to `vitest`-native syntax, or (c) a separate `bun test scripts/` invocation.
- **Recommended fix:** Add `scripts/**/*.test.mjs` to vitest's `exclude` array (or rename the file to a pattern vitest doesn't collect) so the dedicated `node --test scripts/release-bump.test.mjs` invocation (already in CI per its file header comment) remains the canonical runner. Out of scope for Plan 20-02 which only touches `src/components/settings/SummarySection.tsx`.
