import { Circle } from 'lucide-react';

export function RecordView() {
  return (
    <section className="flex h-full min-h-[calc(100vh-3rem)] items-center justify-center rounded-xl border border-warm-200/80 bg-white/60 px-6 py-10 text-center shadow-sm dark:border-warm-700/70 dark:bg-warm-800/40">
      <div className="space-y-4">
        <Circle className="mx-auto text-warm-300" size={54} strokeWidth={1.8} />
        <h1 className="text-2xl font-semibold text-warm-700 dark:text-warm-100">
          Ready to Record
        </h1>
        <p className="text-sm text-warm-500 dark:text-warm-300">
          Press Cmd+Shift+R or click to start recording
        </p>
      </div>
    </section>
  );
}
