import type { SpeakerRow } from '../types';

export const SPEAKER_COLORS = [
  '#3b82f6',
  '#ef4444',
  '#22c55e',
  '#f59e0b',
  '#8b5cf6',
  '#06b6d4',
  '#f97316',
  '#ec4899',
];

export function getSpeakerColor(colorIndex: number): string {
  const safe = Math.abs(colorIndex);
  return SPEAKER_COLORS[safe % SPEAKER_COLORS.length];
}

export function getSpeakerDisplayName(speaker: SpeakerRow): string {
  const custom = speaker.display_name.trim();
  if (custom.length > 0) {
    return custom;
  }
  return `Speaker ${speaker.speaker_index + 1}`;
}
