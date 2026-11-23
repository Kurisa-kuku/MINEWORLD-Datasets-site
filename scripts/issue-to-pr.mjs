#!/usr/bin/env node
/**
 * Turn a structured GitHub issue into a validated dataset pull request.
 *
 * Two issue shapes are supported:
 *   - Dataset submission (Issue Form or the matching headings)
 *   - Metadata correction (website editor marker or correction Issue Form)
 *
 * The script never pushes to the default branch and never merges anything.
 * It is intentionally dependency-light: Node 22, sharp, ajv.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import sharp from 'sharp';

const ROOT = process.cwd();
const REPO = process.env.GITHUB_REPOSITORY || '';
const TOKEN = process.env.GITHUB_TOKEN || '';
const ISSUE_NUMBER = Number(process.env.ISSUE_NUMBER || 0);
const API = 'https://api.github.com';

if (!REPO || !TOKEN || !ISSUE_NUMBER) {
  console.error('GITHUB_REPOSITORY, GITHUB_TOKEN and ISSUE_NUMBER are required.');
  process.exit(1);
}

const ALLOWED_COVER_HOSTS = new Set([
  'github.com',
  'user-images.githubusercontent.com',
  'private-user-images.githubusercontent.com',
  'raw.githubusercontent.com',
  'objects.githubusercontent.com',
  'avatars.githubusercontent.com',
]);

const warnings = [];
const tags = JSON.parse(await readFile(path.join(ROOT, 'data', 'tags.json'), 'utf8'));
const schema = JSON.parse(await readFile(path.join(ROOT, 'schemas', 'dataset.schema.json'), 'utf8'));
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(schema);

function log(message) {
  console.log(`[issue-to-pr] ${message}`);
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

async function markIssue(issueNumber, labels) {
  try {
    await ensureLabel('dataset-submission', '2ea44f', 'New dataset submission from the issue form');
    await ensureLabel('dataset-correction', 'a371f7', 'Structured metadata correction');
    await ensureLabel('automation', '6f42c1', 'Created or handled by automation');
    await ensureLabel('in-review', '0e8a16', 'Under maintainer review');
    await api(`/repos/${REPO}/issues/${issueNumber}/labels`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ labels }),
    });
  } catch (error) {
    warnings.push(`Could not update issue labels: ${error.message}`);
  }
}

async function api(pathname, options = {}) {
  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${TOKEN}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'mw-datasets-automation',
    ...(options.headers || {}),
  };
  const response = await fetch(`${API}${pathname}`, { ...options, headers });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const message = data?.message || response.statusText;
    throw new Error(`GitHub API ${response.status} for ${pathname}: ${message}`);
  }
  return data;
}

function normalizeHeading(value) {
  return value
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .toLowerCase()
    .replace(/[`*_]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseSections(body) {
  const sections = new Map();
  let current = null;
  for (const line of String(body || '').replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const heading = line.match(/^###\s+(.+)$/);
    if (heading) {
      current = normalizeHeading(heading[1]);
      sections.set(current, []);
    } else if (current) {
      sections.get(current).push(line);
    }
  }
  return sections;
}

function cleanSection(lines) {
  if (!lines?.length) return '';
  return lines
    .join('\n')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/_No response_/gi, '')
    .trim();
}

function getSection(sections, fragment) {
  const wanted = fragment.toLowerCase();
  for (const [heading, lines] of sections) {
    if (heading.includes(wanted)) return cleanSection(lines);
  }
  return '';
}

function getSectionMatching(sections, predicate) {
  for (const [heading, lines] of sections) {
    if (predicate(heading)) return cleanSection(lines);
  }
  return '';
}

function checkedLabels(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*[-*]\s+\[[xX]\]\s+(.+)$/)?.[1]?.trim())
    .filter(Boolean);
}

function options(group) {
  return tags[group] || [];
}

function resolveTag(group, raw) {
  const value = String(raw || '').trim();
  if (!value) return '';
  const direct = options(group).find((entry) => entry.slug === value.toLowerCase());
  if (direct) return direct.slug;
  const parenthesized = value.match(/\(([a-z0-9][a-z0-9.-]*)\)\s*$/i)?.[1]?.toLowerCase();
  if (parenthesized) {
    const match = options(group).find((entry) => entry.slug === parenthesized);
    if (match) return match.slug;
  }
  const normalized = value
    .toLowerCase()
    .replace(/[`*_]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const entry = options(group).find((item) => {
    if (item.slug === normalized) return true;
    const en = (item.name?.en || '').toLowerCase();
    const zh = (item.name?.zh || '').toLowerCase();
    return (
      normalized.startsWith(item.slug) ||
      normalized === en ||
      normalized === zh ||
      normalized.includes(item.slug)
    );
  });
  return entry?.slug || '';
}

function resolveChecked(group, text) {
  return checkedLabels(text)
    .map((label) => resolveTag(group, label))
    .filter(Boolean);
}

function parseNumber(raw, fallback = 0) {
  const match = String(raw || '').replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  if (!match) return fallback;
  const value = Number(match[0]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function parseBooleanAnswer(text, field) {
  const value = String(text || '').trim();
  if (!value) throw new Error(`Missing privacy answer: ${field}`);
  if (/^(yes|是|true)/i.test(value)) return true;
  if (/^(no|否|false)/i.test(value)) return false;
  throw new Error(`Unrecognised privacy answer for ${field}: ${value}`);
}

function slugify(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 64)
    .replace(/-+$/g, '');
}

function parseLinks(text, fallbackKind) {
  const allowedKinds = new Set(options('linkTypes').map((entry) => entry.slug));
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const links = [];
  for (const line of lines) {
    const parts = line.split('|').map((part) => part.trim());
    let label;
    let url;
    let kind;
    if (parts.length >= 2) {
      [label, url, kind] = parts;
    } else {
      url = parts[0];
      label = url;
    }
    if (!/^(https:\/\/|mailto:)[^\s]+$/.test(url || '')) continue;
    if (!/^[^\s].*$/.test(label || '')) label = url;
    links.push({
      label: label.slice(0, 120),
      url,
      kind: allowedKinds.has(kind) ? kind : fallbackKind,
    });
  }
  return links;
}

function localized(en, zh, field) {
  const value = {};
  if (en?.trim()) value.en = en.trim().slice(0, 4000);
  if (zh?.trim()) value.zh = zh.trim().slice(0, 4000);
  if (!value.en && !value.zh) throw new Error(`Missing bilingual field: ${field}`);
  return value;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function extractImageUrl(text) {
  if (!text) return '';
  const markdown = text.match(/!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/i);
  if (markdown) return markdown[1];
  const html = text.match(/<img[^>]+src=["'](https?:\/\/[^"']+)["']/i);
  if (html) return html[1];
  const bare = text.match(/https:\/\/[^\s<>()]+/i);
  return bare?.[0] || '';
}

async function downloadCover(url) {
  if (!url) return null;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    warnings.push('Cover URL is invalid; the default pixel cover will be used.');
    return null;
  }
  if (parsed.protocol !== 'https:' || !ALLOWED_COVER_HOSTS.has(parsed.hostname)) {
    warnings.push('Cover host is not on the allowlist; the default pixel cover will be used. Re-upload the image to GitHub.');
    return null;
  }

  let response;
  try {
    response = await fetch(parsed, {
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        Accept: 'image/avif,image/webp,image/png,image/jpeg,*/*;q=0.8',
        'User-Agent': 'mw-datasets-cover-bot',
      },
      redirect: 'follow',
    });
    if (!response.ok && (response.status === 401 || response.status === 403 || response.status === 404)) {
      response = await fetch(parsed, {
        headers: {
          Accept: 'image/avif,image/webp,image/png,image/jpeg,*/*;q=0.8',
          'User-Agent': 'mw-datasets-cover-bot',
        },
        redirect: 'follow',
      });
    }
  } catch (error) {
    warnings.push(`Cover download failed: ${error.message}`);
    return null;
  }

  if (!response.ok) {
    warnings.push(`Cover download failed with HTTP ${response.status}; default cover will be used.`);
    return null;
  }

  try {
    const finalUrl = new URL(response.url);
    if (!ALLOWED_COVER_HOSTS.has(finalUrl.hostname)) throw new Error('redirect host not allowed');
    const contentType = response.headers.get('content-type') || '';
    if (contentType && !contentType.startsWith('image/')) throw new Error('not an image');
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > 2 * 1024 * 1024) throw new Error('image too large (>2 MB)');
    return buffer;
  } catch (error) {
    warnings.push(`Cover rejected: ${error.message}; default cover will be used.`);
    return null;
  }
}

