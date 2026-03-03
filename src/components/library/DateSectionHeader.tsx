type DateSectionHeaderProps = {
  label: string;
  count: number;
};

export function DateSectionHeader({ label, count }: DateSectionHeaderProps) {
  return (
    <header className="mb-2 mt-6 first:mt-0">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</h2>
        <span className="text-xs text-gray-400 dark:text-gray-400">{count}</span>
      </div>
      <div className="mt-1 h-px w-full bg-gray-200 dark:bg-gray-800" />
    </header>
  );
}
