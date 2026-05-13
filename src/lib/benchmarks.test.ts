import { describe, expect, it } from 'vitest';

import { matchesBenchmarkModel, validateBenchmarks } from './benchmarks';

const validBenchmarkRaw = {
  schema_version: 1,
  generated: '2026-05-13T14:32:11.000Z',
  generator: 'scripts/benchmark-models.mjs',
  generator_git_sha: '0000000000000000000000000000000000000000',
  hardware_tier: {
    cpu_model: 'Apple M3 Pro',
    total_ram_gb: 36,
    gpu_present: true,
    gpu_model: 'Apple M3 Pro (integrated, Metal)',
    os: 'darwin',
  },
  methodology: {
    warmup_runs: 1,
    measured_runs: 5,
    aggregation: 'median',
    temperature: 0,
    seed: 42,
    speed_num_predict: 512,
    quality_num_predict: -1,
    notes: 'test fixture',
  },
  models: [
    {
      name: 'phi4-mini',
      verdict: 'recommended',
      quality: {
        quality_score: 0.83,
        action_items_pct: 0.91,
        decisions_pct: 0.78,
        key_points_pct: 0.85,
        sections_present: true,
        per_transcript: {
          '15min': {
            quality_score: 0.85,
            action_items_pct: 0.92,
            decisions_pct: 0.8,
            key_points_pct: 0.87,
          },
          '45min': {
            quality_score: 0.82,
            action_items_pct: 0.9,
            decisions_pct: 0.77,
            key_points_pct: 0.84,
          },
          '90min': {
            quality_score: 0.81,
            action_items_pct: 0.91,
            decisions_pct: 0.76,
            key_points_pct: 0.83,
          },
        },
      },
      speed: {
        tokens_per_sec: 42.5,
        time_to_first_token_ms: 280,
        e2e_summary_seconds: 18.4,
      },
    },
  ],
};

/**
 * Deep-clones validBenchmarkRaw and recursively merges `partial` into it.
 * Matches the buildFilters pattern in libraryFilterParams.test.ts.
 * Hand-rolled to honor D-19 (no lodash.merge).
 */
function buildBenchmark(partial: Record<string, unknown> = {}): unknown {
  const base = JSON.parse(JSON.stringify(validBenchmarkRaw)) as Record<string, unknown>;
  return deepMerge(base, partial);
}

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  for (const key of Object.keys(source)) {
    const sv = source[key];
    const tv = target[key];
    if (
      sv !== null &&
      typeof sv === 'object' &&
      !Array.isArray(sv) &&
      tv !== null &&
      typeof tv === 'object' &&
      !Array.isArray(tv)
    ) {
      target[key] = deepMerge(tv as Record<string, unknown>, sv as Record<string, unknown>);
    } else {
      target[key] = sv;
    }
  }
  return target;
}

describe('matchesBenchmarkModel', () => {
  it('returns true for identical names', () => {
    expect(matchesBenchmarkModel('phi4-mini', 'phi4-mini')).toBe(true);
  });

  it('treats :latest suffix as equivalent (both directions)', () => {
    expect(matchesBenchmarkModel('phi4-mini:latest', 'phi4-mini')).toBe(true);
    expect(matchesBenchmarkModel('phi4-mini', 'phi4-mini:latest')).toBe(true);
  });

  it('is case-sensitive', () => {
    expect(matchesBenchmarkModel('Phi4-Mini', 'phi4-mini')).toBe(false);
  });

  it('returns false for different model names', () => {
    expect(matchesBenchmarkModel('llama3.2:3b', 'phi4-mini')).toBe(false);
  });

  it('preserves tags other than :latest', () => {
    expect(matchesBenchmarkModel('phi4-mini:0.5b', 'phi4-mini')).toBe(false);
  });
});

describe('validateBenchmarks', () => {
  it('returns the parsed BenchmarkData when given a well-formed object', () => {
    const result = validateBenchmarks(buildBenchmark());
    expect(result.schema_version).toBe(1);
    expect(result.models).toHaveLength(1);
    expect(result.models[0].name).toBe('phi4-mini');
    expect(result.models[0].verdict).toBe('recommended');
    expect(result.hardware_tier.os).toBe('darwin');
    expect(result.methodology.aggregation).toBe('median');
  });

  it('throws when schema_version !== 1', () => {
    const bad = buildBenchmark({ schema_version: 2 });
    expect(() => validateBenchmarks(bad)).toThrow();
  });

  it('throws when models is not an array', () => {
    const bad = buildBenchmark({ models: 'not-an-array' as unknown });
    expect(() => validateBenchmarks(bad)).toThrow();
  });

  it('throws when a model row has an unknown verdict (typo)', () => {
    const bad = JSON.parse(JSON.stringify(validBenchmarkRaw));
    bad.models[0].verdict = 'Recomended';
    expect(() => validateBenchmarks(bad)).toThrow();
  });

  it('accepts verdict: null', () => {
    const ok = JSON.parse(JSON.stringify(validBenchmarkRaw));
    ok.models[0].verdict = null;
    const result = validateBenchmarks(ok);
    expect(result.models[0].verdict).toBeNull();
  });

  it('throws when hardware_tier.os is not darwin/win32/linux', () => {
    const bad = buildBenchmark({ hardware_tier: { os: 'freebsd' } });
    expect(() => validateBenchmarks(bad)).toThrow();
  });

  it('accepts models: [] (empty array) — Wave 1 skeleton must validate', () => {
    const ok = buildBenchmark({ models: [] });
    const result = validateBenchmarks(ok);
    expect(result.models).toEqual([]);
  });

  it('throws with a path-bearing message ($.models[0]) when the first model is malformed', () => {
    const bad = JSON.parse(JSON.stringify(validBenchmarkRaw));
    bad.models[0].name = 123;
    expect(() => validateBenchmarks(bad)).toThrow(/\$\.models\[0\]/);
  });
});

describe('methodology assertion (BENCH-02 shape contract)', () => {
  it('accepts the locked methodology shape (warmup=1, measured=5, aggregation=median)', () => {
    const result = validateBenchmarks(buildBenchmark());
    expect(result.methodology.warmup_runs).toBe(1);
    expect(result.methodology.measured_runs).toBe(5);
    expect(result.methodology.aggregation).toBe('median');
  });
});

describe('lineup assertion (BENCH-03 shape contract)', () => {
  it('accepts a 2-model lineup with phi4-mini and llama3.2:3b', () => {
    const second = JSON.parse(JSON.stringify(validBenchmarkRaw.models[0]));
    second.name = 'llama3.2:3b';
    second.verdict = 'alternate';
    const ok = JSON.parse(JSON.stringify(validBenchmarkRaw));
    ok.models = [ok.models[0], second];
    const result = validateBenchmarks(ok);
    expect(result.models[0].name).toBe('phi4-mini');
    expect(result.models[1].name).toBe('llama3.2:3b');
  });
});