async function writeCover(buffer, slug) {
  const coverDir = path.join(ROOT, 'public', 'covers');
  await mkdir(coverDir, { recursive: true });
  const base = path.join(coverDir, slug);
  await sharp(buffer)
    .rotate()
    .resize(1280, 720, { fit: 'cover', position: 'attention' })
    .webp({ quality: 84, effort: 4 })
    .toFile(`${base}.webp`);
  await sharp(buffer)
    .rotate()
    .resize(640, 360, { fit: 'cover', position: 'attention' })
    .webp({ quality: 82, effort: 4 })
    .toFile(`${base}-thumb.webp`);
  const coverStat = await stat(`${base}.webp`);
  if (coverStat.size > 2 * 1024 * 1024) {
    throw new Error('Processed cover exceeds 2 MB. Use a simpler image or lower resolution.');
  }
  return {
    cover: `/covers/${slug}.webp`,
    coverThumb: `/covers/${slug}-thumb.webp`,
  };
}

async function findExistingIssueDataset(issueNumber) {
  const dir = path.join(ROOT, 'data', 'datasets');
  const files = await readdir(dir);
  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    try {
      const data = JSON.parse(await readFile(path.join(dir, file), 'utf8'));
      if (data.submission?.issueNumber === issueNumber) return data;
    } catch {
      // Other validation will catch malformed entries.
    }
  }
  return null;
}

