import { BookOpen } from 'lucide-react';

export function LibraryView() {
  return (
    <section className="h-full min-h-[calc(100vh-3rem)] rounded-xl border border-warm-200/80 bg-white/60 p-6 shadow-sm dark:border-warm-700/70 dark:bg-warm-800/40">
      <h1 className="text-2xl font-semibold text-warm-700 dark:text-warm-100">
        Meeting Library
      </h1>
      <div className="mt-12 flex flex-col items-center justify-center gap-3 text-center text-warm-400 dark:text-warm-300">
        <BookOpen size={52} strokeWidth={1.8} />
        <p className="text-lg font-medium">No meetings yet</p>
        <p className="text-sm text-warm-500 dark:text-warm-400">
          Your recorded meetings will appear here
        </p>
      </div>
    </section>
  );
}
