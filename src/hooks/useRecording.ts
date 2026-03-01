import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { sendNotification } from '@tauri-apps/plugin-notification';
import { platform } from '@tauri-apps/plugin-os';
import { open } from '@tauri-apps/plugin-shell';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { SessionStatePayload } from '../types';

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

function parseStartedAt(value: string | null): number {
  if (!value) {
    return Date.now();
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Date.now();
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
    setElapsedMs(Math.max(0, Date.now() - startedAt));
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
      const os = platform();
      if (os === 'macos') {
        await open('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture');
      } else if (os === 'windows') {
        await open('ms-settings:privacy-microphone');
      } else {
        setPermissionHint('Linux does not expose a universal settings deep link. Check system audio settings manually.');
      }
    } catch {
      setPermissionHint('Unable to open settings automatically. Please configure audio permissions manually.');
    }
  }, []);

  const ensurePermissions = useCallback(async () => {
    setPermissionLoading(true);
    setPermissionHint(null);

    try {
      const os = platform();
      if (os === 'macos') {
        const macPerms = await import('tauri-plugin-macos-permissions-api');

        let micGranted = await macPerms.checkMicrophonePermission();
        if (!micGranted) {
          await macPerms.requestMicrophonePermission();
          micGranted = await macPerms.checkMicrophonePermission();
        }

        if (!micGranted) {
          setPermissionStatus((previous) => ({ ...previous, mic: 'denied' }));
          setPermissionHint('Microphone access is required before recording can start.');
          return false;
        }

        let screenGranted = await macPerms.checkScreenRecordingPermission();
        if (!screenGranted) {
          const proceed = window.confirm(
            'openNotes needs Screen Recording access to capture meeting audio from Zoom/Meet and other apps. Continue to System Settings setup?'
          );

          if (!proceed) {
            setPermissionStatus({ mic: 'granted', screenRecording: 'denied' });
            setPermissionHint('Screen Recording is still disabled. Recording was not started.');
            return false;
          }

          await macPerms.requestScreenRecordingPermission();
          screenGranted = await macPerms.checkScreenRecordingPermission();

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
      }

      const status = await invoke<PermissionPayload>('check_audio_permissions');
      setPermissionStatus(formatPermissionStatus(status));
      return true;
    } catch {
      const os = platform();
      if (os === 'macos') {
        setPermissionHint('Permission check failed. Try again and verify macOS privacy settings.');
      } else if (os === 'windows') {
        setPermissionHint('Permission check failed. Verify Windows microphone privacy settings and retry.');
      } else {
        setPermissionHint('Permission check failed. Verify Linux audio device access and retry.');
      }
      return false;
    } finally {
      setPermissionLoading(false);
    }
  }, []);

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

    void listen<SessionStatePayload>('session-state-changed', (event) => {
      const { phase, startedAt } = event.payload;

      if (phase === 'idle') {
        applyRecordingStopped();
        return;
      }

      const startedAtMs = parseStartedAt(startedAt);
      if (!startTimeRef.current) {
        applyRecordingStarted(startedAtMs);
      }

      if (phase === 'paused') {
        if (!pausedAtRef.current) {
          pausedAtRef.current = Date.now();
        }
        setIsRecording(true);
        setIsPaused(true);
        return;
      }

      if (pausedAtRef.current) {
        pausedAccumulatedMsRef.current += Date.now() - pausedAtRef.current;
        pausedAtRef.current = null;
      }

      setIsRecording(true);
      setIsPaused(false);
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
    ensurePermissions,
    refreshPermissions,
    openSystemSettings,
  };
}
