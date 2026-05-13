/**
 * scripts/benchmark-models.mjs — openNotes benchmark harness (maintainer-only).
 *
 * Purpose: Run a live-Ollama benchmark sweep (warmup + N=5 + median + hardware-tier)
 * over a small lineup of summarization models, emit `src/data/model-benchmarks.json` as
 * the single source of truth, and backfill the v1.1 BENCHMARK.md PENDING rows for
 * phi4-mini iteration 2.
 *
 * Usage:
 *   bun run benchmark                    # full sweep over MODELS
 *   bun run benchmark --model phi4-mini  # partial: rerun one model, preserve other rows
 *
 * Host requirements (pre-flighted):
 *   - Node >= 22 (project requirement)
 *   - Python >= 3.10 on PATH (any of python3, python, py)
 *   - Ollama CLI >= 0.5.0 (per CONTEXT.md D-21; actual ollama-stop floor is 0.3.11
 *     per Pitfall 11 — the conservative 0.5.0 floor is enforced here)
 *   - Ollama daemon running at http://localhost:11434
 *   - git rev-parse HEAD resolvable (script captures generator_git_sha for traceability)
 *
 * Mirrors src-tauri/src/llm/mod.rs:14-18 chunked-summarization constants — keep in sync.
 *
 * Pattern source: scripts/release-bump.mjs (atomic temp-rename, pre-flight refusal shape).
 * No shebang, no bun-specific APIs, no top-level await, no new npm deps (CONTEXT.md D-19).
 */

import { execFileSync, execSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(__filename), '..');
const V11_BENCH_DIR = resolve(REPO_ROOT, '.planning/milestones/v1.1-phases/13-llm-quality-tuning');
const EVALUATE_PY = resolve(V11_BENCH_DIR, 'eval/evaluate.py');
const TRANSCRIPTS = {
  '15min': resolve(V11_BENCH_DIR, 'transcripts/15min-product-standup.txt'),
  '45min': resolve(V11_BENCH_DIR, 'transcripts/45min-quarterly-review.txt'),
  '90min': resolve(V11_BENCH_DIR, 'transcripts/90min-architecture-workshop.txt'),
};
const GROUND_TRUTH = {
  '15min': resolve(V11_BENCH_DIR, 'ground-truth/15min.json'),
  '45min': resolve(V11_BENCH_DIR, 'ground-truth/45min.json'),
  '90min': resolve(V11_BENCH_DIR, 'ground-truth/90min.json'),
};
const JSON_TARGET = resolve(REPO_ROOT, 'src/data/model-benchmarks.json');
const V11_BENCHMARK_MD = resolve(V11_BENCH_DIR, 'BENCHMARK.md');
const RUNS_DIR = resolve(REPO_ROOT, '.planning/phases/20-benchmark-rerun-and-settings-recommendation-ui/runs');

// === Lineup config (D-01, D-02) — edit this array + rerun to extend the lineup ===
const MODELS = [
  { name: 'phi4-mini',   verdict: 'recommended' },
  { name: 'llama3.2:3b', verdict: 'alternate'   },
];

// === Chunked-summarization constants mirrored from src-tauri/src/llm/mod.rs:14-18 ===
// IMPORTANT: keep in sync with the Rust constants. Drift would cause the 90-min
// transcript to be summarized via a different chunk math than users experience.
const MAX_SINGLE_PASS_CHARS = 96_000;     // llm/mod.rs:14
const MAP_CHUNK_CHARS = 80_000;            // llm/mod.rs:15
const MAP_CHUNK_OVERLAP_CHARS = 2_000;     // llm/mod.rs:16
const CHARS_PER_TOKEN_ESTIMATE = 3.5;      // llm/mod.rs:17
const PROMPT_OVERHEAD_TOKENS = 500;        // llm/mod.rs:18

// === Methodology constants (D-11) — stamped on every JSON row ===
const METHODOLOGY = Object.freeze({
  warmup_runs: 1,
  measured_runs: 5,
  aggregation: 'median',
  temperature: 0,
  seed: 42,
  speed_num_predict: 512,
  quality_num_predict: -1,
  notes: "Ollama stop between models to force clean unload (PITFALLS §Pitfall 7)",
});

