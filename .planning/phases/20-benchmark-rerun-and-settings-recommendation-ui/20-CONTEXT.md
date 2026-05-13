# Phase 20: Benchmark Rerun & Settings Recommendation UI - Context

**Gathered:** 2026-05-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Run a rigorous live-Ollama benchmark (warmup + N=5 + median + per-machine hardware-tier metadata) on a small lineup of summarization models, emit `src/data/model-benchmarks.json` as the single source of truth for benchmark data, replace the hard-coded `phi4-mini` literal in `src/components/settings/SummarySection.tsx` with a JSON-driven `verdict: "recommended"` lookup, backfill the v1.1 `.planning/milestones/v1.1-phases/13-llm-quality-tuning/BENCHMARK.md` PENDING rows from the same run, and produce a generator script that renders a README benchmark table from the JSON.

**Scope anchors:**
- Maintainer-side only. The harness, fixtures, and the Python evaluator NEVER ship with the app. End-user install requires no Python, no fixtures, no live Ollama at install time. Only `src/data/model-benchmarks.json` (static data) is shipped.
- No UI redesign — the badge currently appears as a `· Recommended` suffix inline in the model dropdown label (`SummarySection.tsx:35`); v1.3 keeps that visual presentation, only swaps the predicate from string-equality on a hard-coded literal to a JSON-driven lookup.
- The README rewrite itself (DOCS-01..08) is Phase 23. Phase 20 delivers the JSON, the generator script, and the comment-bracketed table markers placed in README — it does NOT rewrite the README's surrounding copy.
- "Live Ollama" means the maintainer must have Ollama running locally; v1.1's PENDING rows exist because P13 ran without it. v1.3 forecloses that by tagging the bench output with the maintainer's actual hardware spec so users see what hardware produced the numbers.

</domain>

<decisions>
## Implementation Decisions

User directive: *"i trust your recommendation, that you will bring best practices and robust solution"* — all gray areas locked with best-practice defaults below. Override before `/gsd-plan-phase 20` if any of these need to change.

### Model lineup (BENCH-03)
- **D-01:** v1.3 ships scored rows for **two** models: `phi4-mini` (the locked default — `src-tauri/src/llm/mod.rs:12`, `src/lib/constants.ts:18`) and `llama3.2:3b` as the alternate. Reasons llama3.2:3b wins over the other PITFALLS-tier candidates:
  - Broad hardware compatibility (2 GB download, runs on any 16 GB-RAM laptop without GPU) — exercises the "low-tier" recommendation context the README will want for non-Apple-Silicon readers.
  - Different model family from phi4-mini → meaningful comparison rather than two variants of the same family.
  - Small enough that the warmup + N=5 + 3-transcript quality sweep + speed bench completes in a reasonable window on a single dev machine (~30–60 minutes total).
- **D-02:** The model lineup is **data-driven from a config array** at the top of `scripts/benchmark-models.mjs`, not hardcoded into the harness logic. Adding `qwen2.5:3b` or `gemma3:12b` in a later milestone = edit the array + rerun the harness. The shape:
  ```js
  const MODELS = [
    { name: 'phi4-mini',   verdict: 'recommended' },
    { name: 'llama3.2:3b', verdict: 'alternate'   },
  ];
  ```
- **D-03:** `qwen2.5:3b` and `gemma3:12b` are **deferred** for v1.3 (see `<deferred>`). They add benchmark runtime for diminishing comparison value in a release-blocker phase; v1.4+ can extend the lineup once the harness is proven.

