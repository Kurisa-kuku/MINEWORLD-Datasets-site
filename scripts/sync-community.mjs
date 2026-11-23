#!/usr/bin/env node
/**
 * Keep one GitHub issue per published dataset for reactions and community
 * discussion, and snapshot reaction/comment counts into a static JSON file.
 *
 * Runs on a schedule and after data changes. The site reads the snapshot, so
 * GitHub API rate limits never affect page rendering.
 */
import { execFileSync } from 'node:child_process';
import { writeFile, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const REPO = process.env.GITHUB_REPOSITORY || '';
const TOKEN = process.env.GITHUB_TOKEN || '';
const API = 'https://api.github.com';
const STATS_FILE = path.join(ROOT, 'data', 'community', 'stats.json');
const DATA_DIR = path.join(ROOT, 'data', 'datasets');

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
      'User-Agent': 'mw-datasets-community-sync',
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`GitHub API ${response.status} for ${pathname}: ${data?.message || response.statusText}`);
  }
  return { data, headers: response.headers };
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

async function likeCount(issueNumber) {
  const { data } = await api(`/repos/${REPO}/issues/${issueNumber}/reactions?content=%2B1&per_page=100`);
  return Array.isArray(data) ? data.length : 0;
}

async function main() {
  await ensureLabel('dataset-reaction', '54aeff', 'Community reactions and comments for a dataset');
  await ensureLabel('community', '8fd6a9', 'Community-maintained discussion');

  const files = (await readdir(DATA_DIR)).filter((file) => file.endsWith('.json')).sort();
  const datasets = [];
  for (const file of files) {
    datasets.push(JSON.parse(await readFile(path.join(DATA_DIR, file), 'utf8')));
  }

  let existing = {};
  try {
    existing = JSON.parse(await readFile(STATS_FILE, 'utf8'));
  } catch {
    existing = {};
  }

  const { data: rawIssues } = await api(
    `/repos/${REPO}/issues?state=all&labels=dataset-reaction&per_page=100`,
  );
  const issues = new Map();
  for (const issue of rawIssues) {
    if (issue.pull_request) continue;
    const slug = String(issue.title || '').replace(/^\[Reactions\]\s*/, '').trim();
    if (slug) issues.set(slug, issue);
  }

  const [owner, repoName] = REPO.split('/');
  const siteBase = repoName === `${owner}.github.io` ? '' : `/${repoName}`;
  const siteUrl = (process.env.SITE_URL || `https://${owner}.github.io${siteBase}`).replace(/\/+$/, '');

  const nextStats = {};
  for (const dataset of datasets) {
    const slug = dataset.slug;
    if (dataset.demo) {
      if (existing[slug]) nextStats[slug] = existing[slug];
      continue;
    }

    let issue = issues.get(slug);
    if (!issue) {
      try {
        const { data: created } = await api(`/repos/${REPO}/issues`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: `[Reactions] ${slug}`,
            labels: ['dataset-reaction', 'community'],
            body: [
              '<!-- mw-community-issue -->',
              `## ${dataset.title?.en || dataset.title?.zh || slug}`,
              '',
              dataset.summary?.en || dataset.summary?.zh || '',
              '',
              `**Dataset page:** ${siteUrl}/en/datasets/${slug}/`,
              '',
              'React with 👍 to like this dataset. Comments here are counted in the catalog.',
              '',
              'For license, privacy or broken-link issues, use the report form on the dataset page instead of this thread.',
            ].join('\n'),
          }),
        });
        issue = created;
        issues.set(slug, created);
        console.log(`Created community issue #${created.number} for ${slug}`);
      } catch (error) {
        console.error(`Could not create community issue for ${slug}:`, error.message);
        if (existing[slug]) nextStats[slug] = existing[slug];
        continue;
      }
    }

    const likes = await likeCount(issue.number);
    const previous = existing[slug];
    const changed =
      !previous ||
      previous.issueNumber !== issue.number ||
      previous.likes !== likes ||
      previous.comments !== Number(issue.comments || 0);
    nextStats[slug] = {
      issueNumber: issue.number,
      likes,
      comments: Number(issue.comments || 0),
      updatedAt: changed || !previous.updatedAt ? new Date().toISOString() : previous.updatedAt,
    };
    console.log(`${slug}: ${likes} likes, ${issue.comments || 0} comments, issue #${issue.number}`);
  }

  const sorted = Object.fromEntries(Object.entries(nextStats).sort(([a], [b]) => a.localeCompare(b)));
  const serialized = `${JSON.stringify(sorted, null, 2)}\n`;
  let previousSerialized = '';
  try {
    previousSerialized = await readFile(STATS_FILE, 'utf8');
  } catch {
    previousSerialized = '';
  }
  await writeFile(STATS_FILE, serialized, 'utf8');
  if (serialized === previousSerialized) {
    console.log('Community stats unchanged.');
    return;
  }

  execFileSync('git', ['config', 'user.name', 'mw-datasets-bot'], { stdio: 'inherit' });
  execFileSync('git', ['config', 'user.email', 'mw-datasets-bot@users.noreply.github.com'], { stdio: 'inherit' });
  execFileSync('git', ['add', 'data/community/stats.json'], { stdio: 'inherit' });
  const status = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' });
  if (!status.trim()) {
    console.log('Community stats unchanged.');
    return;
  }
  execFileSync('git', ['commit', '-m', 'chore(community): sync reaction counts'], { stdio: 'inherit' });
  execFileSync('git', ['push'], { stdio: 'inherit' });
  console.log('Community stats committed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
