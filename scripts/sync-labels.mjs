#!/usr/bin/env node
/**
 * Create the repository labels used by the issue templates, automation and
 * moderation queues. Idempotent; run once after creating the repository.
 */
import process from 'node:process';

const REPO = process.env.GITHUB_REPOSITORY || 'Kurisa-kuku/MINEWORLD-Datasets-site';
const TOKEN = process.env.GITHUB_TOKEN || '';
const API = 'https://api.github.com';

if (!TOKEN) {
  console.error('GITHUB_TOKEN is required.');
  process.exit(1);
}

const labels = [
  ['dataset-submission', '2ea44f', 'New dataset submission from the issue form'],
  ['dataset-correction', 'a371f7', 'Structured metadata correction'],
  ['dataset-report', 'd73a4a', 'Broken link, license, privacy or data quality report'],
  ['link-health', 'f2a33c', 'Automated link reachability check'],
  ['data-error', 'b60205', 'Data or metadata problem requiring attention'],
  ['needs-review', 'fbca04', 'Waiting for a maintainer decision'],
  ['dataset-reaction', '54aeff', 'Community reactions and comments for a dataset'],
  ['community', '8fd6a9', 'Community-maintained discussion'],
  ['automation', '6f42c1', 'Created or handled by automation'],
  ['in-review', '0e8a16', 'Under maintainer review'],
];

async function api(pathname, options = {}) {
  const response = await fetch(`${API}${pathname}`, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${TOKEN}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'mw-datasets-labels',
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const error = new Error(`GitHub API ${response.status}: ${data?.message || response.statusText}`);
    error.status = response.status;
    throw error;
  }
  return data;
}

for (const [name, color, description] of labels) {
  try {
    await api(`/repos/${REPO}/labels/${encodeURIComponent(name)}`);
    const updated = await api(`/repos/${REPO}/labels/${encodeURIComponent(name)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ color, description }),
    });
    console.log(`updated ${updated.name}`);
  } catch (error) {
    if (error.status !== 404) throw error;
    const created = await api(`/repos/${REPO}/labels`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, color, description }),
    });
    console.log(`created ${created.name}`);
  }
}
