import type {
  BenchmarkData,
  BenchmarkModel,
  HardwareTier,
  Methodology,
  OsPlatform,
  Quality,
  Speed,
  Verdict,
} from '../types/model-benchmarks';

class BenchmarksValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BenchmarksValidationError';
  }
}

function assertObject(v: unknown, path: string): asserts v is Record<string, unknown> {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) {
    throw new BenchmarksValidationError(
      `expected object at ${path}, got ${v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v}`,
    );
  }
}

function assertString(v: unknown, path: string): asserts v is string {
  if (typeof v !== 'string') {
    throw new BenchmarksValidationError(`expected string at ${path}, got ${typeof v}`);
  }
}

function assertNumber(v: unknown, path: string): asserts v is number {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new BenchmarksValidationError(`expected finite number at ${path}, got ${typeof v}`);
  }
}

function assertBoolean(v: unknown, path: string): asserts v is boolean {
  if (typeof v !== 'boolean') {
    throw new BenchmarksValidationError(`expected boolean at ${path}, got ${typeof v}`);
  }
}

function assertVerdict(v: unknown, path: string): asserts v is Verdict {
  if (v !== 'recommended' && v !== 'alternate' && v !== null) {
    throw new BenchmarksValidationError(
      `expected "recommended" | "alternate" | null at ${path}, got ${JSON.stringify(v)}`,
    );
  }
}

function assertOsPlatform(v: unknown, path: string): asserts v is OsPlatform {
  if (v !== 'darwin' && v !== 'win32' && v !== 'linux') {
    throw new BenchmarksValidationError(
      `expected "darwin" | "win32" | "linux" at ${path}, got ${JSON.stringify(v)}`,
    );
  }
}

function validateHardwareTier(v: unknown, path: string): HardwareTier {
  assertObject(v, path);
  assertString(v.cpu_model, `${path}.cpu_model`);
  assertNumber(v.total_ram_gb, `${path}.total_ram_gb`);
  assertBoolean(v.gpu_present, `${path}.gpu_present`);
  if (v.gpu_model !== null) {
    assertString(v.gpu_model, `${path}.gpu_model`);
  }
  assertOsPlatform(v.os, `${path}.os`);
  return v as unknown as HardwareTier;
}

function validateMethodology(v: unknown, path: string): Methodology {
  assertObject(v, path);
  assertNumber(v.warmup_runs, `${path}.warmup_runs`);
  assertNumber(v.measured_runs, `${path}.measured_runs`);
  if (v.aggregation !== 'median') {
    throw new BenchmarksValidationError(
      `expected "median" at ${path}.aggregation, got ${JSON.stringify(v.aggregation)}`,
    );
  }
  assertNumber(v.temperature, `${path}.temperature`);
  assertNumber(v.seed, `${path}.seed`);
  assertNumber(v.speed_num_predict, `${path}.speed_num_predict`);
  assertNumber(v.quality_num_predict, `${path}.quality_num_predict`);
  assertString(v.notes, `${path}.notes`);
  return v as unknown as Methodology;
}

function validatePerTranscriptQuality(v: unknown, path: string): void {
  assertObject(v, path);
  assertNumber(v.quality_score, `${path}.quality_score`);
  assertNumber(v.action_items_pct, `${path}.action_items_pct`);
  assertNumber(v.decisions_pct, `${path}.decisions_pct`);
  assertNumber(v.key_points_pct, `${path}.key_points_pct`);
}

function validateQuality(v: unknown, path: string): Quality {
  assertObject(v, path);
  assertNumber(v.quality_score, `${path}.quality_score`);
  assertNumber(v.action_items_pct, `${path}.action_items_pct`);
  assertNumber(v.decisions_pct, `${path}.decisions_pct`);
  assertNumber(v.key_points_pct, `${path}.key_points_pct`);
  assertBoolean(v.sections_present, `${path}.sections_present`);
  assertObject(v.per_transcript, `${path}.per_transcript`);
  for (const key of ['15min', '45min', '90min'] as const) {
    validatePerTranscriptQuality(v.per_transcript[key], `${path}.per_transcript.${key}`);
  }
  return v as unknown as Quality;
}

function validateSpeed(v: unknown, path: string): Speed {
  assertObject(v, path);
  assertNumber(v.tokens_per_sec, `${path}.tokens_per_sec`);
  assertNumber(v.time_to_first_token_ms, `${path}.time_to_first_token_ms`);
  assertNumber(v.e2e_summary_seconds, `${path}.e2e_summary_seconds`);
  return v as unknown as Speed;
}

export function validateBenchmarks(raw: unknown): BenchmarkData {
  assertObject(raw, '$');
  if (raw.schema_version !== 1) {
    throw new BenchmarksValidationError(
      `unsupported schema_version: ${JSON.stringify(raw.schema_version)} (expected 1)`,
    );
  }
  assertString(raw.generated, '$.generated');
  assertString(raw.generator, '$.generator');
  assertString(raw.generator_git_sha, '$.generator_git_sha');
  const hardware_tier = validateHardwareTier(raw.hardware_tier, '$.hardware_tier');
  const methodology = validateMethodology(raw.methodology, '$.methodology');
  if (!Array.isArray(raw.models)) {
    throw new BenchmarksValidationError(`expected array at $.models, got ${typeof raw.models}`);
  }
  const models: BenchmarkModel[] = raw.models.map((m, i) => {
    const path = `$.models[${i}]`;
    assertObject(m, path);
    assertString(m.name, `${path}.name`);
    assertVerdict(m.verdict, `${path}.verdict`);
    const quality = validateQuality(m.quality, `${path}.quality`);
    const speed = validateSpeed(m.speed, `${path}.speed`);
    return { name: m.name, verdict: m.verdict, quality, speed };
  });
  return {
    schema_version: 1,
    generated: raw.generated,
    generator: raw.generator,
    generator_git_sha: raw.generator_git_sha,
    hardware_tier,
    methodology,
    models,
  };
}

export function matchesBenchmarkModel(modelName: string, jsonRowName: string): boolean {
  const normalize = (n: string) => n.replace(/:latest$/, '');
  return normalize(modelName) === normalize(jsonRowName);
}
