type DateSectionHeaderProps = {
  label: string;
  count: number;
};

export function DateSectionHeader({ label, count }: DateSectionHeaderProps) {
  return (
    <header className="mb-2 mt-6 first:mt-0">
      <div className="flex items-center gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">{label}</h2>
        <span className="rounded-md bg-gray-100/60 px-1.5 py-0.5 text-[10px] font-medium text-gray-400 dark:bg-gray-800/40 dark:text-gray-500">
          {count}
        </span>
        <div className="h-px flex-1 bg-gray-200/50 dark:bg-gray-800/50" />
      </div>
    </header>
  );
}
