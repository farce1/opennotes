import type { Meeting } from '../../types';

export function formatDate(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatShortDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

export function formatDuration(durationSeconds: number | null): string {
  if (typeof durationSeconds !== 'number' || durationSeconds <= 0) {
    return 'In progress';
  }

  const hours = Math.floor(durationSeconds / 3600);
  const minutes = Math.floor((durationSeconds % 3600) / 60);
  const seconds = durationSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }

  return `${seconds}s`;
}

export function statusClasses(status: Meeting['status']): string {
  if (status === 'completed') {
    return 'bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/12 dark:text-emerald-300';
  }

  if (status === 'recovered') {
    return 'bg-amber-500/10 text-amber-600 dark:bg-amber-500/12 dark:text-amber-300';
  }

  if (status === 'failed') {
    return 'bg-red-500/10 text-red-600 dark:bg-red-500/12 dark:text-red-300';
  }

  return 'bg-gray-100/60 text-gray-500 dark:bg-gray-800/40 dark:text-gray-400';
}

export function normalizeAudioSource(value: string | null): 'mic' | 'system' | 'both' | null {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (normalized.includes('both')) {
    return 'both';
  }

  if (normalized.includes('mic')) {
    return 'mic';
  }

  if (normalized.includes('system')) {
    return 'system';
  }

  return null;
}
