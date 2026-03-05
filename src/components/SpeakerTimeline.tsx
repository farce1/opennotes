import { useMemo, useState, type MouseEvent, type ReactNode } from 'react';

import type { SpeakerRow, SpeakerTurnRow } from '../types';
import { getSpeakerColor, getSpeakerDisplayName } from './speakerUtils';

const MIN_SEGMENT_PERCENT = 0.5;

interface SpeakerTimelineProps {
  speakers: SpeakerRow[];
  speakerTurns: SpeakerTurnRow[];
  totalDurationMs: number;
  onSegmentClick: (startMs: number) => void;
  currentElapsedMs: number;
}

type TooltipState = {
  speakerName: string;
  startMs: number;
  endMs: number;
  x: number;
  y: number;
};

function formatMs(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function getFallbackSpeakerName(speakerIndex: number): string {
  return `Speaker ${speakerIndex + 1}`;
}

export function SpeakerTimeline({
  speakers,
  speakerTurns,
  totalDurationMs,
  onSegmentClick,
  currentElapsedMs,
}: SpeakerTimelineProps) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const speakerByIndex = useMemo(
    () => new Map(speakers.map((speaker) => [speaker.speaker_index, speaker])),
    [speakers],
  );

  const segments = useMemo<ReactNode[]>(
    () => {
      if (totalDurationMs <= 0) return [];
      return speakerTurns.map((turn) => {
        const speaker = speakerByIndex.get(turn.speaker_index);
        const speakerName = speaker
          ? getSpeakerDisplayName(speaker)
          : getFallbackSpeakerName(turn.speaker_index);
        const left = Math.max(0, (turn.start_ms / totalDurationMs) * 100);
        const rawWidth = ((turn.end_ms - turn.start_ms) / totalDurationMs) * 100;
        const width = Math.max(
          0,
          Math.min(100 - left, Math.max(MIN_SEGMENT_PERCENT, rawWidth)),
        );
        const color = getSpeakerColor(speaker?.color_index ?? turn.speaker_index);

        return (
          <button
            key={turn.id}
            type="button"
            aria-label={`${speakerName} at ${formatMs(turn.start_ms)}`}
            onClick={() => onSegmentClick(turn.start_ms)}
            onMouseEnter={(event: MouseEvent<HTMLButtonElement>) => {
              setTooltip({
                speakerName,
                startMs: turn.start_ms,
                endMs: turn.end_ms,
                x: event.clientX,
                y: event.clientY,
              });
            }}
            onMouseLeave={() => setTooltip(null)}
            className="absolute inset-y-0 cursor-pointer opacity-85 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2"
            style={{
              left: `${left}%`,
              width: `${width}%`,
              backgroundColor: color,
            }}
          />
        );
      });
    },
    [onSegmentClick, speakerByIndex, speakerTurns, totalDurationMs],
  );

  if (totalDurationMs <= 0 || speakers.length < 2) {
    return null;
  }

  const indicatorLeft = Math.max(0, Math.min(100, (currentElapsedMs / totalDurationMs) * 100));

  return (
    <div className="sticky top-0 z-10 rounded-xl border border-gray-200 bg-white/95 p-3 backdrop-blur-sm dark:border-gray-700 dark:bg-gray-950/95">
      <div className="relative h-5 overflow-hidden rounded-md bg-gray-200 dark:bg-gray-700">
        {segments}
        <div
          className="pointer-events-none absolute inset-y-0 w-0.5 bg-white/80 dark:bg-gray-100/60"
          style={{ left: `${indicatorLeft}%` }}
        />
      </div>

      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-700 dark:text-gray-200">
        {speakers.map((speaker) => (
          <span key={speaker.id} className="inline-flex items-center gap-1.5">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: getSpeakerColor(speaker.color_index) }}
            />
            <span>{getSpeakerDisplayName(speaker)}</span>
          </span>
        ))}
      </div>

      {tooltip ? (
        <div
          className="fixed z-50 rounded-md bg-gray-900 px-2 py-1 text-xs text-white shadow-lg"
          style={{ top: tooltip.y - 40, left: tooltip.x - 60, pointerEvents: 'none' }}
        >
          <p className="font-semibold">{tooltip.speakerName}</p>
          <p>{formatMs(tooltip.startMs)}–{formatMs(tooltip.endMs)}</p>
        </div>
      ) : null}
    </div>
  );
}
