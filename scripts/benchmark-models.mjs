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

// === Block A: Ollama HTTP API timing capture ===
// Mirrors RESEARCH Pattern 4. Timing fields are nanoseconds per Ollama docs.

async function generateAndTime(model, prompt, opts) {
  const wallStart = process.hrtime.bigint();
  const res = await fetch(`${OLLAMA_BASE}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt,
      stream: false,
      keep_alive: opts.keep_alive ?? '5m',
      options: {
        num_predict: opts.num_predict,
        temperature: METHODOLOGY.temperature,
        seed: METHODOLOGY.seed,
        num_ctx: opts.num_ctx ?? 4096,
      },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Ollama /api/generate failed for ${model}: ${res.status} ${body.slice(0, 200)}`);
  }
  const json = await res.json();
  const wall_ns = Number(process.hrtime.bigint() - wallStart);
  return {
    response: json.response ?? '',
    eval_count: json.eval_count ?? 0,
    eval_duration_ns: json.eval_duration ?? 0,
    prompt_eval_duration_ns: json.prompt_eval_duration ?? 0,
    total_duration_ns: json.total_duration ?? 0,
    load_duration_ns: json.load_duration ?? 0,
    wall_clock_ns: wall_ns,
  };
}

// === Block B: Chunked summarization mirroring llm/mod.rs ===
// MUST byte-match src-tauri/src/llm/mod.rs:14-18 — already declared above.
// MUST byte-match src-tauri/src/llm/mod.rs:455 — keep in sync.
// On drift, the byte-diff acceptance check (Step 4) fails loudly.

// Mirrors src-tauri/src/llm/mod.rs:455 — DEFAULT_STANDARD_PROMPT.
const DEFAULT_STANDARD_PROMPT = "You are a meeting notes assistant. Summarize ONLY what is explicitly said in the transcript below. Do NOT invent, assume, or hallucinate any information that is not directly present in the transcript. If the transcript is short or lacks substance, reflect that honestly — write a brief summary and use \"None identified.\" for empty sections.\n\nProduce structured meeting notes in Markdown with exactly these four sections:\n\n## Overview\n[Summarize only what was actually discussed. For very short or minimal transcripts, write 1-2 sentences. For longer meetings, write up to 8-12 sentences. Only mention participants if they are named in the transcript.]\n\n## Key Points\n[Bullet list of the most important facts, insights, or information shared. Only include points explicitly stated in the transcript. If nothing substantive was discussed, write \"None identified.\"]\n\n## Decisions Made\n[Bullet list of decisions that were made during the meeting. Only include decisions explicitly stated. If none, write \"None identified.\"]\n\n## Action Items\n[List ALL action items as: - @[person]: [task] by [deadline]. Only include action items explicitly assigned in the transcript. If no action items were mentioned, write \"None identified.\"]\n\nCRITICAL: Every claim in your summary must be directly traceable to the transcript. If the transcript contains only greetings or filler words, say so. Do NOT fabricate meeting content.\n\nAlso generate a concise meeting title (max 10 words) on the very first line as: TITLE: [title]";

// Mirrors src-tauri/src/llm/mod.rs:448-453 — keep in sync.
// Benchmarks run English-only (per CONTEXT.md scope), but mirror the helper for fidelity.
function buildLanguageInstruction(language) {
  if (language === "pl") {
    return "\nWrite the entire summary in Polish (język polski). Use Polish for all section headings: use \"## Przegląd\" instead of \"## Overview\", \"## Kluczowe punkty\" instead of \"## Key Points\", \"## Podjęte decyzje\" instead of \"## Decisions Made\", \"## Zadania do wykonania\" instead of \"## Action Items\". Write \"Brak.\" instead of \"None identified.\" The TITLE: line should also be in Polish.\n\n";
  }
  return "";
}

// Mirrors src-tauri/src/llm/mod.rs:457-469 — keep in sync.
// Harness uses templatePrompt=null and speakerRoster=null (benchmarks run defaults only).
function buildPromptFromTemplate(transcript, language = "en", templatePrompt = null, speakerRoster = null) {
  const base = templatePrompt ?? DEFAULT_STANDARD_PROMPT;
  const rosterBlock = speakerRoster ?? "";
  const langInstruction = buildLanguageInstruction(language);
  return `${base}\n\n${rosterBlock}${langInstruction}Transcript:\n${transcript}`;
}

// Mirrors src-tauri/src/llm/mod.rs:471-488 — keep in sync.
function buildSynthesisPrompt(stitched, language = "en", templatePrompt = null, speakerRoster = null) {
  const rosterBlock = speakerRoster ?? "";
  const langInstruction = buildLanguageInstruction(language);
  if (templatePrompt != null) {
    return `Synthesize these partial summaries into a single coherent summary. Follow the structure and tone of this template:\n\n${templatePrompt}\n\n${rosterBlock}${langInstruction}Partial summaries:\n\n${stitched}`;
  }
  // Default path — mirror the Rust default verbatim (with language + roster injection).
  return `You are given partial meeting summaries from consecutive sections. Synthesize them into a single coherent summary with the same four-section structure.\n\nYou MUST include every action item from every section below. Do not merge, summarize, or drop any @person assignments. Each action item from each section must appear in the final Action Items list.\n\nThe Overview should be 8-12 sentences since this is a long meeting.\n\nReturn the result in Markdown with:\n- First line as TITLE: [concise title]\n- ## Overview\n- ## Key Points\n- ## Decisions Made\n- ## Action Items\n\n${rosterBlock}${langInstruction}Partial summaries:\n\n${stitched}`;
}

