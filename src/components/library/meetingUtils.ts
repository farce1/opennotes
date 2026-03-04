import type { Meeting } from '../../types';
import i18n from '../../i18n';

export function formatDate(value: string): string {
  const locale = i18n.language;
  return new Date(value).toLocaleString(locale, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatShortDate(value: string): string {
  const locale = i18n.language;
  return new Date(value).toLocaleDateString(locale, {
    month: 'short',
    day: 'numeric',
  });
}

export function formatDuration(durationSeconds: number | null): string {
  const t = i18n.t.bind(i18n);

  if (typeof durationSeconds !== 'number' || durationSeconds <= 0) {
    return t('duration_inProgress', { ns: 'common' });
  }

  const hours = Math.floor(durationSeconds / 3600);
  const minutes = Math.floor((durationSeconds % 3600) / 60);
  const seconds = durationSeconds % 60;

  const h = t('duration_h', { ns: 'common' });
  const m = t('duration_m', { ns: 'common' });
  const s = t('duration_s', { ns: 'common' });

  if (hours > 0) {
    return `${hours}${h} ${minutes}${m}`;
  }

  if (minutes > 0) {
    return `${minutes}${m} ${seconds}${s}`;
  }

  return `${seconds}${s}`;
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
