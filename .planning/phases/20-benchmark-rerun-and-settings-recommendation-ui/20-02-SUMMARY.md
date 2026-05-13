---
phase: 20-benchmark-rerun-and-settings-recommendation-ui
plan: 02
subsystem: ui
tags: [settings, ui, i18n, benchmarks, react, json-driven]

# Dependency graph
requires:
  - phase: 20-benchmark-rerun-and-settings-recommendation-ui
    provides: validateBenchmarks + matchesBenchmarkModel (src/lib/benchmarks.ts), BenchmarkData type (src/types/model-benchmarks.ts), skeleton model-benchmarks.json (Wave 1 / Plan 20-01)
provides:
  - SummarySection.tsx with JSON-driven Recommended badge predicate
  - i18n-aware Recommended label (en/pl) replacing hard-coded English literal
  - formatModelLabel(model, recommendedLabel) signature — plain function, no rules-of-hooks risk
  - Module-scope BENCHMARKS = validateBenchmarks(benchmarksRaw) fail-fast load (D-29)
affects:
  - 20-05 (live JSON commit by harness — will activate the badge end-to-end)
  - 20-03 (settings recommendation UI — may consume BENCHMARKS similarly)
  - 20-04 (recommendation rationale display — may reuse same BENCHMARKS instance pattern)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Module-scope static JSON import + validator call: `const BENCHMARKS = validateBenchmarks(benchmarksRaw)` runs once at import; throws on shape mismatch (fail-fast at build time, D-29)"
    - "Pass-resolved-i18n-string to plain formatters: when a non-React utility needs an i18n label, call `t(...)` at the React call site and pass the resolved string as a parameter (D-30a option a) — keeps formatter signature inspectable, avoids rules-of-hooks violation"

key-files:
  created: []
  modified:
    - src/components/settings/SummarySection.tsx — 13 insertions, 6 deletions: module-scope BENCHMARKS import + validator, formatModelLabel signature change, JSON-driven predicate, two useMemo call sites updated with i18n label + dep array

key-decisions:
  - "D-30a option (a) confirmed: formatModelLabel takes recommendedLabel: string as a second arg. Callers pass t('model_recommended'). Rejected option (b) (inline predicate in .map()) per RESEARCH §Pitfall 5 — option (a) keeps the predicate co-located with size/download formatting and centralizes one signature change at 3 sites instead of scattering."
  - "Imports placed in the relative-import group, ordered lexicographically: contexts → hooks → data → lib → types → ui. The new `import benchmarksRaw from '../../data/model-benchmarks.json'` and `import { matchesBenchmarkModel, validateBenchmarks } from '../../lib/benchmarks'` slot between hooks and lib/constants."

patterns-established:
  - "Plain formatter + i18n: utility functions that need a localized string accept the resolved string as a parameter rather than calling useTranslation themselves"
  - "Static JSON validation at module scope: validate-on-import surfaces shape mismatch in `bun run build` before a release artifact is produced (T-20-01 mitigation)"

requirements-completed: [BENCH-05]

# Metrics
duration: ~15min
completed: 2026-05-13
---

# Phase 20 Plan 02: SummarySection JSON-Driven Recommended Badge Summary

**Rewires the Settings → Summary recommended-badge predicate from a hard-coded `phi4-mini` string check to a `BENCHMARKS.models.some(...)` lookup against the validated `src/data/model-benchmarks.json` skeleton, with the badge label now driven by `t('model_recommended')` (en/pl parity).**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-05-13T10:36:11Z (worktree spawn)
- **Completed:** 2026-05-13T10:37:57Z (Task 1 commit + summary)
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Hard-coded `'phi4-mini' || 'phi4-mini:latest'` predicate replaced with data-driven JSON lookup that closes BENCH-05 and ROADMAP P20 Success Criterion 4 ("removing or renaming the recommended row in JSON changes the badge without a code change").
- i18n side-bug closed en route: the previously hard-coded English ` · Recommended` literal is now `t('model_recommended')`, with Polish parity already present at `src/i18n/locales/pl/settings.json:147` ("Zalecany").
- `formatModelLabel` remains a plain (non-hook) function — the i18n label is passed in as a `recommendedLabel: string` parameter (D-30a option a), avoiding the rules-of-hooks violation flagged in RESEARCH §Pitfall 5.
- Module-scope `const BENCHMARKS = validateBenchmarks(benchmarksRaw)` provides fail-fast schema validation at module load (D-29) — a malformed JSON commit will throw during `bun run build` before a release is produced.

