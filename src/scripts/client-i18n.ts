import { createInstance, type i18n as I18nInstance, type TFunction } from 'i18next';
import { resources } from '../i18n/resources';
import type { Lang } from '../config';

let pending: Promise<TFunction> | undefined;

export function clientLang(): Lang {
  return window.MW?.config.lang === 'zh' ? 'zh' : 'en';
}

export async function getClientT(): Promise<TFunction> {
  if (!pending) {
    pending = (async () => {
      const lang = clientLang();
      const instance: I18nInstance = createInstance();
      await instance.init({
        lng: lang,
        fallbackLng: 'en',
        supportedLngs: ['en', 'zh'],
        resources,
        defaultNS: 'translation',
        initAsync: false,
        interpolation: { escapeValue: false },
        returnNull: false,
      });
      return instance.getFixedT(lang);
    })();
  }
  return pending;
}