function uniqueSlug(base, existing) {
  const dir = path.join(ROOT, 'data', 'datasets');
  const used = new Set(
    (existsSync(dir) ? readdirSync(dir) : []).map((file) => file.replace(/\.json$/, '')),
  );
  let candidate = base || `dataset-${ISSUE_NUMBER}`;
  let n = 2;
  while (used.has(candidate) && existing?.slug !== candidate) {
    candidate = `${base}-${n}`;
    n += 1;
  }
  return candidate;
}

function validateDataset(data, slug) {
  const valid = validate(data);
  if (!valid) {
    const details = (validate.errors || [])
      .map((error) => `${error.instancePath || '/'} ${error.message}`)
      .join('; ');
    throw new Error(`Dataset JSON failed schema validation: ${details}`);
  }
  const knownTags = (group) => new Set(options(group).map((entry) => entry.slug));
  const requireTags = (group, values, label) => {
    for (const value of values) {
      if (!knownTags(group).has(value)) throw new Error(`${label}: unknown tag ${value}`);
    }
  };
  requireTags('format', [data.format], 'format');
  requireTags('environment', [data.environment], 'environment');
  requireTags('verification', [data.compatibility.verification], 'verification');
  requireTags('streams', data.compatibility.streams, 'streams');
  requireTags('license', [data.license], 'license');
  requireTags('tasks', data.tags.tasks, 'tasks');
  requireTags('dimensions', data.tags.dimensions, 'dimensions');
  requireTags('trainingUses', data.tags.trainingUses, 'training uses');
  requireTags('quality', data.tags.quality, 'quality');
  requireTags('accessTypes', [data.access.type], 'access type');
  if (data.format === 'mwarecorder') {
    if (!data.compatibility.minecraftVersions.length) throw new Error('Mwarecorder needs a Minecraft version');
    if (!data.compatibility.modVersions?.length) throw new Error('Mwarecorder needs a recorder mod version');
    if (!data.compatibility.dataFormatVersion) throw new Error('Mwarecorder needs a data format version');
  }
  if (data.slug !== slug) throw new Error('Slug mismatch');
  return true;
}

