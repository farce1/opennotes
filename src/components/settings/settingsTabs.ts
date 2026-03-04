import { Database, FileText, Info, Mic, SlidersHorizontal, Sparkles } from 'lucide-react';

import type { SettingsTab } from '../../types';

export type SettingsTabLabelKey =
  | 'settingsTab_general'
  | 'settingsTab_recording'
  | 'settingsTab_transcription'
  | 'settingsTab_summary'
  | 'settingsTab_data'
  | 'settingsTab_about';

export type SettingsTabConfig = {
  id: SettingsTab;
  labelKey: SettingsTabLabelKey;
  icon: typeof SlidersHorizontal;
};

export const DEFAULT_SETTINGS_TAB: SettingsTab = 'general';

export const SETTINGS_TABS: SettingsTabConfig[] = [
  { id: 'general', labelKey: 'settingsTab_general', icon: SlidersHorizontal },
  { id: 'recording', labelKey: 'settingsTab_recording', icon: Mic },
  { id: 'transcription', labelKey: 'settingsTab_transcription', icon: FileText },
  { id: 'summary', labelKey: 'settingsTab_summary', icon: Sparkles },
  { id: 'data', labelKey: 'settingsTab_data', icon: Database },
  { id: 'about', labelKey: 'settingsTab_about', icon: Info },
];

export function isSettingsTab(value: string | undefined): value is SettingsTab {
  return SETTINGS_TABS.some((tab) => tab.id === value);
}

export function settingsTabPath(tab: SettingsTab): string {
  return `/settings/${tab}`;
}
