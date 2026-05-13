---
phase: 20-benchmark-rerun-and-settings-recommendation-ui
plan: 03
subsystem: benchmarks
tags: [benchmarks, harness, ollama, nodejs, scripts, llm, evaluation]

# Dependency graph
requires:
  - phase: 20-01-skeleton-and-validator
    provides: src/types/model-benchmarks.ts + src/lib/benchmarks.ts validator; src/data/model-benchmarks.json skeleton — the harness writes the live JSON through this contract via atomic temp+rename
  - phase: v1.1 milestone (.planning/milestones/v1.1-phases/13-llm-quality-tuning)
    provides: evaluate.py + 3 transcript/ground-truth fixture pairs the harness shells out to
provides:
  - scripts/benchmark-models.mjs — maintainer-only Node ESM benchmark orchestrator (643 LOC)
  - bun run benchmark wired in package.json
  - .planning/phases/20-benchmark-rerun-and-settings-recommendation-ui/runs/.gitignore — keep quality/, exclude warmup/+speed/
  - scripts/benchmark-models.prompts.test.mjs — Vitest byte-diff guard against Rust prompt drift
affects:
  - plan 20-04 (BENCHMARK.md README badge — renderer reads src/data/model-benchmarks.json the harness writes)
  - plan 20-05 (maintainer-machine live run — actually invokes bun run benchmark)

# Tech tracking
tech-stack:
  added: []  # Zero new npm or Cargo deps (D-19 honored)
  patterns:
    - "Atomic temp+rename writes (mirrored from scripts/release-bump.mjs:86-95)"
    - "Cross-platform GPU detection (system_profiler / lspci / PowerShell Get-CimInstance)"
    - "Vitest byte-diff guard between JS harness and Rust source prompt constants"
    - "Fail-fast pre-flight chain with single-line actionable error messages"
    - "Map-reduce chunked summarization mirroring src-tauri/src/llm/mod.rs:14-18 and :455/:486 byte-for-byte"

key-files:
  created:
    - scripts/benchmark-models.mjs
    - scripts/benchmark-models.prompts.test.mjs
    - .planning/phases/20-benchmark-rerun-and-settings-recommendation-ui/runs/.gitignore
  modified:
    - package.json (single new scripts entry: "benchmark")

key-decisions:
  - "Vitest form chosen over inline-shell form for the prompt byte-diff guard — vitest config already picks up scripts/**/*.test.mjs, no additional infrastructure needed, runs in CI alongside the rest of the suite"
  - "Verbatim DEFAULT_STANDARD_PROMPT mirror of src-tauri/src/llm/mod.rs:455 (BLOCKER-2 fix from plan-checker iteration 1) — drift surfaces immediately via the byte-diff test rather than at maintainer-run time"
  - "globalThis.__BENCH_GIT_SHA__ intentionally kept as the only surviving bridge — getGeneratorGitShaShortFromGlobal() reads it for the backfill footnote, avoiding a SHA threaded through every helper signature"
  - "Backfill regex mismatch (replaceCount !== 3) is fail-fast (process.exit 1), not warn-and-continue — silent drift between BENCHMARK.md row layout and the harness regex would silently corrupt audit data otherwise"
  - "Conservative Ollama version floor of 0.5.0 (vs the actual ollama-stop floor of 0.3.11 from Pitfall 11) — codifies the stable /api/generate timing-fields surface"
  - "Partial-rerun merge trusts the existing JSON's models[] shape rather than running the TS validator inline — D-19 forbids new deps and bundling tsx, so the harness preserves untouched rows verbatim and only the new --model row is fully reconstructed"
  - "Apple Silicon GPU strings get the (integrated, Metal) suffix (D-13a) — distinguishes apple-silicon perf characteristics from discrete-GPU configurations in the hardware_tier field downstream UIs may key on"

