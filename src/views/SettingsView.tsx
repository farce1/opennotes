import { Database, FileText, Info, Mic, SlidersHorizontal, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';

import { AboutSection } from '../components/settings/AboutSection';
import { DataSection } from '../components/settings/DataSection';
import { GeneralSection } from '../components/settings/GeneralSection';
import { RecordingSection } from '../components/settings/RecordingSection';
import { SettingsSidebar } from '../components/settings/SettingsSidebar';
import { SummarySection } from '../components/settings/SummarySection';
import { TranscriptionSection } from '../components/settings/TranscriptionSection';
import type { SettingsTab } from '../types';

const TABS = [
  {
    id: 'general' as const,
    label: 'General',
    description: 'Theme, shortcuts, and global defaults',
    icon: SlidersHorizontal,
  },
  {
    id: 'recording' as const,
    label: 'Recording',
    description: 'Audio devices and capture source',
    icon: Mic,
  },
  {
    id: 'transcription' as const,
    label: 'Transcription',
    description: 'Model download and language controls',
    icon: FileText,
  },
  {
    id: 'summary' as const,
    label: 'Summary',
    description: 'Ollama models and auto-summary options',
    icon: Sparkles,
  },
  {
    id: 'data' as const,
    label: 'Data',
    description: 'Storage path, backups, and restores',
    icon: Database,
  },
  {
    id: 'about' as const,
    label: 'About',
    description: 'Version, updates, and release status',
    icon: Info,
  },
];

function renderSelectedTab(selectedTab: SettingsTab) {
  if (selectedTab === 'general') return <GeneralSection />;
  if (selectedTab === 'recording') return <RecordingSection />;
  if (selectedTab === 'transcription') return <TranscriptionSection />;
  if (selectedTab === 'summary') return <SummarySection />;
  if (selectedTab === 'data') return <DataSection />;
  return <AboutSection />;
}

export function SettingsView() {
  const [selectedTab, setSelectedTab] = useState<SettingsTab>('general');

  const activeTab = useMemo(() => {
    return TABS.find((tab) => tab.id === selectedTab) ?? TABS[0];
  }, [selectedTab]);

  const ActiveIcon = activeTab.icon;

  return (
    <section className="relative h-full min-h-[calc(100vh-3rem)] overflow-hidden rounded-[1.75rem] border border-gray-200/70 bg-gradient-to-br from-white/80 via-white/60 to-gray-100/70 p-5 shadow-[0_28px_80px_-50px_rgba(15,23,42,0.45)] dark:border-gray-800/70 dark:from-gray-900/90 dark:via-gray-900/70 dark:to-gray-950/80">
      <div className="pointer-events-none absolute -left-20 -top-16 h-56 w-56 rounded-full bg-accent/10 blur-3xl dark:bg-accent/20" />
      <div className="pointer-events-none absolute -bottom-24 right-12 h-52 w-52 rounded-full bg-gray-400/10 blur-3xl dark:bg-gray-700/25" />

      <div className="relative z-10 flex h-full min-h-0 flex-col">
        <header className="border-b border-gray-200/70 pb-4 dark:border-gray-800/70">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gray-400 dark:text-gray-500">Workspace</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-gray-800 dark:text-gray-50">Settings</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Tune recording, transcription, summary, and app behavior from one control room.
          </p>
        </header>

        <div className="mt-4 rounded-2xl border border-gray-200/80 bg-white/65 p-3 shadow-sm backdrop-blur-sm dark:border-gray-700/80 dark:bg-gray-900/45">
          <SettingsSidebar tabs={TABS} selectedTab={selectedTab} onSelect={setSelectedTab} />

          <div className="mt-3 inline-flex items-center gap-2 rounded-lg border border-gray-200/80 bg-white/75 px-3 py-2 text-xs text-gray-500 dark:border-gray-700/80 dark:bg-gray-800/60 dark:text-gray-400">
            <span className="rounded-md bg-accent/10 p-1 text-accent dark:bg-accent/20 dark:text-accent-muted">
              <ActiveIcon size={13} />
            </span>
            <span className="font-medium text-gray-700 dark:text-gray-100">{activeTab.label}</span>
            <span aria-hidden="true">•</span>
            <span>{activeTab.description}</span>
          </div>
        </div>

        <div className="mt-4 min-h-0 flex-1 rounded-2xl border border-gray-200/80 bg-white/75 p-4 shadow-[0_12px_32px_-24px_rgba(15,23,42,0.55)] backdrop-blur-sm dark:border-gray-700/80 dark:bg-gray-900/55 sm:p-5 lg:p-6">
          <div className="h-full overflow-y-auto pr-1">{renderSelectedTab(selectedTab)}</div>
        </div>
      </div>
    </section>
  );
}
