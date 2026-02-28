import { Database } from 'lucide-react';

import { DataManagement } from './DataManagement';

export function DataSection() {
  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2 text-warm-700 dark:text-warm-100">
        <Database size={20} />
        <h2 className="text-lg font-semibold">Data</h2>
      </div>
      <p className="text-sm text-warm-500 dark:text-warm-400">
        Backup, restore, and storage settings.
      </p>
      <DataManagement />
    </section>
  );
}
