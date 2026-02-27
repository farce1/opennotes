import { RecordingWidget } from '../components/widget/RecordingWidget';

export function WidgetView() {
  return (
    <main className="h-screen w-screen bg-transparent p-0">
      <div className="flex h-full w-full items-start justify-center pt-2">
        <RecordingWidget />
      </div>
    </main>
  );
}
