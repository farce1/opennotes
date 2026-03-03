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
    return 'bg-emerald-100/70 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200';
  }

  if (status === 'recovered') {
    return 'bg-amber-100/70 text-amber-700 dark:bg-amber-500/10 dark:text-amber-200';
  }

  if (status === 'failed') {
    return 'bg-red-100/70 text-red-700 dark:bg-red-500/10 dark:text-red-200';
  }

  return 'bg-gray-100/70 text-gray-700 dark:bg-gray-800/70 dark:text-gray-100';
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
