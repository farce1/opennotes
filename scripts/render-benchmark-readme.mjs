/**
 * scripts/render-benchmark-readme.mjs — Render the benchmark table block in README.md.
 *
 * Reads src/data/model-benchmarks.json (the maintainer-curated single source of truth) and
 * replaces the content between <!-- BEGIN:BENCHMARK_TABLE --> and <!-- END:BENCHMARK_TABLE -->
 * markers in README.md.
 *
 * Idempotent: re-running on the same JSON produces zero diff. Anchors on the exact marker
 * comment strings (NOT line numbers) so Phase 23 can relocate the block.
 *
 * Usage: bun run benchmark:render-readme
 * No new npm deps (CONTEXT.md D-19). Pure Node stdlib.
 *
 * Pattern source: scripts/release-bump.mjs (atomic temp-rename write).
 */

import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(__filename), '..');
const JSON_TARGET = resolve(REPO_ROOT, 'src/data/model-benchmarks.json');
const README_TARGET = resolve(REPO_ROOT, 'README.md');

const BEGIN_MARKER = '<!-- BEGIN:BENCHMARK_TABLE -->';
const END_MARKER = '<!-- END:BENCHMARK_TABLE -->';

function dieWith(msg) {
  console.error(`error: ${msg}`);
  process.exit(1);
}

function loadBenchmarks() {
  let text;
  try {
    text = readFileSync(JSON_TARGET, 'utf8');
  } catch (e) {
    dieWith(`could not read ${JSON_TARGET}: ${e.message}. Run 'bun run benchmark' first to produce it.`);
  }
  let raw;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    dieWith(`${JSON_TARGET} is not valid JSON: ${e.message}`);
  }
  // Defense-in-depth shape check (the canonical validator lives in src/lib/benchmarks.ts;
  // this .mjs script duplicates only the fields it uses — D-19 forbids new deps so we
  // cannot import the TS validator here).
  if (typeof raw !== 'object' || raw === null) dieWith('benchmarks JSON root is not an object');
  if (raw.schema_version !== 1) dieWith(`unsupported schema_version: ${JSON.stringify(raw.schema_version)} (expected 1)`);
  if (!Array.isArray(raw.models)) dieWith('benchmarks JSON .models is not an array');
  if (typeof raw.hardware_tier !== 'object' || raw.hardware_tier === null) dieWith('benchmarks JSON .hardware_tier is missing');
  if (typeof raw.methodology !== 'object' || raw.methodology === null) dieWith('benchmarks JSON .methodology is missing');
  if (typeof raw.generated !== 'string') dieWith('benchmarks JSON .generated is missing or not a string');
  return raw;
}

// Heuristic — JSON does not carry `parameters` or `download_size` columns explicitly;
// derive from model name when reasonable. Phase 23 may wire these from the Ollama library
// catalog if the columns need population beyond the parseable cases.
function deriveParameters(modelName) {
  const m = modelName.match(/:(\d+(?:\.\d+)?[bB])\b/) ?? modelName.match(/-?(\d+(?:\.\d+)?[bB])\b/);
  return m ? m[1].toUpperCase() : '';
}

function deriveDownload(_modelName) {
  // TODO(P23-DOCS-07): wire from Ollama library catalog if needed. For v1.3, leave blank — the
  // Settings UI already surfaces a `downloadSize` field via OllamaModelInfo at runtime.
  return '';
}

function renderRow(m) {
  const params = deriveParameters(m.name);
  const download = deriveDownload(m.name);
  const quality = m.quality && typeof m.quality.quality_score === 'number'
    ? m.quality.quality_score.toFixed(1)
    : '';
  const tps = m.speed && typeof m.speed.tokens_per_sec === 'number'
    ? m.speed.tokens_per_sec.toFixed(1)
    : '';
  const ttft = m.speed && typeof m.speed.time_to_first_token_ms === 'number'
    ? `${Math.round(m.speed.time_to_first_token_ms)}ms`
    : '';
  const recommended = m.verdict === 'recommended' ? '★' : '';
  return `| ${m.name} | ${params} | ${download} | ${quality} | ${tps} | ${ttft} | ${recommended} |`;
}

function renderGpuLabel(ht) {
  if (ht.gpu_model) return ht.gpu_model;
  if (ht.gpu_present) return 'integrated graphics';
  return 'no discrete GPU';
}

function renderTable(data) {
  const header = `| Model | Parameters | Download | Quality Score | Tokens/sec | Time-to-first-token | Recommended |`;
  const divider = `|-------|------------|----------|---------------|-----------|-----------------------|-------------|`;
  const rows = data.models.map(renderRow);
  const tableLines = [header, divider, ...rows];
  const footnote = `\n*Measured on: ${data.hardware_tier.cpu_model} / ${data.hardware_tier.total_ram_gb} GB / ${renderGpuLabel(data.hardware_tier)} · Methodology: warmup + N=${data.methodology.measured_runs} + ${data.methodology.aggregation} · Generated: ${data.generated}*`;
  return `\n${tableLines.join('\n')}\n${footnote}\n`;
}

function replaceBetweenMarkers(readmeText, body) {
  const begin = readmeText.indexOf(BEGIN_MARKER);
  const end = readmeText.indexOf(END_MARKER);
  if (begin === -1) dieWith(`README marker not found: ${BEGIN_MARKER}. Place the marker pair in README.md.`);
  if (end === -1) dieWith(`README marker not found: ${END_MARKER}. Place the marker pair in README.md.`);
  if (end < begin) dieWith(`README markers out of order: ${END_MARKER} appears before ${BEGIN_MARKER}`);
  const before = readmeText.slice(0, begin + BEGIN_MARKER.length);
  const after = readmeText.slice(end);
  return `${before}\n${body}\n${after}`;
}

function writeTextAtomic(targetPath, text) {
  const tmp = targetPath + '.bench-readme.tmp';
  writeFileSync(tmp, text);
  renameSync(tmp, targetPath);
}

function main() {
  const data = loadBenchmarks();
  const body = renderTable(data);
  const readmeText = readFileSync(README_TARGET, 'utf8');
  const next = replaceBetweenMarkers(readmeText, body);
  if (next === readmeText) {
    console.log('[render] README.md already up to date — no write needed.');
    return;
  }
  writeTextAtomic(README_TARGET, next);
  console.log(`[render] README.md benchmark table updated (${data.models.length} model rows).`);
}

main();
