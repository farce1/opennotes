import { invoke } from '@tauri-apps/api/core';
import { Mic, RotateCw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { useSetting } from '../../hooks/useSettings';
import { DEFAULT_SETTINGS } from '../../lib/constants';

const AUDIO_SOURCE_OPTIONS = [
  { value: 'mic' as const, label: 'Mic Only' },
  { value: 'system' as const, label: 'System Audio' },
  { value: 'both' as const, label: 'Both' },
];

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

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2 text-gray-700 dark:text-gray-100">
        <Mic size={20} />
        <h2 className="text-lg font-semibold">Recording</h2>
      </div>

      <div className="border-b border-gray-100 pb-6 dark:border-gray-800">
        <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">
          Microphone Device
        </h3>
        <div className="mt-3 flex items-center gap-2">
          <select
            value={selectedMicDevice}
            onChange={(event) => void updatePreferredMicDevice(event.target.value || null)}
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
          >
            {deviceOptions.map((device) => (
              <option key={device || 'system-default'} value={device}>
                {device || 'System Default'}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void loadDevices()}
            disabled={loadingDevices}
            className="inline-flex items-center rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-70 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
          >
            <RotateCw size={15} className={loadingDevices ? 'animate-spin' : ''} />
          </button>
        </div>
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          Device preference applies to new recordings.
        </p>
        {deviceError ? (
          <p className="mt-2 rounded-lg border border-amber-300/70 bg-amber-50/70 px-3 py-2 text-xs text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
            {deviceError}
          </p>
        ) : null}
      </div>

      <div className="pb-6">
        <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">
          Default Audio Source
        </h3>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {AUDIO_SOURCE_OPTIONS.map((option) => {
            const selected = selectedAudioSource === option.value;

            return (
              <button
                key={option.value}
                type="button"
                onClick={() => void updateDefaultAudioSource(option.value)}
                className={[
                  'rounded-lg border px-3 py-2 text-sm transition-colors duration-150',
                  selected
                    ? 'border-accent bg-accent-subtle text-gray-900 dark:bg-[rgba(59,130,246,0.12)] dark:text-gray-50'
                    : 'border-gray-200 bg-gray-100 text-gray-700 hover:bg-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700',
                ].join(' ')}
              >
                {option.label}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          Choose which audio sources are captured by default when starting a new recording.
        </p>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Maximum recording duration: 4 hours
        </p>
      </div>
    </section>
  );
}
