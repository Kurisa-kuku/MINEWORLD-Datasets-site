import { AUTH_EVENT, GitHubError, getSession, githubFetch, type AuthSession } from './auth';
import { getClientT } from './client-i18n';
import { debounce, toast } from './utils';

interface GitHubIssue {
  number: number;
  title: string;
  body: string | null;
  html_url: string;
  created_at: string;
  updated_at: string;
  user: { login: string; avatar_url: string } | null;
  labels: Array<{ name: string; color?: string }>;
  pull_request?: unknown;
  state: string;
}

interface GitHubPull extends GitHubIssue {
  head?: { ref: string };
  base?: { ref: string };
}

interface AdminState {
  issues: GitHubIssue[];
  pulls: GitHubPull[];
  activeTab: 'reports' | 'corrections' | 'health' | 'pulls';
  query: string;
  loading: boolean;
  canModerate: boolean;
}

const state: AdminState = {
  issues: [],
  pulls: [],
  activeTab: 'reports',
  query: '',
  loading: false,
  canModerate: false,
};

const queue = document.querySelector<HTMLElement>('[data-admin-queue]');
const errorBox = document.querySelector<HTMLElement>('[data-admin-error]');
const loading = document.querySelector<HTMLElement>('[data-admin-loading]');
const search = document.querySelector<HTMLInputElement>('#admin-search');
const refresh = document.querySelector<HTMLButtonElement>('[data-admin-refresh]');
const status = document.querySelector<HTMLElement>('[data-admin-status]');
const mode = document.querySelector<HTMLElement>('[data-admin-mode]');
const loginButton = document.querySelector<HTMLButtonElement>('[data-admin-login]');
const readonlyNote = document.querySelector<HTMLElement>('[data-admin-readonly-note]');
const readonlyText = document.querySelector<HTMLElement>('[data-admin-readonly-text]');
const tabs = document.querySelectorAll<HTMLButtonElement>('[data-admin-tab]');

let t: Awaited<ReturnType<typeof getClientT>>;
void getClientT().then((translate) => {
  t = translate;
  init();
});

function labelsOf(issue: GitHubIssue): string[] {
  return (issue.labels || []).map((label) => label.name.toLowerCase());
}

function inCategory(issue: GitHubIssue, category: AdminState['activeTab']): boolean {
  const labels = labelsOf(issue);
  const title = String(issue.title || '').toLowerCase();
  if (category === 'reports') {
    return labels.includes('dataset-report') || labels.includes('report') || title.startsWith('[report]');
  }
  if (category === 'corrections') {
    return labels.includes('dataset-correction') || labels.includes('correction') || title.startsWith('[correction]');
  }
  if (category === 'health') {
    return labels.includes('link-health') || labels.includes('data-error') || title.startsWith('[link-health]');
  }
  return false;
}

function categoryCount(category: AdminState['activeTab']): number {
  if (category === 'pulls') return filtered(state.pulls).length;
  return filtered(state.issues.filter((issue) => inCategory(issue, category))).length;
}

function filtered<T extends GitHubIssue>(items: T[]): T[] {
  const query = state.query.trim().toLowerCase();
  if (!query) return items;
  return items.filter(
    (item) =>
      item.title.toLowerCase().includes(query) ||
      (item.user?.login || '').toLowerCase().includes(query) ||
      labelsOf(item).some((label) => label.includes(query)),
  );
}

