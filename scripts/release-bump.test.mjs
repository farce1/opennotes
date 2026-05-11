/**
 * Smoke tests for scripts/release-bump.mjs.
 *
 * Strategy: copy the script into a temp dir that mocks the repo layout
 * (package.json, src-tauri/Cargo.toml, src-tauri/tauri.conf.json),
 * `git init`, then run the script. Assertions cover happy path,
 * dirty-tree refusal, missing-arg refusal, and bad-semver refusal.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(__filename), '..');
const SCRIPT_SRC = join(REPO_ROOT, 'scripts/release-bump.mjs');

function makeFixtureRepo() {
  const root = mkdtempSync(join(tmpdir(), 'release-bump-test-'));
  mkdirSync(join(root, 'scripts'));
  mkdirSync(join(root, 'src-tauri'));
  copyFileSync(SCRIPT_SRC, join(root, 'scripts/release-bump.mjs'));
  writeFileSync(join(root, 'package.json'), JSON.stringify({
    name: 'fixture', version: '0.1.0', type: 'module', scripts: {},
  }, null, 2) + '\n');
  writeFileSync(join(root, 'src-tauri/Cargo.toml'),
    '[package]\nname = "fixture"\nversion = "0.1.0"\nedition = "2021"\n\n[dependencies]\nfoo = { version = "1.2.3" }\n');
  writeFileSync(join(root, 'src-tauri/tauri.conf.json'), JSON.stringify({
    productName: 'fixture', version: '0.1.0',
  }, null, 2) + '\n');
  execSync('git init -q && git add -A && git -c user.email=x@x -c user.name=x commit -q -m init',
    { cwd: root });
  return root;
}

function runBump(root, args) {
  return spawnSync('node', ['scripts/release-bump.mjs', ...args], { cwd: root, encoding: 'utf8' });
}

test('happy path: clean tree, valid version → updates all three files', () => {
  const root = makeFixtureRepo();
  const r = runBump(root, ['1.3.0']);
  assert.equal(r.status, 0, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
  assert.equal(JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version, '1.3.0');
  assert.equal(JSON.parse(readFileSync(join(root, 'src-tauri/tauri.conf.json'), 'utf8')).version, '1.3.0');
  const cargo = readFileSync(join(root, 'src-tauri/Cargo.toml'), 'utf8');
  assert.match(cargo, /^\[package\][\s\S]*?\nversion = "1\.3\.0"/m);
  // Dependency version must be untouched (Pitfall 4 regression check)
  assert.match(cargo, /foo = \{ version = "1\.2\.3" \}/);
});

test('dirty tree without --force → refuses (exit 1)', () => {
  const root = makeFixtureRepo();
  writeFileSync(join(root, 'package.json'), '{}\n'); // make it dirty
  const r = runBump(root, ['1.3.0']);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /working tree is dirty/i);
});

test('dirty tree with --force → proceeds', () => {
  const root = makeFixtureRepo();
  writeFileSync(join(root, 'README.md'), 'untracked\n');
  const r = runBump(root, ['1.3.0', '--force']);
  assert.equal(r.status, 0, `stderr: ${r.stderr}`);
});

test('missing version arg → exit 1 with Usage:', () => {
  const root = makeFixtureRepo();
  const r = runBump(root, []);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Usage:/);
});

test('invalid version (with leading v) → exit 1', () => {
  const root = makeFixtureRepo();
  const r = runBump(root, ['v1.3.0']);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /not a valid semver/);
});

test('rc.1 prerelease version → accepted', () => {
  const root = makeFixtureRepo();
  const r = runBump(root, ['1.3.0-rc.1']);
  assert.equal(r.status, 0, `stderr: ${r.stderr}`);
  assert.equal(JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version, '1.3.0-rc.1');
});
