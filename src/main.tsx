import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { initI18n } from './i18n';
import { getSetting } from './lib/settings';
import './app.css';

async function bootstrap() {
  const savedLanguage = await getSetting('appLanguage').catch(() => null);
  await initI18n(savedLanguage || 'en');

  ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

bootstrap();
