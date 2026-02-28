import { Database, FileText, Info, Mic, SlidersHorizontal, Sparkles } from 'lucide-react';
import { useState } from 'react';

import { AboutSection } from '../components/settings/AboutSection';
import { DataSection } from '../components/settings/DataSection';
import { GeneralSection } from '../components/settings/GeneralSection';
import { RecordingSection } from '../components/settings/RecordingSection';
import { SettingsSidebar } from '../components/settings/SettingsSidebar';
import { SummarySection } from '../components/settings/SummarySection';
import { TranscriptionSection } from '../components/settings/TranscriptionSection';
import type { SettingsTab } from '../types';

const TABS = [
  { id: 'general' as const, label: 'General', icon: SlidersHorizontal },
  { id: 'recording' as const, label: 'Recording', icon: Mic },
  { id: 'transcription' as const, label: 'Transcription', icon: FileText },
  { id: 'summary' as const, label: 'Summary', icon: Sparkles },
  { id: 'data' as const, label: 'Data', icon: Database },
  { id: 'about' as const, label: 'About', icon: Info },
];

export function SettingsView() {
  const [selectedTab, setSelectedTab] = useState<SettingsTab>('general');

  return (
    <div className="flex h-full min-h-[calc(100vh-3rem)] rounded-xl border border-warm-200/80 bg-white/70 shadow-sm dark:border-warm-700/70 dark:bg-warm-800/40">
      <SettingsSidebar tabs={TABS} selectedTab={selectedTab} onSelect={setSelectedTab} />
      <div className="flex-1 overflow-auto p-6">
        {selectedTab === 'general' ? <GeneralSection /> : null}
        {selectedTab === 'recording' ? <RecordingSection /> : null}
        {selectedTab === 'transcription' ? <TranscriptionSection /> : null}
        {selectedTab === 'summary' ? <SummarySection /> : null}
        {selectedTab === 'data' ? <DataSection /> : null}
        {selectedTab === 'about' ? <AboutSection /> : null}
      </div>
    </div>
  );
}
