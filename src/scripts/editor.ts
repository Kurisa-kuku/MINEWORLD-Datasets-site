import { AUTH_EVENT, createCorrectionIssue, getSession, type AuthSession } from './auth';
import { getClientT } from './client-i18n';
import { toast } from './utils';
import type { Dataset, LinkItem, LinkKind } from '../lib/types';
import type { Lang } from '../config';

const form = document.getElementById('dataset-editor') as HTMLFormElement | null;
const source = document.getElementById('dataset-source') as HTMLScriptElement | null;
if (form && source) {
  void getClientT().then((t) => initEditor(form, source, t));
}

const LINK_KINDS: LinkKind[] = ['download', 'mirror', 'request', 'sample', 'homepage', 'paper', 'benchmark'];

type TFn = Awaited<ReturnType<typeof getClientT>>;

function initEditor(form: HTMLFormElement, source: HTMLScriptElement, t: TFn): void {
  const raw = JSON.parse(source.textContent || '{}') as Dataset;
  const slug = raw.slug;
  const lang = (window.MW?.config.lang || 'en') as Lang;
  const fields = [...form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('[data-editor-field]')];
  const submitButton = document.getElementById('submit-correction') as HTMLButtonElement | null;
  const message = form.querySelector<HTMLElement>('[data-editor-message]');
  const changeCount = document.querySelector<HTMLElement>('[data-change-count]');
  const changeList = document.querySelector<HTMLElement>('[data-change-list]');
  const loginState = document.querySelector<HTMLElement>('[data-login-state]');
  const loginAction = document.querySelector<HTMLElement>('[data-login-action]');
  const noteField = document.getElementById('correction-note') as HTMLTextAreaElement | null;
  let submitted = false;

  const initial = captureState();
  submitButton?.setAttribute('disabled', 'true');

  function captureState(): Record<string, string | boolean> {
    const state: Record<string, string | boolean> = {};
    for (const field of fields) {
      const key = `${field.name}:${field instanceof HTMLInputElement && (field.type === 'checkbox' || field.type === 'radio') ? field.value : ''}`;
      state[key] = field instanceof HTMLInputElement && (field.type === 'checkbox' || field.type === 'radio')
        ? field.checked
        : field.value;
    }
    return state;
  }

  function currentState(): Record<string, string | boolean> {
    return captureState();
  }

  function changedKeys(): string[] {
    const now = currentState();
    const keys = new Set([...Object.keys(initial), ...Object.keys(now)]);
    return [...keys].filter((key) => initial[key] !== now[key]);
  }

  function labelForField(field: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): string {
    const label = form.querySelector<HTMLLabelElement>(`label[for="${CSS.escape(field.id)}"]`);
    if (label) return label.textContent?.trim() || field.name;
    const legend = field.closest('fieldset')?.querySelector('legend');
    if (legend) return legend.textContent?.trim() || field.name;
    return field.name;
  }

  function updateChanges(): void {
    const labels = new Set<string>();
    for (const field of fields) {
      const key = `${field.name}:${field instanceof HTMLInputElement && (field.type === 'checkbox' || field.type === 'radio') ? field.value : ''}`;
      if (initial[key] !== currentState()[key]) labels.add(labelForField(field));
    }
    if (changeCount) changeCount.textContent = t('editor.changeCount', { count: labels.size });
    if (changeList) {
      changeList.innerHTML = '';
      for (const label of labels) {
        const node = document.createElement('div');
        node.className = 'edit-change';
        node.textContent = label;
        changeList.append(node);
      }
    }
    if (submitButton) submitButton.disabled = labels.size === 0;
  }

  function val(name: string): string {
    const element = form.elements.namedItem(name);
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
      return element.value.trim();
    }
    return '';
  }

  function checkedValues(name: string): string[] {
    return [...form.querySelectorAll<HTMLInputElement>(`input[name="${name}"]:checked`)].map((input) => input.value);
  }

  function checkbox(name: string): boolean {
    const input = form.querySelector<HTMLInputElement>(`input[name="${name}"]`);
    return input ? input.checked : false;
  }

  function localizedValue(enName: string, zhName: string, required = true): { en?: string; zh?: string } {
    const en = val(enName);
    const zh = val(zhName);
    if (required && !en && !zh) throw new Error(t('errors.generic'));
    return { ...(en ? { en } : {}), ...(zh ? { zh } : {}) };
  }

  function parseLinks(text: string, fallbackKind: LinkKind): LinkItem[] {
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (lines.length === 0) throw new Error(t('editor.invalidLinks'));
    return lines.map((line) => {
      const [labelPart, urlPart, kindPart] = line.split('|').map((part) => part.trim());
      const url = urlPart || labelPart;
      if (!url || !/^(https:\/\/|mailto:)[^\s]+$/.test(url)) throw new Error(t('editor.invalidLinks'));
      const kind = LINK_KINDS.includes(kindPart as LinkKind) ? (kindPart as LinkKind) : fallbackKind;
      return {
        label: labelPart && labelPart !== url ? labelPart : url,
        url,
        kind,
      };
    });
  }

  function numberValue(name: string, fallback = 0): number {
    const parsed = Number(val(name));
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
  }

  function buildDataset(): Dataset {
    const title = localizedValue('titleEn', 'titleZh');
    const summary = localizedValue('summaryEn', 'summaryZh');
    const accessType = val('accessType') as Dataset['access']['type'];
    const fallbackKind: LinkKind = accessType === 'open' ? 'download' : 'request';
    const accessLinks = parseLinks(val('downloadLinks'), fallbackKind);
    const examples = val('exampleLinks').trim()
      ? parseLinks(val('exampleLinks'), 'homepage').map((link) => ({ ...link, kind: link.kind === 'download' ? 'homepage' : link.kind }))
      : [];

    const usageEn = {
      howToLoad: val('howToLoadEn'),
      recommendedUse: val('recommendedUseEn'),
      limitations: val('limitationsEn'),
    };
    const usageZh = {
      howToLoad: val('howToLoadZh'),
      recommendedUse: val('recommendedUseZh'),
      limitations: val('limitationsZh'),
    };
    const usage = {
      howToLoad: localizedValue('howToLoadEn', 'howToLoadZh'),
      recommendedUse: localizedValue('recommendedUseEn', 'recommendedUseZh'),
      limitations: localizedValue('limitationsEn', 'limitationsZh'),
      examples,
    };
    void usageEn;
    void usageZh;

    if (usageEn.howToLoad.length > 4000 || usageZh.howToLoad.length > 4000) throw new Error(t('errors.generic'));

    return {
      ...raw,
      title,
      summary,
      license: val('license') as Dataset['license'],
      format: val('format') as Dataset['format'],
      environment: val('environment') as Dataset['environment'],
      compatibility: {
        ...raw.compatibility,
        minecraftVersions: val('mcVersions')
          .split(',')
          .map((version) => version.trim())
          .filter(Boolean),
        modVersions: val('modVersions')
          .split(',')
          .map((version) => version.trim())
          .filter(Boolean),
        loader: val('loader') || null,
        dataFormatVersion: val('dataFormatVersion') || null,
        verification: val('verification') as Dataset['compatibility']['verification'],
        streams: checkedValues('streams') as Dataset['compatibility']['streams'],
      },
      scale: {
        episodes: Math.round(numberValue('episodes', raw.scale.episodes)),
        bytes: Math.round(numberValue('sizeGb', raw.scale.bytes / 1024 ** 3) * 1024 ** 3),
        durationSeconds: Math.round(numberValue('durationHours', raw.scale.durationSeconds / 3600) * 3600),
      },
      tags: {
        tasks: checkedValues('tasks') as Dataset['tags']['tasks'],
        dimensions: checkedValues('dimensions') as Dataset['tags']['dimensions'],
        trainingUses: checkedValues('trainingUses') as Dataset['tags']['trainingUses'],
        quality: checkedValues('quality') as Dataset['tags']['quality'],
      },
      access: {
        ...raw.access,
        type: accessType,
        links: accessLinks,
        privacy: {
          personalData: checkbox('privacyPersonal'),
          thirdPartyContent: checkbox('privacyThirdParty'),
          redistributionPermitted: checkbox('privacyRedistribute'),
        },
      },
      usage,
      updatedAt: new Date().toISOString().slice(0, 10),
    };
  }

  function showMessage(text: string, kind: 'error' | 'success' = 'error', link?: { href: string; label: string }): void {
    if (!message) return;
    message.hidden = false;
    message.className = `form-message ${kind === 'error' ? 'form-message--error' : 'form-message--success'}`;
    message.textContent = text;
    if (link) {
      message.append(document.createElement('br'));
      const anchor = document.createElement('a');
      anchor.href = link.href;
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
      anchor.textContent = link.label;
      message.append(anchor);
    }
    message.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function note(): string {
    return noteField?.value.trim() || '';
  }

  function copyDataset(): void {
    try {
      const dataset = buildDataset();
      void navigator.clipboard.writeText(JSON.stringify(dataset, null, 2)).then(
        () => toast(t('copy.copied')),
        () => showMessage(t('copy.failed'), 'error'),
      );
    } catch (error) {
      showMessage(error instanceof Error ? error.message : t('errors.generic'), 'error');
    }
  }

  function downloadDataset(): void {
    try {
      const dataset = buildDataset();
      const blob = new Blob([`${JSON.stringify(dataset, null, 2)}\n`], { type: 'application/json' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${slug}.json`;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(link.href);
    } catch (error) {
      showMessage(error instanceof Error ? error.message : t('errors.generic'), 'error');
    }
  }

  function syncLogin(session: AuthSession | null): void {
    if (!loginState || !loginAction) return;
    if (session) {
      loginState.textContent = `${t('auth.authenticated', { login: session.login })}${session.canModerate ? ` · ${t('auth.moderator')}` : ''}`;
      loginAction.hidden = true;
    } else {
      loginState.textContent = t('editor.loginDesc');
      loginAction.hidden = false;
    }
  }

  form.addEventListener('input', updateChanges);
  form.addEventListener('change', updateChanges);
  form.querySelector('[data-copy-json]')?.addEventListener('click', copyDataset);
  form.querySelector('[data-download-json]')?.addEventListener('click', downloadDataset);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (changedKeys().length === 0) {
      showMessage(t('editor.notChanged'), 'error');
      return;
    }
    if (!note()) {
      noteField?.focus();
      showMessage(t('editor.noteLabel'), 'error');
      return;
    }

    const session = getSession();
    if (!session) {
      showMessage(t('editor.signInFirst'), 'error');
      const trigger = document.querySelector<HTMLButtonElement>('.js-auth-open:not([hidden])');
      trigger?.click();
      return;
    }

    let dataset: Dataset;
    try {
      dataset = buildDataset();
    } catch (error) {
      showMessage(error instanceof Error ? error.message : t('errors.generic'), 'error');
      return;
    }

    if (!submitButton) return;
    submitButton.disabled = true;
    submitButton.dataset.originalLabel = submitButton.innerHTML;
    submitButton.innerHTML = `<span class="pixel-spinner" aria-hidden="true"></span><span>${t('editor.preparing')}</span>`;
    showMessage(t('editor.preparing'), 'success');

    try {
      const issue = await createCorrectionIssue({
        slug,
        title: dataset.title[lang] || dataset.title.en || dataset.title.zh || slug,
        dataset,
        note: note(),
        lang,
      });
      submitted = true;
      showMessage(t('editor.success'), 'success', { href: issue.html_url, label: t('editor.successLink') });
      toast(t('editor.success'));
    } catch (error) {
      submitButton.disabled = false;
      submitButton.innerHTML = submitButton.dataset.originalLabel || t('editor.submit');
      showMessage(error instanceof Error && error.message ? `${t('editor.error')} ${error.message}` : t('editor.error'), 'error');
    }
  });

  window.addEventListener(AUTH_EVENT, (event) => {
    syncLogin((event as CustomEvent<AuthSession | null>).detail ?? getSession());
  });
  window.addEventListener('beforeunload', (event) => {
    if (!submitted && changedKeys().length > 0) {
      event.preventDefault();
    }
  });

  syncLogin(getSession());
  updateChanges();
}
