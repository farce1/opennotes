import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { check, type Update } from '@tauri-apps/plugin-updater';

type CheckState = 'idle' | 'checking' | 'up-to-date' | 'available' | 'error';

interface UpdateContextValue {
  updateAvailable: boolean;
  availableVersion: string | null;
  cachedUpdate: Update | null;
  checkForUpdate: () => Promise<void>;
  checkState: CheckState;
  errorMessage: string | null;
}

const UpdateContext = createContext<UpdateContextValue>({
  updateAvailable: false,
  availableVersion: null,
  cachedUpdate: null,
  checkForUpdate: async () => {},
  checkState: 'idle',
  errorMessage: null,
});

export function useUpdate() {
  return useContext(UpdateContext);
}

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
      setCheckState('error');
      setErrorMessage(error instanceof Error ? error.message : 'Update check failed');
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
