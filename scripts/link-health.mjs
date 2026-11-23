#!/usr/bin/env node
/**
 * Scheduled link health check.
 *
 * Checks every download/access/example URL in data/datasets, then creates or
 * updates a single `link-health` issue. The workflow never edits listings.
 */
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const REPO = process.env.GITHUB_REPOSITORY || '';
const TOKEN = process.env.GITHUB_TOKEN || '';
const DATA_DIR = path.join(ROOT, 'data', 'datasets');
const API = 'https://api.github.com';
const TIMEOUT_MS = 20000;
const CONCURRENCY = 4;

if (!REPO || !TOKEN) {
  console.error('GITHUB_REPOSITORY and GITHUB_TOKEN are required.');
  process.exit(1);
}

async function api(pathname, options = {}) {
  const response = await fetch(`${API}${pathname}`, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${TOKEN}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'mw-datasets-link-health',
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`GitHub API ${response.status} for ${pathname}: ${data?.message || response.statusText}`);
  }
  return data;
}

async function ensureLabel(name, color, description) {
  try {
    await api(`/repos/${REPO}/labels/${encodeURIComponent(name)}`);
  } catch (error) {
    if (!/404/.test(String(error.message))) throw error;
    await api(`/repos/${REPO}/labels`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, color, description }),
    });
  }
}

async function request(url, method) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method,
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MineWorldDatasetsLinkHealth/1.0; +https://github.com/Kurisa-kuku/MINEWORLD-Datasets-site)',
        Accept: 'text/html,application/json,application/octet-stream;q=0.8,*/*;q=0.5',
        Range: 'bytes=0-4096',
      },
    });
    try {
      await response.body?.cancel();
    } catch {
      // Body cancellation is best effort.
    }
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

async function check(url) {
  if (!/^https?:\/\//i.test(url)) return { status: 'skipped', reason: 'non-http link' };
  let head;
  try {
    head = await request(url, 'HEAD');
    if (head.status >= 200 && head.status < 400) return { status: 'ok', code: head.status };
    if ([401, 403, 429].includes(head.status)) {
      return { status: 'manual', code: head.status, reason: 'host blocks automated checks or needs authentication' };
    }
  } catch (error) {
    // Fall back to GET; some hosts do not implement HEAD.
    if (error.name !== 'AbortError' && error.cause?.code !== 'ENOTFOUND') {
      // Continue to GET.
    }
  }

  try {
    const get = await request(url, 'GET');
    if (get.status >= 200 && get.status < 400) return { status: 'ok', code: get.status };
    if ([401, 403, 429].includes(get.status)) {
      return { status: 'manual', code: get.status, reason: 'host blocks automated checks or needs authentication' };
    }
    if (get.status === 405 || get.status === 501) {
      return { status: 'manual', code: get.status, reason: 'server does not allow automated requests' };
    }
    return { status: 'fail', code: get.status, reason: `HTTP ${get.status}` };
  } catch (error) {
    return {
      status: 'fail',
      code: 0,
      reason: error.name === 'AbortError' ? `timeout after ${TIMEOUT_MS / 1000}s` : String(error.cause?.code || error.message),
    };
  }
}

async function main() {
  const files = (await readdir(DATA_DIR)).filter((file) => file.endsWith('.json')).sort();
  const checks = [];
  for (const file of files) {
    const data = JSON.parse(await readFile(path.join(DATA_DIR, file), 'utf8'));
    const urls = new Map();
    for (const link of [...(data.access?.links || []), ...(data.usage?.examples || [])]) {
      if (!link?.url || !/^https?:\/\//i.test(link.url)) continue;
      if (!urls.has(link.url)) urls.set(link.url, link.label);
    }
    for (const [url, label] of urls) checks.push({ slug: data.slug, title: data.title?.en || data.slug, url, label });
  }

  console.log(`Checking ${checks.length} external links across ${files.length} datasets…`);
  const results = [];
  let index = 0;
  async function worker() {
    while (index < checks.length) {
      const current = checks[index];
      index += 1;
      const result = await check(current.url);
      results.push({ ...current, ...result });
      console.log(`${result.status.toUpperCase().padEnd(7)} ${current.slug} ${current.url}${result.code ? ` (${result.code})` : ''}`);
      await new Promise((resolve) => setTimeout(resolve, 180));
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const failures = results.filter((result) => result.status === 'fail');
  const manual = results.filter((result) => result.status === 'manual');
  await ensureLabel('link-health', 'f2a33c', 'Automated external link reachability check');
  await ensureLabel('data-error', 'b60205', 'Data or metadata problem requiring attention');

  const open = await api(`/repos/${REPO}/issues?state=open&labels=link-health&per_page=20`);
  const issue = open.find((item) => !item.pull_request) || null;
  const table = (items) =>
    [
      '| Dataset | URL | Result |',
      '| --- | --- | --- |',
      ...items.map(
        (result) =>
          `| \`${result.slug}\` | ${result.url.replace(/\|/g, '%7C')} | ${result.code ? `HTTP ${result.code}` : result.reason} |`,
      ),
    ].join('\n');

  if (failures.length === 0) {
    console.log('All checked links are reachable.');
    if (issue) {
      await api(`/repos/${REPO}/issues/${issue.number}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: `✅ Scheduled link health check passed ${new Date().toISOString()}.\n\nAll ${checks.length} links responded successfully.` }),
      });
      await api(`/repos/${REPO}/issues/${issue.number}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: 'closed' }),
      });
    }
    return;
  }

  const body = [
    '<!-- mw-link-health -->',
    '## Link health report',
    '',
    `Scheduled check: **${new Date().toISOString().slice(0, 10)}**`,
    '',
    `- Checked: ${results.length}`,
    `- Failed: **${failures.length}**`,
    `- Manual check (blocked/auth): ${manual.length}`,
    '',
    '### Failed links',
    '',
    table(failures),
    '',
    manual.length ? '### Needs manual check\n\n' + table(manual) + '\n' : '',
    'A 403/429 result can be automated bot protection rather than a dead link. Maintainers should open the link in a browser before changing the listing.',
    '',
    'If a link is permanently dead, update the dataset metadata via the correction editor or mark the listing restricted.',
  ].join('\n');

  if (issue) {
    await api(`/repos/${REPO}/issues/${issue.number}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: `[link-health] ${failures.length} broken dataset link${failures.length === 1 ? '' : 's'}`,
        body,
        labels: ['link-health', 'data-error'],
      }),
    });
    console.log(`Updated link-health issue #${issue.number}`);
  } else {
    const created = await api(`/repos/${REPO}/issues`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: `[link-health] ${failures.length} broken dataset link${failures.length === 1 ? '' : 's'}`,
        body,
        labels: ['link-health', 'data-error'],
      }),
    });
    console.log(`Created link-health issue #${created.number}`);
  }
  process.exitCode = 0;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
