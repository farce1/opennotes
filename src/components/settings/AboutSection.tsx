import { Info } from 'lucide-react';

export function AboutSection() {
  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2 text-warm-700 dark:text-warm-100">
        <Info size={20} />
        <h2 className="text-lg font-semibold">About</h2>
      </div>
      <div className="space-y-1 text-sm text-warm-500 dark:text-warm-300">
        <p className="font-medium text-warm-700 dark:text-warm-100">openNotes v0.1.0</p>
        <p>One-click meeting recording with structured, actionable notes — entirely local, entirely free.</p>
      </div>
    </section>
  );
}
