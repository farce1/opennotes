type ElapsedTimerProps = {
  elapsedMs: number;
};

const FOUR_HOURS = 4 * 60 * 60 * 1000;
const COUNTDOWN_WINDOW = 5 * 60 * 1000;
const COUNTDOWN_START = FOUR_HOURS - COUNTDOWN_WINDOW;

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

function formatRemaining(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = String(Math.floor(totalSeconds / 60));
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

export function ElapsedTimer({ elapsedMs }: ElapsedTimerProps) {
  const showCountdown = elapsedMs >= COUNTDOWN_START;
  const remainingMs = Math.max(0, FOUR_HOURS - elapsedMs);

  if (showCountdown) {
    return (
      <div className="flex flex-col leading-tight">
        <span className="font-mono text-sm tracking-wide text-amber-300/90 tabular-nums transition-colors duration-500">
          {formatRemaining(remainingMs)}
        </span>
        <span className="text-[10px] uppercase tracking-wide text-amber-200/70">remaining</span>
      </div>
    );
  }

  return (
    <span className="font-mono text-sm tracking-wide text-white tabular-nums">
      {formatElapsed(elapsedMs)}
    </span>
  );
}
