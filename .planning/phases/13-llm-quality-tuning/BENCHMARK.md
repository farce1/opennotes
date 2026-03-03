# Phase 13 Benchmark Report (phi4-mini)

- Generated: 2026-03-03
- Phase: 13-llm-quality-tuning
- Plan: 13-01

## Environment Status

Live benchmark runs are **pending** because Ollama was not available in this environment during execution.

Command attempted:

```bash
curl -sS http://localhost:11434/api/tags
```

Observed error:

```text
curl: (7) Failed to connect to localhost port 11434 after 0 ms: Couldn't connect to server
```

Per plan instructions, code changes and benchmark infrastructure were completed; live score collection is pending Ollama availability.

## Synthetic Corpus Coverage

| Transcript | Target Duration | Word Count | Character Count | Path Trigger |
|------------|-----------------|------------|-----------------|-------------|
| 15min-product-standup.txt | 15 min | 2,114 | 12,139 | single-pass |
| 45min-quarterly-review.txt | 45 min | 6,310 | 38,169 | single-pass |
| 90min-architecture-workshop.txt | 90 min | 15,509 | 97,741 | chunked (`> 96,000`) |

## Iteration Summary Table

| Transcript | Iteration | Prompt Version | Action Items | Decisions | Key Points | Sections | PASS/FAIL |
|------------|-----------|----------------|--------------|-----------|------------|----------|-----------|
| 15min | 0 (baseline) | baseline prompt, no explicit `num_predict` | PENDING | PENDING | PENDING | PENDING | PENDING |
| 45min | 0 (baseline) | baseline prompt, no explicit `num_predict` | PENDING | PENDING | PENDING | PENDING | PENDING |
| 90min | 0 (baseline) | baseline prompt, no explicit `num_predict` | PENDING | PENDING | PENDING | PENDING | PENDING |
| 15min | 1 (`num_predict`) | explicit `num_predict: -1` in API options | PENDING | PENDING | PENDING | PENDING | PENDING |
| 45min | 1 (`num_predict`) | explicit `num_predict: -1` in API options | PENDING | PENDING | PENDING | PENDING | PENDING |
| 90min | 1 (`num_predict`) | explicit `num_predict: -1` in API options | PENDING | PENDING | PENDING | PENDING | PENDING |
| 15min | 2 (tuned prompt) | prompt/synthesis instructions strengthened | PENDING | PENDING | PENDING | PENDING | PENDING |
| 45min | 2 (tuned prompt) | prompt/synthesis instructions strengthened | PENDING | PENDING | PENDING | PENDING | PENDING |
| 90min | 2 (tuned prompt) | prompt/synthesis instructions strengthened | PENDING | PENDING | PENDING | PENDING | PENDING |

## Prompt Comparison (Side-by-Side)

### Baseline -> Iteration 1

- Change: added `"num_predict": -1` to both Ollama `/api/generate` call paths.
- Rationale: prevent output truncation risk in both streaming and non-streaming generation.

```diff
"options": {
-  "num_ctx": num_ctx
+  "num_ctx": num_ctx,
+  "num_predict": -1
}
```

### Iteration 1 -> Iteration 2 (build_summary_prompt)

- Overview now scales by meeting length.
- Explicit completeness guard added for action items.
- Decision format clarified to forbid rationale text.
- Action-item instruction now enforces full inclusion of assigned tasks.

```diff
## Overview
-[A detailed paragraph (5-8 sentences)...]
+[For short meetings (under 20 minutes), write 3-5 sentences. For longer meetings, write 8-12 sentences...]

## Decisions Made
-[Bullet list of decisions that were made during the meeting...]
+[Bullet list ... State each decision concisely without rationale. Example: "Decided to use PostgreSQL". Do NOT include "because..." reasoning...]

## Action Items
-[List each action item as...]
+[List ALL action items as... Do not skip any. If a person is assigned a task, it MUST appear here...]
+
+IMPORTANT: You MUST capture every single action item mentioned in the transcript...
```

### Iteration 1 -> Iteration 2 (chunked synthesis prompt)

- Added strict cross-chunk action-item preservation rule.
- Added long-meeting overview guidance (8-12 sentences).

```diff
+You MUST include every action item from every section below. Do not merge, summarize, or drop any @person assignments. Each action item from each section must appear in the final Action Items list.
+
+The Overview should be 8-12 sentences since this is a long meeting.
```

## Per-Item Detail Tables

### Iteration 0 (Baseline)

#### 15min-product-standup

| Item Type | Item | Status |
|-----------|------|--------|
| Action | @Alice handle login regression patch by Friday EOD | PENDING RUN |
| Action | @Ben update onboarding tooltip copy by Tuesday | PENDING RUN |
| Action | @Priya prepare churn dashboard snapshot by Monday noon | PENDING RUN |
| Decision | Delay referral launch by one week | PENDING RUN |
| Decision | Keep current email provider for this quarter | PENDING RUN |

#### 45min-quarterly-review

