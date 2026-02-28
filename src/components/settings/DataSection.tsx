import { Database } from 'lucide-react';

import { useSetting } from '../../hooks/useSettings';
import { DataManagement } from './DataManagement';

export function DataSection() {
  const [dataDirectory] = useSetting('dataDirectory');

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2 text-warm-700 dark:text-warm-100">
        <Database size={20} />
        <h2 className="text-lg font-semibold">Data</h2>
      </div>
      <p className="text-sm text-warm-500 dark:text-warm-400">
        Backup, restore, and storage settings.
      </p>

      <article className="rounded-xl border border-warm-200/80 bg-warm-50 p-4 shadow-sm dark:border-warm-700/60 dark:bg-warm-800/70">
        <h3 className="text-xs font-medium uppercase tracking-wide text-warm-500 dark:text-warm-300">
          Storage Path
        </h3>
        <p className="mt-3 rounded-lg border border-warm-200/80 bg-white px-3 py-2 text-sm text-warm-700 dark:border-warm-600 dark:bg-warm-700/70 dark:text-warm-100">
          {dataDirectory ?? '~/.opennotes'}
        </p>
      </article>

      <DataManagement />
    </section>
  );
}