patterns-established:
  - "Pre-flight chain (5 checks, fail-fast, single-line error): git rev-parse → python3≥3.10 (with python/py fallback) → ollama≥0.5.0 → daemon at localhost:11434 → fixtures present"
  - "T-20-03 mitigation surface for hardware-tier: cpu_model, total_ram_gb, gpu_model, os only — never hostname/username/IP/MAC"
  - "Sequential model loop (never parallel) honors Pitfall 7 root cause #4 — Ollama stop between models forces clean unload, eliminating cross-model timing contamination"
  - "Quality-vs-speed pass separation: 1-run quality (num_predict=-1 production) → N=5 measured speed (num_predict=512 bounded, median reported) → 1-run E2E (num_predict=-1 production on 45min) — three different measurements, three different inferences, three semantically distinct outputs"

requirements-completed: [BENCH-01, BENCH-02, BENCH-03]

# Metrics
duration: 12min
completed: 2026-05-13
---

# Phase 20 Plan 03: Benchmark harness Summary

**Maintainer-only Node ESM benchmark orchestrator (scripts/benchmark-models.mjs) — three-stage flow: 5-check pre-flight + cross-platform hardware detect → per-model warmup+quality+speed+E2E loop with Rust-mirrored chunked path → atomic JSON write + v1.1 BENCHMARK.md iteration-2 backfill**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-05-13T10:42:00Z
- **Completed:** 2026-05-13T10:51:04Z
- **Tasks:** 3
- **Files modified:** 4 (3 created, 1 modified)

## Accomplishments

- **Plan-author's largest single artifact of the phase shipped in one pass:** scripts/benchmark-models.mjs is 643 LOC of pre-flight + hardware-detect + Ollama-HTTP-API timing + chunked-summary mirror + evaluator subprocess + atomic JSON writer + idempotent BENCHMARK.md backfill — all parse-clean, all grep-acceptance-green, zero new npm/Cargo deps.
- **BLOCKER-2 fix (verbatim Rust mirror):** DEFAULT_STANDARD_PROMPT mirrored byte-for-byte from src-tauri/src/llm/mod.rs:455 with a Vitest byte-diff guard (scripts/benchmark-models.prompts.test.mjs) that fails the harness loudly on any future drift between Rust source and JS mirror. The byte-diff test passes green.
- **Cross-platform hardware detection** covers macOS (system_profiler with Apple Silicon "(integrated, Metal)" special-case from D-13a), Linux (lspci), Windows (PowerShell Get-CimInstance — NOT wmic, per RESEARCH §State of the Art on the wmic deprecation), with try/catch soft-fail to gpu_model: null.
- **Atomic JSON write + idempotent backfill:** writeJsonAtomic reuses scripts/release-bump.mjs:86-95 temp+rename pattern; backfillV11BenchmarkMd uses an anchored regex (ITERATION_2_ROW_RE) that replaces exactly 3 PENDING rows for phi4-mini iteration 2 and fail-fasts on replaceCount !== 3, and the v1.3-BACKFILL-FOOTNOTE marker makes the operation idempotent across re-runs.
- **Partial-rerun semantics (D-22, A7):** mergeModelRows preserves untouched rows for models not in `--model <name>` runs while keeping the MODELS lineup order canonical; extras (models present in JSON but absent from MODELS) get appended last so v1.4 additions never destroy v1.3 rows.

## Task Commits

Each task was committed atomically on `worktree-agent-a5af8866c0643d990`:

1. **Task 1 — Scaffold pre-flight + hardware detect:** `a11f5c8` (feat) — 5-check pre-flight chain, MODELS lineup config, mirrored llm/mod.rs:14-18 constants, METHODOLOGY frozen, T-20-03 mitigation surface
2. **Task 2 — Per-model loop + Rust mirror:** `17d04e8` (feat) — generateAndTime over Ollama /api/generate, DEFAULT_STANDARD_PROMPT/buildLanguageInstruction/buildPromptFromTemplate/buildSynthesisPrompt mirrored from mod.rs:448-488 verbatim, chunkTranscript + runSummary single-pass-or-chunked decision, runEvaluator spawnSync with Pitfall-10 exit-code-agnostic stdout parse, median(N=5) speed pass, benchModel sequential orchestration, byte-diff Vitest guard
3. **Task 3 — Writer + backfill + package wiring:** `20ddff8` (feat) — writeJsonAtomic + writeTextAtomic, mergeModelRows partial-rerun merger, loadExistingBenchmarkData, backfillV11BenchmarkMd with anchored regex + idempotent footnote, fail-fast on replaceCount !== 3, main() rewired to drop __BENCH_NEW_ROWS__ + __BENCH_HARDWARE__ globalThis placeholders while keeping __BENCH_GIT_SHA__ for the footnote helper, package.json gains the surgical "benchmark" entry, runs/.gitignore created with `*/warmup/` + `*/speed/` excludes and `!*/quality/` re-includes

