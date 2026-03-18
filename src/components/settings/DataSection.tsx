import { invoke } from '@tauri-apps/api/core';
import { Database, FolderOpen } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useToast } from '../../contexts/ToastContext';
import { useSetting } from '../../hooks/useSettings';
import { getDataDirectory } from '../../lib/constants';
import { currentPlatform } from '../../lib/platform';
import { DataManagement } from './DataManagement';

const panelClasses =
  'rounded-2xl border border-gray-200/80 bg-white/75 p-4 shadow-sm backdrop-blur-sm dark:border-gray-700/80 dark:bg-gray-900/45';

export function DataSection() {
  const { t } = useTranslation('settings');
  const { showToast } = useToast();
  const [dataDirectory] = useSetting('dataDirectory');
  const [resolvedDataDirectory, setResolvedDataDirectory] = useState<string>('');
  const [openingPath, setOpeningPath] = useState(false);

  const storagePath = dataDirectory || resolvedDataDirectory;
  const openButtonLabel =
    currentPlatform() === 'macos'
      ? t('storagePath_btnOpenFinder')
      : currentPlatform() === 'windows'
        ? t('storagePath_btnOpenExplorer')
        : t('storagePath_btnOpenLinux');

  useEffect(() => {
    let cancelled = false;

    void getDataDirectory()
      .then((value) => {
        if (!cancelled) {
          setResolvedDataDirectory(value);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setResolvedDataDirectory('');
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const onOpenStoragePath = async () => {
    if (!storagePath || openingPath) {
      return;
    }

    setOpeningPath(true);

    try {
      await invoke('open_path_in_file_manager', { path: storagePath });
    } catch {
      showToast(t('storagePath_openFailed'));
    } finally {
      setOpeningPath(false);
    }
  };

  return (
    <section className="space-y-5">
      <div className="flex items-start gap-3">
        <span className="rounded-xl border border-gray-200/80 bg-white/80 p-2 text-gray-500 shadow-sm dark:border-gray-700/80 dark:bg-gray-800/70 dark:text-gray-300">
          <Database size={18} />
        </span>
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-gray-800 dark:text-gray-50">{t('data_title')}</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('data_description')}</p>
        </div>
      </div>

      <div className={panelClasses}>
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-100">{t('storagePath_title')}</h3>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t('storagePath_description')}</p>
        <p className="mt-4 rounded-xl border border-gray-200/80 bg-white/80 px-3 py-2.5 text-sm text-gray-700 shadow-sm dark:border-gray-700/80 dark:bg-gray-800/70 dark:text-gray-100">
          {storagePath || t('storagePath_resolving')}
        </p>
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={() => void onOpenStoragePath()}
            disabled={!storagePath || openingPath}
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200/80 bg-white/80 px-3 py-2 text-sm font-semibold text-gray-700 transition-all duration-150 hover:border-gray-300 hover:bg-white disabled:cursor-not-allowed disabled:opacity-70 dark:border-gray-700/80 dark:bg-gray-800/70 dark:text-gray-100 dark:hover:border-gray-600 dark:hover:bg-gray-800"
          >
            <FolderOpen size={14} />
            {openingPath ? t('storagePath_btnOpening') : openButtonLabel}
          </button>
        </div>
      </div>

      <DataManagement />
    </section>
  );
}
