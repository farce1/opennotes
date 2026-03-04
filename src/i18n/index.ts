import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import enCommon from './locales/en/common.json';
import enSettings from './locales/en/settings.json';
import enRecord from './locales/en/record.json';
import enLibrary from './locales/en/library.json';
import enSetup from './locales/en/setup.json';
import enMeeting from './locales/en/meeting.json';
import enWidget from './locales/en/widget.json';

import plCommon from './locales/pl/common.json';
import plSettings from './locales/pl/settings.json';
import plRecord from './locales/pl/record.json';
import plLibrary from './locales/pl/library.json';
import plSetup from './locales/pl/setup.json';
import plMeeting from './locales/pl/meeting.json';
import plWidget from './locales/pl/widget.json';

export const supportedLanguages = ['en', 'pl'] as const;
export type SupportedLanguage = (typeof supportedLanguages)[number];

export const languageLabels: Record<SupportedLanguage, string> = {
  en: 'English',
  pl: 'Polski',
};

export async function initI18n(language: string = 'en') {
  await i18n.use(initReactI18next).init({
    lng: language,
    fallbackLng: 'en',
    defaultNS: 'common',
    ns: ['common', 'settings', 'record', 'library', 'setup', 'meeting', 'widget'],
    resources: {
      en: {
        common: enCommon,
        settings: enSettings,
        record: enRecord,
        library: enLibrary,
        setup: enSetup,
        meeting: enMeeting,
        widget: enWidget,
      },
      pl: {
        common: plCommon,
        settings: plSettings,
        record: plRecord,
        library: plLibrary,
        setup: plSetup,
        meeting: plMeeting,
        widget: plWidget,
      },
    },
    interpolation: {
      escapeValue: false,
    },
  });

  document.documentElement.lang = language;

  return i18n;
}

export default i18n;
