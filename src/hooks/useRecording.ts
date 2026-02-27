import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { sendNotification } from '@tauri-apps/plugin-notification';
import { open } from '@tauri-apps/plugin-shell';
import {
  checkMicrophonePermission,
  checkScreenRecordingPermission,
  requestMicrophonePermission,
  requestScreenRecordingPermission,
} from 'tauri-plugin-macos-permissions-api';
import { useCallback, useEffect, useRef, useState } from 'react';

type PermissionFlag = 'granted' | 'denied' | 'unknown';

type PermissionStatus = {
  mic: PermissionFlag;
  screenRecording: PermissionFlag;
};

type PermissionPayload = {
  mic: string;
  screen_recording: string;
};

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

function toFlag(value: string | undefined): PermissionFlag {
  if (value === 'granted') {
    return 'granted';
  }

  if (value === 'denied') {
    return 'denied';
  }

  return 'unknown';
}

function formatPermissionStatus(payload: PermissionPayload): PermissionStatus {
  return {
    mic: toFlag(payload.mic),
    screenRecording: toFlag(payload.screen_recording),
  };
}

export function useRecording() {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [permissionStatus, setPermissionStatus] = useState<PermissionStatus>({
    mic: 'unknown',
    screenRecording: 'unknown',
  });
  const [permissionHint, setPermissionHint] = useState<string | null>(null);
  const [permissionLoading, setPermissionLoading] = useState(false);

  const startTimeRef = useRef<number | null>(null);
  const pausedAtRef = useRef<number | null>(null);
  const pausedAccumulatedMsRef = useRef(0);

  const refreshElapsed = useCallback(() => {
    const startedAt = startTimeRef.current;
    if (!startedAt) {
      setElapsedMs(0);
      return;
    }

    let pausedMs = pausedAccumulatedMsRef.current;
    if (isPaused && pausedAtRef.current) {
      pausedMs += Date.now() - pausedAtRef.current;
    }

    setElapsedMs(Math.max(0, Date.now() - startedAt - pausedMs));
  }, [isPaused]);

  const applyRecordingStarted = useCallback((startedAt: number) => {
    startTimeRef.current = startedAt;
    pausedAtRef.current = null;
    pausedAccumulatedMsRef.current = 0;
    setStartTime(startedAt);
    setElapsedMs(0);
    setIsRecording(true);
    setIsPaused(false);
  }, []);

  const applyRecordingStopped = useCallback(() => {
    startTimeRef.current = null;
    pausedAtRef.current = null;
    pausedAccumulatedMsRef.current = 0;
    setIsRecording(false);
    setIsPaused(false);
    setStartTime(null);
    setElapsedMs(0);
    setAudioLevel(0);
  }, []);

  const refreshPermissions = useCallback(async () => {
    try {
      const status = await invoke<PermissionPayload>('check_audio_permissions');
      setPermissionStatus(formatPermissionStatus(status));
    } catch {
      setPermissionStatus({ mic: 'unknown', screenRecording: 'unknown' });
    }
  }, []);

  const openSystemSettings = useCallback(async () => {
    try {
      await open('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture');
    } catch {
      setPermissionHint('Unable to open System Settings. Please open Privacy > Screen Recording manually.');
    }
  }, []);

  const ensurePermissions = useCallback(async () => {
    setPermissionLoading(true);
    setPermissionHint(null);

    try {
      let micGranted = await checkMicrophonePermission();
      if (!micGranted) {
        await requestMicrophonePermission();
        micGranted = await checkMicrophonePermission();
      }

      if (!micGranted) {
        setPermissionStatus((prev) => ({ ...prev, mic: 'denied' }));
        setPermissionHint('Microphone access is required before recording can start.');
        return false;
      }

      let screenGranted = await checkScreenRecordingPermission();
      if (!screenGranted) {
        const proceed = window.confirm(
          'openNotes needs Screen Recording access to capture meeting audio from Zoom/Meet and other apps. Continue to System Settings setup?'
        );

        if (!proceed) {
          setPermissionStatus({ mic: 'granted', screenRecording: 'denied' });
          setPermissionHint('Screen Recording is still disabled. Recording was not started.');
          return false;
        }

        await requestScreenRecordingPermission();
        screenGranted = await checkScreenRecordingPermission();

        if (!screenGranted) {
          setPermissionStatus({ mic: 'granted', screenRecording: 'denied' });
          setPermissionHint(
            'Enable Screen Recording in System Settings > Privacy > Screen Recording, then restart openNotes.'
          );
          return false;
        }
      }

      setPermissionStatus({ mic: 'granted', screenRecording: 'granted' });
      return true;
    } catch {
      setPermissionHint('Permission check failed. Try again and verify macOS privacy settings.');
      return false;
    } finally {
      setPermissionLoading(false);
    }
  }, []);

  const startRecording = useCallback(async () => {
    if (isRecording) {
      return true;
    }

    const permissionsOk = await ensurePermissions();
    if (!permissionsOk) {
      return false;
    }

    try {
      await invoke('start_recording');
      applyRecordingStarted(Date.now());
      return true;
    } catch (error) {
      const message = String(error);
      if (message.includes('already active') || message.includes('already')) {
        applyRecordingStarted(Date.now());
        return true;
      }
      setPermissionHint('Recording failed to start. Check permissions and audio device availability.');
      return false;
    }
  }, [applyRecordingStarted, ensurePermissions, isRecording]);

  const stopRecording = useCallback(async () => {
    if (!isRecording) {
      return null;
    }

    try {
      const outputPath = await invoke<string>('stop_recording');
      applyRecordingStopped();
      return outputPath;
    } catch {
      setPermissionHint('Stopping recording failed. Try again from the widget controls.');
      return null;
    }
  }, [applyRecordingStopped, isRecording]);

  const pauseRecording = useCallback(async () => {
    if (!isRecording || isPaused) {
      return;
    }

    try {
      await invoke('pause_recording');
      pausedAtRef.current = Date.now();
      setIsPaused(true);
    } catch {
      setPermissionHint('Failed to pause recording.');
    }
  }, [isPaused, isRecording]);

  const resumeRecording = useCallback(async () => {
    if (!isRecording || !isPaused) {
      return;
    }

    try {
      await invoke('resume_recording');
      if (pausedAtRef.current) {
        pausedAccumulatedMsRef.current += Date.now() - pausedAtRef.current;
      }
      pausedAtRef.current = null;
      setIsPaused(false);
    } catch {
      setPermissionHint('Failed to resume recording.');
    }
  }, [isPaused, isRecording]);

  useEffect(() => {
    refreshElapsed();

    if (!isRecording) {
      return;
    }

    const timer = window.setInterval(refreshElapsed, 1000);
    return () => window.clearInterval(timer);
  }, [isRecording, refreshElapsed]);

  useEffect(() => {
    if (!isRecording || !startTime) {
      return;
    }

    const timer = window.setTimeout(() => {
      void sendNotification({
        title: 'openNotes',
        body: 'Recording has been running for 2 hours. Still going?',
      });
    }, TWO_HOURS_MS);

    return () => window.clearTimeout(timer);
  }, [isRecording, startTime]);

  useEffect(() => {
    void refreshPermissions();
  }, [refreshPermissions]);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | null = null;

    void listen<number>('audio-level', (event) => {
      setAudioLevel(Math.max(0, Math.min(1, Number(event.payload) || 0)));
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
  }, []);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | null = null;

    void listen('recording-toggle', async () => {
      if (isRecording) {
        await stopRecording();
      } else {
        await startRecording();
      }
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
  }, [isRecording, startRecording, stopRecording]);

  useEffect(() => {
    let disposed = false;
    const cleanups: Array<() => void> = [];

    void Promise.all([
      listen('recording-started', () => {
        applyRecordingStarted(Date.now());
      }),
      listen('recording-stopped', () => {
        applyRecordingStopped();
      }),
      listen('recording-paused', () => {
        pausedAtRef.current = Date.now();
        setIsPaused(true);
      }),
      listen('recording-resumed', () => {
        if (pausedAtRef.current) {
          pausedAccumulatedMsRef.current += Date.now() - pausedAtRef.current;
        }
        pausedAtRef.current = null;
        setIsPaused(false);
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
  }, [applyRecordingStarted, applyRecordingStopped]);

  return {
    isRecording,
    isPaused,
    audioLevel,
    startTime,
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
  };
}
