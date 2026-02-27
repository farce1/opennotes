import { Pause, Play, Square } from 'lucide-react';

import { ElapsedTimer } from './ElapsedTimer';
import { WaveformBar } from './WaveformBar';

function useRecordingPlaceholder() {
  return {
    isPaused: false,
    audioLevel: 0.16,
    startTime: Date.now(),
    pauseRecording: async () => {},
    resumeRecording: async () => {},
    stopRecording: async () => {},
  };
}

export function RecordingWidget() {
  const {
    isPaused,
    audioLevel,
    startTime,
    pauseRecording,
    resumeRecording,
    stopRecording,
  } = useRecordingPlaceholder();

  const onPauseToggle = async () => {
    if (isPaused) {
      await resumeRecording();
      return;
    }

    await pauseRecording();
  };

  return (
    <section
      data-tauri-drag-region
      className="flex h-[72px] w-[280px] items-center gap-3 rounded-full border border-white/15 bg-black/80 px-4 shadow-xl backdrop-blur-sm"
    >
      <ElapsedTimer startTime={startTime} isPaused={isPaused} />

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
        onClick={stopRecording}
        className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-red-500/90 text-white transition hover:bg-red-500"
        aria-label="Stop recording"
      >
        <Square size={13} />
      </button>
    </section>
  );
}
