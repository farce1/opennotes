import { Sparkles } from 'lucide-react';

export function SummarySection() {
  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2 text-warm-700 dark:text-warm-100">
        <Sparkles size={20} />
        <h2 className="text-lg font-semibold">Summary</h2>
      </div>
      <p className="text-sm text-warm-500 dark:text-warm-400">
        LLM model selection, auto-summary preferences, and Ollama configuration.
      </p>
    </section>
  );
}
