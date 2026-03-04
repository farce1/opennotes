import { RecordingWidget } from '../components/widget/RecordingWidget';

export function WidgetView() {
  return (
    <main className="h-screen w-screen overflow-hidden bg-transparent p-0">
      <h1 className="sr-only">openNotes Recording Widget</h1>
      <p className="sr-only">
        Floating recording controls with elapsed timer, waveform meter, and
        pause or stop actions.
      </p>
      <RecordingWidget />
    </main>
  );
}
