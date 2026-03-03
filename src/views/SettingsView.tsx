import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router';

import { AboutSection } from '../components/settings/AboutSection';
import { DataSection } from '../components/settings/DataSection';
import { GeneralSection } from '../components/settings/GeneralSection';
import {
  DEFAULT_SETTINGS_TAB,
  isSettingsTab,
  settingsTabPath,
} from '../components/settings/settingsTabs';
import { RecordingSection } from '../components/settings/RecordingSection';
import { SummarySection } from '../components/settings/SummarySection';
import { TranscriptionSection } from '../components/settings/TranscriptionSection';
import type { SettingsTab } from '../types';

function renderSelectedTab(selectedTab: SettingsTab) {
  if (selectedTab === 'general') return <GeneralSection />;
  if (selectedTab === 'recording') return <RecordingSection />;
  if (selectedTab === 'transcription') return <TranscriptionSection />;
  if (selectedTab === 'summary') return <SummarySection />;
  if (selectedTab === 'data') return <DataSection />;
  return <AboutSection />;
}

export function SettingsView() {
  const { tab } = useParams<{ tab?: string }>();
  const navigate = useNavigate();

  const selectedTab: SettingsTab = isSettingsTab(tab) ? tab : DEFAULT_SETTINGS_TAB;

  useEffect(() => {
    if (!isSettingsTab(tab)) {
      navigate(settingsTabPath(DEFAULT_SETTINGS_TAB), { replace: true });
    }
  }, [navigate, tab]);

  return (
    <section className="relative h-full min-h-[calc(100vh-3rem)] overflow-hidden rounded-[1.75rem] border border-gray-200/70 bg-gradient-to-br from-white/80 via-white/60 to-gray-100/70 p-5 shadow-[0_28px_80px_-50px_rgba(15,23,42,0.45)] dark:border-gray-800/70 dark:from-gray-900/90 dark:via-gray-900/70 dark:to-gray-950/80">
      <div className="pointer-events-none absolute -left-20 -top-16 h-56 w-56 rounded-full bg-accent/10 blur-3xl dark:bg-accent/20" />
      <div className="pointer-events-none absolute -bottom-24 right-12 h-52 w-52 rounded-full bg-gray-400/10 blur-3xl dark:bg-gray-700/25" />

      <div className="relative z-10 flex h-full min-h-0 flex-col">
        <div className="min-h-0 flex-1 rounded-2xl border border-gray-200/80 bg-white/75 p-4 shadow-[0_12px_32px_-24px_rgba(15,23,42,0.55)] backdrop-blur-sm dark:border-gray-700/80 dark:bg-gray-900/55 sm:p-5 lg:p-6">
          <div className="h-full overflow-y-auto pr-1">{renderSelectedTab(selectedTab)}</div>
        </div>
      </div>
    </section>
  );
}
