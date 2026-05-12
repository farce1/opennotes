# openNotes — Updater Keypair Operations

> **Maintainer-only runbook.** This document does NOT contain private key bytes.
> It describes how the updater keypair was generated, where the private key lives,
> and how to rotate it if compromise is suspected.
>
> Phase 19 — CONFIG-02 / D-03.

## Why this exists

`src-tauri/tauri.conf.json` `plugins.updater.pubkey` is the public component of a
minisign-style keypair Tauri uses to sign each release's `latest.json` updater
feed. The installed app verifies that signature before applying an auto-update.

Without a real keypair, the app would either:
1. Refuse all updates (if a placeholder pubkey is committed and the feed is signed
   by a non-matching key), or
2. Trust an unauthenticated feed (if signing is disabled), which is a supply-chain
   compromise.

## Generation (one-time, already done)

The current keypair was generated with:

```bash
mkdir -p ~/.tauri
bunx @tauri-apps/cli signer generate -w ~/.tauri/opennotes.key
```

- The private key is written to `~/.tauri/opennotes.key` (encrypted with the
  password chosen at generation time).
- The public key is committed to `src-tauri/tauri.conf.json`
  `plugins.updater.pubkey`.

## Where the private key lives

| Location | Purpose |
|----------|---------|
| `~/.tauri/opennotes.key` (maintainer's machine) | Working copy — never committed |
| GitHub Actions secret `TAURI_SIGNING_PRIVATE_KEY` | Used by `tauri-action` to sign each release's `latest.json` |
| GitHub Actions secret `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Password protecting the private key |
| Offline backup: `<TO BE FILLED BY MAINTAINER>` | Disaster recovery — e.g., encrypted USB stick, 1Password secure note, paper backup in a safe |

The two GitHub secrets are referenced from `.github/workflows/release.yml`
(lines 229-230) and are read by `tauri-action`. Confirm they are populated in
the repo settings at:
`https://github.com/farce1/opennotes/settings/secrets/actions`

## What to do if the private key is compromised

1. Stop the bleeding:
   - Rotate the GitHub Actions secrets immediately (replace with a new keypair —
     see "Rotation" below).
   - Do NOT publish any new release with the old keypair.

2. Generate a new keypair:
   ```bash
   bunx @tauri-apps/cli signer generate -w ~/.tauri/opennotes-NEW.key
   ```

3. Replace the public key:
   - Edit `src-tauri/tauri.conf.json` `plugins.updater.pubkey` to the new public
     key.
   - Run `bun run release:bump <next-version>` (e.g., bump to a hotfix patch).
   - Commit + push + tag.

4. Replace the GitHub Actions secrets:
   - `TAURI_SIGNING_PRIVATE_KEY` <- contents of `~/.tauri/opennotes-NEW.key`
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` <- the new password

5. **Notify users in the release notes.** A compromised key means all
   auto-updates issued under that key are tainted; users on the old key cannot
   auto-update to a new-key release (the signature won't verify). They will need
   to download the new version manually. This is a known limitation of
   in-app updaters — there is no rollover protocol in Tauri v2's updater plugin
   (as of 2026-05).

6. Document the incident in `docs/SECURITY.md` (create if needed) with date,
   suspected cause, and rotation timestamp.

## Rotation cadence

No scheduled rotation. The keypair is rotated only on suspected compromise or
after a major release where the maintainer chooses to refresh keys (e.g., before
a v2.0). Rotation is disruptive to users on auto-update, so we don't rotate
"just in case."

## Verification after a release

Per CONFIG-06 / D-10, after the first signed release:

```bash
curl -s "https://github.com/farce1/opennotes/releases/latest/download/latest.json" | jq '{version, signature_present: (has("platforms") and (.platforms | to_entries | any(.value.signature)))}'
```

Confirms the feed parses and at least one platform entry has a `signature`
field. This does NOT verify the signature cryptographically — the installed
Tauri app does that automatically when checking for updates.

## What is NOT in this file

- The private key bytes (kept out of the repo on purpose).
- The password for the private key.
- The exact offline-backup location (deliberately vague to avoid handing an
  attacker a map).
