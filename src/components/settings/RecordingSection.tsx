import { Mic } from 'lucide-react';

export function RecordingSection() {
  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2 text-warm-700 dark:text-warm-100">
        <Mic size={20} />
        <h2 className="text-lg font-semibold">Recording</h2>
      </div>
      <p className="text-sm text-warm-500 dark:text-warm-400">
        Microphone selection, audio source defaults, and recording preferences.
      </p>
    </section>
  );
}
