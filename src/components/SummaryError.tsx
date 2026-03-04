import { AlertCircle, TriangleAlert, WifiOff } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

type SummaryErrorProps = {
  errorMessage: string;
  onRetry: () => void;
  onSwitchModel?: (model: string) => void;
  onCheckConnection?: () => void;
};

type ParsedSummaryError = {
  kind: string;
  raw: string;
};

function parseSummaryError(errorMessage: string): ParsedSummaryError {
  try {
    const parsed = JSON.parse(errorMessage) as { kind?: string; raw?: string };
    return {
      kind: parsed.kind ?? 'generation',
      raw: parsed.raw ?? errorMessage,
    };
  } catch {
    return { kind: 'generation', raw: errorMessage };
  }
}

export function SummaryError({ errorMessage, onRetry, onSwitchModel, onCheckConnection }: SummaryErrorProps) {
  const { t } = useTranslation('meeting');
  const { t: tc } = useTranslation('common');
  const [showDetails, setShowDetails] = useState(false);
  const parsed = useMemo(() => parseSummaryError(errorMessage), [errorMessage]);

  const isWarning = parsed.kind === 'connectionRefused' || parsed.kind === 'contextTruncated';
  const containerClass = isWarning
    ? 'rounded-lg border border-amber-300/70 bg-amber-50/70 px-3 py-3 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200'
    : 'rounded-lg border border-red-300/70 bg-red-50/70 px-3 py-3 text-sm text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200';
  const buttonClass = isWarning
    ? 'rounded-md border border-amber-400/80 px-2.5 py-1 text-xs font-medium text-amber-800 transition hover:bg-amber-100/70 dark:border-amber-500/60 dark:text-amber-100 dark:hover:bg-amber-500/20'
    : 'rounded-md border border-red-300/80 px-2.5 py-1 text-xs font-medium text-red-700 transition hover:bg-red-100/70 dark:border-red-500/60 dark:text-red-200 dark:hover:bg-red-500/20';

  let icon = <TriangleAlert size={16} className="mt-0.5 shrink-0" />;
  let message = t('error_generationFailed');

  if (parsed.kind === 'outOfMemory') {
    message = t('error_outOfMemory');
  } else if (parsed.kind === 'connectionRefused') {
    icon = <WifiOff size={16} className="mt-0.5 shrink-0" />;
    message = t('error_connectionRefused');
  } else if (parsed.kind === 'contextTruncated') {
    icon = <AlertCircle size={16} className="mt-0.5 shrink-0" />;
    message = t('error_contextTruncated');
  }

  return (
    <div className={containerClass}>
      <div className="flex items-start gap-2">
        {icon}
        <div className="w-full space-y-2">
          <p>{message}</p>

          <div className="flex flex-wrap items-center gap-2">
            {parsed.kind === 'outOfMemory' ? (
              <>
                <button type="button" onClick={() => onSwitchModel?.('phi4-mini')} className={buttonClass}>
                  {t('error_switchModel', { model: 'phi4-mini' })}
                </button>
                <button type="button" onClick={onRetry} className={buttonClass}>
                  {tc('btn_retry')}
                </button>
              </>
            ) : null}

            {parsed.kind === 'connectionRefused' ? (
              <>
                <button type="button" onClick={() => onCheckConnection?.()} className={buttonClass}>
                  {t('error_checkConnection')}
                </button>
                <button type="button" onClick={onRetry} className={buttonClass}>
                  {tc('btn_retry')}
                </button>
              </>
            ) : null}

            {parsed.kind === 'generation' ? (
              <button type="button" onClick={onRetry} className={buttonClass}>
                {tc('btn_retry')}
              </button>
            ) : null}

            <button
              type="button"
              onClick={() => setShowDetails((previous) => !previous)}
              className="rounded-md border border-current/30 px-2.5 py-1 text-xs font-medium opacity-90 transition hover:opacity-100"
            >
              {showDetails ? t('error_hideDetails') : t('error_showDetails')}
            </button>
          </div>

          {showDetails ? (
            <pre className="overflow-auto rounded-md border border-black/10 bg-black/5 p-2 text-xs leading-relaxed dark:border-white/10 dark:bg-white/5">
              {parsed.raw}
            </pre>
          ) : null}
        </div>
      </div>
    </div>
  );
}