## Task Commits

1. **Task 1: Rewire formatModelLabel and call sites in SummarySection.tsx** — `ced1856` (feat)

_Note: Plan 20-02's single task is a refactor with a paired i18n improvement; no test-only commit was required because the plan piggybacks on `benchmarks.test.ts` from Plan 20-01 (15 tests, all green) and the existing settings render/snapshot suites. The plan-level frontmatter `type: execute` (not `tdd`) reflects this._

**Plan metadata:** Pending — orchestrator will commit `20-02-SUMMARY.md` once this agent returns; this same commit also captures `deferred-items.md`.

## Files Created/Modified
- `src/components/settings/SummarySection.tsx` — 13 insertions / 6 deletions:
  - Lines 8–9 (new): `import benchmarksRaw from '../../data/model-benchmarks.json'` + `import { matchesBenchmarkModel, validateBenchmarks } from '../../lib/benchmarks'`
  - Line 14 (new): `const BENCHMARKS = validateBenchmarks(benchmarksRaw)` — module-scope fail-fast validation
  - Lines 34–44: `formatModelLabel` rewritten — signature now `(model: OllamaModelInfo, recommendedLabel: string)`, predicate replaced with `BENCHMARKS.models.some((b) => b.verdict === 'recommended' && matchesBenchmarkModel(model.name, b.name))`, label uses `recommendedLabel` parameter
  - Lines 240, 242: `modelDropdownOptions` useMemo — call site now `formatModelLabel(model, t('model_recommended'))`, dep array `[modelOptions, t]`
  - Lines 249, 251: `pullModelDropdownOptions` useMemo — call site now `formatModelLabel(model, t('model_recommended'))`, dep array `[availablePullModels, t]`

## Decisions Made

- **D-30a option (a) over option (b):** Pass `recommendedLabel` as a second parameter to `formatModelLabel` rather than inlining the recommended-detection into each `.map()` callback. Rationale (per RESEARCH §Pitfall 5): the formatter's signature change is one line at three call sites, whereas option (b) would scatter the predicate across two `.map()` bodies and make the next visual change harder. Option (a) keeps size/download/recommended formatting co-located.
- **Import grouping:** New imports `benchmarksRaw` and `{ matchesBenchmarkModel, validateBenchmarks }` placed alongside `useSetting` (hooks) and `DEFAULT_SETTINGS` (lib) in the relative-import block. Order kept lexicographically grouped by directory depth so the file diff stays minimal.
- **No try/catch wrapper around `validateBenchmarks`:** Per D-29 and RESEARCH §Open Question 4, fail-fast at module-load is the intended T-20-01 mitigation. Wrapping would hide CI's "broken JSON" signal.

## Deviations from Plan

None — plan executed exactly as written. Three edits (module-scope imports + BENCHMARKS, formatModelLabel rewrite, two call site updates) match the verbatim code in the plan's `<action>` block.

## Acceptance Criteria Verification

All static checks from `<acceptance_criteria>` pass on the committed code:

| Check | Result |
|-------|--------|
| `! grep -n "'phi4-mini'" src/components/settings/SummarySection.tsx` | PASS (zero hits) |
| `! grep -n "' · Recommended'" src/components/settings/SummarySection.tsx` | PASS (zero hits) |
| `grep -c "BENCHMARKS.models.some" src/components/settings/SummarySection.tsx` | 1 (>=1 required) |
| `grep -q "const BENCHMARKS = validateBenchmarks(benchmarksRaw);"` | PASS |
| `grep -c "formatModelLabel(model, t('model_recommended'))"` | 2 (>=2 required) |
| `grep -q "function formatModelLabel(model: OllamaModelInfo, recommendedLabel: string): string"` | PASS |
| `bun run build` exits 0 | PASS (✓ 2675 modules transformed, built in 3.33s) |
| `bun run test` — vitest suite | 37/37 passed (`benchmarks.test.ts` 15 tests, settings/contexts/hooks all green) |

