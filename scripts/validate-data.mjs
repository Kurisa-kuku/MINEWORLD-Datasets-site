#!/usr/bin/env node
/**
 * Validate every dataset JSON against the public schema and the tag vocabulary.
 *
 * Usage:
 *   node scripts/validate-data.mjs
 *   node scripts/validate-data.mjs --strict-warnings
 */
import { readFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import sharp from 'sharp';

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, 'data', 'datasets');
const SCHEMA_PATH = path.join(ROOT, 'schemas', 'dataset.schema.json');
const TAGS_PATH = path.join(ROOT, 'data', 'tags.json');
const strictWarnings = process.argv.includes('--strict-warnings');

const errors = [];
const warnings = [];

function error(file, message) {
  errors.push(`${file}: ${message}`);
}
function warn(file, message) {
  warnings.push(`${file}: ${message}`);
}

const [schema, tags] = await Promise.all([
  readFile(SCHEMA_PATH, 'utf8').then(JSON.parse),
  readFile(TAGS_PATH, 'utf8').then(JSON.parse),
]);

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(schema);

const tagGroups = [
  'format',
  'environment',
  'verification',
  'streams',
  'license',
  'tasks',
  'dimensions',
  'trainingUses',
  'quality',
  'accessTypes',
  'linkTypes',
  'contributorRoles',
];
const tagSlugs = Object.fromEntries(
  tagGroups.map((group) => [group, new Set((tags[group] ?? []).map((item) => item.slug))]),
);

const files = (await readdir(DATA_DIR)).filter((file) => file.endsWith('.json')).sort();
if (files.length === 0) console.log('No dataset records yet; validating the vocabulary and default covers.');

const datasets = [];
for (const file of files) {
  const fullPath = path.join(DATA_DIR, file);
  let data;
  try {
    data = JSON.parse(await readFile(fullPath, 'utf8'));
  } catch (cause) {
    error(file, `invalid JSON: ${cause.message}`);
    continue;
  }
  datasets.push({ file, data });
}

const slugs = new Map();
const issueNumbers = new Map();

