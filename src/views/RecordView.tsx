import { AlertTriangle, CheckCircle2, Circle, Mic, Square } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';

import { useModelSetup } from '../hooks/useModelSetup';
import { useRecording } from '../hooks/useRecording';
import { useTranscript } from '../hooks/useTranscript';

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function RecordView() {
  const navigate = useNavigate();
  const transcriptContainerRef = useRef<HTMLDivElement | null>(null);
  const [recordingError, setRecordingError] = useState<string | null>(null);

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

  const { modelStatus, checkModelReady } = useModelSetup();
  const { segments, isTranscribing, startTranscription, stopTranscription, resetTranscript } = useTranscript();

  const stateLabel = isRecording ? (isPaused ? 'Paused' : 'Recording') : 'Ready to Record';

  const modelReady = modelStatus === 'ready';
  const modelBlocked = modelStatus === 'not_ready' || modelStatus === 'error';
  const isModelChecking = modelStatus === 'checking' || modelStatus === 'unknown';

  useEffect(() => {
    const container = transcriptContainerRef.current;
    if (!container) {
      return;
    }

    container.scrollTop = container.scrollHeight;
  }, [segments.length]);

  const transcriptHint = useMemo(() => {
    if (isRecording && !segments.length) {
      return 'Listening for speech… segments appear after VAD completes a phrase.';
    }

    if (!isRecording && segments.length) {
      return 'Recent transcript from the last recording session.';
    }

    return 'Live transcript appears here while recording.';
  }, [isRecording, segments.length]);

  const handleStartRecording = async () => {
    setRecordingError(null);

    const ready = await checkModelReady();
    if (!ready) {
      setRecordingError('Transcription model not set up. Open Setup to download it before recording.');
      return;
    }

    resetTranscript();

    const started = await startRecording();
    if (!started) {
      return;
    }

    const transcriptionStarted = await startTranscription();
    if (!transcriptionStarted) {
      await stopRecording();
      setRecordingError('Transcription worker failed to start. Verify model files and retry.');
    }
  };

  const handleStopRecording = async () => {
    await stopTranscription();
    const outputPath = await stopRecording();

    if (!outputPath) {
      return;
    }

    const title = `Meeting — ${new Date().toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })}`;

    navigate('/meeting-complete', {
      state: {
        segments,
        title,
      },
    });
  };

  return (
    <section className="flex h-full min-h-[calc(100vh-3rem)] items-center justify-center rounded-xl border border-warm-200/80 bg-white/60 px-6 py-10 shadow-sm dark:border-warm-700/70 dark:bg-warm-800/40">
      <div className="w-full max-w-4xl space-y-6">
        <div className="text-center">
          <Circle
            className={`mx-auto ${isRecording ? 'text-red-500' : 'text-warm-300'}`}
            size={54}
            strokeWidth={1.8}
          />
          <h1 className="mt-4 text-2xl font-semibold text-warm-700 dark:text-warm-100">{stateLabel}</h1>
          <p className="mt-1 text-sm text-warm-500 dark:text-warm-300">
            {isRecording
              ? `Elapsed: ${formatElapsed(elapsedMs)} — transcription starts automatically with recording.`
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

          <div className="flex items-center justify-between">
            <span className="font-medium text-warm-700 dark:text-warm-100">Transcription model</span>
            {modelReady ? (
              <span className="inline-flex items-center gap-1 text-emerald-600">
                <CheckCircle2 size={15} /> Ready
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

            {permissionStatus.screenRecording !== 'granted' ? (
              <button
                type="button"
                onClick={() => void openSystemSettings()}
                className="rounded-lg border border-amber-400 px-3 py-1.5 text-xs font-medium text-amber-700 transition hover:bg-amber-100/70 dark:border-amber-500 dark:text-amber-300 dark:hover:bg-amber-500/10"
              >
                Open System Settings
              </button>
            ) : null}

            {modelBlocked ? (
              <button
                type="button"
                onClick={() => navigate('/setup')}
                className="rounded-lg border border-accent px-3 py-1.5 text-xs font-medium text-accent transition hover:bg-accent-light/30"
              >
                Open Setup
              </button>
            ) : null}
          </div>

          {permissionHint ? (
            <p className="rounded-lg border border-amber-300/70 bg-amber-50/70 px-3 py-2 text-xs text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
              {permissionHint}
            </p>
          ) : null}

          {recordingError ? (
            <p className="rounded-lg border border-red-300/70 bg-red-50/70 px-3 py-2 text-xs text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200">
              {recordingError}
            </p>
          ) : null}

          {modelBlocked ? (
            <p className="rounded-lg border border-accent-light bg-accent-light/35 px-3 py-2 text-xs text-warm-700 dark:border-accent/40 dark:bg-accent/10 dark:text-warm-100">
              Transcription model not set up. Go to Setup to download it before recording.
            </p>
          ) : null}

          {isModelChecking ? (
            <p className="rounded-lg border border-warm-300/70 bg-white/70 px-3 py-2 text-xs text-warm-600 dark:border-warm-600 dark:bg-warm-800/60 dark:text-warm-200">
              Checking transcription model status…
            </p>
          ) : null}
        </div>

        <div className="rounded-xl border border-warm-200/70 bg-white/70 p-4 dark:border-warm-700/70 dark:bg-warm-900/30">
          <div className="mb-3 flex items-center justify-between text-xs uppercase tracking-wide text-warm-500 dark:text-warm-300">
            <span>Live Transcript</span>
            <span>{isTranscribing ? 'Transcribing' : 'Idle'}</span>
          </div>

          <div
            ref={transcriptContainerRef}
            className={`h-56 rounded-lg border border-warm-200/70 bg-warm-50/50 p-3 dark:border-warm-700/70 dark:bg-warm-900/40 ${
              isRecording ? 'overflow-y-hidden' : 'overflow-y-auto'
            }`}
          >
            {segments.length ? (
              <div className="space-y-2">
                {segments.map((segment) => (
                  <article
                    key={segment.index}
                    className="grid grid-cols-[auto_1fr] gap-x-3 rounded-md border border-transparent px-1 py-1.5 animate-[transcriptFade_0.3s_ease-out]"
                  >
                    <span className="font-mono text-xs text-warm-500 dark:text-warm-300">{formatElapsed(segment.elapsedMs)}</span>
                    <p className="text-sm leading-relaxed text-warm-700 dark:text-warm-100">{segment.text}</p>
                  </article>
                ))}
              </div>
            ) : (
              <p className="text-sm text-warm-500 dark:text-warm-300">{transcriptHint}</p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3">
          {!isRecording ? (
            <button
              type="button"
              onClick={() => void handleStartRecording()}
              disabled={permissionLoading || !modelReady}
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
                onClick={() => void handleStopRecording()}
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