async function parseSubmission(issue) {
  const body = issue.body || '';
  const sections = parseSections(body);
  const get = (fragment) => getSection(sections, fragment);

  const titleEn = get('english title');
  const titleZh = get('title (chinese');
  const summaryEn = get('english short description');
  const summaryZh = get('short description (chinese');
  if (!titleEn && !titleZh) throw new Error('A title is required in at least one language.');
  if (!summaryEn && !summaryZh) throw new Error('A short description is required in at least one language.');

  const license = resolveTag('license', get('license /'));
  const format = resolveTag('format', getSectionMatching(sections, (heading) => heading.startsWith('format /')));
  const verification = resolveTag('verification', get('verification /'));
  const environment = resolveTag('environment', get('environment /'));
  const accessType = resolveTag('accessTypes', get('access type'));
  if (!license) throw new Error('A valid license is required.');
  if (!format) throw new Error('A valid format is required.');
  if (!verification) throw new Error('A valid verification status is required.');
  if (!environment) throw new Error('A valid environment is required.');
  if (!accessType) throw new Error('A valid access type is required.');

  const streams = resolveChecked('streams', get('data streams'));
  if (!streams.length) throw new Error('Select at least one data stream.');
  const tasks = resolveChecked('tasks', get('task tags'));
  const dimensions = resolveChecked('dimensions', get('dimensions /'));
  const trainingUses = resolveChecked('trainingUses', get('training uses'));
  const quality = resolveChecked('quality', get('quality annotations'));
  if (!tasks.length) throw new Error('Select at least one task tag.');
  if (!dimensions.length) throw new Error('Select at least one dimension.');
  if (!trainingUses.length) throw new Error('Select at least one training use.');

  const accessFallback = accessType === 'open' ? 'download' : 'request';
  const accessLinks = parseLinks(get('download and access links'), accessFallback);
  if (!accessLinks.length) throw new Error('At least one valid https:// or mailto: link is required.');

  const howToLoad = localized(get('how to load (english'), get('how to load (chinese'), 'how to load');
  const recommendedUse = localized(
    get('recommended use (english'),
    get('recommended use (chinese'),
    'recommended use',
  );
  const limitations = localized(get('known limitations (english'), get('known limitations (chinese'), 'known limitations');
  const examples = parseLinks(get('example links'), 'homepage');

  const linkedContributors = String(get('additional contributors') || '')
    .split(',')
    .map((login) => login.trim().replace(/^@/, ''))
    .filter((login) => /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(login));
  const author = issue.user?.login || 'ghost';
  const contributors = [
    { github: author, roles: ['uploader', 'curator'] },
    ...linkedContributors
      .filter((login) => login.toLowerCase() !== author.toLowerCase())
      .map((github) => ({ github, roles: ['uploader'] })),
  ];

  const existing = await findExistingIssueDataset(issue.number);
  const slugBase = slugify(titleEn || titleZh) || `dataset-${issue.number}`;
  const slug = existing?.slug || uniqueSlug(slugBase, existing);
  const coverUrl = extractImageUrl(get('cover'));
  let coverBuffer = null;
  if (coverUrl) coverBuffer = await downloadCover(coverUrl);
  const cover = coverBuffer
    ? { cover: `/covers/${slug}.webp`, coverThumb: `/covers/${slug}-thumb.webp` }
    : existing?.cover
      ? {
          cover: existing.cover,
          coverThumb: existing.coverThumb || existing.cover.replace(/\.webp$/, '-thumb.webp'),
        }
      : {};

  const now = today();
  const minecraftVersions = get('minecraft version')
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value && !/not applicable|n\/a/i.test(value));
  const modVersions = get('recorder version')
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value && !/not applicable|n\/a/i.test(value));

  const dataset = {
    slug,
    title: localized(titleEn, titleZh, 'title'),
    summary: localized(summaryEn, summaryZh, 'summary'),
    license,
    ...(cover.cover ? { cover: cover.cover, coverThumb: cover.coverThumb } : {}),
    format,
    compatibility: {
      minecraftVersions,
      modVersions,
      loader: get('loader /') || null,
      dataFormatVersion: get('data format version') || null,
      verification,
      streams,
    },
    environment,
    scale: {
      episodes: Math.round(parseNumber(get('episode count'), 0)),
      bytes: Math.round(parseNumber(get('total size in gb'), 0) * 1024 ** 3),
      durationSeconds: Math.round(parseNumber(get('total duration in hours'), 0) * 3600),
    },
    tags: { tasks, dimensions, trainingUses, quality },
    access: {
      type: accessType,
      links: accessLinks,
      privacy: {
        personalData: parseBooleanAnswer(get('personal player data'), 'personal data'),
        thirdPartyContent: parseBooleanAnswer(get('third-party content'), 'third-party content'),
        redistributionPermitted: parseBooleanAnswer(get('redistribution permitted'), 'redistribution'),
      },
    },
    usage: { howToLoad, recommendedUse, limitations, examples },
    contributors,
    history: [
      {
        date: now,
        version: null,
        type: 'release',
        note: {
          en: `Initial listing converted from submission issue #${issue.number}.`,
          zh: `由提交 Issue #${issue.number} 自动转换的初始条目。`,
        },
        url: issue.html_url,
      },
    ],
    createdAt: issue.created_at?.slice(0, 10) || now,
    updatedAt: now,
    submission: {
      issueNumber: issue.number,
      submittedBy: author,
      source: 'issue-form',
    },
  };

  validateDataset(dataset, slug);
  return { kind: 'submission', dataset, slug, coverBuffer };
}

