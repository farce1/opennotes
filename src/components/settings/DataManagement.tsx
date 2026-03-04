import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import { Database, HardDrive, Upload } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

type ActionState = 'idle' | 'backing_up' | 'restoring' | 'done' | 'error';

export function DataManagement() {
  const { t } = useTranslation('settings');
  const [backupStatus, setBackupStatus] = useState<ActionState>('idle');
  const [restoreStatus, setRestoreStatus] = useState<ActionState>('idle');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const onBackup = async () => {
    setStatusMessage(null);

    const destination = await save({
      defaultPath: 'opennotes-backup.zip',
      filters: [{ name: 'openNotes Backup', extensions: ['zip'] }],
    });

    if (!destination) {
      return;
    }

    setBackupStatus('backing_up');

    try {
      await invoke('backup_library', { destination });
      setBackupStatus('done');
      setStatusMessage(t('dataManagement_backupSuccess'));
    } catch {
      setBackupStatus('error');
      setStatusMessage(t('dataManagement_backupFailed'));
    }
  };

  const onRestore = async () => {
    setStatusMessage(null);

    const confirmed = window.confirm(t('dataManagement_confirmRestore'));
    if (!confirmed) {
      return;
    }

    const selected = await open({
      title: t('dataManagement_selectBackup'),
      filters: [{ name: 'openNotes Backup', extensions: ['zip'] }],
      multiple: false,
    });

    if (typeof selected !== 'string') {
      return;
    }

    setRestoreStatus('restoring');

    try {
      await invoke('restore_library', { source: selected });
      setRestoreStatus('done');
      setStatusMessage(t('dataManagement_restoreSuccess'));
    } catch {
      setRestoreStatus('error');
      setStatusMessage(t('dataManagement_restoreFailed'));
    }
  };

  return (
    <div className="rounded-2xl border border-gray-200/80 bg-white/75 p-4 shadow-sm backdrop-blur-sm dark:border-gray-700/80 dark:bg-gray-900/45">
      <div className="flex items-start gap-3">
        <span className="rounded-xl border border-gray-200/80 bg-white/80 p-1.5 text-gray-500 dark:border-gray-700/80 dark:bg-gray-800/70 dark:text-gray-300">
          <Database size={15} />
        </span>
        <div>
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-100">{t('dataManagement_title')}</h3>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {t('dataManagement_description')}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void onBackup()}
          disabled={backupStatus === 'backing_up' || restoreStatus === 'restoring'}
          className="inline-flex items-center gap-2 rounded-xl border border-accent/40 bg-accent px-3 py-2 text-sm font-semibold text-white transition-all duration-150 hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-70"
        >
          <HardDrive size={14} />
          {backupStatus === 'backing_up' ? t('dataManagement_btnBackingUp') : t('dataManagement_btnBackup')}
        </button>

        <button
          type="button"
          onClick={() => void onRestore()}
          disabled={backupStatus === 'backing_up' || restoreStatus === 'restoring'}
          className="inline-flex items-center gap-2 rounded-xl border border-gray-200/80 bg-white/80 px-3 py-2 text-sm font-semibold text-gray-700 transition-all duration-150 hover:border-gray-300 hover:bg-white disabled:cursor-not-allowed disabled:opacity-70 dark:border-gray-700/80 dark:bg-gray-800/70 dark:text-gray-100 dark:hover:border-gray-600 dark:hover:bg-gray-800"
        >
          <Upload size={14} />
          {restoreStatus === 'restoring' ? t('dataManagement_btnRestoring') : t('dataManagement_btnRestore')}
        </button>
      </div>

      <p className="mt-3 text-xs text-amber-700 dark:text-amber-200">
        {t('dataManagement_restoreWarning')}
      </p>

      {statusMessage ? (
        <p
          className={[
            'mt-3 rounded-xl border px-3 py-2 text-xs',
            backupStatus === 'error' || restoreStatus === 'error'
              ? 'border-red-300/70 bg-red-50/80 text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200'
              : 'border-emerald-300/70 bg-emerald-50/80 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200',
          ].join(' ')}
        >
          {statusMessage}
        </p>
      ) : null}
    </div>
  );
}
