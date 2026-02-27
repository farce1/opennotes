import { Channel, invoke } from '@tauri-apps/api/core';
import { useCallback, useRef, useState } from 'react';

import type { TranscriptEvent, TranscriptSegment } from '../types';

function asSegment(event: Extract<TranscriptEvent, { event: 'segment' }>): TranscriptSegment {
  return {
    text: event.data.text,
    elapsedMs: event.data.elapsedMs,
    index: event.data.index,
  };
}

export function useTranscript() {
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const channelRef = useRef<Channel<TranscriptEvent> | null>(null);

  const startTranscription = useCallback(async () => {
    const channel = new Channel<TranscriptEvent>();
    channel.onmessage = (event) => {
      if (event.event === 'segment') {
        setSegments((previous) => [...previous, asSegment(event)]);
        return;
      }

      if (event.event === 'transcribing') {
        setIsTranscribing(Boolean(event.data.active));
      }
    };

    channelRef.current = channel;

    try {
      await invoke('start_transcription', { onSegment: channel });
      return true;
    } catch {
      setIsTranscribing(false);
      channelRef.current = null;
      return false;
    }
  }, []);

  const stopTranscription = useCallback(async () => {
    try {
      await invoke('stop_transcription');
    } finally {
      setIsTranscribing(false);
      channelRef.current = null;
    }
  }, []);

  const resetTranscript = useCallback(() => {
    setSegments([]);
    setIsTranscribing(false);
  }, []);

  return {
    segments,
    isTranscribing,
    startTranscription,
    stopTranscription,
    resetTranscript,
  };
}
