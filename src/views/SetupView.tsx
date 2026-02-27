import { ArrowRight, Download, RefreshCw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';

import { useModelSetup } from '../hooks/useModelSetup';

function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) {
    return `${(mb / 1024).toFixed(2)} GB`;
  }
  return `${mb.toFixed(1)} MB`;
}

function formatEta(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return 'estimating…';
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

export function SetupView() {
  const navigate = useNavigate();
  const { modelStatus, downloadProgress, errorMessage, startDownload } = useModelSetup();
  const [downloadStartedAt, setDownloadStartedAt] = useState<number | null>(null);
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
    if (modelStatus !== 'downloading') {
      return;
    }

    const timer = window.setInterval(() => {
      setTick((value) => value + 1);
    }, 1000);

    return () => window.clearInterval(timer);
  }, [modelStatus]);

  const progressPercent = useMemo(() => {
    if (!downloadProgress || downloadProgress.total <= 0) {
      return 0;
    }

    return Math.max(0, Math.min(100, (downloadProgress.downloaded / downloadProgress.total) * 100));
  }, [downloadProgress]);

  const etaLabel = useMemo(() => {
    if (!downloadStartedAt || !downloadProgress || downloadProgress.total <= 0 || downloadProgress.downloaded <= 0) {
      return 'estimating…';
    }

    const elapsedSeconds = Math.max(1, (Date.now() - downloadStartedAt) / 1000);
    const bytesPerSecond = downloadProgress.downloaded / elapsedSeconds;
    if (bytesPerSecond <= 0) {
      return 'estimating…';
    }

    const remainingBytes = Math.max(0, downloadProgress.total - downloadProgress.downloaded);
    return formatEta(remainingBytes / bytesPerSecond);
  }, [downloadProgress, downloadStartedAt, tick]);

  return (
    <section className="flex h-full min-h-[calc(100vh-3rem)] items-center justify-center rounded-xl border border-warm-200/80 bg-white/60 px-6 py-10 shadow-sm dark:border-warm-700/70 dark:bg-warm-800/40">
      <div className="w-full max-w-xl rounded-2xl border border-warm-200/70 bg-warm-50/80 p-8 shadow-sm dark:border-warm-700/70 dark:bg-warm-900/30">
        <h1 className="text-2xl font-semibold text-warm-700 dark:text-warm-50">Set Up Transcription</h1>
        <p className="mt-2 text-sm text-warm-600 dark:text-warm-200">
          Download the speech recognition model to enable local meeting transcription.
        </p>
        <p className="mt-1 text-xs uppercase tracking-wide text-warm-400 dark:text-warm-300">
          Optimized for your Mac
        </p>

        {modelStatus === 'checking' || modelStatus === 'unknown' ? (
          <div className="mt-6 rounded-xl border border-warm-200 bg-white/70 px-4 py-3 text-sm text-warm-600 dark:border-warm-700 dark:bg-warm-800/50 dark:text-warm-200">
            Checking existing model files…
          </div>
        ) : null}

        {modelStatus === 'not_ready' ? (
          <button
            type="button"
            onClick={() => void startDownload()}
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-hover"
          >
            <Download size={16} />
            Download Model
          </button>
        ) : null}

        {modelStatus === 'downloading' && downloadProgress ? (
          <div className="mt-6 space-y-3">
            <p className="text-sm font-medium text-warm-700 dark:text-warm-100">Downloading transcription model…</p>
            <div className="h-2.5 overflow-hidden rounded-full bg-warm-200 dark:bg-warm-700">
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-xs text-warm-500 dark:text-warm-300">
              <span>
                {formatBytes(downloadProgress.downloaded)} / {formatBytes(downloadProgress.total)}
              </span>
              <span>ETA {etaLabel}</span>
            </div>
          </div>
        ) : null}

        {modelStatus === 'extracting' ? (
          <div className="mt-6 rounded-xl border border-warm-200 bg-white/70 px-4 py-3 text-sm text-warm-600 dark:border-warm-700 dark:bg-warm-800/50 dark:text-warm-200">
            Extracting model files…
          </div>
        ) : null}

        {modelStatus === 'error' ? (
          <div className="mt-6 space-y-3 rounded-xl border border-red-200 bg-red-50/80 p-4 text-sm dark:border-red-500/40 dark:bg-red-500/10">
            <p className="text-red-700 dark:text-red-200">{errorMessage ?? 'Model setup failed. Please retry.'}</p>
            <button
              type="button"
              onClick={() => void startDownload()}
              className="inline-flex items-center gap-2 rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-100 dark:border-red-500/40 dark:text-red-200 dark:hover:bg-red-500/20"
            >
              <RefreshCw size={14} />
              Retry Download
            </button>
          </div>
        ) : null}

        {modelStatus === 'ready' ? (
          <div className="mt-6 space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/80 p-4 dark:border-emerald-500/40 dark:bg-emerald-500/10">
            <p className="text-sm font-medium text-emerald-700 dark:text-emerald-200">All set! Transcription is ready.</p>
            <button
              type="button"
              onClick={() => navigate('/record')}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
            >
              Start Recording
              <ArrowRight size={15} />
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
