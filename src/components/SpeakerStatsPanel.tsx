import { ChevronDown, ChevronUp } from 'lucide-react';
import { useMemo, useState } from 'react';

import type { SpeakerRow, SpeakerTurnRow } from '../types';
import { getSpeakerColor, getSpeakerDisplayName } from './speakerUtils';

interface SpeakerStatsPanelProps {
  speakers: SpeakerRow[];
  speakerTurns: SpeakerTurnRow[];
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

export function SpeakerStatsPanel({ speakers, speakerTurns }: SpeakerStatsPanelProps) {
  const [expanded, setExpanded] = useState(true);

  const totals = useMemo(() => {
    const talkTimeBySpeaker = new Map<number, number>();
    for (const turn of speakerTurns) {
      const current = talkTimeBySpeaker.get(turn.speaker_index) ?? 0;
      talkTimeBySpeaker.set(turn.speaker_index, current + Math.max(0, turn.end_ms - turn.start_ms));
    }

    const rows = speakers
      .map((speaker) => ({
        speaker,
        talkTimeMs: talkTimeBySpeaker.get(speaker.speaker_index) ?? 0,
      }))
      .sort((a, b) => b.talkTimeMs - a.talkTimeMs);

    const totalTalkTimeMs = rows.reduce((sum, row) => sum + row.talkTimeMs, 0);
    return { rows, totalTalkTimeMs };
  }, [speakerTurns, speakers]);

  return (
    <section className="rounded-xl border border-gray-200 bg-white/80 p-3 dark:border-gray-700 dark:bg-gray-900/55">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-center justify-between text-left"
      >
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Speaker Statistics</h3>
        <span className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
          {expanded ? 'Hide speaker stats' : 'Show speaker stats'}
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </span>
      </button>

      {expanded ? (
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {totals.rows.map(({ speaker, talkTimeMs }) => {
            const percent = totals.totalTalkTimeMs > 0
              ? Math.round((talkTimeMs / totals.totalTalkTimeMs) * 100)
              : 0;
            const color = getSpeakerColor(speaker.color_index);

            return (
              <article
                key={speaker.id}
                className="rounded-lg border border-gray-200 bg-gray-50/80 p-3 dark:border-gray-700 dark:bg-gray-800/60"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
                    <span className="text-sm font-medium text-gray-800 dark:text-gray-100">
                      {getSpeakerDisplayName(speaker)}
                    </span>
                  </div>
                  <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">{percent}%</span>
                </div>

                <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                  <div
                    className="h-full rounded-full transition-[width] duration-300"
                    style={{
                      width: `${percent}%`,
                      backgroundColor: color,
                    }}
                  />
                </div>

                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  Duration: {formatDuration(talkTimeMs)}
                </p>
              </article>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
