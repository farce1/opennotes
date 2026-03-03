import { Database, FileText, Info, Mic, SlidersHorizontal, Sparkles } from 'lucide-react';

import type { SettingsTab } from '../../types';

export type SettingsTabConfig = {
  id: SettingsTab;
  label: string;
  description: string;
  icon: typeof SlidersHorizontal;
};

export const DEFAULT_SETTINGS_TAB: SettingsTab = 'general';

export const SETTINGS_TABS: SettingsTabConfig[] = [
  {
    id: 'general',
    label: 'General',
    description: 'Theme, shortcuts, and global defaults',
    icon: SlidersHorizontal,
  },
  {
    id: 'recording',
    label: 'Recording',
    description: 'Audio devices and capture source',
    icon: Mic,
  },
  {
    id: 'transcription',
    label: 'Transcription',
    description: 'Model download and language controls',
    icon: FileText,
  },
  {
    id: 'summary',
    label: 'Summary',
    description: 'Ollama models and auto-summary options',
    icon: Sparkles,
  },
  {
    id: 'data',
    label: 'Data',
    description: 'Storage path, backups, and restores',
    icon: Database,
  },
  {
    id: 'about',
    label: 'About',
    description: 'Version, updates, and release status',
    icon: Info,
  },
];

export function isSettingsTab(value: string | undefined): value is SettingsTab {
  return SETTINGS_TABS.some((tab) => tab.id === value);
}

export function settingsTabPath(tab: SettingsTab): string {
  return `/settings/${tab}`;
}
