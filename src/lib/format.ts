import type { Lang } from '../config';
import { intlLocale } from '../i18n';

export function formatNumber(value: number, lang: Lang, options: Intl.NumberFormatOptions = {}): string {
  return new Intl.NumberFormat(intlLocale(lang), {
    maximumFractionDigits: 1,
    ...options,
  }).format(value);
}

export function formatInteger(value: number, lang: Lang): string {
  return new Intl.NumberFormat(intlLocale(lang), { maximumFractionDigits: 0 }).format(value);
}

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];

export function formatBytes(bytes: number, lang: Lang): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return `0 ${BYTE_UNITS[0]}`;
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), BYTE_UNITS.length - 1);
  const value = bytes / 1024 ** exponent;
  const digits = value >= 100 || exponent === 0 ? 0 : value >= 10 ? 1 : 2;
  const formatted = new Intl.NumberFormat(intlLocale(lang), {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  }).format(value);
  return `${formatted} ${BYTE_UNITS[exponent]}`;
}

export function formatDuration(seconds: number, lang: Lang): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return lang === 'zh' ? '0 小时' : '0 h';
  if (seconds < 60) {
    return lang === 'zh' ? `${formatInteger(seconds, lang)} 秒` : `${formatInteger(seconds, lang)} sec`;
  }
  if (seconds < 3600) {
    const minutes = Math.round(seconds / 60);
    return lang === 'zh' ? `${formatInteger(minutes, lang)} 分钟` : `${formatInteger(minutes, lang)} min`;
  }
  if (seconds < 3600 * 100) {
    const hours = seconds / 3600;
    const formatted = new Intl.NumberFormat(intlLocale(lang), { maximumFractionDigits: 1 }).format(hours);
    return lang === 'zh' ? `${formatted} 小时` : `${formatted} h`;
  }
  const hours = Math.round(seconds / 3600);
  return lang === 'zh'
    ? `${formatInteger(hours, lang)} 小时`
    : `${formatInteger(hours, lang)} h`;
}

export function formatDate(isoDate: string, lang: Lang): string {
  const date = new Date(`${isoDate}T12:00:00Z`);
  if (Number.isNaN(date.valueOf())) return isoDate;
  return new Intl.DateTimeFormat(intlLocale(lang), {
    year: 'numeric',
    month: lang === 'zh' ? 'long' : 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

export function formatShortDate(isoDate: string, lang: Lang): string {
  const date = new Date(`${isoDate}T12:00:00Z`);
  if (Number.isNaN(date.valueOf())) return isoDate;
  return new Intl.DateTimeFormat(intlLocale(lang), {
    year: '2-digit',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'UTC',
  }).format(date);
}

export function formatReadingTime(minutes: number, lang: Lang): string {
  return lang === 'zh' ? `${minutes} 分钟阅读` : `${minutes} min read`;
}

export function formatEpisodes(episodes: number, lang: Lang): string {
  return `${formatInteger(episodes, lang)} ${lang === 'zh' ? 'EP' : 'EP'}`;
}

export function pluralizedDatasetCount(count: number, lang: Lang): string {
  return lang === 'zh' ? `${formatInteger(count, lang)} 个数据集` : `${formatInteger(count, lang)} ${count === 1 ? 'dataset' : 'datasets'}`;
}

export function pluralizedContributorCount(count: number, lang: Lang): string {
  return lang === 'zh'
    ? `${formatInteger(count, lang)} 位贡献者`
    : `${formatInteger(count, lang)} ${count === 1 ? 'contributor' : 'contributors'}`;
}

export function toIsoDate(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}
