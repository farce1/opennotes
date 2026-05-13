export type Verdict = 'recommended' | 'alternate' | null;

export type OsPlatform = 'darwin' | 'win32' | 'linux';

export interface HardwareTier {
  cpu_model: string;
  total_ram_gb: number;
  gpu_present: boolean;
  gpu_model: string | null;
  os: OsPlatform;
}

export interface Methodology {
  warmup_runs: number;
  measured_runs: number;
  aggregation: 'median';
  temperature: number;
  seed: number;
  speed_num_predict: number;
  quality_num_predict: number;
  notes: string;
}

export interface PerTranscriptQuality {
  quality_score: number;
  action_items_pct: number;
  decisions_pct: number;
  key_points_pct: number;
}

export interface Quality {
  quality_score: number;
  action_items_pct: number;
  decisions_pct: number;
  key_points_pct: number;
  sections_present: boolean;
  per_transcript: {
    '15min': PerTranscriptQuality;
    '45min': PerTranscriptQuality;
    '90min': PerTranscriptQuality;
  };
}

export interface Speed {
  tokens_per_sec: number;
  time_to_first_token_ms: number;
  e2e_summary_seconds: number;
}

export interface BenchmarkModel {
  name: string;
  verdict: Verdict;
  quality: Quality;
  speed: Speed;
}

export interface BenchmarkData {
  schema_version: 1;
  generated: string;
  generator: string;
  generator_git_sha: string;
  hardware_tier: HardwareTier;
  methodology: Methodology;
  models: BenchmarkModel[];
}
