import { createContext, useCallback, useEffect, useState, type ReactNode } from 'react';
import { check, type Update } from '@tauri-apps/plugin-updater';

type CheckState = 'idle' | 'checking' | 'up-to-date' | 'available' | 'unavailable' | 'error';

const UNAVAILABLE_ERROR_PREFIXES = [
  'not allowed',
  'permission',
  'updater is disabled',
  'updater is not configured',
  'could not fetch a valid release json',
  'pubkey',
  'public key',
  'replace_with_generated_pubkey',
  'signature verification',
];

function stringifyError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }

  return '';
}

function toUnavailableMessage(rawError: string): string | null {
  const normalized = rawError.toLowerCase();
  const matchesUnavailablePrefix = UNAVAILABLE_ERROR_PREFIXES.some((prefix) => normalized.includes(prefix));

  if (!matchesUnavailablePrefix) {
    return null;
  }

  if (normalized.includes('could not fetch a valid release json')) {
    return 'No updater manifest was found at the release endpoint. Publish a release that includes latest.json.';
  }

  if (normalized.includes('pubkey') || normalized.includes('public key') || normalized.includes('replace_with_generated_pubkey')) {
    return 'Updater is not configured. Set a valid updater pubkey in src-tauri/tauri.conf.json.';
  }

  if (normalized.includes('not allowed') || normalized.includes('permission')) {
    return 'Updater permission is missing for this window capability.';
  }

  return 'Automatic updates are unavailable in this build.';
}

export interface UpdateContextValue {
  updateAvailable: boolean;
  availableVersion: string | null;
  cachedUpdate: Update | null;
  checkForUpdate: () => Promise<void>;
  checkState: CheckState;
  errorMessage: string | null;
}

export const UpdateContext = createContext<UpdateContextValue>({
  updateAvailable: false,
  availableVersion: null,
  cachedUpdate: null,
  checkForUpdate: async () => {},
  checkState: 'idle',
  errorMessage: null,
});

export function UpdateProvider({ children }: { children: ReactNode }) {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [availableVersion, setAvailableVersion] = useState<string | null>(null);
  const [cachedUpdate, setCachedUpdate] = useState<Update | null>(null);
  const [checkState, setCheckState] = useState<CheckState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const checkForUpdate = useCallback(async () => {
    setCheckState('checking');
    setErrorMessage(null);

    try {
      const update = await check();
      if (update) {
        setUpdateAvailable(true);
        setAvailableVersion(update.version);
        setCachedUpdate(update);
        setCheckState('available');
      } else {
        setUpdateAvailable(false);
        setAvailableVersion(null);
        setCachedUpdate(null);
        setCheckState('up-to-date');
      }
    } catch (error) {
      const rawMessage = stringifyError(error);
      const unavailableMessage = toUnavailableMessage(rawMessage);

      if (unavailableMessage) {
        setCheckState('unavailable');
        setErrorMessage(unavailableMessage);
        return;
      }

      setCheckState('error');
      setErrorMessage(rawMessage || 'Update check failed');
    }
  }, []);

  useEffect(() => {
    void check()
      .then((update) => {
        if (!update) {
          return;
        }
        setUpdateAvailable(true);
        setAvailableVersion(update.version);
        setCachedUpdate(update);
        setCheckState('available');
      })
      .catch(() => {
        // Silent failure: dev/offline/invalid updater config should not disrupt startup.
      });
  }, []);

  return (
    <UpdateContext.Provider
      value={{
        updateAvailable,
        availableVersion,
        cachedUpdate,
        checkForUpdate,
        checkState,
        errorMessage,
      }}
    >
      {children}
    </UpdateContext.Provider>
  );
}
