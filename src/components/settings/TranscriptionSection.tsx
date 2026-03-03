import { Channel, invoke } from '@tauri-apps/api/core';
import { join } from '@tauri-apps/api/path';
import { readDir, remove } from '@tauri-apps/plugin-fs';
import { FileText } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { useSetting } from '../../hooks/useSettings';
import { getDataDirectory } from '../../lib/constants';
import type { DownloadEvent } from '../../types';
import { Dropdown } from '../ui/Dropdown';

type DownloadProgress = {
  downloadedBytes: number;
  totalBytes: number;
  extracting: boolean;
};

const panelClasses =
  'relative z-0 rounded-2xl border border-gray-200/80 bg-white/75 p-4 shadow-sm backdrop-blur-sm focus-within:z-20 dark:border-gray-700/80 dark:bg-gray-900/45';

const LANGUAGE_OPTIONS = [
  { value: 'en', label: 'English' },
  { value: 'pl', label: 'Polish' },
];

export function TranscriptionSection() {
  const [language, updateLanguage] = useSetting('transcriptionLanguage');
  const [modelReady, setModelReady] = useState<boolean>(false);
  const [loadingModelState, setLoadingModelState] = useState(false);
  const [working, setWorking] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);

  const activeLanguage = language ?? 'en';
  const activeModel = activeLanguage === 'pl' ? 'Whisper Tiny (Multilingual)' : 'Parakeet TDT';
  const activeModelSize = activeLanguage === 'pl' ? 'Download size ~111 MB' : 'Download size ~460 MB';

  const refreshModelState = useCallback(async () => {
    setLoadingModelState(true);
    setErrorMessage(null);

    try {
      const ready = await invoke<boolean>('check_model_ready', {
        transcriptionLanguage: activeLanguage,
      });
      setModelReady(ready);
    } catch {
      setErrorMessage('Unable to check transcription model status.');
    } finally {
      setLoadingModelState(false);
    }
  }, [activeLanguage]);

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
      await invoke('download_model', {
        onEvent: channel,
        transcriptionLanguage: activeLanguage,
      });
      await refreshModelState();
    } catch {
      setErrorMessage('Unable to start model download.');
    } finally {
      setWorking(false);
      setDownloadProgress(null);
    }
  }, [activeLanguage, refreshModelState]);

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
    <section className="space-y-5">
      <div className="flex items-start gap-3">
        <span className="rounded-xl border border-gray-200/80 bg-white/80 p-2 text-gray-500 shadow-sm dark:border-gray-700/80 dark:bg-gray-800/70 dark:text-gray-300">
          <FileText size={18} />
        </span>
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-gray-800 dark:text-gray-50">Transcription</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Manage language preferences and local model availability.</p>
        </div>
      </div>

      <div className={panelClasses}>
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-100">Language</h3>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Current release supports English and Polish transcription.</p>

        <Dropdown
          value={activeLanguage}
          options={LANGUAGE_OPTIONS}
          onChange={(value) => {
            void updateLanguage(value);
          }}
          size="regular"
          fullWidth
          className="mt-4 w-full"
        />
      </div>

      <div className={panelClasses}>
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-100">Transcription Model</h3>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{activeModel} runs fully local and powers transcript generation.</p>

        <div className="mt-4 rounded-xl border border-gray-200/70 bg-white/70 p-3 dark:border-gray-700/70 dark:bg-gray-800/55">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-100">{activeModel}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{activeModelSize}</p>
            </div>

            <span
              className={[
                'rounded-full px-2.5 py-1 text-[11px] font-medium',
                modelReady
                  ? 'bg-emerald-500/12 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200'
                  : 'bg-amber-500/12 text-amber-700 dark:bg-amber-500/20 dark:text-amber-200',
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
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200/80 dark:bg-gray-700/70">
                <div className="h-full rounded-full bg-accent transition-all duration-150" style={{ width: `${progressPercent}%` }} />
              </div>
            </div>
          ) : null}

          <div className="mt-3">
            {modelReady ? (
              <button
                type="button"
                onClick={() => void handleDeleteModel()}
                disabled={working}
                className="rounded-xl border border-red-300/70 bg-white/80 px-3 py-2 text-sm font-medium text-red-700 transition-all duration-150 hover:bg-red-50/80 disabled:cursor-not-allowed disabled:opacity-70 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200 dark:hover:bg-red-500/20"
              >
                Delete Model
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void handleDownloadModel()}
                disabled={working}
                className="rounded-xl border border-accent/40 bg-accent/8 px-3 py-2 text-sm font-medium text-accent transition-all duration-150 hover:bg-accent/12 disabled:cursor-not-allowed disabled:opacity-70 dark:border-accent/45 dark:bg-accent/15 dark:text-accent-muted"
              >
                Download {activeModel}
              </button>
            )}
          </div>
        </div>

        {errorMessage ? (
          <p className="mt-3 rounded-xl border border-red-300/70 bg-red-50/80 px-3 py-2 text-xs text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200">
            {errorMessage}
          </p>
        ) : null}
      </div>
    </section>
  );
}
