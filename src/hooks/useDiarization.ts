import { Channel, invoke } from '@tauri-apps/api/core';
import { useCallback, useEffect, useState } from 'react';

import type {
  DiarizationData,
  DiarizationEvent,
  DiarizationStatus,
  DownloadEvent,
  SpeakerRow,
  SpeakerTurnRow,
} from '../types';

function mapBackendStatus(value: string | null): DiarizationStatus {
  if (value === 'running') {
    return 'running';
  }
  if (value === 'complete') {
    return 'complete';
  }
  if (value === 'failed') {
    return 'error';
  }
  return 'idle';
}

export function useDiarization(meetingId: number | null) {
  const [status, setStatus] = useState<DiarizationStatus>('idle');
  const [percent, setPercent] = useState(0);
  const [speakers, setSpeakers] = useState<SpeakerRow[]>([]);
  const [speakerTurns, setSpeakerTurns] = useState<SpeakerTurnRow[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [modelDownloading, setModelDownloading] = useState(false);
  const [modelDownloadPercent, setModelDownloadPercent] = useState(0);

  const loadDiarizationData = useCallback(async () => {
    if (!meetingId) {
      setSpeakers([]);
      setSpeakerTurns([]);
      setStatus('idle');
      setPercent(0);
      return;
    }

    try {
      const data = await invoke<DiarizationData>('get_diarization_data', { meetingId });
      setSpeakers(data.speakers ?? []);
      setSpeakerTurns(data.speakerTurns ?? []);

      const mapped = mapBackendStatus(data.diarizationStatus ?? null);
      setStatus(mapped);
      setPercent(mapped === 'complete' ? 100 : 0);
    } catch {
      setErrorMessage('Unable to load diarization data.');
    }
  }, [meetingId]);

  const renameSpeaker = useCallback(async (speakerId: number, name: string) => {
    const trimmed = name.trim();
    await invoke('rename_speaker', { speakerId, displayName: trimmed });
    setSpeakers((previous) =>
      previous.map((speaker) =>
        speaker.id === speakerId
          ? {
              ...speaker,
              display_name: trimmed,
            }
          : speaker,
      ),
    );
  }, []);

  const ensureModelReady = useCallback(async () => {
    const ready = await invoke<boolean>('check_diarization_model_ready');
    if (ready) {
      return true;
    }

    setModelDownloading(true);
    setModelDownloadPercent(0);
    setErrorMessage(null);

    const channel = new Channel<DownloadEvent>();
    channel.onmessage = (event) => {
      if (event.event === 'progress') {
        const total = event.data.totalBytes || 0;
        const nextPercent = total > 0
          ? Math.min(100, Math.round((event.data.downloadedBytes / total) * 100))
          : 0;
        setModelDownloadPercent(nextPercent);
        return;
      }

      if (event.event === 'complete') {
        setModelDownloadPercent(100);
        return;
      }

      if (event.event === 'cancelled') {
        setErrorMessage('Speaker model download was cancelled.');
      }

      if (event.event === 'error') {
        setErrorMessage(event.data.message || 'Speaker model download failed.');
      }
    };

    try {
      await invoke('download_diarization_model', { onEvent: channel });
      return true;
    } catch {
      setErrorMessage((previous) => previous ?? 'Speaker model download failed.');
      return false;
    } finally {
      setModelDownloading(false);
    }
  }, []);

  const startDiarization = useCallback(async () => {
    if (!meetingId) {
      return;
    }

    setErrorMessage(null);

    const modelReady = await ensureModelReady();
    if (!modelReady) {
      setStatus('error');
      return;
    }

    setStatus('running');
    setPercent(0);

    const channel = new Channel<DiarizationEvent>();
    channel.onmessage = (event) => {
      if (event.event === 'progress') {
        setPercent(Math.max(0, Math.min(100, event.data.percent)));
        return;
      }

      if (event.event === 'complete') {
        setStatus('complete');
        setPercent(100);
        void loadDiarizationData();
        return;
      }

      if (event.event === 'error') {
        setStatus('error');
        setErrorMessage(event.data.message || 'Speaker analysis failed.');
      }
    };

    try {
      await invoke('start_diarization', { meetingId, onEvent: channel });
    } catch {
      setStatus('error');
      setErrorMessage((previous) => previous ?? 'Speaker analysis failed to start.');
    }
  }, [ensureModelReady, loadDiarizationData, meetingId]);

  useEffect(() => {
    setErrorMessage(null);
    void loadDiarizationData();
  }, [loadDiarizationData]);

  return {
    status,
    percent,
    speakers,
    speakerTurns,
    errorMessage,
    modelDownloading,
    modelDownloadPercent,
    startDiarization,
    renameSpeaker,
    loadDiarizationData,
  };
}
