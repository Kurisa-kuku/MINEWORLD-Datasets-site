export function $<T extends Element = Element>(selector: string, root: ParentNode = document): T | null {
  return root.querySelector<T>(selector);
}

export function $$<T extends Element = Element>(selector: string, root: ParentNode = document): T[] {
  return [...root.querySelectorAll<T>(selector)];
}

export function config() {
  if (!window.MW?.config) throw new Error('Missing site configuration');
  return window.MW.config;
}

let toastTimer: number | undefined;

export function toast(message: string): void {
  const node = document.getElementById('toast');
  if (!node) return;
  node.textContent = message;
  node.classList.add('is-visible');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => node.classList.remove('is-visible'), 2600);
}

export async function copyText(text: string, successMessage: string, failureMessage: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    toast(successMessage);
    return true;
  } catch {
    try {
      const area = document.createElement('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      area.remove();
      toast(ok ? successMessage : failureMessage);
      return ok;
    } catch {
      toast(failureMessage);
      return false;
    }
  }
}

export function debounce<T extends (...args: never[]) => void>(fn: T, delay = 180): (...args: Parameters<T>) => void {
  let timer: number | undefined;
  return (...args: Parameters<T>) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), delay);
  };
}

export function formatDateClient(iso: string, lang: 'en' | 'zh'): string {
  const date = new Date(iso);
  if (Number.isNaN(date.valueOf())) return iso;
  return new Intl.DateTimeFormat(lang === 'zh' ? 'zh-CN' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

export function setBusy(button: HTMLButtonElement, busy: boolean, label?: string): void {
  if (busy) {
    button.dataset.originalLabel = button.innerHTML;
    button.disabled = true;
    button.innerHTML = `<span class="pixel-spinner" aria-hidden="true"></span><span>${label ?? ''}</span>`;
  } else {
    button.disabled = false;
    if (button.dataset.originalLabel) button.innerHTML = button.dataset.originalLabel;
  }
}

export function normalizeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export function loginPath(lang: 'en' | 'zh', redirect = ''): string {
  const base = document.documentElement.dataset.base || '';
  return `${base}/${lang}/admin/${redirect ? `?next=${encodeURIComponent(redirect)}` : ''}`;
}
