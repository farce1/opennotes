import { Channel, invoke } from '@tauri-apps/api/core';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import type { DownloadEvent, ModelStatus } from '../types';

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
        setErrorMessage(event.data.message || t('stt_errorFallback'));
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
        setErrorMessage(event.data.message || t('stt_errorFallback'));
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
