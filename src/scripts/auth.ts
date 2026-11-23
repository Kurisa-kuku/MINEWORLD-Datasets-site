export interface AuthSession {
  token: string;
  login: string;
  name: string;
  avatarUrl: string;
  canModerate: boolean;
  scopes?: string;
}

const SESSION_KEY = 'mw-github-session-v1';
export const AUTH_EVENT = 'mw:auth';

export class GitHubError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'GitHubError';
    this.status = status;
    this.code = code;
  }
}

function config() {
  if (!window.MW?.config) throw new Error('Client configuration is unavailable.');
  return window.MW.config;
}

export function getSession(): AuthSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AuthSession>;
    if (!parsed.token || !parsed.login) return null;
    return {
      token: parsed.token,
      login: parsed.login,
      name: parsed.name || parsed.login,
      avatarUrl: parsed.avatarUrl || `https://github.com/${parsed.login}.png`,
      canModerate: Boolean(parsed.canModerate),
      scopes: parsed.scopes,
    };
  } catch {
    return null;
  }
}

export function getToken(): string | null {
  return getSession()?.token ?? null;
}

export function saveSession(session: AuthSession): void {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  window.dispatchEvent(new CustomEvent<AuthSession>(AUTH_EVENT, { detail: session }));
}

export function clearSession(): void {
  sessionStorage.removeItem(SESSION_KEY);
  window.dispatchEvent(new CustomEvent<AuthSession | null>(AUTH_EVENT, { detail: null }));
}

export async function githubFetch(pathOrUrl: string, init: RequestInit = {}, token?: string | null): Promise<Response> {
  const url = pathOrUrl.startsWith('http') ? pathOrUrl : `https://api.github.com${pathOrUrl}`;
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/vnd.github+json');
  headers.set('X-GitHub-Api-Version', '2022-11-28');
  const authToken = token === undefined ? getSession()?.token : token;
  if (authToken) headers.set('Authorization', `Bearer ${authToken}`);
  const response = await fetch(url, { ...init, headers });
  if (!response.ok) {
    let message = `GitHub API error ${response.status}`;
    try {
      const data = (await response.json()) as { message?: string };
      if (data.message) message = data.message;
    } catch {
      // Keep the status-based fallback.
    }
    throw new GitHubError(message, response.status, String(response.status));
  }
  return response;
}

interface GitHubUser {
  login: string;
  name: string | null;
  avatar_url: string;
}

interface GitHubRepo {
  permissions?: {
    admin?: boolean;
    maintain?: boolean;
    push?: boolean;
  };
}

export async function loginWithToken(rawToken: string): Promise<AuthSession> {
  const token = rawToken.trim();
  if (!token) throw new GitHubError('Token is empty', 401);
  if (!/^(gh[pousr]_|github_pat_)/.test(token) && token.length < 20) {
    throw new GitHubError('Token format is not recognised', 401);
  }

  const userResponse = await githubFetch('/user', {}, token);
  const user = (await userResponse.json()) as GitHubUser;

  let canModerate = false;
  try {
    const repoResponse = await githubFetch(`/repos/${config().repo}`, {}, token);
    const repo = (await repoResponse.json()) as GitHubRepo;
    canModerate = Boolean(repo.permissions?.admin || repo.permissions?.maintain || repo.permissions?.push);
  } catch {
    // Users without repository access can still sign in for reactions and
    // correction issues on public repositories.
    canModerate = false;
  }

  const scopes = userResponse.headers.get('x-oauth-scopes') ?? undefined;
  const session: AuthSession = {
    token,
    login: user.login,
    name: user.name || user.login,
    avatarUrl: user.avatar_url || `https://github.com/${user.login}.png`,
    canModerate,
    scopes,
  };
  saveSession(session);
  return session;
}

export interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

interface DeviceTokenResponse {
  access_token?: string;
  token_type?: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

export function hasDeviceFlow(): boolean {
  return Boolean(window.MW?.config.oauthClientId && window.MW?.config.oauthAuthBase);
}

function authEndpoint(pathname: string): string {
  const base = config().oauthAuthBase;
  if (!base) {
    throw new GitHubError('The OAuth proxy is not configured on this deployment.', 0, 'not_configured');
  }
  return `${base}${pathname}`;
}

export async function requestDeviceCode(): Promise<DeviceCodeResponse> {
  const clientId = config().oauthClientId;
  if (!clientId) throw new GitHubError('Device flow is not configured on this deployment.', 0, 'not_configured');
  const response = await fetch(authEndpoint('/login/device/code'), {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: clientId,
      scope: 'public_repo read:user',
    }),
  });
  if (!response.ok) {
    throw new GitHubError('Could not start GitHub device authorization.', response.status);
  }
  const data = (await response.json()) as Partial<DeviceCodeResponse> & { error?: string; error_description?: string };
  if (data.error || !data.device_code || !data.user_code || !data.verification_uri) {
    throw new GitHubError(data.error_description || data.error || 'GitHub did not return a device code.', 200, data.error);
  }
  return data as DeviceCodeResponse;
}

