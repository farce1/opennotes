import { HashRouter, Navigate, Route, Routes } from 'react-router';
import { AppLayout } from './components/layout/AppLayout';
import { LibraryView } from './views/LibraryView';
import { RecordView } from './views/RecordView';
import { SettingsView } from './views/SettingsView';

export function App() {
  return (
    <HashRouter>
      <Routes>
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
