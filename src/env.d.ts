/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_REPO_SLUG?: string;
  readonly PUBLIC_RECORDER_REPO?: string;
  readonly PUBLIC_GITHUB_OAUTH_CLIENT_ID?: string;
  readonly PUBLIC_GITHUB_AUTH_BASE?: string;
  readonly PUBLIC_ADMIN_LOGINS?: string;
  readonly PUBLIC_GISCUS_REPO_ID?: string;
  readonly PUBLIC_GISCUS_CATEGORY_ID?: string;
  readonly PUBLIC_GISCUS_CATEGORY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface MWClientConfig {
  lang: 'en' | 'zh';
  base: string;
  repo: string;
  owner: string;
  repoName: string;
  githubUrl: string;
  issuesUrl: string;
  discussionsUrl: string;
  oauthClientId: string;
  oauthAuthBase: string;
  deviceFlowEnabled: boolean;
  adminLogins: readonly string[];
  giscusEnabled: boolean;
  labels: Record<string, string>;
}

interface Window {
  MW?: {
    config: MWClientConfig;
    [key: string]: unknown;
  };
}