| Item Type | Item | Status |
|-----------|------|--------|
| Action | @Dana draft Q3 hiring plan by next Wednesday | PENDING RUN |
| Action | @Marcus renegotiate analytics vendor pricing by end of month | PENDING RUN |
| Action | @Irene publish customer segmentation memo | PENDING RUN |
| Action | @Leo run checkout latency deep dive by Friday | PENDING RUN |
| Action | @Nia prepare board-ready revenue bridge deck | PENDING RUN |
| Decision | Prioritize enterprise retention over SMB acquisition | PENDING RUN |
| Decision | Sunset legacy onboarding webinar | PENDING RUN |
| Decision | Move APAC expansion target to Q4 | PENDING RUN |
| Decision | Keep pricing tiers unchanged through Q3 | PENDING RUN |

#### 90min-architecture-workshop

| Item Type | Item | Status |
|-----------|------|--------|
| Action | @Elena finalize event schema v2 by Thursday | PENDING RUN |
| Action | @Ravi prototype idempotency middleware by next sprint demo | PENDING RUN |
| Action | @Ming document service-to-service auth matrix by Tuesday | PENDING RUN |
| Action | @Owen run load test at 5k concurrent sessions by Friday | PENDING RUN |
| Action | @Sara create migration plan for Redis cluster | PENDING RUN |
| Action | @Victor draft incident runbook for stream processor by Wednesday | PENDING RUN |
| Action | @Chloe validate PII redaction in log pipeline by Monday | PENDING RUN |
| Action | @Daniel coordinate security review for token rotation with AppSec | PENDING RUN |
| Decision | Adopt PostgreSQL logical replication for analytics feed | PENDING RUN |
| Decision | Use Kafka as the event backbone | PENDING RUN |
| Decision | Keep GraphQL gateway but split read models | PENDING RUN |
| Decision | Postpone full multi-region failover to phase two | PENDING RUN |
| Decision | Enforce zero-downtime migrations via expand-contract | PENDING RUN |
| Decision | Standardize on OpenTelemetry for tracing | PENDING RUN |

### Iteration 1 (`num_predict`) and Iteration 2 (tuned prompt)

The same item sets above are the scoring targets; FOUND/MISSING outcomes remain pending live generation runs.

## Findings

1. **Effect of `num_predict` fix**
- `num_predict: -1` is now explicit in both stream and non-stream Ollama calls, which removes a known truncation risk when output-token defaults are restrictive.

2. **phi4-mini behavior by transcript length**
- 15min and 45min test assets exercise single-pass summarization path.
- 90min asset is 97,741 characters, so in-app `run_summary()` will route to chunked summarization path.

3. **Chunked-path coverage**
- The synthesis prompt now contains explicit action-item retention instructions across sections, addressing cross-chunk omission risk.

4. **Stochastic variation**
- Not measured yet (pending live runs).

5. **Hallucination observations**
- Not measured yet (pending live runs).

## Final Prompt Text (Current Code)

### `build_summary_prompt()`

```text
You are a meeting notes assistant. Given the following meeting transcript, produce structured meeting notes in Markdown with exactly these four sections:

## Overview
[For short meetings (under 20 minutes), write 3-5 sentences. For longer meetings, write 8-12 sentences. Cover the main topics discussed, participants mentioned, and key conclusions reached.]

## Key Points
[Bullet list of the most important facts, insights, or information shared.]

## Decisions Made
[Bullet list of decisions that were made during the meeting. State each decision concisely without rationale. Example: "Decided to use PostgreSQL". Do NOT include "because..." reasoning. If none, write "None identified."]

## Action Items
[List ALL action items as: - @[person]: [task] by [deadline]. Do not skip any. If a person is assigned a task, it MUST appear here. If no deadlines were mentioned, omit the "by" clause. If no action items, write "None identified."]

IMPORTANT: You MUST capture every single action item mentioned in the transcript. Review your output before finishing to verify no action items were missed.

Also generate a concise meeting title (max 10 words) on the very first line as: TITLE: [title]
```

### `generate_summary_chunked()` synthesis prompt

```text
You are given partial meeting summaries from consecutive sections. Synthesize them into a single coherent summary with the same four-section structure.

You MUST include every action item from every section below. Do not merge, summarize, or drop any @person assignments. Each action item from each section must appear in the final Action Items list.

The Overview should be 8-12 sentences since this is a long meeting.

Return the result in Markdown with:
- First line as TITLE: [concise title]
- ## Overview
- ## Key Points
- ## Decisions Made
- ## Action Items
```

## Recommendations

1. Start Ollama and confirm model availability:
   - `ollama serve`
   - `ollama pull phi4-mini`
   - `curl -s http://localhost:11434/api/tags`
2. Run iteration outputs and evaluate with:
   - `python3 .planning/phases/13-llm-quality-tuning/eval/evaluate.py <summary.md> <ground_truth.json>`
3. Backfill this report's PENDING rows with measured scores and FOUND/MISSING status from evaluator output.
