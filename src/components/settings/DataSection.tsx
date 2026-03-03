import { Database } from 'lucide-react';
import { useEffect, useState } from 'react';

import { useSetting } from '../../hooks/useSettings';
import { getDataDirectory } from '../../lib/constants';
import { DataManagement } from './DataManagement';

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
    <section className="space-y-4">
      <div className="flex items-center gap-2 text-gray-700 dark:text-gray-100">
        <Database size={20} />
        <h2 className="text-lg font-semibold">Data</h2>
      </div>
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Backup, restore, and storage settings.
      </p>

      <div className="border-b border-gray-100 pb-6 dark:border-gray-800">
        <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">
          Storage Path
        </h3>
        <p className="mt-3 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100">
          {dataDirectory || resolvedDataDirectory || 'Resolving storage path…'}
        </p>
      </div>

      <DataManagement />
    </section>
  );
}
