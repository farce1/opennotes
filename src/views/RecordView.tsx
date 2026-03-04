import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import {
  AlertTriangle,
  AudioLines,
  Bot,
  CheckCircle2,
  Circle,
  Clock3,
  Cpu,
  Loader2,
  Mic,
  Square,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';

import { useModelSetup } from '../hooks/useModelSetup';
import { useRecording } from '../hooks/useRecording';
import { useSession } from '../hooks/useSession';
import { useTranscript } from '../hooks/useTranscript';
import { isMacOS } from '../lib/platform';
import { getSetting } from '../lib/settings';
import type { OllamaStatus, TranscriptRow } from '../types';

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

function rowToSegment(row: TranscriptRow) {
  return {
    text: row.text,
    elapsedMs: row.start_time_ms,
    index: row.segment_index,
  };
}

export function RecordView() {
  const { t } = useTranslation('record');
  const navigate = useNavigate();
  const transcriptContainerRef = useRef<HTMLDivElement | null>(null);
  const autoStopTriggeredRef = useRef(false);
  const shortcutHandlingRef = useRef(false);
  const lastShortcutTriggeredAtRef = useRef(0);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [startingSession, setStartingSession] = useState(false);
  const macOS = useMemo(() => isMacOS(), []);
  const systemAudioLabel = useMemo(
    () => (macOS ? t('preflight_systemAudioMac') : t('preflight_systemAudio')),
    [macOS, t],
  );

  const {
    isRecording,
    isPaused,
    startTime,
    elapsedMs,
    permissionStatus,
    permissionHint,
    permissionLoading,
    ensurePermissions,
    grantMicrophonePermission,
    grantSystemAudioPermission,
    refreshPermissions,
  } = useRecording();

  const { modelStatus, checkModelReady } = useModelSetup();
  const { segments, isTranscribing, addEvent, addSegment, resetTranscript } = useTranscript();
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
  const phaseRef = useRef(phase);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const navigateToMeetingComplete = useCallback(
    async (completedMeetingId: number) => {
      const autoSummary = await getSetting('autoSummary');
      navigate('/meeting-complete', {
        state: {
          meetingId: completedMeetingId,
          autoGenerate: autoSummary ?? true,
        },
      });
    },
    [navigate],
  );

  const stateLabel = useMemo(() => {
    if (phase === 'stopping') {
      return t('status_saving');
    }

    if (isRecording) {
      return isPaused ? t('status_paused') : t('status_recording');
    }

    return t('status_ready');
  }, [isPaused, isRecording, phase, t]);

  const modelReady = modelStatus === 'ready';
  const modelBlocked = modelStatus === 'not_ready' || modelStatus === 'error';
  const isModelChecking = modelStatus === 'checking' || modelStatus === 'unknown';
  const modelSettingUp = modelStatus === 'downloading' || modelStatus === 'extracting';
  const remainingAutoStopMs = Math.max(0, FOUR_HOURS_MS - elapsedMs);
  const canChangeSessionState = phase !== 'stopping' && !isSaving;
  const hasOperationalAlert =
    transcriptionDegraded || Boolean(permissionHint) || Boolean(recordingError) || modelBlocked || isModelChecking;

  useEffect(() => {
    const container = transcriptContainerRef.current;
    if (!container) {
      return;
    }

    container.scrollTop = container.scrollHeight;
  }, [segments.length]);

  const transcriptHint = useMemo(() => {
    if (sessionActive && !segments.length) {
      return t('transcript_hintListening');
    }

    if (!sessionActive && segments.length) {
      return t('transcript_hintRecent');
    }

    return t('transcript_hintDefault');
  }, [segments.length, sessionActive, t]);

  useEffect(() => {
    if (!sessionActive || typeof meetingId !== 'number') {
      return;
    }

    let disposed = false;
    let syncInFlight = false;
    let nextOffset = 0;

    const syncTranscriptFromDb = async (limit: number) => {
      if (disposed || syncInFlight) {
        return;
      }

      syncInFlight = true;
      try {
        const rows = await invoke<TranscriptRow[]>('get_transcript_page', {
          meetingId,
          offset: nextOffset,
          limit,
        });

        if (disposed || !rows.length) {
          return;
        }

        rows.forEach((row) => addSegment(rowToSegment(row)));
        const lastRow = rows[rows.length - 1];
        nextOffset = lastRow.segment_index + 1;
      } catch {
        // Ignore transient read errors; a later poll can recover.
      } finally {
        syncInFlight = false;
      }
    };

    void syncTranscriptFromDb(10_000);

    const poller = window.setInterval(() => {
      void syncTranscriptFromDb(250);
    }, 1200);

    return () => {
      disposed = true;
      window.clearInterval(poller);
    };
  }, [addSegment, meetingId, sessionActive]);

  const handleStartRecording = useCallback(async () => {
    setRecordingError(null);
    setStartingSession(true);

    try {
      const ready = await checkModelReady();
      if (!ready) {
        setRecordingError(t('error_modelNotSetUp'));
        return false;
      }

      try {
        const serverUrl = await getSetting('ollamaServerUrl');
        const ollamaStatus = await invoke<OllamaStatus>('check_ollama_status', {
          serverUrl: serverUrl || undefined,
        });
        if (!ollamaStatus.modelReady) {
          setRecordingError(t('error_ollamaNotReady'));
          return false;
        }
      } catch {
        setRecordingError(t('error_ollamaVerify'));
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
        setRecordingError(t('error_sessionStart'));
        return false;
      }
    } finally {
      setStartingSession(false);
    }
  }, [addEvent, checkModelReady, ensurePermissions, resetTranscript, startSession, t]);

  const handleStopRecording = useCallback(async () => {
    try {
      const completedMeetingId = await stopSession();
      if (typeof completedMeetingId === 'number') {
        await navigateToMeetingComplete(completedMeetingId);
      }
    } catch {
      setRecordingError(t('error_sessionStop'));
    }
  }, [navigateToMeetingComplete, stopSession, t]);

  const handleGrantMicrophone = useCallback(async () => {
    setRecordingError(null);
    await grantMicrophonePermission();
  }, [grantMicrophonePermission]);

  const handleGrantSystemAudio = useCallback(async () => {
    setRecordingError(null);
    await grantSystemAudioPermission();
  }, [grantSystemAudioPermission]);

  const handleGoToModels = useCallback(() => {
    navigate('/setup');
  }, [navigate]);

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
    const cleanups: Array<() => void> = [];

    const runToggleAction = async () => {
      const now = Date.now();
      if (shortcutHandlingRef.current) {
        return;
      }

      if (now - lastShortcutTriggeredAtRef.current < 350) {
        return;
      }

      shortcutHandlingRef.current = true;
      lastShortcutTriggeredAtRef.current = now;

      try {
        const currentPhase = phaseRef.current;
        if (currentPhase === 'stopping') {
          return;
        }

        if (currentPhase === 'recording' || currentPhase === 'paused') {
          try {
            const completedMeetingId = await stopSession();
            if (typeof completedMeetingId === 'number') {
              await navigateToMeetingComplete(completedMeetingId);
            }
          } catch {
            setRecordingError(t('error_shortcutStop'));
          }
          return;
        }

        await handleStartRecording();
      } finally {
        window.setTimeout(() => {
          shortcutHandlingRef.current = false;
        }, 220);
      }
    };

    void Promise.all([
      listen('recording-toggle', () => {
        void runToggleAction();
      }),
      listen('recording-pause-toggle', async () => {
        const currentPhase = phaseRef.current;
        if (currentPhase === 'recording') {
          try {
            await pauseSession();
          } catch {
            setRecordingError(t('error_shortcutPause'));
          }
          return;
        }

        if (currentPhase === 'paused') {
          try {
            await resumeSession();
          } catch {
            setRecordingError(t('error_shortcutResume'));
          }
        }
      }),
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
  }, [handleStartRecording, navigateToMeetingComplete, pauseSession, resumeSession, stopSession, t]);

  return (
    <section className="relative flex min-h-full justify-center px-4 py-8 sm:px-6 sm:py-10">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-12 top-8 h-60 w-60 rounded-full bg-accent/15 blur-3xl dark:bg-accent/20" />
        <div className="absolute right-0 top-1/4 h-72 w-72 rounded-full bg-red-500/10 blur-3xl dark:bg-red-500/20" />
        <div className="absolute bottom-0 left-1/3 h-56 w-56 rounded-full bg-cyan-300/20 blur-3xl dark:bg-cyan-400/10" />
      </div>

      <div className="relative w-full max-w-6xl">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div className="space-y-6">
            <section className="relative overflow-hidden rounded-3xl border border-gray-200/80 bg-white/90 p-6 shadow-[0_28px_70px_-38px_rgba(15,23,42,0.55)] backdrop-blur-sm dark:border-gray-700/80 dark:bg-gray-900/80 sm:p-7">
              <div className="pointer-events-none absolute -right-14 -top-20 h-60 w-60 rounded-full bg-accent/15 blur-3xl dark:bg-accent/20" />

              <div className="relative">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div
                      className={`grid h-12 w-12 place-items-center rounded-2xl border ${
                        isRecording && !isPaused
                          ? 'border-red-300 bg-red-500/15 text-red-500 dark:border-red-400/50 dark:bg-red-500/20 dark:text-red-300'
                          : isPaused
                            ? 'border-amber-300 bg-amber-500/10 text-amber-600 dark:border-amber-400/40 dark:bg-amber-500/15 dark:text-amber-200'
                            : 'border-accent/30 bg-accent/10 text-accent dark:border-accent/40 dark:bg-accent/20 dark:text-accent-muted'
                      }`}
                    >
                      <Circle
                        size={21}
                        strokeWidth={2.2}
                        className={isRecording && !isPaused ? 'animate-pulse' : undefined}
                      />
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gray-500 dark:text-gray-400">
                        {t('deck_label')}
                      </p>
                      <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-50">{stateLabel}</h1>
                    </div>
                  </div>

                  <span
                    className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${
                      isTranscribing
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200'
                        : 'bg-gray-200 text-gray-600 dark:bg-gray-700/60 dark:text-gray-300'
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${isTranscribing ? 'animate-pulse bg-emerald-500' : 'bg-gray-400 dark:bg-gray-500'}`}
                    />
                    {isTranscribing ? t('transcription_live') : t('transcription_idle')}
                  </span>
                </div>

                <div className="mt-6 rounded-2xl border border-gray-200/80 bg-gradient-to-br from-white to-gray-100/80 p-5 dark:border-gray-700 dark:from-gray-900 dark:to-gray-850">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
                    <span className="inline-flex items-center gap-1.5">
                      <Clock3 size={13} />
                      {t('clock_label')}
                    </span>
                    <span className="rounded-full bg-accent/10 px-2 py-0.5 text-accent dark:bg-accent/20 dark:text-accent-muted">
                      {t('clock_autoStop')}
                    </span>
                  </div>
                  <p className="mt-3 font-mono text-4xl font-semibold text-gray-900 dark:text-gray-50 sm:text-5xl">
                    {formatElapsed(elapsedMs)}
                  </p>
                  <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">
                    {sessionActive
                      ? t('clock_remaining', { time: formatElapsed(remainingAutoStopMs) })
                      : t('clock_hint')}
                  </p>
                </div>

                <div className="mt-6 flex flex-wrap items-center gap-3">
                  {!sessionActive ? (
                    <button
                      type="button"
                      onClick={() => void handleStartRecording()}
                      disabled={permissionLoading || startingSession || !modelReady}
                      className="inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white shadow-[0_14px_30px_-18px_rgba(37,99,235,0.75)] transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {startingSession ? <Loader2 size={16} className="animate-spin" /> : <Mic size={16} />}
                      {startingSession ? t('btn_starting') : permissionLoading ? t('btn_checkingPermissions') : t('btn_startRecording')}
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => void (isPaused ? resumeSession() : pauseSession())}
                        disabled={!canChangeSessionState}
                        className="rounded-xl border border-gray-300 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:bg-gray-850 dark:text-gray-100 dark:hover:bg-gray-800"
                      >
                        {isPaused ? t('btn_resume') : t('btn_pause')}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleStopRecording()}
                        disabled={!canChangeSessionState}
                        className="inline-flex items-center gap-2 rounded-xl bg-red-500 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_14px_30px_-18px_rgba(239,68,68,0.8)] transition hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <Square size={13} />
                        {isSaving || phase === 'stopping' ? t('btn_saving') : t('btn_stopRecording')}
                      </button>
                    </>
                  )}
                </div>

                {recordingError ? (
                  <p className="mt-3 rounded-xl border border-red-200 bg-red-50/80 px-3 py-2.5 text-sm text-red-700 dark:border-red-500/35 dark:bg-red-500/10 dark:text-red-200">
                    {recordingError}
                  </p>
                ) : null}
              </div>
            </section>

            <section className="rounded-3xl border border-gray-200/80 bg-white/90 p-5 shadow-[0_24px_60px_-40px_rgba(15,23,42,0.55)] backdrop-blur-sm dark:border-gray-700/80 dark:bg-gray-900/80 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-500 dark:text-gray-400">
                    {t('transcript_label')}
                  </p>
                  <h2 className="mt-1 text-lg font-semibold text-gray-900 dark:text-gray-50">{t('transcript_title')}</h2>
                </div>
                <div className="inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                  <AudioLines size={13} />
                  {t('transcript_segmentCount', { count: segments.length })}
                </div>
              </div>

              <div
                ref={transcriptContainerRef}
                className={`mt-4 h-72 rounded-2xl border border-gray-200/70 bg-gray-50/90 p-4 dark:border-gray-700 dark:bg-gray-900/70 ${
                  sessionActive ? 'overflow-y-hidden' : 'overflow-y-auto'
                }`}
              >
                {segments.length ? (
                  <div className="space-y-2.5">
                    {segments.map((segment) => (
                      <article
                        key={segment.index}
                        className="grid grid-cols-[auto_1fr] gap-x-3 rounded-xl border border-transparent bg-white/75 px-2.5 py-2 animate-[transcriptFade_0.3s_ease-out] dark:bg-gray-850/85"
                      >
                        <span className="font-mono text-xs text-gray-500 dark:text-gray-400">
                          {formatElapsed(segment.elapsedMs)}
                        </span>
                        <p className="text-sm leading-relaxed text-gray-700 dark:text-gray-100">{segment.text}</p>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500 dark:text-gray-400">{transcriptHint}</p>
                )}
              </div>

              {typeof meetingId === 'number' && phase === 'idle' ? (
                <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">{t('transcript_lastMeeting', { id: meetingId })}</p>
              ) : null}
            </section>
          </div>

          <aside className="space-y-6">
            <section className="rounded-3xl border border-gray-200/80 bg-white/90 p-5 shadow-[0_24px_60px_-40px_rgba(15,23,42,0.55)] backdrop-blur-sm dark:border-gray-700/80 dark:bg-gray-900/80 sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-500 dark:text-gray-400">
                    {t('preflight_label')}
                  </p>
                  <h2 className="mt-1 text-lg font-semibold text-gray-900 dark:text-gray-50">{t('preflight_title')}</h2>
                </div>
                <button
                  type="button"
                  onClick={() => void refreshPermissions()}
                  className="rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 transition hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-850 dark:text-gray-200 dark:hover:bg-gray-800"
                >
                  {t('preflight_refresh')}
                </button>
              </div>

              <div className="mt-4 space-y-3">
                <div className="rounded-2xl border border-gray-200/80 bg-gray-50/90 p-3.5 dark:border-gray-700 dark:bg-gray-850/70">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-gray-100">
                      <Mic size={15} />
                      {t('preflight_microphone')}
                    </div>
                    {permissionStatus.mic === 'granted' ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-300">
                        <CheckCircle2 size={14} />
                        {t('preflight_granted')}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-300">
                        <AlertTriangle size={14} />
                        {t('preflight_required')}
                      </span>
                    )}
                  </div>
                  {permissionStatus.mic !== 'granted' ? (
                    <button
                      type="button"
                      onClick={() => void handleGrantMicrophone()}
                      disabled={permissionLoading}
                      className="mt-3 rounded-lg border border-accent/50 px-3 py-1.5 text-xs font-semibold text-accent transition hover:bg-accent/10 disabled:cursor-not-allowed disabled:opacity-60 dark:text-accent-muted"
                    >
                      {permissionLoading ? t('preflight_granting') : t('preflight_grantAccess')}
                    </button>
                  ) : null}
                </div>

                <div className="rounded-2xl border border-gray-200/80 bg-gray-50/90 p-3.5 dark:border-gray-700 dark:bg-gray-850/70">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-gray-100">
                      <AudioLines size={15} />
                      {systemAudioLabel}
                    </div>
                    {permissionStatus.screenRecording === 'granted' ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-300">
                        <CheckCircle2 size={14} />
                        {t('preflight_granted')}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-300">
                        <AlertTriangle size={14} />
                        {t('preflight_setupNeeded')}
                      </span>
                    )}
                  </div>
                  {permissionStatus.screenRecording !== 'granted' ? (
                    <button
                      type="button"
                      onClick={() => void handleGrantSystemAudio()}
                      disabled={permissionLoading}
                      className="mt-3 rounded-lg border border-accent/50 px-3 py-1.5 text-xs font-semibold text-accent transition hover:bg-accent/10 disabled:cursor-not-allowed disabled:opacity-60 dark:text-accent-muted"
                    >
                      {permissionLoading ? t('preflight_granting') : t('preflight_grantAccess')}
                    </button>
                  ) : null}
                </div>

                <div className="rounded-2xl border border-gray-200/80 bg-gray-50/90 p-3.5 dark:border-gray-700 dark:bg-gray-850/70">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-gray-100">
                      <Cpu size={15} />
                      {t('preflight_transcriptionModel')}
                    </div>
                    {modelReady ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-300">
                        <CheckCircle2 size={14} />
                        {t('preflight_ready')}
                      </span>
                    ) : modelSettingUp || isModelChecking ? (
                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{t('preflight_checking')}</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-300">
                        <AlertTriangle size={14} />
                        {t('preflight_setupNeeded')}
                      </span>
                    )}
                  </div>
                  {!modelReady && !modelSettingUp && !isModelChecking ? (
                    <button
                      type="button"
                      onClick={handleGoToModels}
                      className="mt-3 rounded-lg border border-accent/50 px-3 py-1.5 text-xs font-semibold text-accent transition hover:bg-accent/10 dark:text-accent-muted"
                    >
                      {t('preflight_goToModels')}
                    </button>
                  ) : null}
                </div>
              </div>
            </section>

            <section className="rounded-3xl border border-gray-200/80 bg-white/90 p-5 shadow-[0_24px_60px_-40px_rgba(15,23,42,0.55)] backdrop-blur-sm dark:border-gray-700/80 dark:bg-gray-900/80 sm:p-6">
              <div className="space-y-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-500 dark:text-gray-400">
                    {t('notes_label')}
                  </p>
                  <div className="mt-2 rounded-2xl border border-gray-200/80 bg-gradient-to-br from-gray-50 to-white p-4 dark:border-gray-700 dark:from-gray-850 dark:to-gray-900">
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-100">
                      {t('notes_privacy')}
                    </p>
                  </div>
                </div>

                <div className="space-y-2.5">
                  <article className="flex items-center gap-3 rounded-2xl border border-gray-200/80 bg-gray-50/85 p-3 dark:border-gray-700 dark:bg-gray-850/70">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent dark:bg-accent/20 dark:text-accent-muted">
                      <Bot size={14} />
                    </span>
                    <p className="text-xs font-medium text-gray-700 dark:text-gray-200">
                      {t('notes_aiValidation')}
                    </p>
                  </article>

                  <article className="flex items-center gap-3 rounded-2xl border border-gray-200/80 bg-gray-50/85 p-3 dark:border-gray-700 dark:bg-gray-850/70">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent dark:bg-accent/20 dark:text-accent-muted">
                      <Clock3 size={14} />
                    </span>
                    <p className="text-xs font-medium text-gray-700 dark:text-gray-200">
                      {t('notes_autoStop')}
                    </p>
                  </article>

                </div>
              </div>

              {hasOperationalAlert ? (
                <div className="mt-4 space-y-2.5">
                  {transcriptionDegraded ? (
                    <p className="rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-2 text-xs text-amber-700 dark:border-amber-500/35 dark:bg-amber-500/10 dark:text-amber-200">
                      {t('alert_transcriptionDegraded')}
                    </p>
                  ) : null}

                  {permissionHint ? (
                    <p className="rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-2 text-xs text-amber-700 dark:border-amber-500/35 dark:bg-amber-500/10 dark:text-amber-200">
                      {permissionHint}
                    </p>
                  ) : null}

                  {recordingError ? (
                    <p className="rounded-xl border border-red-200 bg-red-50/80 px-3 py-2 text-xs text-red-700 dark:border-red-500/35 dark:bg-red-500/10 dark:text-red-200">
                      {recordingError}
                    </p>
                  ) : null}

                  {modelBlocked ? (
                    <div className="rounded-xl border border-accent/25 bg-accent-subtle/60 px-3 py-2.5 dark:border-accent/35 dark:bg-accent/10">
                      <p className="text-xs text-gray-700 dark:text-gray-100">
                        {t('alert_modelBlocked')}
                      </p>
                      <button
                        type="button"
                        onClick={handleGoToModels}
                        className="mt-2 rounded-lg border border-accent/45 px-2.5 py-1 text-xs font-semibold text-accent transition hover:bg-accent/10 dark:text-accent-muted"
                      >
                        {t('alert_openModels')}
                      </button>
                    </div>
                  ) : null}

                  {isModelChecking ? (
                    <p className="rounded-xl border border-gray-200 bg-white/80 px-3 py-2 text-xs text-gray-600 dark:border-gray-700 dark:bg-gray-850/75 dark:text-gray-300">
                      {t('alert_modelChecking')}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </section>
          </aside>
        </div>
      </div>
    </section>
  );
}
