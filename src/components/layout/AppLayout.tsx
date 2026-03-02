import { listen } from '@tauri-apps/api/event';
import { useEffect } from 'react';
import { Outlet } from 'react-router';
import { SummaryGenerationProvider } from '../../contexts/SummaryGenerationContext';
import { ToastProvider, useToast } from '../../contexts/ToastContext';
import { UpdateProvider } from '../../contexts/UpdateContext';
import { useTheme } from '../../hooks/useTheme';
import { Sidebar } from './Sidebar';

function EventToastBridge() {
  const { showToast } = useToast();

  useEffect(() => {
    const unlisten = listen('preferred-mic-unavailable', () => {
      showToast('Preferred mic unavailable, using default');
    });

    return () => {
      void unlisten.then((dispose) => dispose());
    };
  }, [showToast]);

  return null;
}

export function AppLayout() {
  useTheme();

  return (
    <UpdateProvider>
      <SummaryGenerationProvider>
        <ToastProvider>
          <EventToastBridge />
          <div className="flex h-screen min-h-[400px] min-w-[600px] bg-warm-50 dark:bg-warm-900">
            <Sidebar />
            <main className="flex-1 overflow-auto p-6 text-warm-900 dark:text-warm-50">
              <Outlet />
            </main>
          </div>
        </ToastProvider>
      </SummaryGenerationProvider>
    </UpdateProvider>
  );
}
