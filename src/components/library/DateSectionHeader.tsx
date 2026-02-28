type DateSectionHeaderProps = {
  label: string;
  count: number;
};

export function DateSectionHeader({ label, count }: DateSectionHeaderProps) {
  return (
    <header className="mb-2 mt-6 first:mt-0">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-warm-500 dark:text-warm-300">{label}</h2>
        <span className="text-xs text-warm-400 dark:text-warm-400">{count}</span>
      </div>
      <div className="mt-1 h-px w-full bg-warm-200 dark:bg-warm-700" />
    </header>
  );
}
