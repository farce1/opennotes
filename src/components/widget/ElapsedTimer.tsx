import { useEffect, useMemo, useRef, useState } from 'react';

type ElapsedTimerProps = {
  startTime: number | null;
  isPaused: boolean;
};

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

export function ElapsedTimer({ startTime, isPaused }: ElapsedTimerProps) {
  const [now, setNow] = useState(() => Date.now());
  const pauseSnapshotRef = useRef<number>(0);

  useEffect(() => {
    if (!startTime) {
      pauseSnapshotRef.current = 0;
      return;
    }

    if (isPaused) {
      pauseSnapshotRef.current = Date.now();
      return;
    }

    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [isPaused, startTime]);

  const elapsedMs = useMemo(() => {
    if (!startTime) {
      return 0;
    }

    if (isPaused && pauseSnapshotRef.current > 0) {
      return pauseSnapshotRef.current - startTime;
    }

    return now - startTime;
  }, [isPaused, now, startTime]);

  return (
    <span className="font-mono text-sm tracking-wide text-white tabular-nums">
      {formatElapsed(elapsedMs)}
    </span>
  );
}
