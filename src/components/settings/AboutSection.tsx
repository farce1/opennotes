import { getVersion } from '@tauri-apps/api/app';
import { relaunch } from '@tauri-apps/plugin-process';
import { AlertCircle, CheckCircle, Download, Info, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useUpdate } from '../../contexts/UpdateContext';

export function AboutSection() {
  const { updateAvailable, availableVersion, cachedUpdate, checkForUpdate, checkState, errorMessage } = useUpdate();
  const [appVersion, setAppVersion] = useState('v0.1.0');
  const [installState, setInstallState] = useState<'idle' | 'installing' | 'done' | 'error'>('idle');

  useEffect(() => {
    void getVersion()
      .then((version) => {
        setAppVersion(`v${version}`);
      })
      .catch(() => {
        setAppVersion('v0.1.0');
      });
  }, []);

  const handleInstall = useCallback(async () => {
    if (!cachedUpdate) {
      return;
    }

    setInstallState('installing');
    try {
      await cachedUpdate.downloadAndInstall();
      setInstallState('done');
      await relaunch();
    } catch {
      setInstallState('error');
    }
  }, [cachedUpdate]);

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2 text-warm-700 dark:text-warm-100">
        <Info size={20} />
        <h2 className="text-lg font-semibold">About</h2>
      </div>
      <article className="rounded-xl border border-warm-200/80 bg-warm-50 p-5 shadow-sm dark:border-warm-700/60 dark:bg-warm-800/70">
        <p className="text-xl font-semibold text-warm-800 dark:text-warm-50">openNotes</p>
        <p className="mt-1 text-sm text-warm-600 dark:text-warm-200">{appVersion}</p>
        <p className="mt-4 text-sm leading-relaxed text-warm-600 dark:text-warm-200">
          One-click meeting recording with structured, actionable notes — entirely local, entirely free.
        </p>
      </article>

      <article className="rounded-xl border border-warm-200/80 bg-warm-50 p-5 shadow-sm dark:border-warm-700/60 dark:bg-warm-800/70">
        <h3 className="text-xs font-medium uppercase tracking-wide text-warm-500 dark:text-warm-300">
          Updates
        </h3>

        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void checkForUpdate()}
              disabled={checkState === 'checking' || installState === 'installing'}
              className="inline-flex items-center gap-2 rounded-lg border border-warm-200 px-3 py-2 text-sm text-warm-700 transition hover:bg-warm-100 disabled:cursor-not-allowed disabled:opacity-70 dark:border-warm-600 dark:text-warm-100 dark:hover:bg-warm-700"
            >
              {checkState === 'checking' ? <Loader2 size={16} className="animate-spin" /> : null}
              Check for updates
            </button>

            {updateAvailable && checkState === 'available' && installState === 'idle' ? (
              <button
                type="button"
                onClick={() => void handleInstall()}
                className="inline-flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm text-white transition hover:bg-accent/90"
              >
                <Download size={15} />
                Install & restart
              </button>
            ) : null}
          </div>

          {checkState === 'up-to-date' ? (
            <p className="flex items-center gap-2 text-sm text-warm-600 dark:text-warm-200">
              <CheckCircle size={16} className="text-green-600 dark:text-green-400" />
              You&apos;re up to date ({appVersion})
            </p>
          ) : null}

          {checkState === 'available' ? (
            <p className="text-sm text-warm-600 dark:text-warm-200">
              Update available: v{availableVersion ?? 'unknown'}
            </p>
          ) : null}

          {checkState === 'error' ? (
            <p className="flex items-center gap-2 text-sm text-red-600 dark:text-red-300">
              <AlertCircle size={16} />
              {errorMessage || 'Update check failed'}
            </p>
          ) : null}

          {installState === 'installing' ? (
            <p className="text-sm text-warm-600 dark:text-warm-200">Installing update...</p>
          ) : null}

          {installState === 'error' ? (
            <p className="text-sm text-red-600 dark:text-red-300">Install failed. Please try again.</p>
          ) : null}
        </div>
      </article>
    </section>
  );
}
