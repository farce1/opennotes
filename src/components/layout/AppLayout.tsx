import { sendNotification } from '@tauri-apps/plugin-notification';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Outlet } from 'react-router';
import { ModelSetupProvider } from '../../contexts/ModelSetupContext';
import { OllamaSetupProvider } from '../../contexts/OllamaSetupContext';
import { SessionProvider } from '../../contexts/SessionContext';
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

function SessionCompleteBridge() {
  const { t } = useTranslation('common');
  const { showToast } = useToast();

  useEffect(() => {
    const unlisten = listen<number>('session-complete', async () => {
      try {
        const window = getCurrentWebviewWindow();
        const focused = await window.isFocused();

        if (focused) {
          showToast(t('notification_processingComplete'));
          return;
        }

        await sendNotification({
          title: 'openNotes',
          body: t('notification_processingComplete'),
        });
      } catch {
        showToast(t('notification_processingComplete'));
      }
    });

    return () => {
      void unlisten.then((dispose) => dispose());
    };
  }, [showToast, t]);

  return null;
}

export function AppLayout() {
  useTheme();

  return (
    <UpdateProvider>
      <ModelSetupProvider>
        <OllamaSetupProvider>
          <SummaryGenerationProvider>
            <ToastProvider>
              <SessionProvider>
                <EventToastBridge />
                <SessionCompleteBridge />
                <div className="flex h-screen min-h-[560px] min-w-[860px] bg-gray-100 dark:bg-gray-950">
                  <Sidebar />
                  <main className="flex-1 overflow-auto p-6 text-gray-900 dark:text-gray-50">
                    <Outlet />
                  </main>
                </div>
              </SessionProvider>
            </ToastProvider>
          </SummaryGenerationProvider>
        </OllamaSetupProvider>
      </ModelSetupProvider>
    </UpdateProvider>
  );
}
