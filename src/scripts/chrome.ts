import { $, $$, copyText, toast } from './utils';
import { getClientT } from './client-i18n';
import { AUTH_EVENT } from './auth';

const THEME_KEY = 'mw-theme';

function applyTheme(theme: 'light' | 'dark'): void {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Theme still applies for this page even when storage is unavailable.
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#171321' : '#b7e4fa');
  for (const button of $$<HTMLButtonElement>('.js-theme-toggle')) {
    button.setAttribute(
      'aria-label',
      theme === 'dark'
        ? button.dataset.labelLight || 'Switch to daylight'
        : button.dataset.labelDark || 'Switch to night',
    );
    button.setAttribute('aria-pressed', String(theme === 'dark'));
  }
}

function initTheme(): void {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(THEME_KEY);
  } catch {
    stored = null;
  }
  const initial = stored === 'light' || stored === 'dark'
    ? stored
    : window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  document.documentElement.dataset.theme = initial;
  for (const button of $$<HTMLButtonElement>('.js-theme-toggle')) {
    button.setAttribute('aria-pressed', String(initial === 'dark'));
    button.setAttribute(
      'aria-label',
      initial === 'dark' ? button.dataset.labelLight || 'Switch to daylight' : button.dataset.labelDark || 'Switch to night',
    );
    button.addEventListener('click', () => {
      const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      applyTheme(next);
    });
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', initial === 'dark' ? '#171321' : '#b7e4fa');
}

function initMobileNav(): void {
  const toggle = $<HTMLButtonElement>('.js-mobile-menu');
  const panel = $<HTMLElement>('#mobile-nav');
  if (!toggle || !panel) return;

  const setOpen = (open: boolean) => {
    panel.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    document.body.style.overflow = open ? 'hidden' : '';
  };

  toggle.addEventListener('click', () => {
    setOpen(!panel.classList.contains('is-open'));
  });
  for (const link of $$<HTMLAnchorElement>('a', panel)) {
    link.addEventListener('click', () => setOpen(false));
  }
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && panel.classList.contains('is-open')) setOpen(false);
  });
}

function initReveal(): void {
  const targets = $$('.reveal');
  if (!targets.length) return;
  if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    for (const target of targets) target.classList.add('is-visible');
    return;
  }
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      }
    },
    { rootMargin: '0px 0px -50px 0px', threshold: 0.05 },
  );
  for (const target of targets) observer.observe(target);
}

function initCopyButtons(): void {
  for (const button of $$<HTMLButtonElement>('[data-copy-value]')) {
    button.addEventListener('click', async () => {
      const t = await getClientT();
      const value = button.dataset.copyValue || window.location.href;
      await copyText(value, button.dataset.copiedLabel || t('copy.copied'), t('copy.failed'));
    });
  }

  for (const button of $$<HTMLButtonElement>('[data-copy-target]')) {
    button.addEventListener('click', async () => {
      const t = await getClientT();
      const selector = button.dataset.copyTarget;
      const target = selector ? $(selector) : null;
      if (!target) return;
      await copyText(target.textContent || '', t('copy.copied'), t('copy.failed'));
    });
  }

  for (const button of $$<HTMLButtonElement>('.js-copy-code')) {
    button.addEventListener('click', async () => {
      const t = await getClientT();
      const code = button.parentElement?.querySelector('pre')?.textContent || '';
      await copyText(code, t('copy.copied'), t('copy.failed'));
    });
  }

  for (const button of $$<HTMLButtonElement>('.js-copy-link')) {
    button.addEventListener('click', async () => {
      const t = await getClientT();
      await copyText(window.location.href, t('copy.copied'), t('copy.failed'));
    });
  }

  for (const button of $$<HTMLButtonElement>('.js-share')) {
    button.addEventListener('click', async () => {
      const t = await getClientT();
      if (navigator.share) {
        try {
          await navigator.share({ title: document.title, url: window.location.href });
          return;
        } catch {
          // Fall through to copy.
        }
      }
      await copyText(window.location.href, t('copy.copied'), t('copy.failed'));
    });
  }
}

function initLanguageLinks(): void {
  for (const link of $$<HTMLAnchorElement>('.js-lang-link')) {
    link.addEventListener('click', () => {
      if (window.location.search) {
        const target = new URL(link.href, window.location.origin);
        target.search = window.location.search;
        target.hash = window.location.hash;
        link.href = target.toString();
      }
      try {
        const locale = link.getAttribute('hreflang');
        if (locale === 'zh' || locale === 'en') localStorage.setItem('mw-locale', locale);
      } catch {
        // Language persistence is optional.
      }
    });
  }
}

function initDetailTabs(): void {
  const tabs = $$<HTMLAnchorElement>('.detail-tab');
  if (!tabs.length || !('IntersectionObserver' in window)) return;
  const sections = tabs
    .map((tab) => {
      const id = tab.getAttribute('href')?.replace('#', '');
      return id ? document.getElementById(id) : null;
    })
    .filter((section): section is HTMLElement => Boolean(section));

  const observer = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (!visible.length) return;
      const id = visible[0].target.id;
      for (const tab of tabs) tab.classList.toggle('is-active', tab.getAttribute('href') === `#${id}`);
    },
    { rootMargin: '-130px 0px -60% 0px', threshold: 0 },
  );
  for (const section of sections) observer.observe(section);
}

function initSmoothAnchors(): void {
  for (const link of $$<HTMLAnchorElement>('a[href^="#"]')) {
    link.addEventListener('click', (event) => {
      const id = link.getAttribute('href')?.slice(1);
      if (!id) return;
      const target = document.getElementById(id);
      if (!target) return;
      event.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      history.replaceState(null, '', `#${id}`);
    });
  }
}

function initAuthToast(): void {
  window.addEventListener(AUTH_EVENT, () => {
    // Auth widget owns the visible state; this listener exists so page scripts
    // can rely on a single event name without importing internals.
  });
}

export function initChrome(): void {
  initTheme();
  initMobileNav();
  initCopyButtons();
  initLanguageLinks();
  initDetailTabs();
  initSmoothAnchors();
  initReveal();
  initAuthToast();

  document.documentElement.classList.add('is-ready');
  const client = window.MW as NonNullable<Window['MW']> | undefined;
  if (client) client.toast = toast;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initChrome, { once: true });
} else {
  initChrome();
}