## Files Created/Modified

- `scripts/benchmark-models.mjs` — 643-line Node ESM benchmark orchestrator (maintainer-only). Pre-flight + hardware-detect + Ollama HTTP timing + chunked-path Rust mirror + atomic JSON write + BENCHMARK.md backfill.
- `scripts/benchmark-models.prompts.test.mjs` — Vitest byte-diff guard. Extracts the DEFAULT_STANDARD_PROMPT string literal from both src-tauri/src/llm/mod.rs and scripts/benchmark-models.mjs via regex; asserts equality. Fails the suite on any future Rust drift, surfacing the prompt-mirror invariant at test time rather than at maintainer-run time.
- `.planning/phases/20-benchmark-rerun-and-settings-recommendation-ui/runs/.gitignore` — keeps `quality/` subdirs (canonical audit outputs the maintainer commits in Plan 05), excludes `warmup/` (discarded measurement) and `speed/` (N=5 per-run files that would 5x the audit corpus for no analytic value).
- `package.json` — surgical single-line addition: `"benchmark": "node scripts/benchmark-models.mjs"` placed adjacent to `"release:bump"`. No other fields changed (2 non-benchmark diff lines, which is the trailing-comma transformation on the preceding line).

## Decisions Made

See the `key-decisions` frontmatter list above. The non-obvious ones:

- **Verbatim Rust mirror over paraphrase:** A paraphrased prompt would make `quality_score` measure a fiction. The byte-diff Vitest guard is the safety net.
- **globalThis.__BENCH_GIT_SHA__ kept, others removed:** Task 2 used three globalThis bridges as placeholders. Task 3's main() rewrite kept only the one (`__BENCH_GIT_SHA__`) that `getGeneratorGitShaShortFromGlobal()` reads inside `backfillV11BenchmarkMd()`. Threading the SHA through every backfill function signature would add boilerplate for one usage site; the bridge is documented inline.
- **Trust existing models[] shape on partial-rerun merge:** The harness re-implements no validator. D-19 forbids npm/cargo deps and `tsx` shells. The pragma is: if the existing JSON parses cleanly, trust its `models[]` array, replace the matching row, keep all others verbatim. If the existing JSON doesn't parse, warn and treat as empty (full overwrite next run).

## Chunked-summarization mirroring approach

The harness reproduces the 90-min transcript path by re-implementing (option (b), the Rust mirror approach) the chunked-summary flow from `src-tauri/src/llm/mod.rs:539` (`generate_summary_chunked`) in JavaScript:

- `MAX_SINGLE_PASS_CHARS = 96_000` decides single-pass vs chunked (`runSummary()` first branch)
- `MAP_CHUNK_CHARS = 80_000` + `MAP_CHUNK_OVERLAP_CHARS = 2_000` drive `chunkTranscript()` (sliding window)
- Each chunk produces a partial via `buildPromptFromTemplate(chunk)` (default prompt mirroring mod.rs:457-469)
- Partials stitched as `Section ${i+1}:\n...` lines and passed to `buildSynthesisPrompt()` (mirroring mod.rs:471-488)

