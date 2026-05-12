import { Channel, invoke } from '@tauri-apps/api/core';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import type { DownloadEvent, ModelStatus } from '../types';

// Stable discriminator from src-tauri/src/extract.rs ExtractError::kind().
// Phase 19 — ONBOARD-01 polish (Phase 21) will fill in the i18n table entries;
// until then, callers fall through to the raw `message` string.
const EXTRACT_ERROR_I18N_KEYS: Record<string, string> = {
  corrupt_archive: 'model_download_error_corrupt_archive',
  disk_full: 'model_download_error_disk_full',
  permission_denied: 'model_download_error_permission_denied',
  hash_mismatch: 'model_download_error_hash_mismatch',
  unknown: 'model_download_error_unknown',
};

/**
 * Translator shape accepted by `resolveDownloadErrorCopy`. Loosely typed so the
 * helper accepts both i18next's strict TFunction (which has a typed key union
 * scoped to its namespace) and a plain mock function in unit tests. The values
 * we actually pass are always plain strings from EXTRACT_ERROR_I18N_KEYS, which
 * are not in the strict 'setup' namespace at runtime — they will route through
 * i18next's missing-key handler and fall back to `defaultValue` (Phase 21 will
 * register the real translations).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TranslatorLike = (key: any, opts?: { defaultValue?: string }) => string;

/**
 * Resolve a model-download error to user-facing copy.
 * - If the Rust side emits a typed `kind` (new in Phase 19 EXTRACT-04), look up
 *   the i18n key for it. The translation table may not yet have the entry
 *   (Phase 21 polish); in that case we fall through to the verbatim `message`.
 * - If `kind` is absent (network/timeout errors with no kind set), use `message`
 *   directly — this is the backward-compat path for pre-Phase-19 event payloads.
 */
export function resolveDownloadErrorCopy(
  t: TranslatorLike,
  payload: { message: string; kind?: string | null },
): string {
  const kind = payload.kind ?? undefined;
  if (kind && EXTRACT_ERROR_I18N_KEYS[kind]) {
    const key = EXTRACT_ERROR_I18N_KEYS[kind];
    // i18next returns the key itself when a translation is missing; pass
    // `defaultValue` so we fall through to the raw message in that case.
    return t(key, { defaultValue: payload.message });
  }
  return payload.message;
}

type DownloadProgress = {
  downloaded: number;
  total: number;
};

interface ModelSetupContextValue {
  modelStatus: ModelStatus;
  downloadProgress: DownloadProgress | null;
  errorMessage: string | null;
  diarizationModelReady: boolean | null;
  diarizationDownloadProgress: DownloadProgress | null;
  startDownload: () => Promise<void>;
  cancelDownload: () => Promise<void>;
  checkModelReady: () => Promise<boolean>;
  checkDiarizationModelReady: () => Promise<boolean>;
  downloadDiarizationModel: () => Promise<void>;
}

const ModelSetupContext = createContext<ModelSetupContextValue>({
  modelStatus: 'unknown',
  downloadProgress: null,
  errorMessage: null,
  diarizationModelReady: null,
  diarizationDownloadProgress: null,
  startDownload: async () => {},
  cancelDownload: async () => {},
  checkModelReady: async () => false,
  checkDiarizationModelReady: async () => false,
  downloadDiarizationModel: async () => {},
});

export function useModelSetup() {
  return useContext(ModelSetupContext);
}

