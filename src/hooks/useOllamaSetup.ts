import { Channel, invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-shell';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { OllamaPullEvent, OllamaSetupPhase, OllamaStatus } from '../types';

type PullProgress = {
  status: string;
  completed: number;
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

export function useOllamaSetup() {
  const [setupPhase, setSetupPhase] = useState<OllamaSetupPhase>('checking');
  const [pullProgress, setPullProgress] = useState<PullProgress | null>(null);
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
        const status = await invoke<OllamaStatus>('check_ollama_status');
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
        setErrorMessage('Unable to check Ollama status.');
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
      setErrorMessage('Unable to open the Ollama download page.');
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
        setErrorMessage(event.data.message || 'Model pull failed.');
      }
    };

    pullChannelRef.current = channel;

    try {
      await invoke('pull_ollama_model', { model: 'phi4-mini', onEvent: channel });
    } catch {
      setSetupPhase('error');
      setErrorMessage('Unable to pull Ollama model. Ensure Ollama is running and retry.');
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

  return {
    setupPhase,
    pullProgress,
    errorMessage,
    waitingForOllama,
    checkStatus,
    openOllamaDownload,
    startOllama,
    pullModel,
  };
}