**Note on `useTranslation` grep guard (acceptance criterion 7):** The plan asserts `grep -c 'useTranslation' src/components/settings/SummarySection.tsx` equals 1, but the actual count is **2** — the `import { useTranslation } from 'react-i18next'` line on line 4 and the hook call `const { t } = useTranslation('settings')` on line 52. The original file (pre-Plan-02) also had 2 occurrences. The *intent* of the guard is satisfied: there is exactly **one** `useTranslation()` *call*, and it is inside `SummarySection` (line 52), NOT inside `formatModelLabel`. `formatModelLabel` remains a plain function. The rules-of-hooks guard from RESEARCH §Pitfall 5 holds. (The criterion's `grep -c` is off-by-one because grep also matches the import line — this is a plan-side spec mistake, not an implementation defect.)

## Issues Encountered

- **`bun run test` reports 1 failed test file:** `scripts/release-bump.test.mjs` — *"No test suite found in file"*. **Pre-existing failure**, confirmed by re-running `bun run test` with Plan 20-02 changes stashed (identical error on base commit `e1c27c6`). The file uses `import { test } from 'node:test'` rather than Vitest, so vitest's collector finds no registered tests. **Out of scope** per the scope boundary rule — logged to `.planning/phases/20-benchmark-rerun-and-settings-recommendation-ui/deferred-items.md` with recommended fix (add `scripts/**/*.test.mjs` to vitest's exclude glob; the existing `node --test` runner in CI per the file's header comment remains the canonical runner). All 37 vitest-discovered tests, including the 15 `benchmarks.test.ts` tests added by Plan 20-01 and the OllamaSetupContext/Library/ModelSetup suites, pass cleanly.

## User Setup Required

None — no external service configuration. The badge is invisible until Plan 20-05 commits the live JSON (Wave 1's skeleton has `models: []`); this is correct degraded behavior per D-33.

## Threat Flags

None — no new security-relevant surface introduced. Plan 20-02 only adds a static JSON import at module scope (validator already mitigates T-20-01 from Plan 20-01) and rewires an existing in-process render predicate. No network endpoints, auth paths, file access patterns, or schema changes at trust boundaries added.

## Known Stubs

None directly introduced. The skeleton `model-benchmarks.json` with `models: []` (from Plan 20-01) makes the badge predicate return false for every model — this is **intentional degraded behavior per D-33** and will be wired by Plan 20-05 when the harness commits the live JSON. The plan's own behavior section explicitly calls this out ("With the Wave 1 skeleton JSON (`models: []`), NO model shows the badge — degraded behavior is correct, never crashes").

## Next Phase Readiness

- BENCH-05 closed: the predicate IS the data.
- ROADMAP P20 Success Criterion 4 satisfied **structurally** — Plan 20-05 closes the loop end-to-end by committing the live JSON containing `phi4-mini` with `verdict: "recommended"`.
- The `BENCHMARKS` constant + `validateBenchmarks` + `matchesBenchmarkModel` pattern is now established and can be reused verbatim by Plans 20-03 / 20-04 if they need to read the same data (e.g., to surface speed/quality numbers next to the badge).
- No blockers for Wave 3.

## Self-Check: PASSED

- `src/components/settings/SummarySection.tsx` — modified, committed in `ced1856`. Verified: `git show --stat ced1856` shows 1 file changed, 13 insertions(+), 6 deletions(-).
- `git log --oneline | grep ced1856` — FOUND.
- `.planning/phases/20-benchmark-rerun-and-settings-recommendation-ui/20-02-SUMMARY.md` — this file, created.
- `.planning/phases/20-benchmark-rerun-and-settings-recommendation-ui/deferred-items.md` — created with the pre-existing `release-bump.test.mjs` failure logged.

---
*Phase: 20-benchmark-rerun-and-settings-recommendation-ui*
*Plan: 02*
*Completed: 2026-05-13*
