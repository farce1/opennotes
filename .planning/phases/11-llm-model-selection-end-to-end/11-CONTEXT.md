# Phase 11: LLM Model Selection End-to-End - Context

**Gathered:** 2026-03-02
**Status:** Ready for planning

<domain>
## Phase Boundary

The model selector the user chose in Settings is actually used everywhere — summary generation, Ollama status checks, and the setup wizard — with consistent model names in the database and clear error messages when things go wrong. This phase wires the selection through, normalises names, adapts context windows, and polishes the dropdown UX.

</domain>

<decisions>
## Implementation Decisions

### Error message UX
- Errors display **inline in the summary area** (replaces where summary would appear), with a retry button — stays until dismissed
- Messages are **user-friendly with expandable details** — e.g., "This model ran out of memory. Try a smaller model." with a "Show details" toggle for the raw Ollama error
- Error includes an **action button** like "Switch to phi4-mini" or "Retry" that the user can click directly from the error state
- **Connection-refused errors** (Ollama not running) get **distinct treatment** from generation errors (OOM, timeout) — e.g., "Ollama isn't running. Start it and retry." with a check-connection button

### Recommendation labels
- phi4-mini gets a "Recommended" label in the dropdown
- **All models show parameter size** (e.g., "3.8B", "7B") next to the model name so users can gauge capability
- Size info is **queried from Ollama's API** dynamically — always accurate
- Dropdown shows **only installed models** (from `ollama list`) — no suggested/uninstalled models

### Dropdown lock behavior
- Dropdown is **grayed out with a small spinner icon** during active generation, indicating the lock reason visually
- Lock state **persists across navigation** — if user leaves Settings and comes back while generation is running, dropdown stays locked
- Model change **applies immediately** on selection — no confirmation dialog
- **Show model name on the summary page** — small label like "Generated with phi4-mini" so user knows which model produced the summary

### num_ctx adaptation
- **Query Ollama's `/api/show` endpoint** for the model's context length — fall back to safe conservative default (4096) if unavailable
- If transcript is too long for model context: **truncate and warn** — show a note: "Summary based on first X minutes (model context limit)"
- **Pre-check token count** before sending to Ollama — warn user proactively if transcript will likely exceed the model's limit
- num_ctx sizing strategy: Claude's discretion (match transcript vs always max)

### Claude's Discretion
- Exact badge/pill visual design for "Recommended" label (fits existing Settings UI)
- num_ctx sizing strategy — whether to size to transcript length or use model max
- Token estimation approach for pre-check
- Exact spinner placement and animation within the dropdown

</decisions>

<specifics>
## Specific Ideas

- Error action buttons should let the user fix the problem without leaving the current page — e.g., "Switch to phi4-mini" directly switches the model and retries
- Connection errors should feel distinct from generation errors so the user knows whether the problem is "Ollama is off" vs "the model struggled"
- Model size indicators help users make informed choices without needing to know model names by heart

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 11-llm-model-selection-end-to-end*
*Context gathered: 2026-03-02*