function currentItems(): GitHubIssue[] {
  if (state.activeTab === 'pulls') return filtered(state.pulls);
  return filtered(state.issues.filter((issue) => inCategory(issue, state.activeTab)));
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat(window.MW?.config.lang === 'zh' ? 'zh-CN' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(iso));
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function init(): void {
  search?.addEventListener(
    'input',
    debounce(() => {
      state.query = search.value;
      render();
    }, 140),
  );
  refresh?.addEventListener('click', () => void loadQueue());

  for (const tab of tabs) {
    tab.addEventListener('click', () => {
      state.activeTab = (tab.dataset.adminTab || 'reports') as AdminState['activeTab'];
      for (const other of tabs) {
        const active = other === tab;
        other.classList.toggle('is-active', active);
        other.setAttribute('aria-selected', String(active));
      }
      render();
    });
  }

  syncAuth(getSession());
  window.addEventListener(AUTH_EVENT, (event) => {
    const session = (event as CustomEvent<AuthSession | null>).detail ?? getSession();
    syncAuth(session);
    void loadQueue();
  });

  void loadQueue();
}

function syncAuth(session: AuthSession | null): void {
  state.canModerate = Boolean(session?.canModerate);
  if (loginButton) loginButton.hidden = Boolean(session);
  if (mode) {
    mode.textContent = state.canModerate
      ? t('auth.moderator')
      : session
        ? t('admin.readonly')
        : t('admin.publicQueue');
    mode.className = `badge ${state.canModerate ? 'tone-grass' : session ? 'tone-gold' : 'tone-stone'}`;
  }
  if (status) {
    status.textContent = state.canModerate
      ? `${t('auth.authenticated', { login: session?.login || '' })} · ${t('auth.permission')}`
      : session
        ? t('admin.noAccess')
        : t('admin.loginRequired');
  }
  if (readonlyNote) readonlyNote.hidden = state.canModerate;
  if (readonlyText) {
    readonlyText.textContent = session ? t('admin.noAccess') : t('admin.publicQueue');
  }
}

async function loadQueue(): Promise<void> {
  if (!queue || state.loading) return;
  state.loading = true;
  if (loading) loading.hidden = false;
  queue.hidden = true;
  if (errorBox) errorBox.hidden = true;

  try {
    const [issuesResponse, pullsResponse] = await Promise.all([
      githubFetch(`/repos/${window.MW!.config.repo}/issues?state=open&per_page=100&sort=updated&direction=desc`),
      githubFetch(`/repos/${window.MW!.config.repo}/pulls?state=open&per_page=100&sort=updated&direction=desc`),
    ]);
    const issues = (await issuesResponse.json()) as GitHubIssue[];
    const pulls = (await pullsResponse.json()) as GitHubPull[];
    state.issues = issues.filter((issue) => !issue.pull_request);
    state.pulls = pulls;
    render();
  } catch (error) {
    if (errorBox) {
      const statusCode = error instanceof GitHubError ? error.status : 0;
      errorBox.hidden = false;
      errorBox.textContent =
        statusCode === 403 || statusCode === 429
          ? t('errors.rateLimit')
          : `${t('admin.queueError')}${error instanceof Error ? ` (${error.message})` : ''}`;
    }
    if (queue) queue.hidden = true;
  } finally {
    state.loading = false;
    if (loading) loading.hidden = true;
  }
}

function bodyPreview(issue: GitHubIssue): string {
  let body = issue.body || '';
  const marker = body.indexOf('mw-datasets-correction:start');
  if (marker > 0) body = body.slice(0, marker).replace(/<!--[\s\S]*?-->/g, '').trim();
  body = body.replace(/```[\s\S]*?```/g, '[JSON]').replace(/<[^>]+>/g, '');
  return body.slice(0, 420) + (body.length > 420 ? '…' : '');
}

async function postComment(issueNumber: number, value: string): Promise<void> {
  if (!value.trim()) return;
  await githubFetch(`/repos/${window.MW!.config.repo}/issues/${issueNumber}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body: value.trim() }),
  });
  toast(t('admin.commented'));
  await loadQueue();
}

async function closeIssue(issueNumber: number): Promise<void> {
  await githubFetch(`/repos/${window.MW!.config.repo}/issues/${issueNumber}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state: 'closed' }),
  });
  toast(t('admin.closed'));
  await loadQueue();
}