export function ModelSetupProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation('setup');
  const [modelStatus, setModelStatus] = useState<ModelStatus>('unknown');
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [diarizationModelReady, setDiarizationModelReady] = useState<boolean | null>(null);
  const [diarizationDownloadProgress, setDiarizationDownloadProgress] = useState<DownloadProgress | null>(null);
  const downloadChannelRef = useRef<Channel<DownloadEvent> | null>(null);

  const checkModelReady = useCallback(async () => {
    setModelStatus('checking');

    try {
      const ready = await invoke<boolean>('check_model_ready');
      setModelStatus(ready ? 'ready' : 'not_ready');
      return ready;
    } catch {
      setModelStatus('error');
      setErrorMessage(t('context_model_checkError'));
      return false;
    }
  }, []);

  const startDownload = useCallback(async () => {
    setModelStatus('downloading');
    setErrorMessage(null);
    setDownloadProgress({ downloaded: 0, total: 0 });

    const channel = new Channel<DownloadEvent>();
    channel.onmessage = (event) => {
      if (event.event === 'progress') {
        setModelStatus('downloading');
        setDownloadProgress({
          downloaded: event.data.downloadedBytes,
          total: event.data.totalBytes,
        });
        return;
      }

      if (event.event === 'extracting') {
        setModelStatus('extracting');
        return;
      }

      if (event.event === 'complete') {
        setModelStatus('ready');
        setDownloadProgress(null);
        setErrorMessage(null);
        return;
      }

      if (event.event === 'cancelled') {
        setModelStatus('not_ready');
        setDownloadProgress(null);
        setErrorMessage(null);
        return;
      }

      if (event.event === 'error') {
        setModelStatus('error');
        const data = event.data as { message: string; kind?: string };
        const copy = resolveDownloadErrorCopy(t, data);
        setErrorMessage(copy || t('stt_errorFallback'));
      }
    };

    downloadChannelRef.current = channel;

    try {
      await invoke('download_model', {
        onEvent: channel,
      });
    } catch {
      setModelStatus((current) => (current === 'not_ready' || current === 'ready' ? current : 'error'));
      setErrorMessage((current) => current ?? t('stt_errorFallback'));
    }
  }, []);

  const cancelDownload = useCallback(async () => {
    try {
      await invoke('cancel_download');
    } catch {
      // Best-effort cancel
    }
  }, []);

  useEffect(() => {
    void checkModelReady();
  }, [checkModelReady]);

  const checkDiarizationModelReady = useCallback(async () => {
    try {
      const ready = await invoke<boolean>('check_diarization_model_ready');
      setDiarizationModelReady(ready);
      return ready;
    } catch {
      setErrorMessage(t('stt_errorFallback'));
      setDiarizationModelReady(false);
      return false;
    }
  }, [t]);

  const downloadDiarizationModel = useCallback(async () => {
    setErrorMessage(null);
    setDiarizationDownloadProgress({ downloaded: 0, total: 0 });

    const channel = new Channel<DownloadEvent>();
    channel.onmessage = (event) => {
      if (event.event === 'progress') {
        setDiarizationDownloadProgress({
          downloaded: event.data.downloadedBytes,
          total: event.data.totalBytes,
        });
        return;
      }

      if (event.event === 'extracting') {
        return;
      }

      if (event.event === 'complete') {
        setDiarizationModelReady(true);
        setDiarizationDownloadProgress(null);
        return;
      }

      if (event.event === 'cancelled') {
        setDiarizationDownloadProgress(null);
        return;
      }

      if (event.event === 'error') {
        const data = event.data as { message: string; kind?: string };
        const copy = resolveDownloadErrorCopy(t, data);
        setErrorMessage(copy || t('stt_errorFallback'));
      }
    };

    try {
      await invoke('download_diarization_model', { onEvent: channel });
      setDiarizationModelReady(true);
    } catch {
      setErrorMessage((current) => current ?? t('stt_errorFallback'));
      setDiarizationModelReady(false);
    } finally {
      setDiarizationDownloadProgress(null);
    }
  }, [t]);

  return (
    <ModelSetupContext.Provider
      value={{
        modelStatus,
        downloadProgress,
        errorMessage,
        diarizationModelReady,
        diarizationDownloadProgress,
        startDownload,
        cancelDownload,
        checkModelReady,
        checkDiarizationModelReady,
        downloadDiarizationModel,
      }}
    >
      {children}
    </ModelSetupContext.Provider>
  );
}
