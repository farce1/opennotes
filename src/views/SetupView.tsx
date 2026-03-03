import { ArrowRight, Bot, Download, Loader2, RefreshCw } from 'lucide-react';
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
      return 'estimating…';
    }

    const elapsedSeconds = Math.max(1, (Date.now() - ollamaDownloadStartedAt) / 1000);
    const bytesPerSecond = ollamaDownloadProgress.downloaded / elapsedSeconds;
    if (bytesPerSecond <= 0) {
      return 'estimating…';
    }

    const remainingBytes = Math.max(0, ollamaDownloadProgress.total - ollamaDownloadProgress.downloaded);
    return formatEta(remainingBytes / bytesPerSecond);
  }, [ollamaDownloadProgress, ollamaDownloadStartedAt, tick]);

  const allReady = modelStatus === 'ready' && setupPhase === 'ready';

  return (
    <section className="flex h-full min-h-[calc(100vh-3rem)] items-center justify-center px-6 py-10">
      <div className="w-full max-w-3xl p-8">
        <h1 className="text-2xl font-semibold text-gray-700 dark:text-gray-50">Local Models</h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
          Two models run locally on your Mac to power transcription and AI notes. Nothing leaves your device.
        </p>

        <div className="mt-6 space-y-5">
          <div className="rounded-lg bg-gray-50 p-5 dark:bg-gray-800/50">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-700 dark:text-gray-100">Speech-to-Text</h2>
              <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500 dark:bg-gray-700 dark:text-gray-400">Parakeet TDT 0.6B</span>
            </div>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Converts meeting audio into text in real time. Runs on-device using NVIDIA&apos;s Parakeet speech recognition model.
            </p>

            {modelStatus === 'checking' || modelStatus === 'unknown' ? (
              <div className="mt-4 rounded-md bg-gray-100 px-4 py-3 text-sm text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                Checking existing model files…
              </div>
            ) : null}

            {modelStatus === 'not_ready' ? (
              <button
                type="button"
                onClick={() => void startDownload()}
                className="mt-4 inline-flex items-center gap-2 rounded-md bg-accent px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-hover"
              >
                <Download size={16} />
                Download Parakeet TDT 0.6B
              </button>
            ) : null}

            {modelStatus === 'downloading' && downloadProgress ? (
              <div className="mt-4 space-y-3">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-100">Downloading Parakeet TDT 0.6B…</p>
                <div className="h-2.5 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
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
            ) : null}

            {modelStatus === 'extracting' ? (
              <div className="mt-4 rounded-md bg-gray-100 px-4 py-3 text-sm text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                Extracting model files…
              </div>
            ) : null}

            {modelStatus === 'error' ? (
              <div className="mt-4 space-y-3 rounded-lg border border-red-200 bg-red-50/80 p-4 text-sm dark:border-red-500/40 dark:bg-red-500/10">
                <p className="text-red-700 dark:text-red-200">{modelErrorMessage ?? 'Model download failed. Please retry.'}</p>
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
              <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-sm font-medium text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200">
                Parakeet TDT 0.6B is ready.
              </div>
            ) : null}
          </div>

          <div className="rounded-lg bg-gray-50 p-5 dark:bg-gray-800/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bot size={17} className="text-accent" />
                <h2 className="text-base font-semibold text-gray-700 dark:text-gray-100">AI Notes</h2>
              </div>
              <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500 dark:bg-gray-700 dark:text-gray-400">Phi-4 Mini via Ollama</span>
            </div>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Generates meeting summaries and action items after recording. Powered by Microsoft&apos;s Phi-4 Mini running through Ollama.
            </p>

            {setupPhase === 'checking' ? (
              <div className="mt-4 rounded-md bg-gray-100 px-4 py-3 text-sm text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                Checking Ollama status…
              </div>
            ) : null}

            {setupPhase === 'not_installed' ? (
              <div className="mt-4 space-y-3">
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  Ollama is required to run Phi-4 Mini locally. Click below to automatically download, install, and configure everything.
                </p>
                <button
                  type="button"
                  onClick={() => void autoSetup()}
                  className="inline-flex items-center gap-2 rounded-md bg-accent px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-hover"
                >
                  <Download size={16} />
                  Set Up AI Notes
                </button>
              </div>
            ) : null}

            {setupPhase === 'not_running' ? (
              <div className="mt-4 space-y-3">
                <p className="text-sm text-gray-600 dark:text-gray-300">Ollama is installed but not running.</p>
                <button
                  type="button"
                  onClick={() => void autoSetup()}
                  className="inline-flex items-center gap-2 rounded-md bg-accent px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-hover"
                >
                  <Loader2 size={16} />
                  Start Ollama
                </button>
              </div>
            ) : null}

            {setupPhase === 'downloading_ollama' ? (
              <div className="mt-4 space-y-3">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-100">Downloading Ollama…</p>
                <div className="h-2.5 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
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
            ) : null}

            {setupPhase === 'extracting_ollama' ? (
              <div className="mt-4 flex items-center gap-2 rounded-md bg-gray-100 px-4 py-3 text-sm text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                <Loader2 size={14} className="animate-spin" />
                Extracting Ollama…
              </div>
            ) : null}

            {setupPhase === 'installing_ollama' ? (
              <div className="mt-4 flex items-center gap-2 rounded-md bg-gray-100 px-4 py-3 text-sm text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                <Loader2 size={14} className="animate-spin" />
                Installing Ollama…
              </div>
            ) : null}

            {setupPhase === 'starting_ollama' ? (
              <div className="mt-4 flex items-center gap-2 rounded-md bg-gray-100 px-4 py-3 text-sm text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                <Loader2 size={14} className="animate-spin" />
                Starting Ollama…
              </div>
            ) : null}

            {setupPhase === 'model_not_pulled' ? (
              <div className="mt-4 space-y-3">
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  Ollama is running. Download Phi-4 Mini (~2.5 GB) to enable AI-generated meeting summaries.
                </p>
                <button
                  type="button"
                  onClick={() => void autoSetup()}
                  className="inline-flex items-center gap-2 rounded-md bg-accent px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-hover"
                >
                  <Download size={16} />
                  Download Phi-4 Mini
                </button>
              </div>
            ) : null}

            {setupPhase === 'pulling' && pullProgress ? (
              <div className="mt-4 space-y-3">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-100">Downloading Phi-4 Mini…</p>
                <div className="h-2.5 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                  <div
                    className="h-full rounded-full bg-accent transition-[width] duration-300"
                    style={{ width: `${ollamaProgressPercent}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                  <span>
                    {formatBytes(pullProgress.completed)} / {formatBytes(pullProgress.total)}
                  </span>
                  <span>{pullProgress.status}</span>
                </div>
              </div>
            ) : null}

            {setupPhase === 'ready' ? (
              <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-sm font-medium text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200">
                Phi-4 Mini is ready.
              </div>
            ) : null}

            {setupPhase === 'error' ? (
              <div className="mt-4 space-y-3 rounded-lg border border-red-200 bg-red-50/80 p-4 text-sm dark:border-red-500/40 dark:bg-red-500/10">
                <p className="text-red-700 dark:text-red-200">{ollamaErrorMessage ?? 'Ollama model setup failed. Please retry.'}</p>
                <button
                  type="button"
                  onClick={() => void autoSetup()}
                  className="inline-flex items-center gap-2 rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-100 dark:border-red-500/40 dark:text-red-200 dark:hover:bg-red-500/20"
                >
                  <RefreshCw size={14} />
                  Retry
                </button>
              </div>
            ) : null}
          </div>
        </div>

        {allReady ? (
          <div className="mt-6 space-y-3 rounded-md border border-emerald-200 bg-emerald-50/80 p-4 dark:border-emerald-500/40 dark:bg-emerald-500/10">
            <p className="text-sm font-medium text-emerald-700 dark:text-emerald-200">
              Both models are ready. You can start recording.
            </p>
            <button
              type="button"
              onClick={() => navigate('/record')}
              className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
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
