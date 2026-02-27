type WaveformBarProps = {
  level: number;
};

const BAR_COUNT = 7;

export function WaveformBar({ level }: WaveformBarProps) {
  const clamped = Math.max(0, Math.min(1, level));

  return (
    <div className="flex h-8 items-end gap-1 px-1" aria-label="Live audio level">
      {Array.from({ length: BAR_COUNT }, (_, index) => {
        const curve = 0.28 + ((index + 1) / BAR_COUNT) * 0.72;
        const variation = 0.85 + ((index % 3) * 0.08);
        const normalized = Math.max(0.08, Math.min(1, clamped * curve * variation));
        const height = `${Math.round(8 + normalized * 20)}px`;

        return (
          <span
            key={index}
            className="w-[4px] rounded-full bg-emerald-300 shadow-[0_0_10px_rgba(16,185,129,0.55)] transition-all duration-75"
            style={{ height }}
          />
        );
      })}
    </div>
  );
}
