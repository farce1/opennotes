import { AlertCircle, Pause, Play, Square } from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useTranslation } from 'react-i18next';

import { useRecording } from '../../hooks/useRecording';
import { useSession } from '../../hooks/useSession';
import { ElapsedTimer } from './ElapsedTimer';
import { WaveformBar } from './WaveformBar';

export function RecordingWidget() {
  const { t } = useTranslation('widget');
  const { isPaused, isRecording, audioLevel, audioSpectrum, elapsedMs } = useRecording();
  const { phase, transcriptionDegraded, pauseSession, resumeSession, stopSession } = useSession();

  const isSaving = phase === 'stopping';
  const isTranscribing = phase === 'recording' || phase === 'paused';

  const onPauseToggle = async () => {
    if (!isRecording || isSaving) {
      return;
    }

    if (isPaused) {
      await resumeSession();
      return;
    }

    await pauseSession();
  };

  const onStartDrag = (event: React.MouseEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest('button, a, input, textarea, select, [data-no-drag]')) {
      return;
    }

    void getCurrentWindow().startDragging();
  };

  return (
    <section
      data-tauri-drag-region
      onMouseDown={onStartDrag}
      className="flex h-full w-full cursor-grab select-none items-center gap-3 rounded-[22px] border border-white/12 bg-black/86 px-4 shadow-[0_14px_34px_rgba(0,0,0,0.45)] backdrop-blur-xl active:cursor-grabbing"
    >
      <div className="min-w-[78px]">
        <ElapsedTimer elapsedMs={elapsedMs} />
        <p
          className={`mt-0.5 flex items-center gap-1 text-[10px] uppercase tracking-wide transition-opacity duration-200 ${
            isTranscribing || transcriptionDegraded ? 'opacity-100' : 'opacity-0'
          } ${transcriptionDegraded ? 'text-amber-300/90' : 'text-white/60'}`}
        >
          {transcriptionDegraded ? (
            <>
              <AlertCircle size={10} className="text-amber-300/90" />
              {t('status_transcriptionIssue')}
            </>
          ) : (
            t('status_transcribing')
          )}
        </p>
      </div>

      <div className="flex-1">
        <WaveformBar level={audioLevel} spectrum={audioSpectrum} />
      </div>

      <button
        type="button"
        onClick={() => void onPauseToggle()}
        disabled={!isRecording || isSaving}
        className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50"
        aria-label={isPaused ? t('aria_resumeRecording') : t('aria_pauseRecording')}
      >
        {isPaused ? <Play size={14} /> : <Pause size={14} />}
      </button>

      <button
        type="button"
        onClick={() => void stopSession()}
        disabled={!isRecording || isSaving}
        className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-red-500/90 text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
        aria-label={t('aria_stopRecording')}
      >
        <Square size={13} />
      </button>
    </section>
  );
}
