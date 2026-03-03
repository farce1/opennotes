import { ChevronDown, Check } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

type DropdownOption<T extends string> = {
  value: T;
  label: string;
  icon?: ReactNode;
};

type DropdownProps<T extends string> = {
  value: T;
  options: DropdownOption<T>[];
  onChange: (value: T) => void;
  placeholder?: string;
  className?: string;
};

export function Dropdown<T extends string>({
  value,
  options,
  onChange,
  placeholder = 'Select...',
  className = '',
}: DropdownProps<T>) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selectedOption = options.find((o) => o.value === value);

  useEffect(() => {
    function onClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    if (open) {
      document.addEventListener('mousedown', onClickOutside);
    }

    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      setOpen(false);
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setOpen((prev) => !prev);
    }
  };

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        onKeyDown={onKeyDown}
        className={[
          'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-150',
          'border border-gray-200/60 bg-white/50 text-gray-700 shadow-sm',
          'hover:bg-white/80 hover:border-gray-300/70',
          'dark:border-gray-700/60 dark:bg-gray-800/50 dark:text-gray-200',
          'dark:hover:bg-gray-800/80 dark:hover:border-gray-600/70',
          'focus:outline-none focus:ring-2 focus:ring-accent/40',
          open ? 'ring-2 ring-accent/40 border-accent/30 dark:border-accent/30' : '',
        ].join(' ')}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        {selectedOption?.icon}
        <span>{selectedOption?.label ?? placeholder}</span>
        <ChevronDown
          size={12}
          className={[
            'text-gray-400 transition-transform duration-200',
            open ? 'rotate-180' : '',
          ].join(' ')}
        />
      </button>

      {open && (
        <div
          className={[
            'absolute left-0 z-30 mt-1.5 min-w-[160px] overflow-hidden rounded-xl',
            'border border-gray-200/70 bg-white/95 shadow-lg shadow-black/8 backdrop-blur-xl',
            'dark:border-gray-700/70 dark:bg-gray-900/95 dark:shadow-black/30',
            'animate-[dropdownIn_120ms_ease-out]',
          ].join(' ')}
          role="listbox"
        >
          <div className="p-1">
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={option.value === value}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                className={[
                  'flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors duration-100',
                  option.value === value
                    ? 'bg-accent/8 text-accent font-medium dark:bg-accent/12 dark:text-accent-muted'
                    : 'text-gray-600 hover:bg-gray-100/80 dark:text-gray-300 dark:hover:bg-gray-800/80',
                ].join(' ')}
              >
                {option.icon}
                <span className="flex-1">{option.label}</span>
                {option.value === value && <Check size={12} className="text-accent shrink-0" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
