import { SlidersHorizontal } from 'lucide-react';

export function GeneralSection() {
  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2 text-warm-700 dark:text-warm-100">
        <SlidersHorizontal size={20} />
        <h2 className="text-lg font-semibold">General</h2>
      </div>
      <p className="text-sm text-warm-500 dark:text-warm-400">
        Theme, keyboard shortcuts, and global preferences.
      </p>
    </section>
  );
}