for (const { file, data } of datasets) {
  const valid = validate(data);
  if (!valid) {
    for (const issue of validate.errors ?? []) {
      error(file, `${issue.instancePath || '/'} ${issue.message}`);
    }
    continue;
  }

  const expected = `${data.slug}.json`;
  if (file !== expected) error(file, `filename must be ${expected} (slug-derived)`);

  if (slugs.has(data.slug)) error(file, `duplicate slug ${data.slug} (also in ${slugs.get(data.slug)})`);
  slugs.set(data.slug, file);

  if (data.submission?.issueNumber) {
    const seen = issueNumbers.get(data.submission.issueNumber);
    if (seen) error(file, `submission issue #${data.submission.issueNumber} already used by ${seen}`);
    issueNumbers.set(data.submission.issueNumber, file);
  }

  const checkTags = (group, values, label) => {
    for (const value of values ?? []) {
      if (!tagSlugs[group].has(value)) error(file, `${label} uses unknown ${group} slug "${value}"`);
    }
  };
  checkTags('format', [data.format], 'format');
  checkTags('environment', [data.environment], 'environment');
  checkTags('verification', [data.compatibility.verification], 'compatibility.verification');
  checkTags('streams', data.compatibility.streams, 'compatibility.streams');
  checkTags('license', [data.license], 'license');
  checkTags('tasks', data.tags.tasks, 'tags.tasks');
  checkTags('dimensions', data.tags.dimensions, 'tags.dimensions');
  checkTags('trainingUses', data.tags.trainingUses, 'tags.trainingUses');
  checkTags('quality', data.tags.quality, 'tags.quality');
  checkTags('accessTypes', [data.access.type], 'access.type');
  checkTags('linkTypes', [...data.access.links, ...data.usage.examples].map((link) => link.kind), 'link.kind');

  for (const contributor of data.contributors) {
    checkTags('contributorRoles', contributor.roles, 'contributors.roles');
  }

  if (data.updatedAt < data.createdAt) error(file, 'updatedAt cannot be earlier than createdAt');

  for (const entry of data.history) {
    if (entry.date > data.updatedAt) {
      warn(file, `history entry ${entry.date} is newer than updatedAt ${data.updatedAt}`);
    }
  }

  if (data.format === 'mwarecorder') {
    if (!data.compatibility.minecraftVersions?.length) error(file, 'Mwarecorder requires minecraftVersions');
    if (!data.compatibility.modVersions?.length) error(file, 'Mwarecorder requires modVersions');
    if (!data.compatibility.dataFormatVersion) error(file, 'Mwarecorder requires dataFormatVersion');
    if (!data.compatibility.streams.includes('state')) {
      warn(file, 'Mwarecorder dataset has no state stream');
    }
  }

  if (data.deprecation?.status === 'superseded') {
    const replacement = data.deprecation.replacedBy;
    if (!replacement) error(file, 'superseded dataset must set replacedBy');
    else if (!existsSync(path.join(DATA_DIR, `${replacement}.json`))) {
      error(file, `replacedBy target "${replacement}" does not exist`);
    }
  }

  if ((data.access.type === 'request' || data.access.type === 'restricted') &&
      !data.access.links.some((link) => link.kind === 'request')) {
    warn(file, `${data.access.type} access should include a request-kind link`);
  }

  if (data.access.type === 'open' && data.access.privacy.personalData) {
    warn(file, 'open download + personalData=true needs a privacy justification');
  }

  if (data.access.type === 'open' && !data.access.privacy.redistributionPermitted) {
    warn(file, 'open download + redistributionPermitted=false is contradictory');
  }

  if (data.cover) {
    const coverPath = path.join(ROOT, 'public', data.cover.replace(/^\//, ''));
    if (!existsSync(coverPath)) {
      error(file, `cover file not found: public${data.cover}`);
    } else {
      try {
        const [meta, fileMeta] = await Promise.all([sharp(coverPath).metadata(), stat(coverPath)]);
        if (fileMeta.size > 2 * 1024 * 1024) error(file, `cover exceeds 2 MB (${fileMeta.size} bytes)`);
        if (meta.width && meta.height) {
          const ratio = meta.width / meta.height;
          if (Math.abs(ratio - 16 / 9) > 0.02) {
            error(file, `cover is ${meta.width}x${meta.height}; expected 16:9`);
          }
        }
      } catch (cause) {
        error(file, `cover could not be decoded: ${cause.message}`);
      }
    }

    const thumbPath = data.coverThumb
      ? path.join(ROOT, 'public', data.coverThumb.replace(/^\//, ''))
      : coverPath.replace(/\.webp$/, '-thumb.webp');
    if (!existsSync(thumbPath)) error(file, `cover thumbnail not found: ${thumbPath}`);
  } else if (data.coverThumb) {
    error(file, 'coverThumb requires cover');
  }
}

const known = new Set(datasets.map(({ data }) => data.slug));
for (const { file, data } of datasets) {
  if (data.deprecation?.replacedBy && !known.has(data.deprecation.replacedBy)) {
    error(file, `replacedBy target "${data.deprecation.replacedBy}" is not a known dataset`);
  }
}

for (const file of ['default-grass', 'default-netherrack', 'default-endstone', 'default-amethyst']) {
  for (const suffix of ['', '-thumb']) {
    if (!existsSync(path.join(ROOT, 'public', 'covers', `${file}${suffix}.webp`))) {
      error('public/covers', `missing default cover ${file}${suffix}.webp`);
    }
  }
}

if (warnings.length) {
  console.log(`\n${warnings.length} warning(s):`);
  for (const message of warnings) console.log(`  ! ${message}`);
}

if (errors.length) {
  console.error(`\n${errors.length} error(s):`);
  for (const message of errors) console.error(`  x ${message}`);
  process.exit(1);
}

if (strictWarnings && warnings.length) {
  console.error('\n--strict-warnings is set; failing on warnings.');
  process.exit(1);
}

console.log(`\nValidated ${datasets.length} dataset(s) — schema, tags, covers, references OK.`);
