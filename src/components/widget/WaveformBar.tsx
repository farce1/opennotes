type WaveformBarProps = {
  level: number;
  spectrum?: number[];
};

const BAR_COUNT = 7;

export function WaveformBar({ level, spectrum = [] }: WaveformBarProps) {
  const clamped = Math.max(0, Math.min(1, level));

  return (
    <div className="flex h-11 items-end gap-1 px-1" aria-label="Live audio level">
      {Array.from({ length: BAR_COUNT }, (_, index) => {
        const band = Math.max(0, Math.min(1, Number(spectrum[index]) || 0));
        const blend = Math.max(band, clamped * (0.35 + (index / BAR_COUNT) * 0.2));
        const normalized = Math.max(0.04, Math.min(1, blend));
        const height = `${Math.round(9 + normalized * 35)}px`;

        return (
          <span
            key={index}
            className="w-[4px] rounded-full bg-emerald-300 shadow-[0_0_6px_rgba(16,185,129,0.45)] transition-all duration-75"
            style={{ height }}
          />
        );
      })}
    </div>
  );
}
