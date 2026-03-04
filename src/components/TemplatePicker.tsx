import { Check, ChevronDown, Plus, Settings2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

import type { SummaryTemplate } from '../lib/templates';

type TemplatePickerProps = {
  selectedId: string;
  builtInTemplates: SummaryTemplate[];
  customTemplates: SummaryTemplate[];
  onSelect: (id: string) => void;
  onCreateNew: () => void;
  onManage: () => void;
  disabled?: boolean;
};

type MenuPosition = {
  top?: number;
  bottom?: number;
  left: number;
  width: number;
  maxHeight: number;
};

export function TemplatePicker({
  selectedId,
  builtInTemplates,
  customTemplates,
  onSelect,
  onCreateNew,
  onManage,
  disabled = false,
}: TemplatePickerProps) {
  const { t } = useTranslation('meeting');
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const selectedTemplate = useMemo(
    () =>
      builtInTemplates.find((template) => template.id === selectedId)
      ?? customTemplates.find((template) => template.id === selectedId),
    [builtInTemplates, customTemplates, selectedId],
  );

  useEffect(() => {
    if (!open) {
      setMenuPosition(null);
      return;
    }

    const updatePosition = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) {
        return;
      }

      const viewportPadding = 12;
      const menuOffset = 6;
      const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
      const spaceAbove = rect.top - viewportPadding;
      const estimatedMenuHeight = 420;
      const openUpward = spaceBelow < estimatedMenuHeight && spaceAbove > spaceBelow;
      const availableSpace = openUpward ? spaceAbove : spaceBelow;
      const maxHeight = Math.max(180, Math.min(420, availableSpace - menuOffset));

      if (openUpward) {
        setMenuPosition({
          bottom: window.innerHeight - rect.top + menuOffset,
          left: rect.left,
          width: rect.width,
          maxHeight,
        });
        return;
      }

      setMenuPosition({
        top: rect.bottom + menuOffset,
        left: rect.left,
        width: rect.width,
        maxHeight,
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

  useEffect(() => {
    if (!open) {
      return;
    }

    const onClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (containerRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => {
          if (disabled) {
            return;
          }
          setOpen((value) => !value);
        }}
        disabled={disabled}
        className={[
          'inline-flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm transition',
          'border-gray-200/70 bg-white/70 text-gray-700 shadow-sm hover:bg-white',
          'dark:border-gray-700/70 dark:bg-gray-900/60 dark:text-gray-100 dark:hover:bg-gray-900',
          'focus:outline-none focus:ring-2 focus:ring-accent/40 disabled:cursor-not-allowed disabled:opacity-60',
          open ? 'ring-2 ring-accent/40 border-accent/30 dark:border-accent/30' : '',
        ].join(' ')}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="min-w-0">
          <span className="block truncate font-medium">
            {selectedTemplate?.name ?? t('template_selectTemplate')}
          </span>
          {selectedTemplate?.description ? (
            <span className="block truncate text-xs text-gray-500 dark:text-gray-400">
              {selectedTemplate.description}
            </span>
          ) : null}
        </span>
        <ChevronDown
          size={14}
          className={[
            'shrink-0 text-gray-400 transition-transform duration-150',
            open ? 'rotate-180' : '',
          ].join(' ')}
        />
      </button>

      {open && menuPosition
        ? createPortal(
            <div
              ref={menuRef}
              className="fixed z-[1000] overflow-x-hidden overflow-y-auto rounded-xl border border-gray-200/70 bg-white/95 shadow-lg shadow-black/8 backdrop-blur-xl dark:border-gray-700/70 dark:bg-gray-900/95 dark:shadow-black/30 animate-[dropdownIn_120ms_ease-out]"
              style={{
                top: menuPosition.top,
                bottom: menuPosition.bottom,
                left: menuPosition.left,
                width: menuPosition.width,
                maxHeight: menuPosition.maxHeight,
              }}
              role="listbox"
            >
              <div className="p-1">
                <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                  {t('template_builtIn')}
                </div>
                {builtInTemplates.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => {
                      onSelect(template.id);
                      setOpen(false);
                    }}
                    className={[
                      'mb-1 flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left transition-colors duration-100',
                      template.id === selectedId
                        ? 'bg-accent/8 text-accent dark:bg-accent/12 dark:text-accent-muted'
                        : 'text-gray-700 hover:bg-gray-100/80 dark:text-gray-200 dark:hover:bg-gray-800/80',
                    ].join(' ')}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{template.name}</span>
                      <span className="block text-xs text-gray-500 dark:text-gray-400">{template.description}</span>
                    </span>
                    {template.id === selectedId ? <Check size={14} className="mt-0.5 shrink-0 text-accent" /> : null}
                  </button>
                ))}

                {customTemplates.length > 0 ? (
                  <>
                    <div className="my-1 border-t border-gray-200/70 dark:border-gray-700/70" />
                    <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                      {t('template_myTemplates')}
                    </div>
                    {customTemplates.map((template) => (
                      <button
                        key={template.id}
                        type="button"
                        onClick={() => {
                          onSelect(template.id);
                          setOpen(false);
                        }}
                        className={[
                          'mb-1 flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left transition-colors duration-100',
                          template.id === selectedId
                            ? 'bg-accent/8 text-accent dark:bg-accent/12 dark:text-accent-muted'
                            : 'text-gray-700 hover:bg-gray-100/80 dark:text-gray-200 dark:hover:bg-gray-800/80',
                        ].join(' ')}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{template.name}</span>
                          <span className="block text-xs text-gray-500 dark:text-gray-400">{template.description}</span>
                        </span>
                        {template.id === selectedId ? <Check size={14} className="mt-0.5 shrink-0 text-accent" /> : null}
                      </button>
                    ))}
                  </>
                ) : null}
              </div>

              <div className="border-t border-gray-200/70 p-1 dark:border-gray-700/70">
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onCreateNew();
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-medium text-accent transition hover:bg-accent/10"
                >
                  <Plus size={14} />
                  {t('template_createNew')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onManage();
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-medium text-accent transition hover:bg-accent/10"
                >
                  <Settings2 size={14} />
                  {t('template_manageTemplates')}
                </button>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
