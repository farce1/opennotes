import { useCallback, useState } from 'react';

import type { TranscriptEvent, TranscriptSegment } from '../types';

const MAX_DISPLAY_SEGMENTS = 50;

function asSegment(event: Extract<TranscriptEvent, { event: 'segment' }>): TranscriptSegment {
  return {
    text: event.data.text,
    elapsedMs: event.data.elapsedMs,
    index: event.data.index,
  };
}

function pushSegment(
  previous: TranscriptSegment[],
  nextSegment: TranscriptSegment,
): TranscriptSegment[] {
  const next = [...previous, nextSegment];
  return next.length > MAX_DISPLAY_SEGMENTS
    ? next.slice(next.length - MAX_DISPLAY_SEGMENTS)
    : next;
}

export function useTranscript() {
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [isTranscribing, setIsTranscribing] = useState(false);

  const addSegment = useCallback((segment: TranscriptSegment) => {
    setSegments((previous) => pushSegment(previous, segment));
  }, []);

  const addEvent = useCallback((event: TranscriptEvent) => {
    if (event.event === 'segment') {
      setSegments((previous) => pushSegment(previous, asSegment(event)));
      return;
    }

    if (event.event === 'transcribing') {
      setIsTranscribing(Boolean(event.data.active));
    }
  }, []);

  const setTranscribing = useCallback((active: boolean) => {
    setIsTranscribing(active);
  }, []);

  const resetTranscript = useCallback(() => {
    setSegments([]);
    setIsTranscribing(false);
  }, []);

  return {
    segments,
    isTranscribing,
    addEvent,
    addSegment,
    setTranscribing,
    resetTranscript,
  };
}