### Recommended-verdict mechanism (BENCH-04, BENCH-05)
- **D-04:** **Maintainer-written `verdict` field per JSON row.** No auto-picker. Allowed values: `"recommended"`, `"alternate"`, `null`. UI predicate (`SummarySection.tsx`): a model gets the `· Recommended` suffix iff a row exists in `model-benchmarks.json` whose `name` normalizes to match the model and whose `verdict === "recommended"`. **No hard-coded `phi4-mini` string remains in the predicate** (closes BENCH-05).
- **D-05:** Name matching is normalized: `phi4-mini` matches both `phi4-mini` and `phi4-mini:latest` (Ollama exposes the same model under both tags). The normalizer strips a trailing `:latest` suffix before comparing. Defined as a tiny helper `matchesBenchmarkModel(modelName, jsonRowName)` and unit-tested.
- **D-06:** Multiple rows MAY be marked `verdict: "recommended"` (forward-compatibility for hardware-tier'd recommendations in v1.4+). v1.3 ships exactly one — `phi4-mini`. Removing or renaming the recommended row in JSON changes the badge **without a code change** (closes ROADMAP P20 success criterion 4).

### Benchmark metrics scope (BENCH-01, BENCH-02)
- **D-07:** **Quality + speed.** Both dimensions land in the same JSON row per model. Quality is sourced from the v1.1 Python evaluator (reused as-is — no rewrite). Speed is measured by the new Node orchestrator using wall-clock timing + Ollama API response fields.
- **D-08:** **Quality dimensions** (per transcript, then aggregated):
  - `action_items_pct` — percent of ground-truth action items found in summary output (existing v1.1 scorer)
  - `decisions_pct` — percent of ground-truth decisions found
  - `key_points_pct` — percent of ground-truth key points found
  - `sections_present` — boolean: all 4 required Markdown sections (`## Overview`, `## Key Points`, `## Decisions Made`, `## Action Items`) emitted
  - `quality_score` — weighted average: `0.4 * action_items_pct + 0.3 * decisions_pct + 0.2 * key_points_pct + 0.1 * (sections_present ? 100 : 0)`. Single 0-100 number for the README table.
- **D-09:** **Speed dimensions** (median of N=5 measured runs after warmup, on the 45-min canonical transcript only):
  - `tokens_per_sec` — wall-clock-bounded by `num_predict: 512` (per PITFALLS pitfall 7 advice — apples-to-apples)
  - `time_to_first_token_ms`
  - `e2e_summary_seconds` — full end-to-end summary latency at the production `num_predict: -1` setting (what users actually experience); separate measurement pass from the bounded `tokens_per_sec` pass.
- **D-10:** **Two measurement passes per model:**
  1. **Quality pass** — production settings (`num_predict: -1`, `temperature: 0`, `seed: 42`), all 3 transcripts (15/45/90 min), `evaluate.py` scores each output. The 90-min transcript validates the chunked-summarization path.
  2. **Speed pass** — bounded settings (`num_predict: 512`, `temperature: 0`, `seed: 42`), 45-min transcript only, N=5 measured runs after a discarded warmup, median reported.
- **D-11:** **Methodology metadata** (stamped on every JSON row, satisfies ROADMAP P20 success criterion 1):
  - `methodology.warmup_runs: 1` (one discarded warmup pass per model)
  - `methodology.measured_runs: 5`
  - `methodology.aggregation: "median"`
  - `methodology.temperature: 0`
  - `methodology.seed: 42`
  - `methodology.speed_num_predict: 512`
  - `methodology.quality_num_predict: -1`
  - `methodology.notes: "Ollama stop between models to force clean unload (PITFALLS §Pitfall 7)"`

### Hardware-tier representation
- **D-12:** The harness **auto-detects the maintainer's hardware** and stamps each JSON row with a `hardware_tier` object. Fields: `cpu_model`, `total_ram_gb`, `gpu_present` (boolean), `gpu_model` (optional string), `os` (`darwin` / `windows_nt` / `linux`).
- **D-13:** Detection sources, cross-platform via Node:
  - `cpu_model` ← `os.cpus()[0].model.trim()`
  - `total_ram_gb` ← `Math.round(os.totalmem() / (1024 ** 3))`
  - `os` ← `os.platform()` (`darwin` | `win32` | `linux`)
  - `gpu_model` ← best-effort: `system_profiler SPDisplaysDataType` on macOS (parse first `Chipset Model:`), `wmic path win32_VideoController get name /value` on Windows, `lspci | grep -i 'vga\\|3d'` on Linux. Wrap in try/catch — failure sets `gpu_model: null`. `gpu_present` is derived: `gpu_model != null`.
- **D-14:** **Single-machine measurement is acknowledged.** v1.3 ships ONE hardware tier per row — whatever machine the maintainer runs the harness on. The README copy (P23) frames the table as *"Measured on: [maintainer's CPU model] / [RAM] GB / [GPU]"*, not as *"Recommended for your hardware"*. Future milestones can append additional `hardware_tiers[]` entries collected from contributors.
- **D-15:** JSON schema supports multi-tier extension forward (the `hardware_tier` field becomes the FIRST entry in a `hardware_tiers[]` array post-v1.3) but v1.3 ships flat single-tier to keep schema simple. **For v1.3, each model gets one row, one hardware_tier.**

### JSON schema (BENCH-04)
- **D-16:** File path: `src/data/model-benchmarks.json`. Ships as a Vite static import (`tsconfig.json` already has `resolveJsonModule: true`, so `import benchmarks from '../../data/model-benchmarks.json'` works directly — no Vite plugin needed).
- **D-17:** Schema shape:
  ```json
  {
    "schema_version": 1,
    "generated": "2026-05-13T14:32:11.000Z",
    "generator": "scripts/benchmark-models.mjs",
    "hardware_tier": {
      "cpu_model": "Apple M3 Pro",
      "total_ram_gb": 36,
      "gpu_present": true,
      "gpu_model": "Apple M3 Pro GPU (integrated)",
      "os": "darwin"
    },
    "methodology": {
      "warmup_runs": 1,
      "measured_runs": 5,
      "aggregation": "median",
      "temperature": 0,
      "seed": 42,
      "speed_num_predict": 512,
      "quality_num_predict": -1,
      "notes": "Ollama stop between models to force clean unload (PITFALLS §Pitfall 7)"
    },
    "models": [
      {
        "name": "phi4-mini",
        "verdict": "recommended",
        "quality": {
          "quality_score": 92.4,
          "action_items_pct": 95.2,
          "decisions_pct": 89.7,
          "key_points_pct": 91.1,
          "sections_present": true,
          "per_transcript": {
            "15min": { "quality_score": 96.0, "action_items_pct": 100, "decisions_pct": 100, "key_points_pct": 88 },
            "45min": { "quality_score": 91.5, "action_items_pct": 95,  "decisions_pct": 88,  "key_points_pct": 92 },
            "90min": { "quality_score": 89.7, "action_items_pct": 91,  "decisions_pct": 81,  "key_points_pct": 93 }
          }
        },
        "speed": {
          "tokens_per_sec": 38.2,
          "time_to_first_token_ms": 410,
          "e2e_summary_seconds": 42.7
        }
      },
      {
        "name": "llama3.2:3b",
        "verdict": "alternate",
        "quality": { /* same shape */ },
        "speed": { /* same shape */ }
      }
    ]
  }
  ```
- **D-18:** A TypeScript companion type — `src/types/model-benchmarks.ts` — mirrors the schema and is the import target for the Settings UI (not the raw JSON shape). The JSON imports as `unknown`, gets parsed through a `validateBenchmarks(raw): BenchmarkData` helper that throws on shape mismatch. This isolates downstream UI from schema drift.
- **D-19:** **No JSON Schema (`.json` Schema spec) file shipped.** v1.3 enforces shape via the TS type + the validator. Schema-Schema files are over-engineering for a single producer (maintainer-side harness) and a single consumer (Settings UI + README generator). If a second producer ever appears, write the JSON Schema then.

### Harness orchestrator (BENCH-01, BENCH-02)
- **D-20:** **Single Node ESM script** at `scripts/benchmark-models.mjs`, invoked as `bun run benchmark` (also wires `package.json` `"scripts": { "benchmark": "node scripts/benchmark-models.mjs" }`). Reuses the existing `scripts/release-bump.mjs` pattern (Node ESM, no shebang, no `bun` runtime APIs — pure Node so it works whether the maintainer invokes via `bun run` or `node`).
- **D-21:** **Reuse v1.1 Python evaluator** (`.planning/milestones/v1.1-phases/13-llm-quality-tuning/eval/evaluate.py`) and v1.1 ground-truth fixtures (`ground-truth/*.json`, `transcripts/*.txt`) as-is. The Node orchestrator:
  1. Pre-flight: `curl http://localhost:11434/api/tags` to confirm Ollama is running; abort with actionable error if not.
  2. For each model in the lineup:
     - `ollama pull <model>` (idempotent — fast if already present)
     - `ollama stop <model>` to force a clean unload (PITFALLS §Pitfall 7)
     - **Warmup pass:** 1 throwaway summary on the 15min transcript, result discarded.
     - **Quality pass:** for each of the 3 transcripts, invoke the in-app summary path (via a thin Tauri-independent wrapper OR by reusing the existing Ollama HTTP API call shape from `src-tauri/src/llm/mod.rs`; planning agent picks the cleanest spike), capture output to `.planning/phases/20-.../runs/<model>/<transcript>.md`, then `python3 evaluate.py <output.md> <ground_truth.json>` to score.
     - **Speed pass:** N=5 measured runs on the 45min transcript with `num_predict: 512`. Capture per-run `tokens_per_sec`, `time_to_first_token_ms`, `e2e_summary_seconds`. Compute medians.
     - `ollama stop <model>` between models.
  3. Write both outputs:
     - `src/data/model-benchmarks.json` (single source of truth)
     - Backfill the PENDING rows in `.planning/milestones/v1.1-phases/13-llm-quality-tuning/BENCHMARK.md` from the same run (closes BENCH-01 explicitly — the v1.1 report no longer contains PENDING rows; ROADMAP P20 success criterion 1).
- **D-22:** **The harness is idempotent and resumable.** Re-running it overwrites both outputs. Per-model intermediate run outputs (`.planning/phases/20-.../runs/`) are committed for audit and reproducibility — they're cheap (~50 KB per model per transcript). A `--model <name>` flag bench-only one model so partial reruns are cheap.
- **D-23:** **Determinism caveat** (per PITFALLS): even with `temperature: 0` and `seed: 42`, Ollama is documented to drift 1-3% across runs. The N=5 median absorbs this. Test fingerprint stability: re-running the harness on the same maintainer machine within an hour should produce `quality_score` values within ±2.0 of each other. If drift exceeds that, investigate (likely v1.2 prompt-template drift — PITFALLS pitfall 7 root cause 6).
- **D-24:** **Failure modes are explicit.** If Ollama is unreachable: exit 1 with `"Ollama not running at http://localhost:11434 — run 'ollama serve' first"`. If a model fails to pull: exit 1 naming the model. If `evaluate.py` is missing: exit 1 with the path. Never produce a partial JSON file — write atomically via temp-file + rename (same pattern as `scripts/release-bump.mjs`).

### README integration (DOCS-07 forward dependency)
- **D-25:** **Generator script + comment-bracketed block in README.** Path: `scripts/render-benchmark-readme.mjs`. Reads `src/data/model-benchmarks.json`, writes a markdown table between `<!-- BEGIN:BENCHMARK_TABLE -->` and `<!-- END:BENCHMARK_TABLE -->` markers in README.md. Idempotent. Invocation: `bun run benchmark:render-readme`.
- **D-26:** **Phase 20 places the markers in README.md** (as an empty bracketed block near the bottom for now, since the end-user README rewrite is P23). The actual user-visible placement and surrounding copy is decided in P23 — the markers just need to exist somewhere so the generator has an anchor. The script tolerates the markers being moved between P20 and P23 (re-find by exact marker comment, not by line number).
- **D-27:** Table columns (in order): **Model**, **Parameters**, **Download**, **Quality Score**, **Tokens/sec**, **Time-to-first-token**, **Recommended**.
  - "Recommended" column shows `★` for rows with `verdict: "recommended"`, blank otherwise.
  - Below the table, the script renders a single-line footnote: *"Measured on: [cpu_model] / [total_ram_gb] GB / [gpu_model or 'integrated graphics' or 'no discrete GPU'] · Methodology: warmup + N=5 + median · Generated: [generated timestamp]"*. This carries the hardware-tier and methodology metadata into the README without forcing the maintainer to hand-write it.
- **D-28:** **CI assertion is OUT OF SCOPE for Phase 20.** Phase 23 (DOCS-07) decides whether to gate the table on a CI check that the README block matches what the JSON would render. P20 ships the generator; P23 decides on enforcement.

### Settings UI rewire (BENCH-05)
- **D-29:** `src/components/settings/SummarySection.tsx` imports the validated benchmark data at module scope:
  ```ts
  import benchmarksRaw from '../../data/model-benchmarks.json';
  import { validateBenchmarks } from '../../lib/benchmarks';
  const BENCHMARKS = validateBenchmarks(benchmarksRaw);
  ```
- **D-30:** The current `formatModelLabel()` line 35 changes from:
  ```ts
  const rec = model.name === 'phi4-mini' || model.name === 'phi4-mini:latest' ? ' · Recommended' : '';
  ```
  to:
  ```ts
  const recommended = BENCHMARKS.models.some(
    (b) => b.verdict === 'recommended' && matchesBenchmarkModel(model.name, b.name),
  );
  const rec = recommended ? ` · ${t('model_recommended')}` : '';
  ```
  Uses the existing `model_recommended` i18n key (`src/i18n/locales/en/settings.json:147` = "Recommended", `pl/settings.json:147` = "Zalecany"). **No hard-coded English literal**, fixing a latent i18n bug in the current code as well.
- **D-31:** `matchesBenchmarkModel` lives in `src/lib/benchmarks.ts` alongside `validateBenchmarks`. Both are unit-tested via Vitest (existing repo test infrastructure). Tests cover: `:latest` suffix tolerance, case sensitivity (case-sensitive — Ollama model names are), empty-JSON-row tolerance, missing-verdict tolerance.
- **D-32:** **No new UI components.** The badge stays as an inline `· Recommended` suffix in the dropdown label — same visual presentation as today. ROADMAP P20 explicitly says "no UI redesign". A separate visual chip/icon is deferred to v1.4 if user feedback asks for it.
- **D-33:** **Removed-row tolerance.** If `src/data/model-benchmarks.json` has no model with `verdict: "recommended"`, no badge renders anywhere. If the recommended model isn't in the user's local Ollama install, no badge renders for any of their models. Both are correct degraded behaviors — never crash, never throw.

### v1.1 BENCHMARK.md backfill (BENCH-01)
- **D-34:** The harness writes the v1.1 BENCHMARK.md update **as a side effect of the same run** that produces the JSON. Pattern: read the existing markdown, identify `PENDING` cells via regex, replace with measured values, preserve all surrounding prose (especially the existing "Iteration 0 (Baseline)" / "Iteration 1 (`num_predict`)" / "Iteration 2 (tuned prompt)" structure and the "Findings" + "Final Prompt Text" sections — those are historical context, not data).
- **D-35:** Backfill scope: **only the phi4-mini PENDING rows in the existing iteration tables**. llama3.2:3b is NOT added to the v1.1 report (different scope — v1.1 was phi4-mini-only). The cross-model comparison lives in `src/data/model-benchmarks.json`, not the v1.1 report. v1.1's report is "phi4-mini quality tuning over 3 prompt iterations on 3 transcript lengths" — that's its frame, and v1.3 respects it.
- **D-36:** **Iteration coverage:** v1.1 defined 3 prompt iterations (baseline, `num_predict: -1`, tuned prompt). The current code state is the tuned prompt (iteration 2). v1.3 cannot retroactively run iterations 0 and 1 (the source code no longer has those prompt versions). **Therefore: only iteration 2 rows get backfilled with measured scores**; iterations 0 and 1 get a footnote explaining that scores are unrecoverable because the source code moved past them. This is honest reporting, not silent gap-filling.

### Claude's Discretion
- Whether the Node orchestrator calls Ollama directly via `fetch('http://localhost:11434/api/generate')` or shells out to the `ollama` CLI binary — both work; pick whichever produces cleaner per-run timing capture.
- Exact regex / parser for the BENCHMARK.md backfill — as long as the file shape is preserved, the parsing approach is implementation detail.
- Whether the in-app summary path (i.e., the chunked summarization logic from `src-tauri/src/llm/mod.rs`) is reused by the harness via a small Rust binary, or reimplemented in the Node orchestrator at the HTTP level. The Rust route guarantees the harness measures *exactly what users experience* (including chunked synthesis); the Node route is simpler but risks measuring something slightly different from production. Planner decides.
- Per-platform GPU detection edge cases (e.g., macOS Apple Silicon reports GPU under "Chipset Model:" as the SoC name; Linux multi-GPU systems may return multiple lines from `lspci`). Use first-match heuristics; don't over-engineer.
- Test transcript count for the speed pass — D-09 specifies "45-min transcript only" as a robust default, but the planner may add a brief speed measurement on 15min too if it adds runtime negligibly and improves the README's comparison story.
- Whether to add a `scripts/benchmark-models.test.mjs` harness self-test (e.g., a mock Ollama responder for CI). v1.3 doesn't require it — the harness runs maintainer-side only.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements
- `.planning/REQUIREMENTS.md` §BENCH — the 5 locked REQ-IDs for Phase 20 (BENCH-01 through BENCH-05)
- `.planning/ROADMAP.md` §"Phase 20: Benchmark Rerun & Settings Recommendation UI" — 5 explicit success criteria, including the "no hard-coded `phi4-mini` literal" predicate constraint and the "removing or renaming the recommended row in JSON changes the badge without a code change" constraint
- `.planning/research/PITFALLS.md` §Pitfall 7 — full rationale for the warmup + N=5 + median methodology, the `temperature: 0` / `seed: 42` / `num_predict: 512` settings, the `ollama stop` between-models step, and the hardware-tier'd README recommendations
- `.planning/PROJECT.md` §Out of Scope — *"Live re-benchmarking per user install"* is explicitly out of scope; the harness is maintainer-only

### Prior phase context (carried forward)
- `.planning/milestones/v1.1-phases/13-llm-quality-tuning/13-CONTEXT.md` — methodology established (synthetic transcripts, ground-truth-first scoring, completeness-as-primary-quality-dimension); Phase 20 reuses this measurement spine
- `.planning/milestones/v1.1-phases/13-llm-quality-tuning/BENCHMARK.md` — the target document for BENCH-01 backfill; structure must be preserved
- `.planning/phases/19-release-critical-config-packaging-blockers/19-CONTEXT.md` §"VC++ Redist sourcing" + §"Pure-Rust archive extraction" — establishes the *"failure visibility over silent success"* pattern (D-24 here inherits it) and the *"vendor inputs, hash them, code-review changes"* pattern (the model lineup config in `benchmark-models.mjs` is the equivalent: lineup changes are a code-review event)

### Reusable v1.1 harness assets (Phase 20 invokes, does NOT rewrite)
- `.planning/milestones/v1.1-phases/13-llm-quality-tuning/eval/evaluate.py` — Python quality scorer; reused as-is; called as subprocess from the Node orchestrator
- `.planning/milestones/v1.1-phases/13-llm-quality-tuning/ground-truth/15min.json` — ground truth for 15-min synthetic transcript
- `.planning/milestones/v1.1-phases/13-llm-quality-tuning/ground-truth/45min.json` — ground truth for 45-min synthetic transcript (also the canonical speed-bench transcript per D-09)
- `.planning/milestones/v1.1-phases/13-llm-quality-tuning/ground-truth/90min.json` — ground truth for 90-min synthetic transcript (validates the chunked summarization path)
- `.planning/milestones/v1.1-phases/13-llm-quality-tuning/transcripts/15min-product-standup.txt`
- `.planning/milestones/v1.1-phases/13-llm-quality-tuning/transcripts/45min-quarterly-review.txt`
- `.planning/milestones/v1.1-phases/13-llm-quality-tuning/transcripts/90min-architecture-workshop.txt`

### Files this phase modifies
- `src/components/settings/SummarySection.tsx` — `SummarySection.tsx:35` predicate rewrite (BENCH-05); add module-scope JSON import + validator call
- `package.json` — add `"benchmark"` and `"benchmark:render-readme"` script entries
- `.planning/milestones/v1.1-phases/13-llm-quality-tuning/BENCHMARK.md` — backfill phi4-mini iteration-2 PENDING rows (BENCH-01); leave iterations 0/1 with an explicit "unrecoverable — source code moved past this prompt version" footnote
- `README.md` — add empty `<!-- BEGIN:BENCHMARK_TABLE -->` / `<!-- END:BENCHMARK_TABLE -->` markers near the bottom (the user-visible placement and surrounding copy is decided in Phase 23)
- `src/lib/constants.ts` *(maybe)* — only if planner decides the default model identifier should be sourced from the benchmark JSON's `verdict: "recommended"` row at app-init time; v1.3 default is to leave `ollamaModel: 'phi4-mini'` as the constant and let the JSON predicate drive only the badge, not the default selection (avoids a startup data-validation pipeline for a v1.3-low-value benefit)

### Files this phase creates
- `src/data/model-benchmarks.json` — the single source of truth (BENCH-04). Vite static import, dependency-free at user-install time, `generated` timestamp + `schema_version: 1`.
- `src/types/model-benchmarks.ts` — TypeScript schema mirror; the Settings UI imports this type, not the raw JSON shape.
- `src/lib/benchmarks.ts` — `validateBenchmarks(raw): BenchmarkData` throw-on-shape-mismatch validator + `matchesBenchmarkModel(modelName, jsonRowName): boolean` normalizer.
- `src/lib/benchmarks.test.ts` — Vitest unit tests for the validator and normalizer (`:latest` suffix, empty-row tolerance, missing-verdict tolerance).
- `scripts/benchmark-models.mjs` — Node ESM orchestrator: pre-flight Ollama check, per-model warmup + quality pass + speed pass, writes both `src/data/model-benchmarks.json` and the BENCHMARK.md backfill. `--model <name>` flag for partial reruns. Atomic temp-file + rename.
- `scripts/render-benchmark-readme.mjs` — Node ESM generator: reads JSON, writes the README table between marker comments. Idempotent.
- `.planning/phases/20-benchmark-rerun-and-settings-recommendation-ui/runs/` — committed per-model summary outputs from the harness run (audit + reproducibility; ~50 KB per model per transcript).

### Cross-phase touchpoints (do NOT widen scope)
- README rewrite, end-user copy, screenshots, FAQ, install steps → **Phase 23** (DOCS-01..08). Phase 20 only places the table markers and ships the generator; the surrounding README copy is Phase 23's domain.
- Wizard copy / Polish parity / 5-state Ollama detection / stalled-download fallback → **Phase 21** (ONBOARD-01/02/03/05/06). Phase 20 does not change the wizard.
- Clean-VM validation of the JSON loading on real installers → **Phase 22** (VALIDATE-06 round-trip includes summarization, which now reads the JSON for the badge). Phase 20 ships the data; Phase 22 proves it loads on every platform.
- Whether a CI job asserts README-vs-JSON drift → **Phase 23** (DOCS-07). Phase 20 ships the generator; Phase 23 decides on the gate.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`src-tauri/src/commands.rs:60` `OllamaModelInfo` struct** (`name`, `parameter_size`, `download_size`) — the in-memory shape the Settings UI already consumes. Phase 20 layers a separate `BenchmarkData` lookup on top via the model name; it does **not** extend `OllamaModelInfo` with a `recommended` field on the Rust side (that would couple Ollama protocol surface to maintainer benchmark data — wrong layering).
- **v1.1 Python evaluator** (`evaluate.py`) — already does keyword-significant tokenization, action-item person+task matching, and phrase scoring. Output is parseable from stdout — the Node orchestrator captures it via `child_process.execFileSync`. No rewrite needed.
- **`scripts/release-bump.mjs` pattern** (Phase 19) — Node ESM, no shebang, atomic temp-write + rename, refuses unsafe states (dirty tree), prints actionable error messages. `benchmark-models.mjs` and `render-benchmark-readme.mjs` follow the same shape.
- **`src/i18n/locales/{en,pl}/settings.json:147` `model_recommended` key** (en: "Recommended", pl: "Zalecany") — already present from v1.1. The new predicate uses `t('model_recommended')` instead of a hard-coded English literal, fixing a latent i18n bug en route.
- **`tsconfig.json` `resolveJsonModule: true`** — JSON import works natively. No Vite plugin, no asset bundler config needed.

### Established Patterns
- **Structured-error channel pattern** (Phase 11 `OllamaError`, Phase 19 `ExtractError`) — the harness uses concrete error types with `kind` discriminators. Failure modes: `OllamaUnreachable`, `ModelPullFailed`, `EvaluatorMissing`, `EvaluatorFailed`, `JsonWriteFailed`. The CLI prints a single concrete next-step message per failure mode (no stack traces, no generic "Error").
- **Exact-pin discipline for new deps** (Phase 10 sherpa-rs, Phase 19 tar/bzip2/sha2/fs2) — if the harness adds any new npm deps, they get exact-pinned in `package.json` (no `^` or `~`). v1.3 expectation: zero new npm deps required (everything is `child_process` + `fs` + `os` from Node stdlib).
- **i18n-driven user-facing copy** (Phase 11, Phase 19) — no hard-coded English strings in UI code paths. D-30's `t('model_recommended')` follows this; D-32's "no new UI components" keeps the surface area small.
- **Test colocation via Vitest** (existing `src/contexts/OllamaSetupContext.test.tsx`) — `src/lib/benchmarks.test.ts` is colocated next to `src/lib/benchmarks.ts`. No new test framework introduced.

### Integration Points
- `SummarySection.tsx` consumes `OllamaModelInfo[]` from `invoke('list_ollama_models')` and `invoke('list_ollama_library_catalog_models')` — both calls remain unchanged. The new code is purely client-side: enrich each model's display label by cross-referencing the static JSON.
- The Vite build picks up `src/data/model-benchmarks.json` as a regular module import — no special asset handling. The JSON ships inside the bundled JS chunk (small; ~3 KB for two models).
- The harness's per-model warmup needs **the actual chunked-summarization path** used by the production app to faithfully measure the 90-min transcript's behavior. Planner picks between: (a) a thin Rust CLI binary that calls `llm/mod.rs`'s summary function directly, or (b) reimplementing the HTTP-level Ollama call shape in the Node orchestrator. (a) measures-what-users-experience; (b) is simpler. Either route satisfies the success criteria as long as the chunk threshold (>96,000 chars) is honored on the 90-min asset.

</code_context>

<specifics>
## Specific Ideas

- **Honest reporting over silent gap-filling.** v1.1's iterations 0 and 1 cannot be retroactively measured because the source code moved past them. The BENCHMARK.md backfill must explicitly footnote this rather than leaving rows mysteriously absent or filled in with iteration-2 numbers.
- **The badge is data, not code.** The success criterion *"removing or renaming the recommended row in JSON changes the badge without a code change"* is the litmus test for whether the rewire is done. After v1.3 ships, swapping the recommended model is a one-line JSON edit + a regenerated README table.
- **Single-machine measurement is honest.** The README copy frames the table as *"Measured on: [maintainer's hardware]"*, never *"Recommended for your hardware"*. Hardware-tier'd recommendations require multi-machine sweeps and belong in v1.4+.
- **The harness is maintainer-only and that's a feature.** Users get a static JSON, not a runtime benchmark. PROJECT.md §Out of Scope explicitly excludes live re-benchmarking — the JSON is the product, not the harness.

</specifics>

<deferred>
## Deferred Ideas

- **Additional models in the benchmark lineup** — `qwen2.5:3b`, `gemma3:12b`, larger Llama variants. v1.3 lineup is intentionally minimal (phi4-mini + llama3.2:3b). v1.4+ can extend the `MODELS` array in `scripts/benchmark-models.mjs` and rerun.
- **Multi-machine hardware-tier sweeps** — v1.3 ships one machine's measurements. Future milestones can collect contributor-submitted runs into a `hardware_tiers[]` array. JSON schema is forward-compatible (D-15).
- **Auto-recommendation that overrides user model choice** — PROJECT.md §Out of Scope. Recommendations inform; the user's explicit selection wins.
- **Hardware-tier'd "Recommended" badges** (e.g., phi4-mini for low-RAM, gemma3:12b for Apple Silicon) — schema supports it via multiple `verdict: "recommended"` rows, but UI presentation for "which one applies to this user" is a v1.4 design problem.
- **CI assertion that README block matches JSON** — deferred to Phase 23 (DOCS-07). P20 ships the generator; P23 decides on enforcement.
- **Real-time per-user benchmark** — out of v1.3 scope (PROJECT.md). Static maintainer-side benchmark only.
- **Visual badge redesign** (chip / icon / color stripe instead of inline `· Recommended` suffix) — ROADMAP P20 explicitly forbids UI redesign. v1.4+ feature if user feedback asks for it.
- **JSON Schema (.json schema spec) file** — over-engineering for single producer + single consumer. Add when a second producer appears.
- **A `scripts/benchmark-models.test.mjs` harness self-test with a mock Ollama responder** — v1.3 does not require it; the harness runs maintainer-side only and is reviewed via PR.

</deferred>

---

*Phase: 20-benchmark-rerun-and-settings-recommendation-ui*
*Context gathered: 2026-05-13*
