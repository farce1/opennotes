import { listen } from '@tauri-apps/api/event';
import { Pause, Play, Square } from 'lucide-react';
import { useEffect, useState } from 'react';

import { useRecording } from '../../hooks/useRecording';
import { ElapsedTimer } from './ElapsedTimer';
import { WaveformBar } from './WaveformBar';

export function RecordingWidget() {
  const {
    isPaused,
    isRecording,
    audioLevel,
    elapsedMs,
    pauseRecording,
    resumeRecording,
    startRecording,
    stopRecording,
  } = useRecording();
  const [isTranscribing, setIsTranscribing] = useState(false);

  useEffect(() => {
    let disposed = false;
    const cleanups: Array<() => void> = [];

    void Promise.all([
      listen('transcribing-active', () => setIsTranscribing(true)),
      listen('transcribing-inactive', () => setIsTranscribing(false)),
      listen('recording-stopped', () => setIsTranscribing(false)),
    ]).then((handlers) => {
      if (disposed) {
        handlers.forEach((cleanup) => cleanup());
        return;
      }

      cleanups.push(...handlers);
    });

    return () => {
      disposed = true;
      cleanups.forEach((cleanup) => cleanup());
    };
  }, []);

  const onPauseToggle = async () => {
    if (!isRecording) {
      await startRecording();
      return;
    }

    if (isPaused) {
      await resumeRecording();
      return;
    }

    await pauseRecording();
  };

  return (
    <section
      data-tauri-drag-region
      className="flex h-[72px] w-[300px] items-center gap-3 rounded-full border border-white/15 bg-black/80 px-4 shadow-xl backdrop-blur-sm"
    >
      <div className="min-w-[78px]">
        <ElapsedTimer elapsedMs={elapsedMs} />
        <p
          className={`mt-0.5 text-[10px] uppercase tracking-wide text-white/60 transition-opacity duration-200 ${
            isTranscribing ? 'opacity-100' : 'opacity-0'
          }`}
        >
          Transcribing
        </p>
      </div>

      <div className="flex-1">
        <WaveformBar level={audioLevel} />
      </div>

      <button
        type="button"
        onClick={onPauseToggle}
        className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
        aria-label={isPaused ? 'Resume recording' : 'Pause recording'}
      >
        {isPaused ? <Play size={14} /> : <Pause size={14} />}
      </button>

      <button
        type="button"
        onClick={() => void stopRecording()}
        className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-red-500/90 text-white transition hover:bg-red-500"
        aria-label="Stop recording"
      >
        <Square size={13} />
      </button>
    </section>
  );
}