function immutableCorrection(base, incoming) {
  const immutable = [
    'slug',
    'cover',
    'coverThumb',
    'featured',
    'featuredRank',
    'demo',
    'contributors',
    'createdAt',
    'submission',
    'community',
  ];
  const result = { ...incoming };
  for (const key of immutable) {
    if (base[key] === undefined) delete result[key];
    else result[key] = base[key];
  }
  result.history = [...(base.history || [])];
  return result;
}

async function extractCorrectionJson(body, sections) {
  const marker = String(body || '').match(
    /<!--\s*mw-datasets-correction:start\s*-->\s*```json\s*([\s\S]*?)```\s*<!--\s*mw-datasets-correction:end\s*-->/i,
  );
  let raw = marker?.[1];
  if (!raw) {
    const field = getSection(sections, 'complete corrected json');
    const fenced = field.match(/```(?:json)?\s*([\s\S]*?)```/i);
    raw = fenced?.[1] || field;
  }
  if (!raw?.trim()) return null;
  return JSON.parse(raw);
}

async function parseCorrection(issue) {
  const sections = parseSections(issue.body || '');
  const parsed = await extractCorrectionJson(issue.body, sections);
  if (!parsed) throw new Error('Could not find the corrected JSON. Paste the complete JSON from the metadata editor.');
  const requestedSlug = getSection(sections, 'dataset slug') || parsed.slug;
  const slug = String(requestedSlug || parsed.slug || '').trim();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error('A valid dataset slug is required.');
  if (parsed.slug && parsed.slug !== slug) throw new Error('The JSON slug does not match the issue dataset slug.');

  const file = path.join(ROOT, 'data', 'datasets', `${slug}.json`);
  if (!existsSync(file)) throw new Error(`Dataset not found: ${slug}`);
  const base = JSON.parse(await readFile(file, 'utf8'));
  const next = immutableCorrection(base, parsed);
  const now = today();
  next.updatedAt = now;
  next.history.push({
    date: now,
    version: null,
    type: 'correction',
    note: {
      en: `Metadata correction from issue #${issue.number}.`,
      zh: `来自 Issue #${issue.number} 的元数据更正。`,
    },
    url: issue.html_url,
  });
  next.submission = {
    ...(base.submission || {}),
    issueNumber: base.submission?.issueNumber,
  };
  validateDataset(next, slug);
  return { kind: 'correction', dataset: next, slug, base };
}

