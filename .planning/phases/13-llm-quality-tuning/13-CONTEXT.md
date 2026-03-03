# Phase 13: LLM Quality Tuning - Context

**Gathered:** 2026-03-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Benchmark phi4-mini's summarization quality on meetings of varying length (15/45/90 min), then tune `build_summary_prompt()` in `llm/mod.rs` so the default prompt produces reliably complete structured output on long meetings. This phase measures and improves — it does not add new summary sections, change the LLM model, or alter the UI.

</domain>

<decisions>
## Implementation Decisions

### Benchmark methodology
- Use synthetic transcripts with known content (action items, decisions, key points baked in) as ground truth
- 1 carefully crafted transcript per length category (15-min, 45-min, 90-min)
- Automated evaluation: script checks summary output against known ground-truth items
- Primary quality dimension: completeness (did it capture ALL action items and decisions?)
- Secondary dimensions: accuracy and hallucination detection

### Prompt tuning strategy
- Let benchmark results determine how aggressive changes need to be (Claude's discretion on structure vs wording changes)
- Single prompt for all transcript lengths — no length-adaptive variants
- Include the chunked summarization path in tuning scope (90-min will likely hit context window and trigger chunk-then-merge)
- Up to 3 prompt iterations: baseline run, then up to 2 refinement rounds

### Summary output expectations
- Overview section should scale with meeting length (short meetings 3-5 sentences, long meetings 8-12)
- All action items from ground truth must appear in summary — missing any is a failure
- Decisions section captures decision only, not rationale (e.g. "Decided to use PostgreSQL" without "because...")
- If phi4-mini truncates or produces garbled output on long meetings: document the limitation, attempt prompt workarounds, record findings either way

### Documentation & artifacts
- Benchmark results live in `.planning/phases/13-llm-quality-tuning/` as markdown
- Report format: single BENCHMARK.md with tables (transcript length, quality scores, pass/fail, prompt version)
- Synthetic test transcripts committed to repo for reproducibility
- Include side-by-side before/after comparisons showing what changed in prompt and how scores changed per iteration

### Claude's Discretion
- Exact synthetic transcript content and meeting scenarios
- Specific automated evaluation script implementation
- Chunking strategy adjustments if needed
- Whether prompt structure changes are warranted based on benchmark findings

</decisions>

<specifics>
## Specific Ideas

- Ground truth in synthetic transcripts should include clear action items with @person attribution and decisions to test extraction quality
- The 90-min transcript is the critical test case — it validates both single-pass and chunked paths
- Benchmark report should make the rationale for the final prompt self-evident through iteration diffs

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 13-llm-quality-tuning*
*Context gathered: 2026-03-03*
