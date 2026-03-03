import clsx from 'clsx';
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  Download,
  Loader2,
  Mic,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';

import { useModelSetup } from '../hooks/useModelSetup';
import { useOllamaSetup } from '../hooks/useOllamaSetup';

function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) {
    return `${(mb / 1024).toFixed(2)} GB`;
  }
  return `${mb.toFixed(1)} MB`;
}

function formatEta(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return 'estimating...';
  }

  const rounded = Math.max(1, Math.round(seconds));
  const minutes = Math.floor(rounded / 60);
  const remainingSeconds = rounded % 60;

  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  }

  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`;
  }

  return `${remainingSeconds}s`;
}

type Tone = 'neutral' | 'success' | 'warning' | 'danger';

function Notice({
  tone,
  children,
  icon: Icon,
}: {
  tone: Tone;
  children: React.ReactNode;
  icon?: typeof Loader2;
}) {
  const toneClass =
    tone === 'success'
      ? 'border-emerald-200 bg-emerald-50/85 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200'
      : tone === 'warning'
        ? 'border-amber-200 bg-amber-50/85 text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200'
        : tone === 'danger'
          ? 'border-red-200 bg-red-50/85 text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200'
          : 'border-gray-200 bg-gray-100/90 text-gray-600 dark:border-gray-700 dark:bg-gray-800/80 dark:text-gray-300';

  return (
    <div className={clsx('flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm', toneClass)}>
      {Icon ? <Icon size={14} className={tone === 'neutral' ? 'animate-spin' : undefined} /> : null}
      <span>{children}</span>
    </div>
  );
}

function StatusChip({
  label,
  value,
  ready,
}: {
  label: string;
  value: string;
  ready: boolean;
}) {
  return (
    <div
      className={clsx(
        'rounded-xl border px-3 py-2',
        ready
          ? 'border-emerald-200/90 bg-emerald-50/80 dark:border-emerald-500/40 dark:bg-emerald-500/10'
          : 'border-gray-200/90 bg-white/70 dark:border-gray-700/80 dark:bg-gray-900/45',
      )}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">{label}</p>
      <p
        className={clsx(
          'mt-1 text-sm font-medium',
          ready ? 'text-emerald-700 dark:text-emerald-200' : 'text-gray-700 dark:text-gray-200',
        )}
      >
        {value}
      </p>
    </div>
  );
}

function modelStateLabel(modelStatus: ReturnType<typeof useModelSetup>['modelStatus']): string {
  if (modelStatus === 'ready') return 'Ready';
  if (modelStatus === 'downloading') return 'Downloading';
  if (modelStatus === 'extracting') return 'Extracting';
  if (modelStatus === 'error') return 'Needs attention';
  if (modelStatus === 'not_ready') return 'Not installed';
  return 'Checking';
}

function notesStateLabel(setupPhase: ReturnType<typeof useOllamaSetup>['setupPhase']): string {
  if (setupPhase === 'ready') return 'Ready';
  if (setupPhase === 'error') return 'Needs attention';
  if (setupPhase === 'not_installed') return 'Not installed';
  if (setupPhase === 'not_running') return 'Not running';
  if (setupPhase === 'model_not_pulled') return 'Model required';
  if (setupPhase === 'pulling') return 'Downloading model';
  if (setupPhase === 'downloading_ollama') return 'Downloading Ollama';
  if (setupPhase === 'extracting_ollama') return 'Extracting Ollama';
  if (setupPhase === 'installing_ollama') return 'Installing Ollama';
  if (setupPhase === 'starting_ollama') return 'Starting Ollama';
  return 'Checking';
}

export function SetupView() {
  const navigate = useNavigate();
  const { modelStatus, downloadProgress, errorMessage: modelErrorMessage, startDownload } = useModelSetup();
  const {
    setupPhase,
    pullProgress,
    ollamaDownloadProgress,
    errorMessage: ollamaErrorMessage,
    autoSetup,
  } = useOllamaSetup();
  const [downloadStartedAt, setDownloadStartedAt] = useState<number | null>(null);
  const [ollamaDownloadStartedAt, setOllamaDownloadStartedAt] = useState<number | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (modelStatus === 'downloading' && downloadStartedAt === null) {
      setDownloadStartedAt(Date.now());
    }

    if (modelStatus !== 'downloading' && modelStatus !== 'extracting') {
      setDownloadStartedAt(null);
      setTick(0);
    }
  }, [downloadStartedAt, modelStatus]);

  useEffect(() => {
    if (setupPhase === 'downloading_ollama' && ollamaDownloadStartedAt === null) {
      setOllamaDownloadStartedAt(Date.now());
    }

    if (setupPhase !== 'downloading_ollama') {
      setOllamaDownloadStartedAt(null);
    }
  }, [setupPhase, ollamaDownloadStartedAt]);

  const isAnyDownloading = modelStatus === 'downloading' || setupPhase === 'downloading_ollama';

  useEffect(() => {
    if (!isAnyDownloading) {
      return;
    }

    const timer = window.setInterval(() => {
      setTick((value) => value + 1);
    }, 1000);

    return () => window.clearInterval(timer);
  }, [isAnyDownloading]);

  const progressPercent = useMemo(() => {
    if (!downloadProgress || downloadProgress.total <= 0) {
      return 0;
    }

    return Math.max(0, Math.min(100, (downloadProgress.downloaded / downloadProgress.total) * 100));
  }, [downloadProgress]);

  const etaLabel = useMemo(() => {
    if (!downloadStartedAt || !downloadProgress || downloadProgress.total <= 0 || downloadProgress.downloaded <= 0) {
      return 'estimating...';
    }

    const elapsedSeconds = Math.max(1, (Date.now() - downloadStartedAt) / 1000);
    const bytesPerSecond = downloadProgress.downloaded / elapsedSeconds;
    if (bytesPerSecond <= 0) {
      return 'estimating...';
    }

    const remainingBytes = Math.max(0, downloadProgress.total - downloadProgress.downloaded);
    return formatEta(remainingBytes / bytesPerSecond);
  }, [downloadProgress, downloadStartedAt, tick]);

  const ollamaProgressPercent = useMemo(() => {
    if (!pullProgress || pullProgress.total <= 0) {
      return 0;
    }

    return Math.max(0, Math.min(100, (pullProgress.completed / pullProgress.total) * 100));
  }, [pullProgress]);

  const ollamaDownloadPercent = useMemo(() => {
    if (!ollamaDownloadProgress || ollamaDownloadProgress.total <= 0) {
      return 0;
    }

    return Math.max(0, Math.min(100, (ollamaDownloadProgress.downloaded / ollamaDownloadProgress.total) * 100));
  }, [ollamaDownloadProgress]);

  const ollamaDownloadEtaLabel = useMemo(() => {
    if (
      !ollamaDownloadStartedAt ||
      !ollamaDownloadProgress ||
      ollamaDownloadProgress.total <= 0 ||
      ollamaDownloadProgress.downloaded <= 0
    ) {
      return 'estimating...';
    }

    const elapsedSeconds = Math.max(1, (Date.now() - ollamaDownloadStartedAt) / 1000);
    const bytesPerSecond = ollamaDownloadProgress.downloaded / elapsedSeconds;
    if (bytesPerSecond <= 0) {
      return 'estimating...';
    }

    const remainingBytes = Math.max(0, ollamaDownloadProgress.total - ollamaDownloadProgress.downloaded);
    return formatEta(remainingBytes / bytesPerSecond);
  }, [ollamaDownloadProgress, ollamaDownloadStartedAt, tick]);

  const allReady = modelStatus === 'ready' && setupPhase === 'ready';

  return (
    <section className="relative h-full min-h-[calc(100vh-3rem)] overflow-hidden rounded-[1.75rem] border border-gray-200/70 bg-gradient-to-br from-white/85 via-white/70 to-gray-100/70 p-4 shadow-[0_28px_80px_-50px_rgba(15,23,42,0.45)] dark:border-gray-800/70 dark:from-gray-900/90 dark:via-gray-900/70 dark:to-gray-950/80 sm:p-5 lg:p-6">
      <div className="pointer-events-none absolute -left-24 -top-20 h-64 w-64 rounded-full bg-accent/10 blur-3xl dark:bg-accent/20" />
      <div className="pointer-events-none absolute -bottom-24 right-8 h-64 w-64 rounded-full bg-gray-400/10 blur-3xl dark:bg-gray-700/25" />

      <div className="relative z-10 flex h-full min-h-0 flex-col gap-4">
        <header className="rounded-2xl border border-gray-200/80 bg-white/80 p-4 shadow-[0_10px_32px_-24px_rgba(15,23,42,0.65)] backdrop-blur-sm dark:border-gray-700/80 dark:bg-gray-900/55 sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gray-500 dark:text-gray-400">Workspace</p>
              <h1 className="mt-1 text-[1.65rem] font-semibold leading-tight text-gray-900 dark:text-gray-50">Models</h1>
              <p className="mt-2 max-w-3xl text-sm text-gray-600 dark:text-gray-300">
                Manage local transcription and AI notes engines. Both run on-device and keep meeting data on your Mac.
              </p>
            </div>

            <div className="grid w-full gap-2 sm:grid-cols-2 lg:w-[380px]">
              <StatusChip label="Speech-to-Text" value={modelStateLabel(modelStatus)} ready={modelStatus === 'ready'} />
              <StatusChip label="AI Notes" value={notesStateLabel(setupPhase)} ready={setupPhase === 'ready'} />
            </div>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-2">
          <article className="flex min-h-0 flex-col rounded-2xl border border-gray-200/80 bg-white/80 p-4 shadow-[0_16px_36px_-30px_rgba(15,23,42,0.75)] backdrop-blur-sm dark:border-gray-700/80 dark:bg-gray-900/55 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-accent/15 text-accent dark:bg-accent/20 dark:text-accent-muted">
                  <Mic size={18} />
                </span>
                <div>
                  <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Speech-to-Text</h2>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                    Transcribes your meetings in real-time with local inference.
                  </p>
                </div>
              </div>

              <span className="rounded-lg border border-gray-200 bg-gray-100/80 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-600 dark:border-gray-700 dark:bg-gray-800/75 dark:text-gray-300">
                Parakeet TDT 0.6B
              </span>
            </div>

            <div className="mt-5 space-y-3">
              {(modelStatus === 'checking' || modelStatus === 'unknown') && (
                <Notice tone="neutral" icon={Loader2}>
                  Checking existing model files...
                </Notice>
              )}

              {modelStatus === 'not_ready' && (
                <div className="space-y-3">
                  <Notice tone="warning">Model is not installed yet.</Notice>
                  <button
                    type="button"
                    onClick={() => void startDownload()}
                    className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-hover"
                  >
                    <Download size={15} />
                    Download Parakeet Model
                  </button>
                </div>
              )}

              {modelStatus === 'downloading' && downloadProgress && (
                <div className="space-y-2.5 rounded-xl border border-gray-200 bg-gray-50/90 p-3.5 dark:border-gray-700 dark:bg-gray-800/70">
                  <div className="flex items-center justify-between text-sm font-medium text-gray-700 dark:text-gray-100">
                    <span>Downloading model...</span>
                    <span>{Math.round(progressPercent)}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                    <div
                      className="h-full rounded-full bg-accent transition-[width] duration-300"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                    <span>
                      {formatBytes(downloadProgress.downloaded)} / {formatBytes(downloadProgress.total)}
                    </span>
                    <span>ETA {etaLabel}</span>
                  </div>
                </div>
              )}

              {modelStatus === 'extracting' && (
                <Notice tone="neutral" icon={Loader2}>
                  Extracting model files...
                </Notice>
              )}

              {modelStatus === 'error' && (
                <div className="space-y-3 rounded-xl border border-red-200 bg-red-50/85 p-3.5 dark:border-red-500/40 dark:bg-red-500/10">
                  <p className="text-sm text-red-700 dark:text-red-200">
                    {modelErrorMessage ?? 'Model download failed. Please retry.'}
                  </p>
                  <button
                    type="button"
                    onClick={() => void startDownload()}
                    className="inline-flex items-center gap-2 rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-100 dark:border-red-500/40 dark:text-red-200 dark:hover:bg-red-500/20"
                  >
                    <RefreshCw size={14} />
                    Retry Download
                  </button>
                </div>
              )}

              {modelStatus === 'ready' && (
                <Notice tone="success" icon={CheckCircle2}>
                  Parakeet TDT 0.6B is ready.
                </Notice>
              )}
            </div>
          </article>

          <article className="flex min-h-0 flex-col rounded-2xl border border-gray-200/80 bg-white/80 p-4 shadow-[0_16px_36px_-30px_rgba(15,23,42,0.75)] backdrop-blur-sm dark:border-gray-700/80 dark:bg-gray-900/55 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-accent/15 text-accent dark:bg-accent/20 dark:text-accent-muted">
                  <Bot size={18} />
                </span>
                <div>
                  <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">AI Notes</h2>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                    Generates summaries and action items using a local Ollama model.
                  </p>
                </div>
              </div>

              <span className="rounded-lg border border-gray-200 bg-gray-100/80 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-600 dark:border-gray-700 dark:bg-gray-800/75 dark:text-gray-300">
                Phi-4 Mini
              </span>
            </div>

            <div className="mt-5 space-y-3">
              {setupPhase === 'checking' && (
                <Notice tone="neutral" icon={Loader2}>
                  Checking Ollama status...
                </Notice>
              )}

              {setupPhase === 'not_installed' && (
                <div className="space-y-3">
                  <Notice tone="warning">Ollama is required for local AI notes.</Notice>
                  <button
                    type="button"
                    onClick={() => void autoSetup()}
                    className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-hover"
                  >
                    <Download size={15} />
                    Set Up AI Notes
                  </button>
                </div>
              )}

              {setupPhase === 'not_running' && (
                <div className="space-y-3">
                  <Notice tone="warning">Ollama is installed but not running.</Notice>
                  <button
                    type="button"
                    onClick={() => void autoSetup()}
                    className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-hover"
                  >
                    <Loader2 size={15} />
                    Start Ollama
                  </button>
                </div>
              )}

              {setupPhase === 'downloading_ollama' && (
                <div className="space-y-2.5 rounded-xl border border-gray-200 bg-gray-50/90 p-3.5 dark:border-gray-700 dark:bg-gray-800/70">
                  <div className="flex items-center justify-between text-sm font-medium text-gray-700 dark:text-gray-100">
                    <span>Downloading Ollama...</span>
                    <span>{Math.round(ollamaDownloadPercent)}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                    <div
                      className="h-full rounded-full bg-accent transition-[width] duration-300"
                      style={{ width: `${ollamaDownloadPercent}%` }}
                    />
                  </div>
                  {ollamaDownloadProgress ? (
                    <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                      <span>
                        {formatBytes(ollamaDownloadProgress.downloaded)} / {formatBytes(ollamaDownloadProgress.total)}
                      </span>
                      <span>ETA {ollamaDownloadEtaLabel}</span>
                    </div>
                  ) : null}
                </div>
              )}

              {setupPhase === 'extracting_ollama' && (
                <Notice tone="neutral" icon={Loader2}>
                  Extracting Ollama...
                </Notice>
              )}

              {setupPhase === 'installing_ollama' && (
                <Notice tone="neutral" icon={Loader2}>
                  Installing Ollama...
                </Notice>
              )}

              {setupPhase === 'starting_ollama' && (
                <Notice tone="neutral" icon={Loader2}>
                  Starting Ollama...
                </Notice>
              )}

              {setupPhase === 'model_not_pulled' && (
                <div className="space-y-3">
                  <Notice tone="warning">Ollama is running. Pull Phi-4 Mini to enable summaries.</Notice>
                  <button
                    type="button"
                    onClick={() => void autoSetup()}
                    className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-hover"
                  >
                    <Download size={15} />
                    Download Phi-4 Mini
                  </button>
                </div>
              )}

              {setupPhase === 'pulling' && pullProgress && (
                <div className="space-y-2.5 rounded-xl border border-gray-200 bg-gray-50/90 p-3.5 dark:border-gray-700 dark:bg-gray-800/70">
                  <div className="flex items-center justify-between text-sm font-medium text-gray-700 dark:text-gray-100">
                    <span>Downloading Phi-4 Mini...</span>
                    <span>{Math.round(ollamaProgressPercent)}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                    <div
                      className="h-full rounded-full bg-accent transition-[width] duration-300"
                      style={{ width: `${ollamaProgressPercent}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                    <span>
                      {formatBytes(pullProgress.completed)} / {formatBytes(pullProgress.total)}
                    </span>
                    <span className="truncate pl-2">{pullProgress.status}</span>
                  </div>
                </div>
              )}

              {setupPhase === 'ready' && (
                <Notice tone="success" icon={CheckCircle2}>
                  Phi-4 Mini is ready.
                </Notice>
              )}

              {setupPhase === 'error' && (
                <div className="space-y-3 rounded-xl border border-red-200 bg-red-50/85 p-3.5 dark:border-red-500/40 dark:bg-red-500/10">
                  <p className="text-sm text-red-700 dark:text-red-200">
                    {ollamaErrorMessage ?? 'Ollama model setup failed. Please retry.'}
                  </p>
                  <button
                    type="button"
                    onClick={() => void autoSetup()}
                    className="inline-flex items-center gap-2 rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-100 dark:border-red-500/40 dark:text-red-200 dark:hover:bg-red-500/20"
                  >
                    <RefreshCw size={14} />
                    Retry Setup
                  </button>
                </div>
              )}
            </div>
          </article>
        </div>

        <footer
          className={clsx(
            'rounded-2xl border px-4 py-3.5 backdrop-blur-sm sm:px-5',
            allReady
              ? 'border-emerald-200/90 bg-emerald-50/80 dark:border-emerald-500/40 dark:bg-emerald-500/10'
              : 'border-gray-200/80 bg-white/80 dark:border-gray-700/80 dark:bg-gray-900/55',
          )}
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span
                className={clsx(
                  'mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-lg',
                  allReady
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200'
                    : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-300',
                )}
              >
                {allReady ? <ShieldCheck size={16} /> : <Sparkles size={16} />}
              </span>
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {allReady ? 'All local models are ready' : 'Finish setup to unlock full recording workflow'}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {allReady
                    ? 'You can start recording with transcription and AI notes enabled.'
                    : 'Complete both cards above to run transcription and summaries entirely on-device.'}
                </p>
              </div>
            </div>

            {allReady ? (
              <button
                type="button"
                onClick={() => navigate('/record')}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
              >
                Start Recording
                <ArrowRight size={15} />
              </button>
            ) : null}
          </div>
        </footer>
      </div>
    </section>
  );
}