const OLLAMA_BASE = 'http://localhost:11434';
const OLLAMA_VERSION_FLOOR = '0.5.0';
const PYTHON_VERSION_FLOOR = [3, 10]; // major, minor

function usageAndExit(msg) {
  if (msg) console.error(msg);
  console.error('Usage: bun run benchmark [--model <name>] [--force]');
  console.error('Examples:');
  console.error('  bun run benchmark                       # full sweep');
  console.error('  bun run benchmark --model phi4-mini     # single-model partial rerun');
  process.exit(1);
}

const args = process.argv.slice(2);
const modelFlagIdx = args.indexOf('--model');
const filterModel = modelFlagIdx >= 0 ? args[modelFlagIdx + 1] : null;
if (modelFlagIdx >= 0 && !filterModel) usageAndExit('error: --model requires a name');
const force = args.includes('--force');

const TARGET_MODELS = filterModel
  ? MODELS.filter((m) => m.name === filterModel)
  : MODELS;
if (TARGET_MODELS.length === 0) {
  usageAndExit(`error: --model "${filterModel}" is not in the lineup (allowed: ${MODELS.map(m => m.name).join(', ')})`);
}

// === Pre-flight checks (5 in order — D-21 step 1, D-24) ===

function getGeneratorGitSha() {
  try {
    const sha = execSync('git rev-parse HEAD', { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
    const dirty = execSync('git status --porcelain', { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
    if (dirty) {
      console.warn(`[warn] working tree is dirty; appending -dirty to generator_git_sha. Re-run after committing for a clean release artifact.`);
      return `${sha}-dirty`;
    }
    return sha;
  } catch (e) {
    console.error(`error: 'git rev-parse HEAD' failed — script must run inside a git repo.\n  ${e.message}`);
    process.exit(1);
  }
}

function resolvePython() {
  for (const cmd of ['python3', 'python', 'py']) {
    try {
      const out = execFileSync(cmd, ['--version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
      const m = out.match(/Python (\d+)\.(\d+)/);
      if (m) {
        const [maj, min] = [Number(m[1]), Number(m[2])];
        if (maj > PYTHON_VERSION_FLOOR[0] || (maj === PYTHON_VERSION_FLOOR[0] && min >= PYTHON_VERSION_FLOOR[1])) {
          return cmd;
        }
      }
    } catch { /* try next candidate */ }
  }
  console.error(`error: openNotes benchmark harness requires Python ≥ ${PYTHON_VERSION_FLOOR.join('.')} on PATH (looked for python3, python, py). Install Python 3.10+ and re-run.`);
  process.exit(1);
}

function semverGte(a, b) {
  const ap = a.split('.').map(Number);
  const bp = b.split('.').map(Number);
  for (let i = 0; i < Math.max(ap.length, bp.length); i++) {
    const av = ap[i] ?? 0, bv = bp[i] ?? 0;
    if (av > bv) return true;
    if (av < bv) return false;
  }
  return true;
}

function checkOllamaVersion() {
  let raw;
  try {
    raw = execFileSync('ollama', ['--version'], { encoding: 'utf8' });
  } catch {
    console.error(`error: 'ollama' CLI not found on PATH. Install Ollama: https://ollama.com/download`);
    process.exit(1);
  }
  const m = raw.match(/version is (\d+\.\d+(?:\.\d+)?)/) ?? raw.match(/(\d+\.\d+(?:\.\d+)?)/);
  const version = m ? m[1] : 'unknown';
  if (!semverGte(version, OLLAMA_VERSION_FLOOR)) {
    console.error(`error: openNotes benchmark harness requires Ollama ≥ ${OLLAMA_VERSION_FLOOR} (you have ${version}). The 'ollama stop' command (introduced 0.3.11) and modern /api/generate timing fields are stable from ${OLLAMA_VERSION_FLOOR}+. Upgrade: https://ollama.com/download`);
    process.exit(1);
  }
  return version;
}

async function checkOllamaDaemon() {
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/tags`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await res.json();
  } catch {
    console.error(`error: Ollama not running at http://localhost:11434 — run 'ollama serve' first`);
    process.exit(1);
  }
}

function checkFixtures() {
  const missing = [];
  if (!existsSync(EVALUATE_PY)) missing.push(EVALUATE_PY);
  for (const p of Object.values(TRANSCRIPTS)) if (!existsSync(p)) missing.push(p);
  for (const p of Object.values(GROUND_TRUTH)) if (!existsSync(p)) missing.push(p);
  if (missing.length > 0) {
    console.error(`error: evaluator or fixture missing:\n  ${missing.join('\n  ')}\nThe v1.1 evaluator at ${EVALUATE_PY} and its 3 transcript+ground-truth pairs are required.`);
    process.exit(1);
  }
}

// === Hardware detection (D-12, D-13, D-13a; T-20-03 mitigation) ===

function detectGpu() {
  const platform = os.platform();
  try {
    if (platform === 'darwin') {
      const out = execFileSync('system_profiler', ['SPDisplaysDataType'], { encoding: 'utf8', timeout: 5000 });
      const m = out.match(/Chipset Model:\s*(.+)/);
      if (!m) return null;
      const chipset = m[1].trim();
      if (/^Apple\s+M\d/.test(chipset)) {
        return `${chipset} (integrated, Metal)`;
      }
      return chipset;
    }
    if (platform === 'linux') {
      const out = execFileSync('lspci', [], { encoding: 'utf8', timeout: 5000 });
      const lines = out.split('\n').filter((l) =>
        /VGA compatible controller|3D controller|Display controller/i.test(l)
      );
      if (!lines.length) return null;
      return lines[0].replace(/^[\da-f:.]+\s+[^:]+:\s*/i, '').trim();
    }
    if (platform === 'win32') {
      const out = execFileSync('powershell.exe', [
        '-NoProfile', '-Command',
        'Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name',
      ], { encoding: 'utf8', timeout: 8000 });
      const lines = out.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      return lines[0] ?? null;
    }
  } catch {
    return null;
  }
  return null;
}

function detectHardwareTier() {
  const cpu_model = (os.cpus()[0]?.model ?? 'unknown').trim();
  const total_ram_gb = Math.round(os.totalmem() / (1024 ** 3));
  const platform = os.platform();
  const platformOk = platform === 'darwin' || platform === 'win32' || platform === 'linux';
  if (!platformOk) console.warn(`[warn] unsupported platform "${platform}" — recording as "linux"`);
  const osField = platformOk ? platform : 'linux';
  const gpu_model = detectGpu();
  const gpu_present = gpu_model != null;
  // T-20-03 mitigation: sanity-check line — no hostname, no username, no IP
  console.log(`[hardware-tier] cpu="${cpu_model}" ram_gb=${total_ram_gb} gpu="${gpu_model ?? 'null'}" os="${osField}"`);
  return { cpu_model, total_ram_gb, gpu_present, gpu_model, os: osField };
}

function pathSafeModelName(name) {
  return name.replace(/:/g, '-');
}

async function main() {
  const generator_git_sha = getGeneratorGitSha();
  const pythonCmd = resolvePython();
  const ollamaVersion = checkOllamaVersion();
  await checkOllamaDaemon();
  checkFixtures();
  console.log(`[preflight] python=${pythonCmd} ollama=${ollamaVersion} git=${generator_git_sha} target_models=${TARGET_MODELS.map(m => m.name).join(',')}`);
  const hardware_tier = detectHardwareTier();
  // Task 2 (per-model loop) and Task 3 (JSON write + BENCHMARK.md backfill) extend this.
  console.log('[scaffold] per-model loop implemented in Tasks 2-3');
}

main().catch((e) => {
  console.error(`error: harness failed mid-run: ${e.stack ?? e.message}`);
  console.error('One or more files may be in an inconsistent state — review git diff.');
  process.exit(1);
});
