/**
 * OllamaConsentModal — explicit-consent dialog before auto-installing Ollama.
 *
 * Phase 19 — ONBOARD-04. CONTEXT.md D-21..D-26.
 *
 * Shown only on macOS (the caller gates on isMacOS()). Displays three fields
 * (source domain, full URL, byte size) so the user can verify what's about
 * to be downloaded before consenting.
 *
 * Consent is per-attempt (D-24) — not persisted. The dialog re-opens every
 * time the user clicks "Set up AI" on macOS.
 *
 * i18n: keys in 'setup' namespace, prefix `ai_consentModal_`. English-only
 * for Phase 19; Polish parity tracked under ONBOARD-05 in Phase 21.
 */

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) {
    return `${(mb / 1024).toFixed(2)} GB`;
  }
  return `${mb.toFixed(1)} MB`;
}

export type OllamaConsentModalProps = {
  open: boolean;
  downloadUrl: string;
  sourceDomain: string;
  sizeBytes: number | null;
  onConfirm: () => void;
  onDecline: () => void;
};

export function OllamaConsentModal({
  open,
  downloadUrl,
  sourceDomain,
  sizeBytes,
  onConfirm,
  onDecline,
}: OllamaConsentModalProps) {
  const { t } = useTranslation('setup');

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onDecline();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onDecline]);

  if (!open) return null;

  const sizeLabel =
    typeof sizeBytes === 'number' && sizeBytes > 0
      ? formatBytes(sizeBytes)
      : t('ai_consentModal_sizeUnknown', { defaultValue: 'Unknown' });

  return createPortal(
    <>
      <button
        type="button"
        aria-label={t('ai_consentModal_declineButton', { defaultValue: 'Use manual install instead' })}
        onClick={onDecline}
        className="fixed inset-0 z-[1001] bg-black/40 backdrop-blur-sm"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ollama-consent-title"
        className="fixed left-1/2 top-1/2 z-[1002] w-[min(92vw,560px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-5 shadow-xl dark:bg-gray-900"
      >
        <h3
          id="ollama-consent-title"
          className="text-lg font-semibold text-gray-800 dark:text-gray-100"
        >
          {t('ai_consentModal_title', { defaultValue: 'Download and install Ollama?' })}
        </h3>

        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
          {t('ai_consentModal_description', {
            defaultValue:
              'openNotes will download the official Ollama installer from the address below and run it on your Mac. You can review the details before continuing.',
          })}
        </p>

        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex flex-col gap-0.5">
            <dt className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {t('ai_consentModal_sourceDomainLabel', { defaultValue: 'Source domain' })}
            </dt>
            <dd className="font-mono text-gray-800 dark:text-gray-200">{sourceDomain}</dd>
          </div>

          {/* W1 defense-in-depth: if downloadUrl is empty/falsy (e.g., non-macOS slipped through),
              show a clear "Not available on this platform" message instead of an empty <code> block.
              The isMacOS() gate in OllamaSetupContext is the primary defense; this is the safety net. */}
          <div className="flex flex-col gap-0.5">
            <dt className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {t('ai_consentModal_downloadUrlLabel', { defaultValue: 'Download URL' })}
            </dt>
            <dd className="break-all font-mono text-gray-800 dark:text-gray-200">
              {downloadUrl
                ? <code>{downloadUrl}</code>
                : <span className="italic text-gray-500 dark:text-gray-400">{t('ai_consentModal_downloadUrlUnavailable', { defaultValue: 'Not available on this platform' })}</span>
              }
            </dd>
          </div>

          <div className="flex flex-col gap-0.5">
            <dt className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {t('ai_consentModal_sizeLabel', { defaultValue: 'Download size' })}
            </dt>
            <dd className="font-mono text-gray-800 dark:text-gray-200">{sizeLabel}</dd>
          </div>
        </dl>

        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
          {t('ai_consentModal_declineHint', {
            defaultValue: "Prefer to install yourself? We'll open ollama.com/download in your browser.",
          })}
        </p>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onDecline}
            className="rounded-md border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-600 transition hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            {t('ai_consentModal_declineButton', { defaultValue: 'Use manual install instead' })}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            autoFocus
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-accent-hover"
          >
            {t('ai_consentModal_confirmButton', { defaultValue: 'Download & Install Ollama' })}
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
}
