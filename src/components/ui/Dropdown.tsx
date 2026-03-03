import { ChevronDown, Check } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
  size?: 'compact' | 'regular';
  fullWidth?: boolean;
  disabled?: boolean;
};

export function Dropdown<T extends string>({
  value,
  options,
  onChange,
  placeholder = 'Select...',
  className = '',
  size = 'compact',
  fullWidth = false,
  disabled = false,
}: DropdownProps<T>) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number; width: number } | null>(null);
  const selectedOption = options.find((o) => o.value === value);

  useEffect(() => {
    function onClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (ref.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    }

    if (open) {
      document.addEventListener('mousedown', onClickOutside);
    }

    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  useEffect(() => {
    if (!open) {
      setMenuPosition(null);
      return;
    }

    const updatePosition = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;

      setMenuPosition({
        top: rect.bottom + 6,
        left: rect.left,
        width: rect.width,
      });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (disabled) {
      return;
    }

    if (event.key === 'Escape') {
      setOpen(false);
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setOpen((prev) => !prev);
    }
  };

  const buttonSizeClasses =
    size === 'regular'
      ? 'rounded-xl px-3 py-2.5 text-sm'
      : 'rounded-lg px-3 py-1.5 text-xs font-medium';

  const optionSizeClasses = size === 'regular' ? 'px-3 py-2 text-sm' : 'px-2.5 py-1.5 text-xs';

  return (
    <div ref={ref} className={`relative ${open ? 'z-50' : 'z-0'} ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => {
          if (disabled) {
            return;
          }
          setOpen((prev) => !prev);
        }}
        onKeyDown={onKeyDown}
        disabled={disabled}
        className={[
          'items-center gap-2 transition-all duration-150',
          fullWidth ? 'flex w-full justify-between' : 'inline-flex',
          buttonSizeClasses,
          'border border-gray-200/60 bg-white/50 text-gray-700 shadow-sm',
          'hover:bg-white/80 hover:border-gray-300/70',
          'dark:border-gray-700/60 dark:bg-gray-800/50 dark:text-gray-200',
          'dark:hover:bg-gray-800/80 dark:hover:border-gray-600/70',
          'focus:outline-none focus:ring-2 focus:ring-accent/40 disabled:cursor-not-allowed disabled:opacity-60',
          open ? 'ring-2 ring-accent/40 border-accent/30 dark:border-accent/30' : '',
        ].join(' ')}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="flex min-w-0 flex-1 items-center gap-2">
          {selectedOption?.icon}
          <span className="truncate text-left">{selectedOption?.label ?? placeholder}</span>
        </span>
        <ChevronDown
          size={12}
          className={[
            'text-gray-400 transition-transform duration-200',
            open ? 'rotate-180' : '',
          ].join(' ')}
        />
      </button>

      {open && menuPosition
        ? createPortal(
            <div
              ref={menuRef}
              className={[
                'fixed z-[1000] overflow-hidden rounded-xl',
                'border border-gray-200/70 bg-white/95 shadow-lg shadow-black/8 backdrop-blur-xl',
                'dark:border-gray-700/70 dark:bg-gray-900/95 dark:shadow-black/30',
                'animate-[dropdownIn_120ms_ease-out]',
              ].join(' ')}
              style={{
                top: menuPosition.top,
                left: menuPosition.left,
                width: fullWidth ? menuPosition.width : undefined,
                minWidth: fullWidth ? menuPosition.width : 160,
              }}
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
                      'flex w-full items-center gap-2 rounded-lg text-left transition-colors duration-100',
                      optionSizeClasses,
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
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
