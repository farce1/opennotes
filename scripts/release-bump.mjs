#!/usr/bin/env node
/**
 * Atomic version bump across package.json, src-tauri/Cargo.toml, src-tauri/tauri.conf.json.
 *
 * Phase 19 — CONFIG-03 / D-04..D-06.
 *
 * Usage:
 *   bun run release:bump 1.3.0
 *   bun run release:bump 1.3.0-rc.1
 *   bun run release:bump 1.3.0 --force        # bypass dirty-tree refusal
 *
 * Refuses to run on a dirty working tree (per D-05). Does NOT commit (per D-05).
 * Exits non-zero on any parse / IO failure.
 */

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(__filename), '..');

const PKG_JSON  = resolve(REPO_ROOT, 'package.json');
const CARGO_TOML = resolve(REPO_ROOT, 'src-tauri/Cargo.toml');
const TAURI_JSON = resolve(REPO_ROOT, 'src-tauri/tauri.conf.json');

// SemVer-with-optional-prerelease: 1.3.0 or 1.3.0-rc.1 or 1.3.0-beta.2 etc.
// Strict enough to catch typos like "v1.3.0" or "1.3" while permitting standard prereleases.
const VERSION_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

function usageAndExit(msg) {
  console.error(msg);
  console.error('Usage: bun run release:bump <version> [--force]');
  console.error('  <version> must be semver (e.g., 1.3.0 or 1.3.0-rc.1) — do NOT include a leading "v"');
  process.exit(1);
}

function main() {
  const args = process.argv.slice(2);
  const version = args.find((a) => !a.startsWith('--'));
  const force = args.includes('--force');

  if (!version) usageAndExit('error: missing <version> argument');
  if (!VERSION_RE.test(version)) usageAndExit(`error: "${version}" is not a valid semver (e.g., 1.3.0 or 1.3.0-rc.1)`);

  // Dirty-tree check (D-05)
  const dirty = execSync('git status --porcelain', { encoding: 'utf8', cwd: REPO_ROOT }).trim();
  if (dirty && !force) {
    console.error('error: working tree is dirty.');
    console.error('Commit or stash changes first, or re-run with --force.');
    console.error('Uncommitted changes:');
    console.error(dirty.split('\n').map((l) => '  ' + l).join('\n'));
    process.exit(1);
  }

  const oldVersions = {
    pkg: readPackageJsonVersion(),
    cargo: readCargoVersion(),
    tauri: readTauriConfVersion(),
  };

  try {
    updatePackageJson(version);
    updateCargoToml(version);
    updateTauriConfJson(version);
  } catch (e) {
    console.error(`error: bump failed mid-update: ${e.message}`);
    console.error('One or more files may be in an inconsistent state — review git diff.');
    process.exit(1);
  }

  console.log('Bumped versions:');
  console.log(`  package.json        : ${oldVersions.pkg}  ->  ${version}`);
  console.log(`  src-tauri/Cargo.toml: ${oldVersions.cargo} ->  ${version}`);
  console.log(`  tauri.conf.json     : ${oldVersions.tauri} ->  ${version}`);
  console.log('');
  console.log('Review with `git diff` and commit explicitly.');
}

// --- package.json ---
function readPackageJsonVersion() {
  const pkg = JSON.parse(readFileSync(PKG_JSON, 'utf8'));
  return pkg.version;
}
function updatePackageJson(version) {
  const text = readFileSync(PKG_JSON, 'utf8');
  const pkg = JSON.parse(text);
  pkg.version = version;
  const tmp = PKG_JSON + '.bump.tmp';
  // Preserve trailing newline if the original had one
  const trailing = text.endsWith('\n') ? '\n' : '';
  writeFileSync(tmp, JSON.stringify(pkg, null, 2) + trailing);
  renameSync(tmp, PKG_JSON);
}

// --- src-tauri/Cargo.toml ---
// Per Pitfall 4 in RESEARCH.md: there may be multiple `version = "..."` lines (dep specs).
// Update ONLY the first occurrence after the `[package]` section header.
function readCargoVersion() {
  const lines = readFileSync(CARGO_TOML, 'utf8').split('\n');
  let inPackage = false;
  for (const line of lines) {
    if (line.trim().startsWith('[')) {
      inPackage = line.trim() === '[package]';
      continue;
    }
    if (inPackage) {
      const m = line.match(/^\s*version\s*=\s*"([^"]+)"\s*$/);
      if (m) return m[1];
    }
  }
  throw new Error('could not find [package].version in Cargo.toml');
}
function updateCargoToml(version) {
  const text = readFileSync(CARGO_TOML, 'utf8');
  const lines = text.split('\n');
  let inPackage = false;
  let updated = false;
  const out = [];
  for (const line of lines) {
    if (line.trim().startsWith('[')) {
      inPackage = line.trim() === '[package]';
    }
    if (!updated && inPackage && /^\s*version\s*=\s*"[^"]+"\s*$/.test(line)) {
      out.push(line.replace(/"[^"]+"/, `"${version}"`));
      updated = true;
    } else {
      out.push(line);
    }
  }
  if (!updated) throw new Error('could not update [package].version in Cargo.toml');
  const tmp = CARGO_TOML + '.bump.tmp';
  writeFileSync(tmp, out.join('\n'));
  renameSync(tmp, CARGO_TOML);
}

// --- src-tauri/tauri.conf.json ---
// Per Pitfall 5 in RESEARCH.md: root-level `version` field in Tauri v2.
function readTauriConfVersion() {
  const conf = JSON.parse(readFileSync(TAURI_JSON, 'utf8'));
  return conf.version;
}
function updateTauriConfJson(version) {
  const text = readFileSync(TAURI_JSON, 'utf8');
  const conf = JSON.parse(text);
  conf.version = version;
  const tmp = TAURI_JSON + '.bump.tmp';
  const trailing = text.endsWith('\n') ? '\n' : '';
  writeFileSync(tmp, JSON.stringify(conf, null, 2) + trailing);
  renameSync(tmp, TAURI_JSON);
}

main();
