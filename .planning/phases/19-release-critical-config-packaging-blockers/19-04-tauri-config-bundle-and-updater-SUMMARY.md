---
phase: 19-release-critical-config-packaging-blockers
plan: "04"
subsystem: tauri-config
tags:
  - tauri
  - bundle-config
  - updater
  - keypair
  - docs
dependency_graph:
  requires:
    - 19-02 (release-config-check CI gate — CONFIG-04)
  provides:
    - bundle.targets three-platform array (CONFIG-01)
    - endpoint verification (CONFIG-06)
    - RELEASE_KEYS.md maintainer runbook (D-03)
  affects:
    - 19-05 (NSIS resources — layers on top of bundle block)
    - 22-02 (RELEASE-02 — rc.1 tag; keypair must be complete before tagging)
tech_stack:
  added: []
  patterns:
    - Tauri v2 platform-config merge (base + tauri.windows.conf.json narrowing)
    - minisign updater keypair (pubkey in config, private key in GH secrets)
key_files:
  created:
    - docs/RELEASE_KEYS.md
  modified:
    - src-tauri/tauri.conf.json (bundle.targets only; pubkey deferred)
decisions:
  - "Deferred keypair generation (CONFIG-02): pubkey placeholder retained; CI gate from Plan 02 will block any release attempt until replaced — this is the intended failure mode"
  - "Kept tauri.windows.conf.json with targets: [nsis] — narrows Windows runner; base config is the cross-runner truth"
  - "Task 4 post-release curl verification deferred to Phase 22 (RELEASE-02) — no signed release artifact exists in Phase 19"
metrics:
  duration: "~15 minutes"
  completed: "2026-05-12"
  tasks_completed: 3
  tasks_total: 4
  files_modified: 1
  files_created: 1
---

# Phase 19 Plan 04: Tauri Config Bundle and Updater Summary

## Status: plan partially complete — CONFIG-02 outstanding (release blocker remains)

**One-liner:** Three-platform bundle.targets array committed and endpoint verified; updater pubkey generation deferred pending maintainer keypair setup.

---

## CRITICAL FOLLOW-UP

**CONFIG-02 is NOT closed. A release tag CANNOT be cut until all three steps below are complete.**

The Plan 02 `release-config-check` CI gate will grep for `REPLACE_WITH_GENERATED_PUBKEY` in `tauri.conf.json` on every PR and release attempt. Any release workflow run will fail the preflight check until this is resolved.

### Required actions (maintainer):

**Step 1 — Generate the keypair** (run from outside the repo):

```bash
mkdir -p ~/.tauri
bunx @tauri-apps/cli signer generate -w ~/.tauri/opennotes.key
```

Copy the public key string printed to stdout (single base64 line, ~120 chars).

**Step 2 — Replace the placeholder in tauri.conf.json:**

In `src-tauri/tauri.conf.json`, change:
```json
"pubkey": "REPLACE_WITH_GENERATED_PUBKEY"
```
to:
```json
"pubkey": "<PUBLIC_KEY_STRING_FROM_STEP_1>"
```
Commit + push.

**Step 3 — Add two GitHub Actions secrets:**

Visit `https://github.com/farce1/opennotes/settings/secrets/actions` and create:

| Secret name | Value |
|-------------|-------|
| `TAURI_SIGNING_PRIVATE_KEY` | Full contents of `~/.tauri/opennotes.key` (cat the file and paste) |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | The password chosen during `signer generate` |

These secrets are already wired in `.github/workflows/release.yml` lines 229-230.

**After completing all three steps:** Run Phase 22 (RELEASE-02) to cut the rc.1 tag and run Task 4 verification.

---

## Tasks Completed

| Task | Name | Commit | Outcome |
|------|------|--------|---------|
| 1 | Maintainer keypair generation | — | DEFERRED — pubkey placeholder retained |
| 2 | Apply tauri.conf.json edits (bundle.targets + endpoint verify) | 83852d5 | COMPLETE (Edit A only; Edit B deferred) |
| 3 | Create docs/RELEASE_KEYS.md | 49b6dd3 | COMPLETE |
| 4 | Post-release latest.json verification | — | DEFERRED to Phase 22 (RELEASE-02) |

---

## Requirements Status

| Requirement | Status | Notes |
|-------------|--------|-------|
| CONFIG-01 (bundle.targets three-platform) | CLOSED | `["dmg","nsis","appimage"]` committed at 83852d5 |
| CONFIG-02 (real pubkey + GH secrets) | NOT CLOSED — release blocker | Placeholder remains; see CRITICAL FOLLOW-UP |
| CONFIG-06 (endpoint verified) | CLOSED | Canonical URL verified unchanged in tauri.conf.json |

