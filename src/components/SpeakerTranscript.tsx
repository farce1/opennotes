import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { SpeakerRow, SpeakerTurnRow, TranscriptRow, TranscriptSegment } from '../types';
import { SpeakerPopover } from './SpeakerPopover';
import { getSpeakerColor } from './speakerUtils';

interface SpeakerTranscriptProps {
  segments: TranscriptSegment[];
  speakers: SpeakerRow[];
  speakerTurns: SpeakerTurnRow[];
  transcriptRows: TranscriptRow[];
  onRenameSpeaker: (speakerId: number, name: string) => void;
}

type SpeakerGroup = {
  id: string;
  speakerId: number | null;
  speakerRow: SpeakerRow | null;
  segments: TranscriptSegment[];
};

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

export function SpeakerTranscript({
  segments,
  speakers,
  speakerTurns,
  transcriptRows,
  onRenameSpeaker,
}: SpeakerTranscriptProps) {
  const { t } = useTranslation('meeting');
  const [popoverSpeaker, setPopoverSpeaker] = useState<SpeakerRow | null>(null);
  const [popoverSegmentCount, setPopoverSegmentCount] = useState(0);
  const anchorRef = useRef<HTMLElement | null>(null);

  const speakerById = useMemo(
    () => new Map(speakers.map((speaker) => [speaker.id, speaker])),
    [speakers],
  );

  const groups = useMemo<SpeakerGroup[]>(() => {
    const result: SpeakerGroup[] = [];

    transcriptRows.forEach((row, index) => {
      const segment = segments[index] ?? {
        text: row.text,
        elapsedMs: row.start_time_ms,
        index: row.segment_index,
      };

      const speakerId = row.speaker_id;
      const speakerRow = speakerId != null ? speakerById.get(speakerId) ?? null : null;
      const previous = result[result.length - 1];

      if (previous && previous.speakerId === speakerId) {
        previous.segments.push(segment);
        return;
      }

      result.push({
        id: `${speakerId ?? 'none'}-${segment.index}`,
        speakerId,
        speakerRow,
        segments: [segment],
      });
    });

    return result;
  }, [segments, speakerById, transcriptRows]);

  const totalTalkTimeMs = useMemo(
    () =>
      speakerTurns.reduce((sum, turn) => sum + Math.max(0, turn.end_ms - turn.start_ms), 0),
    [speakerTurns],
  );

  if (groups.length === 0) {
    return (
      <div className="rounded-lg bg-gray-50 p-4 text-sm text-gray-500 dark:bg-gray-800/50 dark:text-gray-400">
        {t('transcript_empty')}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {groups.map((group) => {
        const speaker = group.speakerRow;
        const color = speaker ? getSpeakerColor(speaker.color_index) : '#9ca3af';
        const label = speaker
          ? (speaker.display_name.trim() || t('speaker_default', { n: speaker.speaker_index + 1 }))
          : t('speaker_default', { n: group.speakerId != null ? group.speakerId + 1 : 0 });

        return (
          <article key={group.id} className="grid grid-cols-[140px_1fr] gap-3 rounded-xl bg-gray-50 p-3 scroll-mt-20 dark:bg-gray-800/40">
            <div className="pt-1">
              <button
                type="button"
                disabled={!speaker}
                onClick={(event) => {
                  if (!speaker) {
                    return;
                  }
                  anchorRef.current = event.currentTarget;
                  setPopoverSpeaker(speaker);
                  setPopoverSegmentCount(
                    transcriptRows.filter((row) => row.speaker_id === speaker.id).length,
                  );
                }}
                className="inline-flex items-center gap-2 rounded-md px-1 py-0.5 text-left text-sm font-semibold text-gray-700 transition hover:bg-gray-200/60 disabled:cursor-default disabled:hover:bg-transparent dark:text-gray-200 dark:hover:bg-gray-700/70"
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
                <span>{label}</span>
              </button>
            </div>

            <div className="space-y-1.5">
              {group.segments.map((segment) => (
                <div
                  key={segment.index}
                  data-elapsed-ms={segment.elapsedMs}
                  className="grid grid-cols-[52px_1fr] gap-2 scroll-mt-20"
                >
                  <span className="font-mono text-xs text-gray-500 dark:text-gray-400">{formatElapsed(segment.elapsedMs)}</span>
                  <p className="text-sm leading-relaxed text-gray-700 dark:text-gray-100">{segment.text}</p>
                </div>
              ))}
            </div>
          </article>
        );
      })}

      {popoverSpeaker ? (
        <SpeakerPopover
          speaker={popoverSpeaker}
          speakerTurns={speakerTurns}
          totalTalkTimeMs={totalTalkTimeMs}
          segmentCount={popoverSegmentCount}
          onRename={onRenameSpeaker}
          onClose={() => setPopoverSpeaker(null)}
          anchorRef={anchorRef}
        />
      ) : null}
    </div>
  );
}