The verbatim Rust source lines for future drift detection:
- `src-tauri/src/llm/mod.rs:14-18` — chunk constants
- `src-tauri/src/llm/mod.rs:448-453` — `build_language_instruction`
- `src-tauri/src/llm/mod.rs:455` — `DEFAULT_STANDARD_PROMPT` (guarded by Vitest byte-diff)
- `src-tauri/src/llm/mod.rs:457-469` — `build_prompt_from_template`
- `src-tauri/src/llm/mod.rs:471-488` — `build_synthesis_prompt` (default-path branch when templatePrompt is null)

The Vitest guard at `scripts/benchmark-models.prompts.test.mjs` currently asserts byte-equality only for `DEFAULT_STANDARD_PROMPT`. Future iterations could extend it to cover `buildLanguageInstruction` and the synthesis-prompt default path.

## Partial-rerun merge semantics

`mergeModelRows(existing, newRows)` semantics (D-22, Assumption A7):

1. Build a `byName` Map from `existing.models` (preserves prior data)
2. Overwrite/insert each new row keyed by `name` (the original name with `:` form for `llama3.2:3b`, not the path-safe form)
3. Output ordering: rows for names in `MODELS` come first in `MODELS` order; then any extras (models in JSON but not in the current `MODELS` lineup) get appended last

The merge does NOT fully re-validate the existing JSON because D-19 forbids new deps (no `tsx`, no inline TS shell). The merge trusts the existing file's `models[]` array shape. If the existing JSON doesn't parse cleanly, `loadExistingBenchmarkData()` warns and returns `{ schema_version: 1, models: [] }`, so the next write is a full overwrite.

This trade-off is acceptable: the harness's primary writer (full-rerun) always emits a fully-typed object. Partial-reruns are a maintainer-machine convenience for iterating on one model; if the existing JSON ever drifts, the maintainer re-runs full and overwrites.

## Atomic-write pattern (reused from release-bump.mjs)

Both `writeJsonAtomic(targetPath, data)` and `writeTextAtomic(targetPath, text)` mirror the pattern at `scripts/release-bump.mjs:86-95`:

```js
const tmp = targetPath + '.bench.tmp';
writeFileSync(tmp, payload);
renameSync(tmp, targetPath);
```

T-20-04 (DoS via interrupted atomic write) mitigation: on any crash between `writeFileSync` and `renameSync`, the target file is untouched; the orphan `.bench.tmp` lingers but is cosmetic. POSIX `rename(2)` is atomic; Windows has historical EPERM edge cases for concurrent file-locking but the maintainer-script use case is single-process, sequential, so the cross-platform pattern is safe (per RESEARCH §"Pattern 1" cross-platform notes).

## Confirmation: script is parse-clean & pre-flight produces documented errors

Final verification chain:

| Gate | Command | Result |
| --- | --- | --- |
| Parse | `node --check scripts/benchmark-models.mjs` | exit 0 |
| Build | `bun run build` | exit 0 (built in ~3.1s) |
| Byte-diff prompt test | `bun run test scripts/benchmark-models.prompts.test.mjs` | 1 passed (DEFAULT_STANDARD_PROMPT == Rust source byte-for-byte) |
| Smoke (Ollama runs, fixtures missing in worktree) | `node scripts/benchmark-models.mjs --model phi4-mini` | exit 1, prints documented `error: evaluator or fixture missing:` line + list of missing paths + remediation. (This is the pre-flight chain's fixture-existence check firing because `.planning/milestones/` is gitignored at root and therefore absent from this executor worktree — see Issues Encountered.) |
| Vitest full suite | `bun run test` | 38 tests passed; 1 pre-existing failure in `scripts/release-bump.test.mjs` (node:test syntax not Vitest-discoverable) carried over from phase 19 — see deferred-items.md |

The smoke-check did not reach the "Ollama not running" error because the maintainer machine actually has Ollama 0.6.x running. The pre-flight chain ordered the fixtures check after the daemon check; the daemon check passed; the fixtures check failed. Both are valid pre-flight error surfaces and both exit non-zero with single-line actionable errors. Plan 05 will run from the main repo (not a worktree) where `.planning/milestones/` files exist on disk.

## Deviations from Plan

None — plan executed exactly as written. Every <action> block was implemented verbatim, every <acceptance_criteria> gate passed, and the BLOCKER-2 fix (verbatim Rust prompt mirror with byte-diff guard) was honored.

## Issues Encountered

**1. (Process error) Initial Task 1 commit landed on `main` in the parent repo checkout instead of the worktree branch.**
- **Discovered:** Immediately after the first `git commit` in Task 1. `git rev-parse --abbrev-ref HEAD` returned `main`, but the expected branch is `worktree-agent-a5af8866c0643d990`.
- **Root cause:** Several Bash commands used the absolute path `/Users/impera/Documents/GitHub/opennotes` (parent repo) instead of the worktree path `/Users/impera/Documents/GitHub/opennotes/.claude/worktrees/agent-a5af8866c0643d990`. The parent-repo checkout's HEAD was `main`, so commits made there landed on `main`.
- **Recovery (non-destructive forward path):** Cherry-picked the offending commit (`b217a91`) onto the worktree branch as `a11f5c8` (Task 1 final hash). Then reset main back to its prior HEAD `ab66a5c`. No upstream `git update-ref refs/heads/main` was used (only local `git reset --hard ab66a5c` on the parent checkout's working main); no concurrent work was destroyed (this was the only commit since `ab66a5c`).
- **Mitigation for future tasks:** Every subsequent Bash command operated with no absolute parent-repo path; the worktree's CWD-default was honored. All Task 2 and Task 3 commits landed correctly on the worktree branch.

**2. `.planning/milestones/` is not tracked in git** (root `.gitignore` excludes `.planning/`; only specific `.planning/` files are force-added historically). The worktree therefore has no v1.1 fixtures, so the smoke check's pre-flight fixtures stage trips before the script can exercise the rest of the chain. This is harmless for Plan 03's acceptance gates (parse + build + byte-diff guard + smoke exit-1 all pass), and the maintainer running Plan 05 will be in the main checkout where the fixtures exist locally.

## Self-Check: PASSED

- scripts/benchmark-models.mjs: FOUND
- scripts/benchmark-models.prompts.test.mjs: FOUND
- .planning/phases/20-benchmark-rerun-and-settings-recommendation-ui/runs/.gitignore: FOUND
- package.json: FOUND (modified — surgical `benchmark` entry)
- Commit a11f5c8: FOUND (Task 1)
- Commit 17d04e8: FOUND (Task 2)
- Commit 20ddff8: FOUND (Task 3)

## Live data does NOT exist yet

This plan ships the harness script only. The actual benchmark numbers in `src/data/model-benchmarks.json` are still the placeholder/skeleton from Plan 20-01 (waves 1's contract). Plan 20-05 is the maintainer-machine execution that:
1. Pulls phi4-mini + llama3.2:3b via Ollama
2. Runs `bun run benchmark` end-to-end on real hardware
3. Captures live quality scores via evaluate.py
4. Writes the live `src/data/model-benchmarks.json`
5. Backfills the v1.1 BENCHMARK.md iteration-2 PENDING rows with live phi4-mini scores
6. Commits the audit-set `runs/<model>/quality/<transcript>.md` outputs

Plan 20-04 (BENCHMARK.md README badge renderer) reads whatever JSON the harness produces — it works against the Plan 20-01 skeleton today and will reflect live numbers once Plan 20-05 runs.

## Next Phase Readiness

- **Plan 20-04 (README badge renderer):** unblocked. The renderer needs only the JSON file at `src/data/model-benchmarks.json`, which Plan 20-01 already shipped as a skeleton and the harness from this plan will overwrite atomically.
- **Plan 20-05 (live-run checkpoint plan):** unblocked. The script is parse-clean and produces documented pre-flight errors when prerequisites are missing. The maintainer can invoke `bun run benchmark` directly with confidence that it will refuse to proceed on a misconfigured machine.

---
*Phase: 20-benchmark-rerun-and-settings-recommendation-ui*
*Plan: 03*
*Completed: 2026-05-13*