function chunkTranscript(text) {
  if (text.length <= MAP_CHUNK_CHARS) return [text];
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + MAP_CHUNK_CHARS, text.length);
    chunks.push(text.slice(start, end));
    if (end >= text.length) break;
    start = Math.max(end - MAP_CHUNK_OVERLAP_CHARS, start + 1);
  }
  return chunks;
}

async function runSummary(transcript, model) {
  if (transcript.length <= MAX_SINGLE_PASS_CHARS) {
    return await generateAndTime(model, buildPromptFromTemplate(transcript), { num_predict: METHODOLOGY.quality_num_predict });
  }
  // Chunked path — mirrors generate_summary_chunked in llm/mod.rs:539
  const chunks = chunkTranscript(transcript);
  const partials = [];
  const wallStart = process.hrtime.bigint();
  for (const chunk of chunks) {
    const p = await generateAndTime(model, buildPromptFromTemplate(chunk), { num_predict: METHODOLOGY.quality_num_predict });
    partials.push(p.response);
  }
  const stitched = partials.map((p, i) => `Section ${i + 1}:\n${p}`).join("\n\n");
  const synth = await generateAndTime(model, buildSynthesisPrompt(stitched), { num_predict: METHODOLOGY.quality_num_predict });
  const wall_ns = Number(process.hrtime.bigint() - wallStart);
  return { ...synth, total_duration_ns: wall_ns, wall_clock_ns: wall_ns };
}

// === Block C: Evaluator subprocess (Pitfall 10 — exit 0 and exit 1 are BOTH normal) ===

function runEvaluator(pythonCmd, summaryPath, groundTruthPath) {
  const result = spawnSync(pythonCmd, [EVALUATE_PY, summaryPath, groundTruthPath], {
    encoding: 'utf8',
    cwd: REPO_ROOT,
    timeout: 60_000,
  });
  if (result.status === null || result.error) {
    throw new Error(`evaluator failed to run: ${result.error?.message ?? 'spawnSync returned null status'}\nstderr:\n${result.stderr ?? ''}`);
  }
  // Pitfall 10: exit 0 (all-perfect) and exit 1 (some metric < 100%) are BOTH normal.
  // Parse stdout regardless. Only unparseable stdout is a real failure.
  const stdout = result.stdout ?? '';
  const action = parseFloat(stdout.match(/Action items completeness:\s*([\d.]+)%/)?.[1] ?? 'NaN');
  const decision = parseFloat(stdout.match(/Decisions completeness:\s*([\d.]+)%/)?.[1] ?? 'NaN');
  const keypoints = parseFloat(stdout.match(/Key points completeness:\s*([\d.]+)%/)?.[1] ?? 'NaN');
  const sections = /All required sections present:\s*True/i.test(stdout);
  if ([action, decision, keypoints].some((v) => Number.isNaN(v))) {
    throw new Error(`evaluator stdout did not contain expected fields:\nstdout:\n${stdout}\nstderr:\n${result.stderr}`);
  }
  return { action_items_pct: action, decisions_pct: decision, key_points_pct: keypoints, sections_present: sections };
}

function computeQualityScore(q) {
  return 0.4 * q.action_items_pct + 0.3 * q.decisions_pct + 0.2 * q.key_points_pct + 0.1 * (q.sections_present ? 100 : 0);
}

function median(arr) {
  const s = [...arr].sort((a, b) => a - b);
  const n = s.length;
  if (n === 0) return 0;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}

// === Block D: Per-model orchestration ===

function ollamaPull(model) {
  console.log(`[pull] ollama pull ${model}`);
  try {
    execFileSync('ollama', ['pull', model], { stdio: 'inherit', cwd: REPO_ROOT });
  } catch (e) {
    console.error(`error: 'ollama pull ${model}' failed. Check the model name and your network. Exit: ${e.status}`);
    process.exit(1);
  }
}

function ollamaStop(model) {
  try {
    execFileSync('ollama', ['stop', model], { stdio: 'pipe', cwd: REPO_ROOT });
  } catch {
    // 'ollama stop' for an unloaded model is non-zero on some versions; tolerate.
  }
}

