import { Channel, invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useCallback, useEffect, useRef, useState } from 'react';

import { getSetting } from '../lib/settings';
import type { SessionPhase, SessionStatePayload, TranscriptEvent } from '../types';

type SegmentHandler = (event: TranscriptEvent) => void;

const DEFAULT_STATE: SessionStatePayload = {
  phase: 'idle',
  meetingId: null,
  transcriptionDegraded: false,
  startedAt: null,
};

export function useSession() {
  const [phase, setPhase] = useState<SessionPhase>('idle');
  const [meetingId, setMeetingId] = useState<number | null>(null);
  const [transcriptionDegraded, setTranscriptionDegraded] = useState(false);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [processingStage, setProcessingStage] = useState<string | null>(null);
  const [processingFailed, setProcessingFailed] = useState(false);
  const [processingMeetingId, setProcessingMeetingId] = useState<number | null>(null);
  const channelRef = useRef<Channel<TranscriptEvent> | null>(null);

  const applyState = useCallback((nextState: SessionStatePayload) => {
    setPhase(nextState.phase);
    setMeetingId(nextState.meetingId);
    setTranscriptionDegraded(nextState.transcriptionDegraded);
    setStartedAt(nextState.startedAt);
  }, []);

  const startSession = useCallback(async (onEvent?: SegmentHandler) => {
    const channel = new Channel<TranscriptEvent>();
    channel.onmessage = (event) => {
      onEvent?.(event);
    };

    channelRef.current = channel;
    const audioSource = await getSetting('defaultAudioSource');
    const preferredMicDevice = await getSetting('preferredMicDevice');

    const nextMeetingId = await invoke<number>('start_session', {
      onSegment: channel,
      audioSource: audioSource || undefined,
      preferredMicDevice: preferredMicDevice || undefined,
    });

    setMeetingId(nextMeetingId);
    setProcessingFailed(false);
    setProcessingStage(null);
    setProcessingMeetingId(null);
    return nextMeetingId;
  }, []);

  const stopSession = useCallback(async () => {
    const completedMeetingId = await invoke<number>('stop_session');
    channelRef.current = null;
    return completedMeetingId;
  }, []);

  const pauseSession = useCallback(async () => {
    await invoke('pause_session');
  }, []);

  const resumeSession = useCallback(async () => {
    await invoke('resume_session');
  }, []);

  useEffect(() => {
    let disposed = false;
    const cleanups: Array<() => void> = [];

    void invoke<SessionStatePayload>('get_session_state')
      .then((state) => {
        if (!disposed) {
          applyState(state);
        }
      })
      .catch(() => {
        if (!disposed) {
          applyState(DEFAULT_STATE);
        }
      });

    void Promise.all([
      listen<SessionStatePayload>('session-state-changed', (event) => {
        applyState(event.payload);
        if (event.payload.phase === 'processing') {
          setProcessingFailed(false);
          setProcessingMeetingId(event.payload.meetingId ?? null);
        }
      }),
      listen<number>('session-complete', (event) => {
        setPhase('idle');
        setMeetingId(event.payload ?? null);
        setProcessingStage(null);
        setProcessingFailed(false);
        setProcessingMeetingId(null);
      }),
      listen<string>('processing-stage', (event) => {
        setProcessingStage(event.payload);
      }),
      listen<number>('processing-failed', (event) => {
        setProcessingFailed(true);
        setProcessingStage(null);
        setProcessingMeetingId(event.payload);
      }),
    ]).then((handlers) => {
      if (disposed) {
        handlers.forEach((cleanup) => cleanup());
        return;
      }

      cleanups.push(...handlers);
    });

    return () => {
      disposed = true;
      cleanups.forEach((cleanup) => cleanup());
    };
  }, [applyState]);

  const isSaving = phase === 'processing';

  return {
    phase,
    meetingId,
    transcriptionDegraded,
    startedAt,
    isSaving,
    processingStage,
    processingFailed,
    processingMeetingId,
    startSession,
    stopSession,
    pauseSession,
    resumeSession,
  };
}
