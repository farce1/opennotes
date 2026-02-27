import { AlertTriangle, CheckCircle2, Circle, Mic, Square } from 'lucide-react';

import { useRecording } from '../hooks/useRecording';

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

export function RecordView() {
  const {
    isRecording,
    isPaused,
    elapsedMs,
    permissionStatus,
    permissionHint,
    permissionLoading,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    refreshPermissions,
    openSystemSettings,
  } = useRecording();

  const stateLabel = isRecording ? (isPaused ? 'Paused' : 'Recording') : 'Ready to Record';

  return (
    <section className="flex h-full min-h-[calc(100vh-3rem)] items-center justify-center rounded-xl border border-warm-200/80 bg-white/60 px-6 py-10 shadow-sm dark:border-warm-700/70 dark:bg-warm-800/40">
      <div className="w-full max-w-2xl space-y-6">
        <div className="text-center">
          <Circle
            className={`mx-auto ${isRecording ? 'text-red-500' : 'text-warm-300'}`}
            size={54}
            strokeWidth={1.8}
          />
          <h1 className="mt-4 text-2xl font-semibold text-warm-700 dark:text-warm-100">{stateLabel}</h1>
          <p className="mt-1 text-sm text-warm-500 dark:text-warm-300">
            {isRecording
              ? `Elapsed: ${formatElapsed(elapsedMs)} — floating widget is your primary control surface.`
              : 'Press Cmd+Shift+R, use the tray menu, or start recording here.'}
          </p>
        </div>

        <div className="grid gap-3 rounded-xl border border-warm-200/70 bg-warm-50/70 p-4 text-sm dark:border-warm-700/70 dark:bg-warm-900/30">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 font-medium text-warm-700 dark:text-warm-100">
              <Mic size={16} />
              Microphone
            </span>
            {permissionStatus.mic === 'granted' ? (
              <span className="inline-flex items-center gap-1 text-emerald-600">
                <CheckCircle2 size={15} /> Granted
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-red-500">
                <AlertTriangle size={15} /> Required
              </span>
            )}
          </div>

          <div className="flex items-center justify-between">
            <span className="font-medium text-warm-700 dark:text-warm-100">System audio (Screen Recording)</span>
            {permissionStatus.screenRecording === 'granted' ? (
              <span className="inline-flex items-center gap-1 text-emerald-600">
                <CheckCircle2 size={15} /> Granted
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-amber-500">
                <AlertTriangle size={15} /> Setup needed
              </span>
            )}
          </div>

          <div className="flex flex-wrap gap-2 pt-2">
            <button
              type="button"
              onClick={() => void refreshPermissions()}
              className="rounded-lg border border-warm-300 px-3 py-1.5 text-xs font-medium text-warm-700 transition hover:bg-warm-100 dark:border-warm-600 dark:text-warm-100 dark:hover:bg-warm-800"
            >
              Refresh Permissions
            </button>

            {permissionStatus.screenRecording !== 'granted' && (
              <button
                type="button"
                onClick={() => void openSystemSettings()}
                className="rounded-lg border border-amber-400 px-3 py-1.5 text-xs font-medium text-amber-700 transition hover:bg-amber-100/70 dark:border-amber-500 dark:text-amber-300 dark:hover:bg-amber-500/10"
              >
                Open System Settings
              </button>
            )}
          </div>

          {permissionHint && (
            <p className="rounded-lg border border-amber-300/70 bg-amber-50/70 px-3 py-2 text-xs text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
              {permissionHint}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3">
          {!isRecording ? (
            <button
              type="button"
              onClick={() => void startRecording()}
              disabled={permissionLoading}
              className="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              {permissionLoading ? 'Checking permissions…' : 'Start Recording'}
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => void (isPaused ? resumeRecording() : pauseRecording())}
                className="rounded-xl border border-warm-300 px-5 py-2.5 text-sm font-semibold text-warm-700 transition hover:bg-warm-100 dark:border-warm-600 dark:text-warm-100 dark:hover:bg-warm-800"
              >
                {isPaused ? 'Resume' : 'Pause'}
              </button>

              <button
                type="button"
                onClick={() => void stopRecording()}
                className="inline-flex items-center gap-2 rounded-xl bg-red-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-red-600"
              >
                <Square size={13} />
                Stop Recording
              </button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
