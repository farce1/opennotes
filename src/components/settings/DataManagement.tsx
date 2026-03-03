import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import { Database, HardDrive, Upload } from 'lucide-react';
import { useState } from 'react';

type ActionState = 'idle' | 'backing_up' | 'restoring' | 'done' | 'error';

export function DataManagement() {
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
      setStatusMessage('Backup saved successfully.');
    } catch {
      setBackupStatus('error');
      setStatusMessage('Backup failed.');
    }
  };

  const onRestore = async () => {
    setStatusMessage(null);

    const confirmed = window.confirm(
      'This will replace your current library data. Are you sure? The app will need to restart after restore.',
    );
    if (!confirmed) {
      return;
    }

    const selected = await open({
      title: 'Select backup file',
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
      setStatusMessage('Restore complete. Please restart openNotes to use the restored data.');
    } catch {
      setRestoreStatus('error');
      setStatusMessage('Restore failed.');
    }
  };

  return (
    <div className="pb-6">
      <div className="flex items-center gap-2 text-gray-700 dark:text-gray-100">
        <Database size={16} />
        <h2 className="text-sm font-medium text-gray-500 dark:text-gray-400">Data Management</h2>
      </div>

      <p className="mt-3 text-sm text-gray-700 dark:text-gray-100">
        Backup your entire library including recordings, transcripts, and summaries. Restore from a previous backup archive when needed.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void onBackup()}
          disabled={backupStatus === 'backing_up' || restoreStatus === 'restoring'}
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-70"
        >
          <HardDrive size={14} />
          {backupStatus === 'backing_up' ? 'Backing up...' : 'Backup Library'}
        </button>

        <button
          type="button"
          onClick={() => void onRestore()}
          disabled={backupStatus === 'backing_up' || restoreStatus === 'restoring'}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white/70 px-3 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-70 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
        >
          <Upload size={14} />
          {restoreStatus === 'restoring' ? 'Restoring...' : 'Restore from Backup'}
        </button>
      </div>

      <p className="mt-3 text-xs text-amber-700 dark:text-amber-200">
        Restoring will replace all current data. This cannot be undone.
      </p>

      {statusMessage ? (
        <p
          className={[
            'mt-2 rounded-md border px-3 py-2 text-xs',
            backupStatus === 'error' || restoreStatus === 'error'
              ? 'border-red-300/70 bg-red-50/70 text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200'
              : 'border-emerald-300/70 bg-emerald-50/70 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200',
          ].join(' ')}
        >
          {statusMessage}
        </p>
      ) : null}
    </div>
  );
}
