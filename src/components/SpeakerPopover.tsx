import { useEffect, useMemo, useRef, useState } from 'react';

import type { SpeakerRow, SpeakerTurnRow } from '../types';
import { getSpeakerColor, getSpeakerDisplayName } from './speakerUtils';

interface SpeakerPopoverProps {
  speaker: SpeakerRow;
  speakerTurns: SpeakerTurnRow[];
  totalTalkTimeMs: number;
  segmentCount: number;
  onRename: (speakerId: number, name: string) => void;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) {
    return `${seconds}s`;
  }
  return `${minutes}m ${seconds}s`;
}

export function SpeakerPopover({
  speaker,
  speakerTurns,
  totalTalkTimeMs,
  segmentCount,
  onRename,
  onClose,
  anchorRef,
}: SpeakerPopoverProps) {
  const [nameInput, setNameInput] = useState(speaker.display_name ?? '');
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const hasSubmittedRef = useRef(false);

  const talkTimeMs = useMemo(
    () =>
      speakerTurns
        .filter((turn) => turn.speaker_index === speaker.speaker_index)
        .reduce((sum, turn) => sum + Math.max(0, turn.end_ms - turn.start_ms), 0),
    [speaker.speaker_index, speakerTurns],
  );

  const talkPercent = totalTalkTimeMs > 0 ? Math.round((talkTimeMs / totalTalkTimeMs) * 100) : 0;
  const displayName = getSpeakerDisplayName(speaker);

  useEffect(() => {
    const anchorEl = anchorRef.current;
    if (!anchorEl) {
      return;
    }

    const rect = anchorEl.getBoundingClientRect();
    const nextTop = Math.min(window.innerHeight - 220, rect.bottom + 8);
    const nextLeft = Math.min(window.innerWidth - 290, Math.max(16, rect.left));
    setPosition({ top: nextTop, left: nextLeft });
  }, [anchorRef]);

  const submitAndClose = () => {
    if (hasSubmittedRef.current) {
      return;
    }
    hasSubmittedRef.current = true;
    onRename(speaker.id, nameInput);
    onClose();
  };

  useEffect(() => {
    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as Node;
      const popoverEl = popoverRef.current;
      const anchorEl = anchorRef.current;
      if (popoverEl?.contains(target)) {
        return;
      }
      if (anchorEl?.contains(target)) {
        return;
      }
      onClose();
    };

    document.addEventListener('mousedown', onMouseDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
    };
  }, [anchorRef, onClose]);

  return (
    <div
      ref={popoverRef}
      className="fixed z-40 w-[280px] rounded-xl border border-gray-200 bg-white p-3 shadow-xl dark:border-gray-700 dark:bg-gray-900"
      style={{ top: position.top, left: position.left }}
    >
      <div className="flex items-center gap-2">
        <span
          className="h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: getSpeakerColor(speaker.color_index) }}
        />
        <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">{displayName}</span>
      </div>

      <label className="mt-3 block text-xs font-medium text-gray-500 dark:text-gray-400">
        Speaker name
      </label>
      <input
        value={nameInput}
        onChange={(event) => setNameInput(event.target.value)}
        onBlur={submitAndClose}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            submitAndClose();
          }
          if (event.key === 'Escape') {
            event.preventDefault();
            onClose();
          }
        }}
        autoFocus
        className="mt-1 w-full rounded-md border border-gray-300 px-2.5 py-2 text-sm text-gray-800 outline-none ring-accent/20 focus:border-accent focus:ring-2 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
        placeholder="Enter speaker name"
      />

      <div className="mt-3 space-y-1 text-xs text-gray-500 dark:text-gray-400">
        <p>
          Talk time: <span className="font-semibold text-gray-700 dark:text-gray-200">{talkPercent}%</span>
        </p>
        <p>
          Duration: {formatDuration(talkTimeMs)}
        </p>
        <p>{segmentCount} segments</p>
      </div>
    </div>
  );
}