async function mergePull(pullNumber: number): Promise<void> {
  if (!window.confirm(t('admin.mergeConfirm'))) return;
  await githubFetch(`/repos/${window.MW!.config.repo}/pulls/${pullNumber}/merge`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ merge_method: 'squash' }),
  });
  toast(t('admin.merged'));
  await loadQueue();
}

function actionError(error: unknown): void {
  toast(error instanceof GitHubError && error.status === 403 ? t('errors.forbidden') : t('admin.actionFailed'));
}

function createActionButton(label: string, variant: string, action: () => Promise<void>): HTMLButtonElement {
  const button = el('button', `btn btn--small ${variant}`);
  button.type = 'button';
  button.textContent = label;
  button.addEventListener('click', async () => {
    if (!state.canModerate || button.disabled) return;
    button.disabled = true;
    try {
      await action();
    } catch (error) {
      actionError(error);
      button.disabled = false;
    }
  });
  return button;
}

function createCard(issue: GitHubIssue, isPull: boolean): HTMLElement {
  const card = el('article', 'admin-card');
  const head = el('div', 'admin-card__head');
  const titleWrap = el('div');
  const title = el('h2', 'admin-card__title');
  const link = el('a', '', `#${issue.number} · ${issue.title}`);
  link.href = issue.html_url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  title.append(link);
  titleWrap.append(title);

  const meta = el('div', 'admin-card__meta');
  const by = el('span', '', t('admin.issueBy', { user: issue.user?.login || 'ghost' }));
  const updated = el('span', '', t('admin.updated', { date: formatDate(issue.updated_at) }));
  meta.append(by, updated);
  if (issue.labels?.length) {
    const labelWrap = el('span', '');
    labelWrap.textContent = issue.labels.map((label) => `#${label.name}`).join(' ');
    meta.append(labelWrap);
  }
  titleWrap.append(meta);
  head.append(titleWrap);
  if (state.canModerate) {
    const close = createActionButton(t('admin.close'), 'btn--ghost', () => closeIssue(issue.number));
    head.append(close);
  }
  card.append(head);

  const preview = bodyPreview(issue);
  if (preview) card.append(el('div', 'admin-card__body', preview));

  if (isPull && state.canModerate) {
    const actions = el('div', 'admin-card__actions');
    const merge = createActionButton(t('admin.merge'), 'btn--primary', () => mergePull(issue.number));
    actions.append(merge);
    const open = el('a', 'btn btn--small', t('admin.openIssue'));
    open.href = issue.html_url;
    open.target = '_blank';
    open.rel = 'noopener noreferrer';
    actions.append(open);
    card.append(actions);
  } else {
    const actions = el('div', 'admin-card__actions');
    const open = el('a', 'btn btn--small', t('admin.linkToIssue'));
    open.href = issue.html_url;
    open.target = '_blank';
    open.rel = 'noopener noreferrer';
    actions.append(open);
    if (state.canModerate) {
      const commentArea = el('div', 'admin-comment');
      const textarea = el('textarea', 'textarea');
      textarea.placeholder = t('admin.commentPlaceholder');
      textarea.name = `comment-${issue.number}`;
      const post = createActionButton(t('admin.comment'), 'btn--small', () => postComment(issue.number, textarea.value));
      commentArea.append(textarea, post);
      card.append(actions, commentArea);
      return card;
    }
    card.append(actions);
  }
  return card;
}

function render(): void {
  if (!queue) return;
  queue.hidden = false;
  queue.innerHTML = '';
  if (loading) loading.hidden = true;

  for (const tab of tabs) {
    const count = categoryCount((tab.dataset.adminTab || 'reports') as AdminState['activeTab']);
    const countNode = document.querySelector<HTMLElement>(`[data-tab-count="${tab.dataset.adminTab}"]`);
    if (countNode) countNode.textContent = String(count);
  }

  const items = currentItems();
  if (items.length === 0) {
    queue.append(el('div', 'admin-empty', t('admin.empty')));
    return;
  }

  for (const issue of items) {
    queue.append(createCard(issue, state.activeTab === 'pulls'));
  }
}
