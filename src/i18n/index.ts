import { createInstance, type i18n as I18nInstance, type TFunction } from 'i18next';
import { resources } from './resources';
import type { Lang } from '../config';
import type { Localized } from '../lib/types';

const instances = new Map<Lang, Promise<I18nInstance>>();

function instanceFor(lang: Lang): Promise<I18nInstance> {
  const existing = instances.get(lang);
  if (existing) return existing;

  const pending = (async () => {
    const instance = createInstance();
    await instance.init({
      lng: lang,
      fallbackLng: 'en',
      supportedLngs: ['en', 'zh'],
      resources,
      defaultNS: 'translation',
      initAsync: false,
      interpolation: { escapeValue: false },
      returnNull: false,
      missingKeyHandler: false,
    });
    return instance;
  })();

  instances.set(lang, pending);
  return pending;
}

export async function getT(lang: Lang): Promise<TFunction> {
  const instance = await instanceFor(lang);
  return instance.getFixedT(lang);
}

export async function getI18n(lang: Lang): Promise<I18nInstance> {
  return instanceFor(lang);
}

export function normalizeLang(value?: string | null): Lang {
  return value?.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

export function otherLang(lang: Lang): Lang {
  return lang === 'en' ? 'zh' : 'en';
}

export function intlLocale(lang: Lang): string {
  return lang === 'zh' ? 'zh-CN' : 'en-US';
}

export function localize(value: Localized | undefined, lang: Lang): { text: string; fallback: boolean } {
  if (!value) return { text: '', fallback: true };
  const preferred = value[lang]?.trim();
  if (preferred) return { text: preferred, fallback: false };
  const fallbackText = value[otherLang(lang)]?.trim() || value.en?.trim() || value.zh?.trim() || '';
  return { text: fallbackText, fallback: Boolean(fallbackText) };
}

export function missingTranslation(value: Localized | undefined, lang: Lang): boolean {
  return Boolean(value) && !value?.[lang]?.trim();
}

/** True when any user-facing free-text field lacks the active locale. */
export function datasetHasTranslationGap(
  dataset: {
    title: Localized;
    summary: Localized;
    usage?: { howToLoad: Localized; recommendedUse: Localized; limitations: Localized };
    history?: Array<{ note: Localized }>;
    deprecation?: { note?: Localized };
  },
  lang: Lang,
): boolean {
  if (missingTranslation(dataset.title, lang) || missingTranslation(dataset.summary, lang)) return true;
  if (
    dataset.usage &&
    (missingTranslation(dataset.usage.howToLoad, lang) ||
      missingTranslation(dataset.usage.recommendedUse, lang) ||
      missingTranslation(dataset.usage.limitations, lang))
  ) {
    return true;
  }
  if (dataset.history?.some((entry) => missingTranslation(entry.note, lang))) return true;
  if (dataset.deprecation?.note && missingTranslation(dataset.deprecation.note, lang)) return true;
  return false;
}
