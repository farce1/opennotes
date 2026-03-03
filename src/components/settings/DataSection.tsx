import { Database } from 'lucide-react';
import { useEffect, useState } from 'react';

import { useSetting } from '../../hooks/useSettings';
import { getDataDirectory } from '../../lib/constants';
import { DataManagement } from './DataManagement';

const panelClasses =
  'rounded-2xl border border-gray-200/80 bg-white/75 p-4 shadow-sm backdrop-blur-sm dark:border-gray-700/80 dark:bg-gray-900/45';

export function DataSection() {
  const [dataDirectory] = useSetting('dataDirectory');
  const [resolvedDataDirectory, setResolvedDataDirectory] = useState<string>('');

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

  return (
    <section className="space-y-5">
      <div className="flex items-start gap-3">
        <span className="rounded-xl border border-gray-200/80 bg-white/80 p-2 text-gray-500 shadow-sm dark:border-gray-700/80 dark:bg-gray-800/70 dark:text-gray-300">
          <Database size={18} />
        </span>
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-gray-800 dark:text-gray-50">Data</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Storage location, backups, and recovery controls.</p>
        </div>
      </div>

      <div className={panelClasses}>
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-100">Storage Path</h3>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">All recordings, transcripts, and summaries are stored locally here.</p>
        <p className="mt-4 rounded-xl border border-gray-200/80 bg-white/80 px-3 py-2.5 text-sm text-gray-700 shadow-sm dark:border-gray-700/80 dark:bg-gray-800/70 dark:text-gray-100">
          {dataDirectory || resolvedDataDirectory || 'Resolving storage path…'}
        </p>
      </div>

      <DataManagement />
    </section>
  );
}