async function benchModel(model, pythonCmd) {
  console.log(`\n=== Benchmarking ${model.name} (verdict: ${model.verdict}) ===`);
  const modelDir = resolve(RUNS_DIR, pathSafeModelName(model.name));
  const qualityDir = resolve(modelDir, 'quality');
  const speedDir = resolve(modelDir, 'speed');
  mkdirSync(qualityDir, { recursive: true });
  mkdirSync(speedDir, { recursive: true });

  ollamaPull(model.name);
  ollamaStop(model.name);

  // Warmup — discarded (Pitfall 7 root cause #1)
  console.log(`[warmup] ${model.name}`);
  const warmup15 = readFileSync(TRANSCRIPTS['15min'], 'utf8');
  await generateAndTime(model.name, buildPromptFromTemplate(warmup15), { num_predict: METHODOLOGY.speed_num_predict });

  // Quality pass — 1 run × 3 transcripts (D-10)
  const perTranscript = {};
  const sectionsPerTranscript = {};
  for (const key of ['15min', '45min', '90min']) {
    console.log(`[quality] ${model.name} / ${key}`);
    const transcript = readFileSync(TRANSCRIPTS[key], 'utf8');
    const summary = await runSummary(transcript, model.name);
    const outPath = resolve(qualityDir, `${key}.md`);
    writeFileSync(outPath, summary.response);
    const scores = runEvaluator(pythonCmd, outPath, GROUND_TRUTH[key]);
    const quality_score = computeQualityScore(scores);
    perTranscript[key] = {
      quality_score,
      action_items_pct: scores.action_items_pct,
      decisions_pct: scores.decisions_pct,
      key_points_pct: scores.key_points_pct,
    };
    sectionsPerTranscript[key] = scores.sections_present;
    console.log(`  → action=${scores.action_items_pct}% decisions=${scores.decisions_pct}% keypoints=${scores.key_points_pct}% sections=${scores.sections_present} score=${quality_score.toFixed(1)}`);
  }

  // Aggregate quality across the 3 transcripts (model-level rollup)
  const avg = (k) => (perTranscript['15min'][k] + perTranscript['45min'][k] + perTranscript['90min'][k]) / 3;
  const aggSectionsPresent = Object.values(sectionsPerTranscript).every(Boolean);
  const aggQualityScore = (perTranscript['15min'].quality_score + perTranscript['45min'].quality_score + perTranscript['90min'].quality_score) / 3;

  // Speed pass — N=5 measured runs on 45min only with bounded num_predict (D-09, D-10)
  const speedTranscript = readFileSync(TRANSCRIPTS['45min'], 'utf8');
  const tokPerSec = [];
  const ttftMs = [];
  for (let i = 1; i <= METHODOLOGY.measured_runs; i++) {
    console.log(`[speed] ${model.name} run ${i}/${METHODOLOGY.measured_runs}`);
    const r = await generateAndTime(model.name, buildPromptFromTemplate(speedTranscript), { num_predict: METHODOLOGY.speed_num_predict });
    const tps = r.eval_count > 0 ? r.eval_count / (r.eval_duration_ns / 1e9) : 0;
    const ttft = r.prompt_eval_duration_ns / 1e6;
    tokPerSec.push(tps);
    ttftMs.push(ttft);
    writeFileSync(resolve(speedDir, `run-${i}.md`), r.response);  // gitignored per D-22a
  }
  const tokens_per_sec = median(tokPerSec);
  const time_to_first_token_ms = median(ttftMs);

  // E2E pass — single run at production num_predict on 45min (D-09)
  console.log(`[e2e] ${model.name} (production num_predict: ${METHODOLOGY.quality_num_predict})`);
  const e2eStart = process.hrtime.bigint();
  await runSummary(speedTranscript, model.name);
  const e2e_summary_seconds = Number(process.hrtime.bigint() - e2eStart) / 1e9;

  ollamaStop(model.name);

  return {
    name: model.name,
    verdict: model.verdict,
    quality: {
      quality_score: aggQualityScore,
      action_items_pct: avg('action_items_pct'),
      decisions_pct: avg('decisions_pct'),
      key_points_pct: avg('key_points_pct'),
      sections_present: aggSectionsPresent,
      per_transcript: perTranscript,
    },
    speed: {
      tokens_per_sec,
      time_to_first_token_ms,
      e2e_summary_seconds,
    },
  };
}

async function main() {
  const generator_git_sha = getGeneratorGitSha();
  const pythonCmd = resolvePython();
  const ollamaVersion = checkOllamaVersion();
  await checkOllamaDaemon();
  checkFixtures();
  console.log(`[preflight] python=${pythonCmd} ollama=${ollamaVersion} git=${generator_git_sha} target_models=${TARGET_MODELS.map(m => m.name).join(',')}`);
  const hardware_tier = detectHardwareTier();

  // Per-model loop (Task 2 — Task 3 of this plan writes the JSON + backfills BENCHMARK.md)
  const newModelRows = [];
  for (const m of TARGET_MODELS) {
    newModelRows.push(await benchModel(m, pythonCmd));
  }
  // Task 3 of this plan writes the JSON + backfills BENCHMARK.md from newModelRows + hardware_tier.
  console.log('[scaffold] writer implemented in Task 3');
  globalThis.__BENCH_NEW_ROWS__ = newModelRows;  // bridge to Task 3 wiring
  globalThis.__BENCH_HARDWARE__ = hardware_tier;
  globalThis.__BENCH_GIT_SHA__ = generator_git_sha;
}

main().catch((e) => {
  console.error(`error: harness failed mid-run: ${e.stack ?? e.message}`);
  console.error('One or more files may be in an inconsistent state — review git diff.');
  process.exit(1);
});
