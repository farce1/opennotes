import { HashRouter, Navigate, Route, Routes } from 'react-router';
import { AppLayout } from './components/layout/AppLayout';
import { LibraryView } from './views/LibraryView';
import { RecordView } from './views/RecordView';
import { SettingsView } from './views/SettingsView';
import { WidgetView } from './views/WidgetView';

export function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/widget" element={<WidgetView />} />

        <Route element={<AppLayout />}>
          <Route path="/" element={<Navigate to="/record" replace />} />
          <Route path="/record" element={<RecordView />} />
          <Route path="/library" element={<LibraryView />} />
          <Route path="/settings" element={<SettingsView />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}

export default App;
