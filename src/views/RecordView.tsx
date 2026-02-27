import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { AlertTriangle, CheckCircle2, Circle, Mic, Square } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';

import { useModelSetup } from '../hooks/useModelSetup';
import { useRecording } from '../hooks/useRecording';
import { useSession } from '../hooks/useSession';
import { useTranscript } from '../hooks/useTranscript';
import type { OllamaStatus } from '../types';

const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;

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
  const autoStopTriggeredRef = useRef(false);
  const [recordingError, setRecordingError] = useState<string | null>(null);

  const {
    isRecording,
    isPaused,
    startTime,
    elapsedMs,
    permissionStatus,
    permissionHint,
    permissionLoading,
    ensurePermissions,
    refreshPermissions,
    openSystemSettings,
  } = useRecording();

  const { modelStatus, checkModelReady } = useModelSetup();
  const { segments, isTranscribing, addEvent, resetTranscript } = useTranscript();
  const {
    phase,
    meetingId,
    transcriptionDegraded,
    isSaving,
    startSession,
    stopSession,
    pauseSession,
    resumeSession,
  } = useSession();

  const sessionActive = phase === 'recording' || phase === 'paused' || phase === 'stopping';

  const stateLabel = useMemo(() => {
    if (phase === 'stopping') {
      return 'Saving';
    }

    if (isRecording) {
      return isPaused ? 'Paused' : 'Recording';
    }

    return 'Ready to Record';
  }, [isPaused, isRecording, phase]);

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
    if (sessionActive && !segments.length) {
      return 'Listening for speech… segments appear after VAD completes a phrase.';
    }

    if (!sessionActive && segments.length) {
      return 'Recent transcript from the last recording session.';
    }

    return 'Live transcript appears here while recording.';
  }, [segments.length, sessionActive]);

  const handleStartRecording = useCallback(async () => {
    setRecordingError(null);

    const ready = await checkModelReady();
    if (!ready) {
      setRecordingError('Transcription model not set up. Open Setup to download it before recording.');
      return false;
    }

    try {
      const ollamaStatus = await invoke<OllamaStatus>('check_ollama_status');
      if (!ollamaStatus.modelReady) {
        setRecordingError('AI notes model not ready. Open Setup to finish Ollama setup before recording.');
        return false;
      }
    } catch {
      setRecordingError('Unable to verify AI notes model readiness. Open Setup and retry.');
      return false;
    }

    const permissionsOk = await ensurePermissions();
    if (!permissionsOk) {
      return false;
    }

    resetTranscript();

    try {
      await startSession((event) => {
        addEvent(event);
      });
      autoStopTriggeredRef.current = false;
      return true;
    } catch {
      setRecordingError('Session failed to start. Verify audio permissions and model files, then retry.');
      return false;
    }
  }, [addEvent, checkModelReady, ensurePermissions, resetTranscript, startSession]);

  const handleStopRecording = useCallback(async () => {
    try {
      const completedMeetingId = await stopSession();
      if (typeof completedMeetingId === 'number') {
        navigate('/meeting-complete', {
          state: {
            meetingId: completedMeetingId,
            autoGenerate: true,
          },
        });
      }
    } catch {
      setRecordingError('Stopping the session failed. Please retry from the widget or tray controls.');
    }
  }, [navigate, stopSession]);

  useEffect(() => {
    if (!sessionActive || !startTime || phase === 'stopping') {
      autoStopTriggeredRef.current = false;
      return;
    }

    const remainingMs = FOUR_HOURS_MS - elapsedMs;
    if (remainingMs <= 0) {
      if (!autoStopTriggeredRef.current) {
        autoStopTriggeredRef.current = true;
        void handleStopRecording();
      }
      return;
    }

    const timer = window.setTimeout(() => {
      if (!autoStopTriggeredRef.current) {
        autoStopTriggeredRef.current = true;
        void handleStopRecording();
      }
    }, remainingMs);

    return () => window.clearTimeout(timer);
  }, [elapsedMs, handleStopRecording, phase, sessionActive, startTime]);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | null = null;

    void listen('recording-toggle', async () => {
      if (phase === 'stopping') {
        return;
      }

      if (phase === 'recording' || phase === 'paused') {
        try {
          const completedMeetingId = await stopSession();
          if (typeof completedMeetingId === 'number') {
            navigate('/meeting-complete', {
              state: {
                meetingId: completedMeetingId,
                autoGenerate: true,
              },
            });
          }
        } catch {
          setRecordingError('Unable to stop session from shortcut.');
        }
        return;
      }

      await handleStartRecording();
    }).then((cleanup) => {
      if (disposed) {
        cleanup();
        return;
      }

      unlisten = cleanup;
    });

    return () => {
      disposed = true;
      if (unlisten) {
        unlisten();
      }
    };
  }, [handleStartRecording, navigate, phase, stopSession]);

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
            {sessionActive
              ? `Elapsed: ${formatElapsed(elapsedMs)} — session and transcription are coordinated automatically.`
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

          {transcriptionDegraded ? (
            <p className="rounded-lg border border-amber-300/70 bg-amber-50/70 px-3 py-2 text-xs text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
              Transcription encountered an issue during this session. Audio recording is still active.
            </p>
          ) : null}

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
              sessionActive ? 'overflow-y-hidden' : 'overflow-y-auto'
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
          {!sessionActive ? (
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
                onClick={() => void (isPaused ? resumeSession() : pauseSession())}
                disabled={phase === 'stopping' || isSaving}
                className="rounded-xl border border-warm-300 px-5 py-2.5 text-sm font-semibold text-warm-700 transition hover:bg-warm-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-warm-600 dark:text-warm-100 dark:hover:bg-warm-800"
              >
                {isPaused ? 'Resume' : 'Pause'}
              </button>

              <button
                type="button"
                onClick={() => void handleStopRecording()}
                disabled={phase === 'stopping' || isSaving}
                className="inline-flex items-center gap-2 rounded-xl bg-red-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Square size={13} />
                {isSaving || phase === 'stopping' ? 'Saving…' : 'Stop Recording'}
              </button>
            </>
          )}
        </div>

        {typeof meetingId === 'number' && phase === 'idle' ? (
          <p className="text-center text-xs text-warm-500 dark:text-warm-300">Last saved meeting ID: {meetingId}</p>
        ) : null}
      </div>
    </section>
  );
}
