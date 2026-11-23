export type Lang = 'en' | 'zh';

export const LANGS: Lang[] = ['en', 'zh'];
export const DEFAULT_LANG: Lang = 'en';

const repoSlug = import.meta.env.PUBLIC_REPO_SLUG || 'Kurisa-kuku/MINEWORLD-Datasets-site';
const recorderRepo = import.meta.env.PUBLIC_RECORDER_REPO || 'Kurisa-kuku/MineWorld-Agent-Recorder';
const giscusRepoId = import.meta.env.PUBLIC_GISCUS_REPO_ID || '';
const giscusCategoryId = import.meta.env.PUBLIC_GISCUS_CATEGORY_ID || '';

export const SITE = {
  name: 'MineWorld Datasets',
  shortName: 'MW Datasets',
  repo: repoSlug,
  owner: repoSlug.split('/')[0],
  repoName: repoSlug.split('/').slice(1).join('/'),
  recorderRepo: `https://github.com/${recorderRepo}`,
  recorderRepoSlug: recorderRepo,
  github: `https://github.com/${repoSlug}`,
  issues: `https://github.com/${repoSlug}/issues`,
  newIssue: `https://github.com/${repoSlug}/issues/new`,
  pulls: `https://github.com/${repoSlug}/pulls`,
  discussions: `https://github.com/${repoSlug}/discussions`,
  actions: `https://github.com/${repoSlug}/actions`,
  licenseUrl: `https://github.com/${repoSlug}/blob/main/LICENSE`,
  oauthClientId: import.meta.env.PUBLIC_GITHUB_OAUTH_CLIENT_ID || '',
  oauthAuthBase: (import.meta.env.PUBLIC_GITHUB_AUTH_BASE || '').replace(/\/+$/, ''),
  deviceFlowEnabled: Boolean(
    import.meta.env.PUBLIC_GITHUB_OAUTH_CLIENT_ID && import.meta.env.PUBLIC_GITHUB_AUTH_BASE,
  ),
  adminLogins: (import.meta.env.PUBLIC_ADMIN_LOGINS || 'Kurisa-kuku')
    .split(',')
    .map((login: string) => login.trim().toLowerCase())
    .filter(Boolean),
  giscus: {
    repo: repoSlug,
    repoId: giscusRepoId,
    category: import.meta.env.PUBLIC_GISCUS_CATEGORY || 'Announcements',
    categoryId: giscusCategoryId,
    enabled: Boolean(giscusRepoId && giscusCategoryId),
  },
} as const;

export const BASE = import.meta.env.BASE_URL === '/' ? '' : import.meta.env.BASE_URL.replace(/\/+$/, '');

/** Prefix a root-relative public asset or route with Astro's configured base. */
export function withBase(path = ''): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  if (!BASE) return normalized;
  return `${BASE}${normalized === '/' ? '/' : normalized}`;
}

/** Build an internal localized route like /en/datasets/. */
export function localePath(lang: Lang, path = ''): string {
  const segment = path.replace(/^\/+|\/+$/g, '');
  return withBase(`/${lang}${segment ? `/${segment}` : ''}/`);
}

export const TEMPLATES = {
  submission: `${SITE.newIssue}?template=dataset-submission.yml`,
  correction: `${SITE.newIssue}?template=dataset-correction.yml`,
  report: `${SITE.newIssue}?template=dataset-report.yml`,
};

export const LABELS = {
  submission: 'dataset-submission',
  correction: 'dataset-correction',
  report: 'dataset-report',
  health: 'link-health',
  needsReview: 'needs-review',
  automated: 'automated-pr',
} as const;

/** Serializable config consumed by browser scripts. */
export const CLIENT_CONFIG = {
  lang: DEFAULT_LANG,
  base: BASE,
  repo: SITE.repo,
  owner: SITE.owner,
  repoName: SITE.repoName,
  githubUrl: SITE.github,
  issuesUrl: SITE.issues,
  discussionsUrl: SITE.discussions,
  oauthClientId: SITE.oauthClientId,
  oauthAuthBase: SITE.oauthAuthBase,
  deviceFlowEnabled: SITE.deviceFlowEnabled,
  adminLogins: SITE.adminLogins,
  giscusEnabled: SITE.giscus.enabled,
  labels: LABELS,
} as const;
