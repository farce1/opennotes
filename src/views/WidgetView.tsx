import { RecordingWidget } from '../components/widget/RecordingWidget';

export function WidgetView() {
  return (
    <main className="relative h-screen w-screen overflow-hidden bg-transparent p-0">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.06),_transparent_55%)]" />

      <div className="relative flex h-full w-full items-start justify-center pt-2">
        <section className="flex flex-col items-center gap-1">
          <h1 className="sr-only">openNotes Recording Widget</h1>
          <p className="sr-only">
            Floating recording controls with elapsed timer, waveform meter, and
            pause or stop actions.
          </p>

          <RecordingWidget />

          <p className="rounded-full bg-black/35 px-2 py-0.5 text-[10px] tracking-wide text-white/75">
            Drag to move
          </p>
        </section>
      </div>
    </main>
  );
}
