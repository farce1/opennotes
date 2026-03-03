import { Channel, invoke } from '@tauri-apps/api/core';
import { useCallback, useEffect, useRef, useState } from 'react';

import { getSetting } from '../lib/settings';
import type { DownloadEvent, ModelStatus } from '../types';

type DownloadProgress = {
  downloaded: number;
  total: number;
};

export function useModelSetup() {
  const [modelStatus, setModelStatus] = useState<ModelStatus>('unknown');
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const downloadChannelRef = useRef<Channel<DownloadEvent> | null>(null);

  const checkModelReady = useCallback(async () => {
    setModelStatus('checking');

    try {
      const transcriptionLanguage = await getSetting('transcriptionLanguage');
      const ready = await invoke<boolean>('check_model_ready', {
        transcriptionLanguage: transcriptionLanguage || undefined,
      });
      setModelStatus(ready ? 'ready' : 'not_ready');
      return ready;
    } catch {
      setModelStatus('error');
      setErrorMessage('Unable to check local transcription model status.');
      return false;
    }
  }, []);

  const startDownload = useCallback(async () => {
    setModelStatus('downloading');
    setErrorMessage(null);
    setDownloadProgress({ downloaded: 0, total: 0 });
    const transcriptionLanguage = await getSetting('transcriptionLanguage');

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

      if (event.event === 'error') {
        setModelStatus('error');
        setErrorMessage(event.data.message || 'Model download failed. Please retry.');
      }
    };

    downloadChannelRef.current = channel;

    try {
      await invoke('download_model', {
        onEvent: channel,
        transcriptionLanguage: transcriptionLanguage || undefined,
      });
    } catch {
      setModelStatus('error');
      setErrorMessage('Model download failed. Please retry.');
    }
  }, []);

  useEffect(() => {
    void checkModelReady();
  }, [checkModelReady]);

  return {
    modelStatus,
    downloadProgress,
    errorMessage,
    startDownload,
    checkModelReady,
  };
}
