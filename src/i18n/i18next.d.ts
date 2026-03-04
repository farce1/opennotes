import 'i18next';

import type enCommon from './locales/en/common.json';
import type enSettings from './locales/en/settings.json';
import type enRecord from './locales/en/record.json';
import type enLibrary from './locales/en/library.json';
import type enSetup from './locales/en/setup.json';
import type enMeeting from './locales/en/meeting.json';
import type enWidget from './locales/en/widget.json';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common';
    resources: {
      common: typeof enCommon;
      settings: typeof enSettings;
      record: typeof enRecord;
      library: typeof enLibrary;
      setup: typeof enSetup;
      meeting: typeof enMeeting;
      widget: typeof enWidget;
    };
  }
}
