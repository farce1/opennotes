---
status: complete
phase: 20-benchmark-rerun-and-settings-recommendation-ui
source: 20-01-SUMMARY.md, 20-02-SUMMARY.md, 20-03-SUMMARY.md, 20-04-SUMMARY.md
started: 2026-05-13T11:12:24Z
updated: 2026-05-13T11:18:00Z
note: Plan 05 (live maintainer-machine rerun) is intentionally not yet executed — UAT verifies the Wave 1+2 contracts against the skeleton JSON.
---

## Current Test

[testing complete]

## Tests

### 1. App Boot & Settings Render (module-load validator gate)
expected: Start the app from a clean state. Open Settings → Summary. UI renders fully — no white screen, no `BenchmarksValidationError` in console, model dropdown populates. Validates Plan 01 + Plan 02 module-load gate accepts the skeleton JSON at startup.
result: pass

### 2. Recommended badge — skeleton degraded state
expected: In Settings → Summary → Model dropdown, open the list and scan visible models. NO model shows a " · Recommended" / " · Zalecany" suffix in the dropdown label. This is correct degraded behavior per D-33 (skeleton `models: []` means `BENCHMARKS.models.some(...)` returns false for every model). Plan 05 will activate the badge by committing live data with `verdict: 'recommended'`.
result: pass

### 3. i18n parity — Polish "Zalecany"
expected: Switch language to Polish in Settings. Reload the model dropdown. UI renders cleanly — no English literal ` · Recommended` anywhere in Settings (only the i18n-resolved label flows through). Verifies Plan 02's i18n rewire (formatModelLabel now takes `recommendedLabel: string` from `t('model_recommended')`).
result: pass

### 4. `bun run build` clean
expected: From repo root, run `bun run build`. TypeScript strict-mode + Vite production build exits 0 with no errors. This is the build-time enforcement of the D-29 fail-fast schema gate — a malformed `model-benchmarks.json` would surface here before a release artifact is produced.
result: pass

### 5. `bun run test` — vitest suite green
expected: From repo root, run `bun run test`. 38 vitest tests pass: 15 in `benchmarks.test.ts` (Plan 20-01 validator/matcher), 1 in `benchmark-models.prompts.test.mjs` (Plan 20-03 byte-diff guard against Rust prompt drift), 22 across settings/contexts/hooks. The only failure should be the pre-existing `scripts/release-bump.test.mjs` ("No test suite found") which is documented in `deferred-items.md` and is out of scope.
result: pass

### 6. `bun run benchmark` pre-flight fails fast with documented error
expected: From repo root, run `bun run benchmark` (or `bun run benchmark --model phi4-mini`). Without Ollama running or with fixtures missing, the harness exits non-zero with a single-line actionable error pointing at the first failing pre-flight stage (one of: git rev-parse, python3 ≥ 3.10, ollama ≥ 0.5.0, daemon at localhost:11434, fixtures present). Plan 20-03 ships only the harness — actual benchmark execution is Plan 20-05.
result: pass

### 7. `bun run benchmark:render-readme` idempotency
expected: From repo root, run `bun run benchmark:render-readme` twice in a row. First invocation exits 0 and renders the (currently empty / skeleton) table between the `<!-- BEGIN:BENCHMARK_TABLE -->` / `<!-- END:BENCHMARK_TABLE -->` markers. Second invocation prints `[render] README.md already up to date — no write needed.` and produces a byte-identical README (verify with `diff` against a snapshot taken between runs).
result: pass

### 8. README marker block intact
expected: `grep -c "BEGIN:BENCHMARK_TABLE" README.md` returns 1 and `grep -c "END:BENCHMARK_TABLE" README.md` returns 1. The marker pair sits between `## Roadmap` and `## License` (per D-26) and is anchored by exact string so Phase 23 DOCS-07 can relocate it without breaking the generator.
result: pass

## Summary

total: 8
passed: 8
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

[none — all tests passed]
