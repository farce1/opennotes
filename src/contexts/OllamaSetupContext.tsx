import { Channel, invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-shell';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { getSetting } from '../lib/settings';
import type { OllamaPullEvent, OllamaSetupEvent, OllamaSetupPhase, OllamaStatus } from '../types';

type PullProgress = {
  status: string;
  completed: number;
  total: number;
};

type OllamaDownloadProgress = {
  downloaded: number;
  total: number;
};

const POLL_INTERVAL_MS = 3_000;

function mapStatusToPhase(status: OllamaStatus): OllamaSetupPhase {
  if (status.modelReady) {
    return 'ready';
  }

  if (status.running) {
    return 'model_not_pulled';
  }

  if (status.installed) {
    return 'not_running';
  }

  return 'not_installed';
}

interface OllamaSetupContextValue {
  setupPhase: OllamaSetupPhase;
  pullProgress: PullProgress | null;
  ollamaDownloadProgress: OllamaDownloadProgress | null;
  errorMessage: string | null;
  waitingForOllama: boolean;
  checkStatus: (silent?: boolean) => Promise<OllamaStatus | null>;
  openOllamaDownload: () => Promise<void>;
  startOllama: () => Promise<void>;
  pullModel: () => Promise<void>;
  autoSetup: () => Promise<void>;
}

const OllamaSetupContext = createContext<OllamaSetupContextValue>({
  setupPhase: 'checking',
  pullProgress: null,
  ollamaDownloadProgress: null,
  errorMessage: null,
  waitingForOllama: false,
  checkStatus: async () => null,
  openOllamaDownload: async () => {},
  startOllama: async () => {},
  pullModel: async () => {},
  autoSetup: async () => {},
});

export function useOllamaSetup() {
  return useContext(OllamaSetupContext);
}

export function OllamaSetupProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation('setup');
  const [setupPhase, setSetupPhase] = useState<OllamaSetupPhase>('checking');
  const [pullProgress, setPullProgress] = useState<PullProgress | null>(null);
  const [ollamaDownloadProgress, setOllamaDownloadProgress] = useState<OllamaDownloadProgress | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [waitingForOllama, setWaitingForOllama] = useState(false);

  const pollTimerRef = useRef<number | null>(null);
  const pullChannelRef = useRef<Channel<OllamaPullEvent> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current !== null) {
      window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const checkStatus = useCallback(
    async (silent = false) => {
      if (!silent) {
        setSetupPhase('checking');
      }

      try {
        const currentModel = await getSetting('ollamaModel');
        const status = await invoke<OllamaStatus>('check_ollama_status', {
          model: currentModel || undefined,
        });
        const nextPhase = mapStatusToPhase(status);
        setSetupPhase(nextPhase);
        setErrorMessage(null);

        if (nextPhase === 'ready' || nextPhase === 'model_not_pulled') {
          stopPolling();
          setWaitingForOllama(false);
        }

        return status;
      } catch {
        setSetupPhase('error');
        setErrorMessage(t('context_ollama_checkError'));
        return null;
      }
    },
    [stopPolling],
  );

  const startPollingUntilRunning = useCallback(() => {
    setWaitingForOllama(true);
    if (pollTimerRef.current !== null) {
      return;
    }

    pollTimerRef.current = window.setInterval(() => {
      void checkStatus(true);
    }, POLL_INTERVAL_MS);
  }, [checkStatus]);

  const openOllamaDownload = useCallback(async () => {
    try {
      await open('https://ollama.com/download');
      startPollingUntilRunning();
      await checkStatus(true);
    } catch {
      setSetupPhase('error');
      setErrorMessage(t('context_ollama_openDownloadError'));
    }
  }, [checkStatus, startPollingUntilRunning]);

  const startOllama = useCallback(async () => {
    startPollingUntilRunning();
    await checkStatus(true);
  }, [checkStatus, startPollingUntilRunning]);

  const pullModel = useCallback(async () => {
    setSetupPhase('pulling');
    setErrorMessage(null);
    setPullProgress({
      status: 'starting',
      completed: 0,
      total: 0,
    });

    const channel = new Channel<OllamaPullEvent>();
    channel.onmessage = (event) => {
      if (event.event === 'progress') {
        setSetupPhase('pulling');
        setPullProgress({
          status: event.data.status,
          completed: event.data.completed,
          total: event.data.total,
        });
        return;
      }

      if (event.event === 'complete') {
        setSetupPhase('ready');
        setPullProgress(null);
        setErrorMessage(null);
        return;
      }

      if (event.event === 'error') {
        setSetupPhase('error');
        setErrorMessage(event.data.message || t('context_ollama_pullFailed'));
      }
    };

    pullChannelRef.current = channel;

    try {
      const currentModel = await getSetting('ollamaModel');
      await invoke('pull_ollama_model', { model: currentModel || 'phi4-mini', onEvent: channel });
    } catch {
      setSetupPhase('error');
      setErrorMessage(t('context_ollama_pullError'));
    }
  }, []);

  const autoSetup = useCallback(async () => {
    setSetupPhase('checking');
    setErrorMessage(null);
    setOllamaDownloadProgress(null);
    setPullProgress(null);

    let errorHandled = false;

    const channel = new Channel<OllamaSetupEvent>();
    channel.onmessage = (event) => {
      switch (event.event) {
        case 'stage':
          if (event.data.name === 'pulling_model') {
            setSetupPhase('pulling');
          } else {
            setSetupPhase(event.data.name as OllamaSetupPhase);
          }
          break;
        case 'downloadProgress':
          setOllamaDownloadProgress({
            downloaded: event.data.downloadedBytes,
            total: event.data.totalBytes,
          });
          break;
        case 'pullProgress':
          setSetupPhase('pulling');
          setPullProgress({
            status: event.data.status,
            completed: event.data.completed,
            total: event.data.total,
          });
          break;
        case 'complete':
          setSetupPhase('ready');
          setOllamaDownloadProgress(null);
          setPullProgress(null);
          setErrorMessage(null);
          break;
        case 'error':
          errorHandled = true;
          setSetupPhase('error');
          setErrorMessage(event.data.message);
          break;
      }
    };

    try {
      const currentModel = await getSetting('ollamaModel');
      await invoke('auto_setup_ollama', { model: currentModel || 'phi4-mini', onEvent: channel });
    } catch {
      if (!errorHandled) {
        setSetupPhase('error');
        setErrorMessage(t('context_ollama_autoSetupFailed'));
      }
    }
  }, []);

  useEffect(() => {
    void checkStatus();
  }, [checkStatus]);

  useEffect(
    () => () => {
      stopPolling();
      pullChannelRef.current = null;
    },
    [stopPolling],
  );

  return (
    <OllamaSetupContext.Provider
      value={{
        setupPhase,
        pullProgress,
        ollamaDownloadProgress,
        errorMessage,
        waitingForOllama,
        checkStatus,
        openOllamaDownload,
        startOllama,
        pullModel,
        autoSetup,
      }}
    >
      {children}
    </OllamaSetupContext.Provider>
  );
}
