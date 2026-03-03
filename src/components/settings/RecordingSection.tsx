import { invoke } from '@tauri-apps/api/core';
import { Mic, RotateCw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { useSetting } from '../../hooks/useSettings';
import { DEFAULT_SETTINGS } from '../../lib/constants';
import { Dropdown } from '../ui/Dropdown';

const AUDIO_SOURCE_OPTIONS = [
  { value: 'mic' as const, label: 'Mic Only' },
  { value: 'system' as const, label: 'System Audio' },
  { value: 'both' as const, label: 'Both' },
];

const panelClasses =
  'relative z-0 rounded-2xl border border-gray-200/80 bg-white/75 p-4 shadow-sm backdrop-blur-sm focus-within:z-20 dark:border-gray-700/80 dark:bg-gray-900/45';

function optionButtonClasses(selected: boolean): string {
  return [
    'rounded-xl border px-3 py-2.5 text-sm transition-all duration-150',
    selected
      ? 'border-accent/35 bg-accent/10 text-accent shadow-sm dark:border-accent/40 dark:bg-accent/15 dark:text-accent-muted'
      : 'border-gray-200/80 bg-white/80 text-gray-600 hover:border-gray-300 hover:bg-white dark:border-gray-700/80 dark:bg-gray-800/70 dark:text-gray-200 dark:hover:border-gray-600 dark:hover:bg-gray-800',
  ].join(' ');
}

export function RecordingSection() {
  const [preferredMicDevice, updatePreferredMicDevice] = useSetting('preferredMicDevice');
  const [defaultAudioSource, updateDefaultAudioSource] = useSetting('defaultAudioSource');
  const [devices, setDevices] = useState<string[]>([]);
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [deviceError, setDeviceError] = useState<string | null>(null);

  const selectedAudioSource = defaultAudioSource ?? DEFAULT_SETTINGS.defaultAudioSource;
  const selectedMicDevice = preferredMicDevice ?? '';

  const loadDevices = useCallback(async () => {
    setLoadingDevices(true);
    setDeviceError(null);

    try {
      const listed = await invoke<string[]>('list_audio_input_devices');
      setDevices(listed);
    } catch {
      setDevices([]);
      setDeviceError('Unable to list microphone devices. Using system default.');
    } finally {
      setLoadingDevices(false);
    }
  }, []);

  useEffect(() => {
    void loadDevices();
  }, [loadDevices]);

  const deviceOptions = useMemo(() => {
    return ['', ...devices];
  }, [devices]);

  const micDropdownOptions = useMemo(
    () =>
      deviceOptions.map((device) => ({
        value: device,
        label: device || 'System Default',
      })),
    [deviceOptions],
  );

  return (
    <section className="space-y-5">
      <div className="flex items-start gap-3">
        <span className="rounded-xl border border-gray-200/80 bg-white/80 p-2 text-gray-500 shadow-sm dark:border-gray-700/80 dark:bg-gray-800/70 dark:text-gray-300">
          <Mic size={18} />
        </span>
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-gray-800 dark:text-gray-50">Recording</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Set default capture devices and audio source behavior for new sessions.</p>
        </div>
      </div>

      <div className={panelClasses}>
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-100">Microphone Device</h3>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Choose a preferred input device, or keep system default fallback.</p>

        <div className="mt-4 flex items-center gap-2">
          <Dropdown
            value={selectedMicDevice}
            options={micDropdownOptions}
            onChange={(value) => void updatePreferredMicDevice(value || null)}
            size="regular"
            fullWidth
            className="w-full"
          />
          <button
            type="button"
            onClick={() => void loadDevices()}
            disabled={loadingDevices}
            className="inline-flex items-center rounded-xl border border-gray-200/80 bg-white/80 px-3 py-2.5 text-sm text-gray-600 shadow-sm transition-all duration-150 hover:border-gray-300 hover:bg-white disabled:cursor-not-allowed disabled:opacity-70 dark:border-gray-700/80 dark:bg-gray-800/70 dark:text-gray-200 dark:hover:border-gray-600 dark:hover:bg-gray-800"
            aria-label="Refresh microphones"
          >
            <RotateCw size={15} className={loadingDevices ? 'animate-spin' : ''} />
          </button>
        </div>

        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">Device preference applies to newly started recordings.</p>

        {deviceError ? (
          <p className="mt-3 rounded-xl border border-amber-300/70 bg-amber-50/80 px-3 py-2 text-xs text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
            {deviceError}
          </p>
        ) : null}
      </div>

      <div className={panelClasses}>
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-100">Default Audio Source</h3>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Pick what openNotes captures when a recording starts.</p>

        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          {AUDIO_SOURCE_OPTIONS.map((option) => {
            const selected = selectedAudioSource === option.value;

            return (
              <button
                key={option.value}
                type="button"
                onClick={() => void updateDefaultAudioSource(option.value)}
                className={optionButtonClasses(selected)}
              >
                {option.label}
              </button>
            );
          })}
        </div>

        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          Maximum recording duration remains capped at 4 hours.
        </p>
      </div>
    </section>
  );
}
