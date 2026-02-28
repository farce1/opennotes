import { Info } from 'lucide-react';

export function AboutSection() {
  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2 text-warm-700 dark:text-warm-100">
        <Info size={20} />
        <h2 className="text-lg font-semibold">About</h2>
      </div>
      <article className="rounded-xl border border-warm-200/80 bg-warm-50 p-5 shadow-sm dark:border-warm-700/60 dark:bg-warm-800/70">
        <p className="text-xl font-semibold text-warm-800 dark:text-warm-50">openNotes</p>
        <p className="mt-1 text-sm text-warm-600 dark:text-warm-200">v0.1.0</p>
        <p className="mt-4 text-sm leading-relaxed text-warm-600 dark:text-warm-200">
          One-click meeting recording with structured, actionable notes — entirely local, entirely free.
        </p>
      </article>
    </section>
  );
}
