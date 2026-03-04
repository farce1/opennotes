import { getVersion } from '@tauri-apps/api/app';
import { relaunch } from '@tauri-apps/plugin-process';
import { AlertCircle, CheckCircle, Download, Info, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useUpdate } from '../../hooks/useUpdate';

const panelClasses =
  'rounded-2xl border border-gray-200/80 bg-white/75 p-4 shadow-sm backdrop-blur-sm dark:border-gray-700/80 dark:bg-gray-900/45';

export function AboutSection() {
  const { t } = useTranslation('settings');
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
    <section className="space-y-5">
      <div className="flex items-start gap-3">
        <span className="rounded-xl border border-gray-200/80 bg-white/80 p-2 text-gray-500 shadow-sm dark:border-gray-700/80 dark:bg-gray-800/70 dark:text-gray-300">
          <Info size={18} />
        </span>
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-gray-800 dark:text-gray-50">{t('about_title')}</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('about_description')}</p>
        </div>
      </div>

      <div className={panelClasses}>
        <p className="text-xl font-semibold tracking-tight text-gray-800 dark:text-gray-50">openNotes</p>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{appVersion}</p>
        <p className="mt-4 text-sm leading-relaxed text-gray-600 dark:text-gray-300">
          {t('about_tagline')}
        </p>
      </div>

      <div className={panelClasses}>
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-100">{t('updates_title')}</h3>

        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void checkForUpdate()}
              disabled={checkState === 'checking' || installState === 'installing'}
              className="inline-flex items-center gap-2 rounded-xl border border-gray-200/80 bg-white/80 px-3 py-2 text-sm font-medium text-gray-700 transition-all duration-150 hover:border-gray-300 hover:bg-white disabled:cursor-not-allowed disabled:opacity-70 dark:border-gray-700/80 dark:bg-gray-800/70 dark:text-gray-100 dark:hover:border-gray-600 dark:hover:bg-gray-800"
            >
              {checkState === 'checking' ? <Loader2 size={16} className="animate-spin" /> : null}
              {t('updates_btnCheck')}
            </button>

            {updateAvailable && checkState === 'available' && installState === 'idle' ? (
              <button
                type="button"
                onClick={() => void handleInstall()}
                className="inline-flex items-center gap-2 rounded-xl border border-accent/40 bg-accent px-3 py-2 text-sm font-semibold text-white transition-all duration-150 hover:bg-accent-hover"
              >
                <Download size={15} />
                {t('updates_btnInstall')}
              </button>
            ) : null}
          </div>

          {checkState === 'up-to-date' ? (
            <p className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
              <CheckCircle size={16} className="text-emerald-600 dark:text-emerald-400" />
              {t('updates_upToDate', { version: appVersion })}
            </p>
          ) : null}

          {checkState === 'available' ? (
            <p className="text-sm text-gray-600 dark:text-gray-300">{t('updates_available', { version: availableVersion ?? 'unknown' })}</p>
          ) : null}

          {checkState === 'unavailable' ? (
            <p className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-300">
              <AlertCircle size={16} />
              {errorMessage || t('updates_unavailable')}
            </p>
          ) : null}

          {checkState === 'error' ? (
            <p className="flex items-center gap-2 text-sm text-red-600 dark:text-red-300">
              <AlertCircle size={16} />
              {errorMessage || t('updates_error')}
            </p>
          ) : null}

          {installState === 'installing' ? (
            <p className="text-sm text-gray-600 dark:text-gray-300">{t('updates_installing')}</p>
          ) : null}

          {installState === 'error' ? (
            <p className="text-sm text-red-600 dark:text-red-300">{t('updates_installFailed')}</p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