export async function pollDeviceToken(
  deviceCode: string,
  intervalSeconds: number,
  options: { signal?: AbortSignal; onTick?: (elapsed: number) => void } = {},
): Promise<string> {
  const clientId = config().oauthClientId;
  const interval = Math.max(5, intervalSeconds);
  let elapsed = 0;

  while (!options.signal?.aborted) {
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(resolve, interval * 1000);
      options.signal?.addEventListener(
        'abort',
        () => {
          window.clearTimeout(timeout);
          reject(new DOMException('Aborted', 'AbortError'));
        },
        { once: true },
      );
    });
    if (options.signal?.aborted) break;
    elapsed += interval;
    options.onTick?.(elapsed);

    const response = await fetch(authEndpoint('/login/oauth/access_token'), {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        device_code: deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }),
    });
    if (!response.ok) throw new GitHubError('GitHub token polling failed.', response.status);
    const data = (await response.json()) as DeviceTokenResponse;
    if (data.access_token) return data.access_token;
    if (data.error === 'authorization_pending') continue;
    if (data.error === 'slow_down') {
      await new Promise((resolve) => window.setTimeout(resolve, 5000));
      continue;
    }
    if (data.error === 'access_denied') throw new GitHubError('Access was denied on GitHub.', 403, 'access_denied');
    if (data.error === 'expired_token') throw new GitHubError('The device code expired.', 419, 'expired_token');
    throw new GitHubError(data.error_description || data.error || 'GitHub authorization failed.', 400, data.error);
  }
  throw new DOMException('Aborted', 'AbortError');
}

export async function createCorrectionIssue(input: {
  slug: string;
  title: string;
  dataset: unknown;
  note: string;
  lang: 'en' | 'zh';
}): Promise<{ number: number; html_url: string }> {
  const session = getSession();
  if (!session) throw new GitHubError('Not signed in', 401);
  const marker = 'mw-datasets-correction';
  const body = [
    `### Dataset`,
    '',
    `\`${input.slug}\``,
    '',
    `### Corrected JSON`,
    '',
    `<!-- ${marker}:start -->`,
    '```json',
    JSON.stringify(input.dataset, null, 2),
    '```',
    `<!-- ${marker}:end -->`,
    '',
    `### Correction note`,
    '',
    input.note || (input.lang === 'zh' ? '（未填写）' : '(not provided)'),
    '',
    '---',
    '',
    input.lang === 'zh'
      ? '此 Issue 由 MineWorld Datasets 元数据编辑器创建。审核者会校验 JSON 并自动转换为 Pull Request。'
      : 'This issue was created by the MineWorld Datasets metadata editor. A maintainer will validate the JSON and turn it into a pull request.',
  ].join('\n');

  const response = await githubFetch(`/repos/${config().repo}/issues`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: `[Correction] ${input.title}`,
      body,
    }),
  });
  return (await response.json()) as { number: number; html_url: string };
}

export async function addReaction(issueNumber: number, content: '+1' | 'heart' = '+1'): Promise<number> {
  const response = await githubFetch(`/repos/${config().repo}/issues/${issueNumber}/reactions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/vnd.github+json' },
    body: JSON.stringify({ content }),
  });
  const data = (await response.json()) as { id: number };
  return data.id;
}

export async function removeReaction(issueNumber: number, reactionId: number): Promise<void> {
  await githubFetch(`/repos/${config().repo}/issues/${issueNumber}/reactions/${reactionId}`, {
    method: 'DELETE',
  });
}

export async function findMyReaction(issueNumber: number, login: string): Promise<number | null> {
  const response = await githubFetch(
    `/repos/${config().repo}/issues/${issueNumber}/reactions?content=%2B1&per_page=100`,
  );
  const reactions = (await response.json()) as Array<{ id: number; user: { login: string } | null }>;
  const mine = reactions.find((reaction) => reaction.user?.login.toLowerCase() === login.toLowerCase());
  return mine?.id ?? null;
}
