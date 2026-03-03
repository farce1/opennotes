import { useEffect } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router';
import { AppLayout } from './components/layout/AppLayout';
import { LibraryView } from './views/LibraryView';
import { MeetingCompleteView } from './views/MeetingCompleteView';
import { RecordView } from './views/RecordView';
import { SettingsView } from './views/SettingsView';
import { SetupView } from './views/SetupView';
import { WidgetView } from './views/WidgetView';

export function App() {
  useEffect(() => {
    const prefetch = () => {
      void Promise.allSettled([import('@react-pdf/renderer'), import('jszip')]);
    };

    if (typeof requestIdleCallback !== 'undefined') {
      const idleCallbackId = requestIdleCallback(prefetch, { timeout: 5000 });
      return () => cancelIdleCallback(idleCallbackId);
    }

    const timeoutId = window.setTimeout(prefetch, 2000);
    return () => window.clearTimeout(timeoutId);
  }, []);

  return (
    <HashRouter>
      <Routes>
        <Route path="/widget" element={<WidgetView />} />

        <Route element={<AppLayout />}>
          <Route path="/" element={<Navigate to="/record" replace />} />
          <Route path="/record" element={<RecordView />} />
          <Route path="/setup" element={<SetupView />} />
          <Route path="/meeting-complete" element={<MeetingCompleteView />} />
          <Route path="/library" element={<LibraryView />} />
          <Route path="/settings" element={<SettingsView />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}

export default App;