---

## What Was Built

### Task 2: tauri.conf.json — bundle.targets expansion

**Edit A (applied):** `bundle.targets` changed from `["dmg"]` to `["dmg", "nsis", "appimage"]`.

**Edit B (skipped — deferred):** `plugins.updater.pubkey` remains as `"REPLACE_WITH_GENERATED_PUBKEY"`.

**Endpoint verified (no edit needed):** `plugins.updater.endpoints[0]` is already `"https://github.com/farce1/opennotes/releases/latest/download/latest.json"` — CONFIG-06 closed.

**tauri.windows.conf.json preserved:** `targets: ["nsis"]` unchanged — correctly narrows the Windows runner to NSIS-only while the base config supplies the cross-runner truth.

Verification results:
- `node -p "JSON.stringify(require('./src-tauri/tauri.conf.json').bundle.targets)"` → `["dmg","nsis","appimage"]`
- `node -p "require('./src-tauri/tauri.conf.json').plugins.updater.endpoints[0]"` → `https://github.com/farce1/opennotes/releases/latest/download/latest.json`
- `node -p "require('./src-tauri/tauri.conf.json').productName"` → `openNotes`
- JSON parse exits 0 (valid JSON)
- `bun run build` exits 0 (frontend compile succeeds)
- `grep -c '"targets": ["nsis"]' src-tauri/tauri.windows.conf.json` → `1` (unchanged)

### Task 3: docs/RELEASE_KEYS.md

Created 105-line maintainer-only key-management runbook covering:
- Why the keypair exists (updater signature verification)
- Generation command (`bunx @tauri-apps/cli signer generate`)
- Private key storage locations (table: local, two GH secrets, offline backup placeholder)
- Compromise response procedure (stop bleeding → new keypair → replace secret → notify users)
- Rotation cadence (compromise-only; no scheduled rotation)
- Post-release verification curl snippet

Zero private-key bytes: `grep -c 'untrusted comment:'` returns `0`.

### Task 4: Post-release verification (deferred)

Task 4 is a non-blocking `checkpoint:human-verify` requiring a live signed release artifact. Pre-supplied response was `defer-to-phase-22`. Verification will occur in Phase 22 (RELEASE-02) after the `v1.3.0-rc.1` tag is cut:

```bash
curl -s "https://github.com/farce1/opennotes/releases/latest/download/latest.json" | jq '{version, signature_present: (has("platforms") and (.platforms | to_entries | any(.value.signature)))}'
```

---

## Deviations from Plan

### Deferred Items

**Task 1 (keypair generation) — pre-supplied defer response:**
- Maintainer chose the `defer` path for keypair generation
- `plugins.updater.pubkey` remains as `"REPLACE_WITH_GENERATED_PUBKEY"` (29 chars)
- CONFIG-02 is NOT closed; Plan 02's CI gate will block any release attempt — this is the intended failure mode
- See CRITICAL FOLLOW-UP section above for the exact steps required

**Task 4 (post-release verification) — pre-supplied defer-to-phase-22 response:**
- Verification artifact (signed `latest.json`) does not exist in Phase 19
- Deferred to Phase 22 (RELEASE-02) when `v1.3.0-rc.1` is tagged

No other deviations. Plan executed with Edit A applied, Edit B skipped, platform configs reconciled, and runbook created.

---

## Known Stubs

None. The placeholder `"REPLACE_WITH_GENERATED_PUBKEY"` is an intentional tracked release blocker (CONFIG-02), not an accidental stub. It is surfaced in the CRITICAL FOLLOW-UP section and protected by the Plan 02 CI gate.

---

## Threat Flags

No new threat surface beyond what the plan's `<threat_model>` already covers. All seven STRIDE threats (T-19-04-01 through T-19-04-07) remain as documented in the plan.

---

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| `src-tauri/tauri.conf.json` exists | FOUND |
| `docs/RELEASE_KEYS.md` exists | FOUND |
| Commit 83852d5 exists | FOUND |
| Commit 49b6dd3 exists | FOUND |
| `bundle.targets` == `["dmg","nsis","appimage"]` | PASS |
| Endpoint URL verified unchanged | PASS |
| `tauri.windows.conf.json` unchanged | PASS |
| `RELEASE_KEYS.md` >= 30 lines (105 actual) | PASS |
| Zero private-key bytes in RELEASE_KEYS.md | PASS |
| `bun run build` exits 0 | PASS |
