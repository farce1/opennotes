import { Channel, invoke } from '@tauri-apps/api/core';
import { join } from '@tauri-apps/api/path';
import { readDir, remove } from '@tauri-apps/plugin-fs';
import { FileText } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { useSetting } from '../../hooks/useSettings';
import { getDataDirectory } from '../../lib/constants';
import type { DownloadEvent } from '../../types';

type DownloadProgress = {
  downloadedBytes: number;
  totalBytes: number;
  extracting: boolean;
};

export function TranscriptionSection() {
  const [language, updateLanguage] = useSetting('transcriptionLanguage');
  const [modelReady, setModelReady] = useState<boolean>(false);
  const [loadingModelState, setLoadingModelState] = useState(false);
  const [working, setWorking] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);

  const refreshModelState = useCallback(async () => {
    setLoadingModelState(true);
    setErrorMessage(null);

    try {
      const ready = await invoke<boolean>('check_model_ready');
      setModelReady(ready);
    } catch {
      setErrorMessage('Unable to check transcription model status.');
    } finally {
      setLoadingModelState(false);
    }
  }, []);

  useEffect(() => {
    void refreshModelState();
  }, [refreshModelState]);

  const handleDeleteModel = useCallback(async () => {
    const confirmed = window.confirm('Delete downloaded transcription model files?');
    if (!confirmed) {
      return;
    }

    setWorking(true);
    setErrorMessage(null);

    try {
      const dataDir = await getDataDirectory();
      const modelsPath = await join(dataDir, 'models');
      const entries = await readDir(modelsPath);

      for (const entry of entries) {
        const targetPath = await join(modelsPath, entry.name);
        await remove(targetPath, { recursive: true });
      }

      setModelReady(false);
      await refreshModelState();
    } catch {
      setErrorMessage('Unable to delete model files.');
    } finally {
      setWorking(false);
    }
  }, [refreshModelState]);

  const handleDownloadModel = useCallback(async () => {
    setWorking(true);
    setErrorMessage(null);
    setDownloadProgress({
      downloadedBytes: 0,
      totalBytes: 0,
      extracting: false,
    });

    const channel = new Channel<DownloadEvent>();
    channel.onmessage = (event) => {
      if (event.event === 'progress') {
        setDownloadProgress({
          downloadedBytes: event.data.downloadedBytes,
          totalBytes: event.data.totalBytes,
          extracting: false,
        });
        return;
      }

      if (event.event === 'extracting') {
        setDownloadProgress((previous) => ({
          downloadedBytes: previous?.downloadedBytes ?? 0,
          totalBytes: previous?.totalBytes ?? 0,
          extracting: true,
        }));
        return;
      }

      if (event.event === 'complete') {
        setDownloadProgress(null);
        setModelReady(true);
        return;
      }

      if (event.event === 'error') {
        setErrorMessage(event.data.message || 'Model download failed.');
      }
    };

    try {
      await invoke('download_model', { onEvent: channel });
      await refreshModelState();
    } catch {
      setErrorMessage('Unable to start model download.');
    } finally {
      setWorking(false);
      setDownloadProgress(null);
    }
  }, [refreshModelState]);

  const progressPercent = useMemo(() => {
    if (!downloadProgress || !downloadProgress.totalBytes) {
      return 0;
    }

    return Math.min(
      100,
      Math.round((downloadProgress.downloadedBytes / downloadProgress.totalBytes) * 100),
    );
  }, [downloadProgress]);

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2 text-gray-700 dark:text-gray-100">
        <FileText size={20} />
        <h2 className="text-lg font-semibold">Transcription</h2>
      </div>

      <div className="border-b border-gray-100 pb-6 dark:border-gray-800">
        <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">
          Language
        </h3>
        <select
          value={language ?? 'en'}
          onChange={(event) => void updateLanguage(event.target.value)}
          className="mt-3 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
        >
          <option value="en">English</option>
        </select>
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          Additional languages may become available in future updates.
        </p>
      </div>

      <div className="pb-6">
        <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">
          Transcription Model
        </h3>

        <div className="mt-3 rounded-lg bg-gray-50 p-3 dark:bg-gray-800/50">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-100">Parakeet TDT</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">~640 MB</p>
            </div>

            <span
              className={[
                'rounded-full px-2 py-0.5 text-xs font-medium',
                modelReady
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200'
                  : 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-200',
              ].join(' ')}
            >
              {loadingModelState ? 'Checking…' : modelReady ? 'Downloaded' : 'Not Downloaded'}
            </span>
          </div>

          {downloadProgress ? (
            <div className="mt-3 space-y-2">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {downloadProgress.extracting ? 'Extracting model…' : `Downloading… ${progressPercent}%`}
              </p>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                <div
                  className="h-full rounded-full bg-accent transition-all"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          ) : null}

          <div className="mt-3">
            {modelReady ? (
              <button
                type="button"
                onClick={() => void handleDeleteModel()}
                disabled={working}
                className="rounded-lg border border-red-300/80 px-3 py-2 text-sm text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-70 dark:border-red-500/40 dark:text-red-200 dark:hover:bg-red-500/10"
              >
                Delete Model
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void handleDownloadModel()}
                disabled={working}
                className="rounded-lg border border-accent px-3 py-2 text-sm text-accent transition hover:bg-accent-subtle disabled:cursor-not-allowed disabled:opacity-70"
              >
                Download
              </button>
            )}
          </div>
        </div>

        {errorMessage ? (
          <p className="mt-3 rounded-lg border border-red-300/70 bg-red-50/70 px-3 py-2 text-xs text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200">
            {errorMessage}
          </p>
        ) : null}
      </div>
    </section>
  );
}