async function processIssue(issue) {
  const labels = (issue.labels || []).map((label) => (typeof label === 'string' ? label : label.name));
  const title = issue.title || '';
  const body = issue.body || '';
  const isCorrection = labels.includes('dataset-correction') || title.startsWith('[Correction]') || body.includes('mw-datasets-correction:start');
  const isSubmission = !isCorrection && (labels.includes('dataset-submission') || title.startsWith('[Dataset]'));
  if (!isCorrection && !isSubmission) {
    log('Issue does not match a dataset template; nothing to do.');
    return;
  }
  if (issue.user?.type === 'Bot') {
    log('Ignoring bot-authored issue.');
    return;
  }

  log(`Processing ${isCorrection ? 'correction' : 'submission'} issue #${issue.number}`);
  const result = isCorrection ? await parseCorrection(issue) : await parseSubmission(issue);
  const branch = isCorrection ? `correction/issue-${issue.number}` : `dataset/issue-${issue.number}`;
  const file = path.join(ROOT, 'data', 'datasets', `${result.slug}.json`);

  // Check out the trusted default branch BEFORE writing generated files. A
  // re-run must never fight with local changes from a previous attempt.
  const defaultBranch = (await api(`/repos/${REPO}`)).default_branch || 'main';
  execFileSync('git', ['config', 'user.name', 'mw-datasets-bot'], { stdio: 'inherit' });
  execFileSync('git', ['config', 'user.email', 'mw-datasets-bot@users.noreply.github.com'], { stdio: 'inherit' });
  execFileSync('git', ['fetch', 'origin', defaultBranch], { stdio: 'inherit' });
  execFileSync('git', ['checkout', '-B', branch, `origin/${defaultBranch}`], { stdio: 'inherit' });

  if (result.coverBuffer) {
    const written = await writeCover(result.coverBuffer, result.slug);
    result.dataset.cover = written.cover;
    result.dataset.coverThumb = written.coverThumb;
  }

  await writeFile(file, `${JSON.stringify(result.dataset, null, 2)}\n`, 'utf8');
  validateDataset(result.dataset, result.slug);
  if (result.dataset.access.type === 'open' && result.dataset.access.privacy.personalData) {
    warnings.push('Open download with personalData=true: the contributor must justify or restrict this listing.');
  }
  if (result.dataset.access.type === 'open' && !result.dataset.access.privacy.redistributionPermitted) {
    warnings.push('Open download with redistributionPermitted=false is contradictory; review before merging.');
  }

  // Run the full repository validator (schema, tags, cover dimensions, limits
  // and cross-record references) before anything is committed.
  execFileSync(process.execPath, ['scripts/validate-data.mjs'], { stdio: 'inherit' });

  const coverFiles = result.dataset.cover
    ? [result.dataset.cover, result.dataset.coverThumb || result.dataset.cover.replace(/\.webp$/, '-thumb.webp')]
    : [];
  for (const coverFile of coverFiles) {
    if (!existsSync(path.join(ROOT, 'public', coverFile))) {
      warnings.push(`Expected cover missing: ${coverFile}`);
    }
  }

  const addPaths = [path.relative(ROOT, file), ...coverFiles.map((cover) => path.join('public', cover))];
  execFileSync('git', ['add', ...addPaths], { stdio: 'inherit' });
  const commitMessage = isCorrection
    ? `data: correct ${result.slug} from issue #${issue.number}`
    : `data: add ${result.slug} from issue #${issue.number}`;
  const staged = execFileSync('git', ['diff', '--cached', '--name-only'], { encoding: 'utf8' });
  if (!staged.trim()) {
    log('No changes to commit; the branch already matches the generated data.');
    return;
  }
  execFileSync('git', ['commit', '-m', commitMessage], { stdio: 'inherit' });
  execFileSync('git', ['push', '--force', 'origin', `HEAD:refs/heads/${branch}`], { stdio: 'inherit' });
  await markIssue(
    issue.number,
    isCorrection ? ['dataset-correction', 'automation', 'in-review'] : ['dataset-submission', 'automation', 'in-review'],
  );

  const titleText = isCorrection
    ? `fix(data): correct ${result.slug} (#${issue.number})`
    : `data: add ${result.slug} (#${issue.number})`;
  const coverStatus = isCorrection
    ? 'unchanged (metadata correction only)'
    : result.coverBuffer
      ? 'converted to WebP + thumbnail'
      : result.dataset.cover
        ? 'existing cover retained'
        : 'none supplied; the deterministic default cover will be used';
  const warningText = warnings.length
    ? `\n### Automation notes\n\n${warnings.map((warning) => `- ${warning}`).join('\n')}\n`
    : '';
  const prBody = [
    isCorrection ? '## Metadata correction' : '## New dataset submission',
    '',
    `Generated from #${issue.number} by the issue-to-pr workflow.`,
    '',
    `- Dataset: \`${result.slug}\``,
    `- JSON schema: validated`,
    `- Cover: ${coverStatus}`,
    `- Human review: required`,
    warningText,
    '### Review checklist',
    '',
    '- [ ] License and redistribution rights checked',
    '- [ ] Privacy answers checked',
    '- [ ] Links reachable without private credentials',
    '- [ ] Episode count, size and duration plausible',
    '- [ ] Known limitations meaningful',
    '',
    `Closes #${issue.number}`,
    '',
  ].join('\n');

  const [owner] = REPO.split('/');
  const existingPrs = await api(`/repos/${REPO}/pulls?state=open&head=${encodeURIComponent(`${owner}:${branch}`)}`);
  let pr;
  if (existingPrs.length) {
    pr = await api(`/repos/${REPO}/pulls/${existingPrs[0].number}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: titleText, body: prBody }),
    });
  } else {
    pr = await api(`/repos/${REPO}/pulls`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: titleText,
        head: branch,
        base: defaultBranch,
        body: prBody,
        draft: false,
      }),
    });
  }

  const marker = '<!-- mw-dataset-pr -->';
  const commentBody = [
    marker,
    `### ${isCorrection ? 'Correction' : 'Submission'} received`,
    '',
    `A pull request has been ${existingPrs.length ? 'updated' : 'opened'}: ${pr.html_url}`,
    '',
    result.dataset.cover ? 'Cover processed to WebP and a thumbnail.' : 'No cover supplied; a default pixel cover will be selected.',
    warnings.length ? `\nAutomation notes:\n${warnings.map((warning) => `- ${warning}`).join('\n')}` : '',
    '',
    'A maintainer will review the license, privacy disclosures and links before merging.',
  ].join('\n');
  const comments = await api(`/repos/${REPO}/issues/${issue.number}/comments?per_page=100`);
  const existingComment = comments.find((comment) => comment.body?.includes(marker));
  if (existingComment) {
    await api(`/repos/${REPO}/issues/comments/${existingComment.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: commentBody }),
    });
  } else {
    await api(`/repos/${REPO}/issues/${issue.number}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: commentBody }),
    });
  }
  log(`PR ready: ${pr.html_url}`);
}

async function main() {
  const issue = await api(`/repos/${REPO}/issues/${ISSUE_NUMBER}`);
  try {
    await processIssue(issue);
  } catch (error) {
    console.error(error);
    try {
      await api(`/repos/${REPO}/issues/${ISSUE_NUMBER}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body: [
            '<!-- mw-dataset-error -->',
            '### Automation could not process this issue',
            '',
            `\`\`\`\n${String(error.message || error).slice(0, 1800)}\n\`\`\``,
            '',
            'Fix the fields described above (or the cover), then edit the issue to run the workflow again. The metadata editor is often the quickest fix for corrections.',
          ].join('\n'),
        }),
      });
    } catch (commentError) {
      console.error('Could not comment on issue:', commentError);
    }
    process.exitCode = 1;
  }
}

await main();
