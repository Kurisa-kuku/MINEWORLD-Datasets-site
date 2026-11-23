import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import type { Lang } from '../config';
import { datasetHasTranslationGap, localize } from '../i18n';
import type {
  CommunityStat,
  CommunityStats,
  Contributor,
  Dataset,
  DatasetWithMeta,
  TagDefinition,
  TagTone,
  TagVocabulary,
} from './types';

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, 'data', 'datasets');
const SCHEMA_PATH = path.join(ROOT, 'schemas', 'dataset.schema.json');
const TAGS_PATH = path.join(ROOT, 'data', 'tags.json');
const STATS_PATH = path.join(ROOT, 'data', 'community', 'stats.json');

const DEFAULT_COVERS = [
  { cover: '/covers/default-grass.webp', thumb: '/covers/default-grass-thumb.webp' },
  { cover: '/covers/default-netherrack.webp', thumb: '/covers/default-netherrack-thumb.webp' },
  { cover: '/covers/default-endstone.webp', thumb: '/covers/default-endstone-thumb.webp' },
  { cover: '/covers/default-amethyst.webp', thumb: '/covers/default-amethyst-thumb.webp' },
];

export const TAG_TONES: TagTone[] = ['grass', 'stone', 'sky', 'amethyst', 'gold', 'nether', 'end', 'red'];

interface JsonSchemaError {
  instancePath: string;
  message?: string;
}

let vocabularyCache: TagVocabulary | undefined;
let rawDatasetsCache: Dataset[] | undefined;
let statsCache: CommunityStats | undefined;
let ajvValidate: ReturnType<Ajv['compile']> | undefined;

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(file, 'utf8')) as T;
}

export function getVocabulary(): TagVocabulary {
  if (!vocabularyCache) {
    vocabularyCache = readJson<TagVocabulary>(TAGS_PATH);
  }
  return vocabularyCache;
}

const tagCache = new Map<string, Map<string, TagDefinition>>();

export function getTagDefinitions(group: string): TagDefinition[] {
  const vocab = getVocabulary();
  const value = (vocab as unknown as Record<string, unknown>)[group];
  return Array.isArray(value) ? (value as TagDefinition[]) : [];
}

export function getTag(group: string, slug: string | undefined): TagDefinition | undefined {
  if (!slug) return undefined;
  let map = tagCache.get(group);
  if (!map) {
    map = new Map(getTagDefinitions(group).map((entry) => [entry.slug, entry]));
    tagCache.set(group, map);
  }
  return map.get(slug);
}

export function getTagName(group: string, slug: string, lang: Lang): string {
  const definition = getTag(group, slug);
  if (!definition) return slug;
  return localize(definition.name, lang).text || slug;
}

export function getGroupLabel(group: string, lang: Lang): string {
  const labels = getVocabulary().groups?.[group];
  return labels ? localize(labels, lang).text || group : group;
}

export function getDefaultCover(slug: string): { cover: string; thumb: string } {
  let hash = 2166136261;
  for (let i = 0; i < slug.length; i += 1) {
    hash ^= slug.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return DEFAULT_COVERS[(hash >>> 0) % DEFAULT_COVERS.length];
}

function getStats(): CommunityStats {
  if (!statsCache) {
    statsCache = existsSync(STATS_PATH) ? readJson<CommunityStats>(STATS_PATH) : {};
  }
  return statsCache;
}

function validateRawDatasets(): Dataset[] {
  if (rawDatasetsCache) return rawDatasetsCache;
  if (!ajvValidate) {
    const ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(ajv);
    ajvValidate = ajv.compile(readJson<object>(SCHEMA_PATH));
  }

  const files = readdirSync(DATA_DIR)
    .filter((file) => file.endsWith('.json'))
    .sort();
  const datasets: Dataset[] = [];
  const seen = new Set<string>();
  const vocab = getVocabulary();

  for (const file of files) {
    const data = readJson<Dataset>(path.join(DATA_DIR, file));
    const valid = ajvValidate(data);
    if (!valid) {
      const details = (ajvValidate.errors as JsonSchemaError[])
        .map((entry) => `${entry.instancePath || '/'} ${entry.message}`)
        .join('; ');
      throw new Error(`Invalid dataset ${file}: ${details}`);
    }
    if (seen.has(data.slug)) throw new Error(`Duplicate dataset slug: ${data.slug}`);
    if (file !== `${data.slug}.json`) {
      throw new Error(`Dataset file ${file} must be named ${data.slug}.json`);
    }
    seen.add(data.slug);

    const check = (group: string, values: string[], label: string) => {
      const known = new Set(((vocab as unknown as Record<string, TagDefinition[]>)[group] ?? []).map((item) => item.slug));
      for (const value of values) {
        if (!known.has(value)) throw new Error(`${file}: ${label} uses unknown tag "${value}"`);
      }
    };

    check('format', [data.format], 'format');
    check('environment', [data.environment], 'environment');
    check('verification', [data.compatibility.verification], 'verification');
    check('streams', data.compatibility.streams, 'streams');
    check('license', [data.license], 'license');
    check('tasks', data.tags.tasks, 'tasks');
    check('dimensions', data.tags.dimensions, 'dimensions');
    check('trainingUses', data.tags.trainingUses, 'trainingUses');
    check('quality', data.tags.quality, 'quality');
    check('accessTypes', [data.access.type], 'access');
    check('linkTypes', [...data.access.links, ...data.usage.examples].map((link) => link.kind), 'link kind');
    for (const contributor of data.contributors) {
      check('contributorRoles', contributor.roles, 'contributor role');
    }

    if (data.cover && !existsSync(path.join(ROOT, 'public', data.cover.replace(/^\//, '')))) {
      throw new Error(`${file}: cover file public${data.cover} does not exist`);
    }

    datasets.push(data);
  }

  rawDatasetsCache = datasets;
  return datasets;
}

export function getRawDatasets(): Dataset[] {
  return [...validateRawDatasets()];
}

export function getRawDataset(slug: string): Dataset | undefined {
  return validateRawDatasets().find((dataset) => dataset.slug === slug);
}

function sizeBucket(bytes: number): string {
  const ranges = getTagDefinitions('sizeRanges');
  for (const range of ranges) {
    const min = range.minBytes ?? 0;
    const max = range.maxBytes ?? Number.POSITIVE_INFINITY;
    if (bytes >= min && bytes < max) return range.slug;
  }
  return ranges[ranges.length - 1]?.slug ?? '50gb-plus';
}

function buildSearchText(data: Dataset, lang: Lang): string {
  const vocab = getVocabulary();
  const tagText: string[] = [];
  for (const group of ['tasks', 'dimensions', 'trainingUses', 'quality'] as const) {
    for (const slug of data.tags[group]) {
      const definition = getTag(group, slug);
      if (definition) tagText.push(definition.name.en ?? '', definition.name.zh ?? '', slug);
    }
  }
  const contributors = data.contributors.map((entry) => entry.github);
  return [
    data.slug,
    data.title.en,
    data.title.zh,
    data.summary.en,
    data.summary.zh,
    data.compatibility.minecraftVersions.join(' '),
    data.compatibility.modVersions?.join(' ') ?? '',
    data.access.links.map((link) => link.label).join(' '),
    getTagName('format', data.format, lang),
    getTagName('license', data.license, lang),
    ...tagText,
    ...contributors,
    vocab.format.find((item) => item.slug === data.format)?.name.zh ?? '',
  ]
    .join(' ')
    .toLocaleLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function decorateDataset(data: Dataset, lang: Lang): DatasetWithMeta {
  const title = localize(data.title, lang);
  const summary = localize(data.summary, lang);
  const defaultCover = getDefaultCover(data.slug);
  let coverThumb = data.coverThumb;
  if (data.cover && !coverThumb) coverThumb = data.cover.replace(/\.webp$/, '-thumb.webp');
  if (!data.cover) coverThumb = defaultCover.thumb;

  const stat: CommunityStat = getStats()[data.slug] ?? { likes: 0, comments: 0 };
  const issueNumber = data.community?.issueNumber ?? stat.issueNumber;

  return {
    ...data,
    meta: {
      title: title.text || data.slug,
      summary: summary.text,
      fallback: title.fallback || summary.fallback,
      hasTranslationGap: datasetHasTranslationGap(data, lang),
      cover: data.cover || defaultCover.cover,
      coverThumb: coverThumb || defaultCover.thumb,
      primaryTask: data.tags.tasks[0],
      likeCount: stat.likes ?? 0,
      commentCount: stat.comments ?? 0,
      issueNumber,
      sizeRange: sizeBucket(data.scale.bytes),
      streamSet: new Set(data.compatibility.streams),
      searchText: buildSearchText(data, lang),
    },
  };
}

export function getAllDatasets(lang: Lang): DatasetWithMeta[] {
  return validateRawDatasets().map((dataset) => decorateDataset(dataset, lang));
}

export function getDataset(slug: string, lang: Lang): DatasetWithMeta | undefined {
  const raw = getRawDataset(slug);
  return raw ? decorateDataset(raw, lang) : undefined;
}

export function getFeaturedDatasets(lang: Lang, limit = 3): DatasetWithMeta[] {
  return getAllDatasets(lang)
    .filter((dataset) => dataset.featured && dataset.deprecation?.status !== 'superseded')
    .sort((a, b) => (a.featuredRank ?? 99) - (b.featuredRank ?? 99))
    .slice(0, limit);
}

export function getLatestDatasets(lang: Lang, limit = 6): DatasetWithMeta[] {
  return getAllDatasets(lang)
    .filter((dataset) => dataset.deprecation?.status !== 'superseded')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, limit);
}

export function getRelatedDatasets(dataset: DatasetWithMeta, lang: Lang, limit = 3): DatasetWithMeta[] {
  const candidates = getAllDatasets(lang).filter(
    (candidate) => candidate.slug !== dataset.slug && candidate.deprecation?.status !== 'superseded',
  );

  const score = (candidate: DatasetWithMeta): number => {
    let value = 0;
    value += candidate.tags.tasks.filter((tag) => dataset.tags.tasks.includes(tag)).length * 3;
    value += candidate.tags.dimensions.filter((tag) => dataset.tags.dimensions.includes(tag)).length * 2;
    value += candidate.tags.trainingUses.filter((tag) => dataset.tags.trainingUses.includes(tag)).length * 2;
    value += candidate.format === dataset.format ? 2 : 0;
    value += candidate.environment === dataset.environment ? 1 : 0;
    return value;
  };

  return candidates
    .map((candidate) => ({ candidate, score: score(candidate) }))
    .sort((a, b) => b.score - a.score || b.candidate.updatedAt.localeCompare(a.candidate.updatedAt))
    .slice(0, limit)
    .map((entry) => entry.candidate);
}

export interface LibraryFacets {
  minecraftVersions: string[];
  modVersions: string[];
  licenses: string[];
  formats: string[];
  environments: string[];
  verifications: string[];
  tasks: string[];
  dimensions: string[];
  trainingUses: string[];
  qualities: string[];
  accessTypes: string[];
}

export function getFacets(): LibraryFacets {
  const datasets = validateRawDatasets();
  const unique = (values: string[]): string[] => [...new Set(values)].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  return {
    minecraftVersions: unique(datasets.flatMap((dataset) => dataset.compatibility.minecraftVersions)),
    modVersions: unique(datasets.flatMap((dataset) => dataset.compatibility.modVersions ?? [])),
    licenses: unique(datasets.map((dataset) => dataset.license)),
    formats: unique(datasets.map((dataset) => dataset.format)),
    environments: unique(datasets.map((dataset) => dataset.environment)),
    verifications: unique(datasets.map((dataset) => dataset.compatibility.verification)),
    tasks: unique(datasets.flatMap((dataset) => dataset.tags.tasks)),
    dimensions: unique(datasets.flatMap((dataset) => dataset.tags.dimensions)),
    trainingUses: unique(datasets.flatMap((dataset) => dataset.tags.trainingUses)),
    qualities: unique(datasets.flatMap((dataset) => dataset.tags.quality)),
    accessTypes: unique(datasets.map((dataset) => dataset.access.type)),
  };
}

export interface LibraryTotals {
  datasets: number;
  episodes: number;
  durationSeconds: number;
  bytes: number;
  contributors: number;
}

export function getLibraryTotals(): LibraryTotals {
  const datasets = validateRawDatasets();
  return {
    datasets: datasets.length,
    episodes: datasets.reduce((total, dataset) => total + dataset.scale.episodes, 0),
    durationSeconds: datasets.reduce((total, dataset) => total + dataset.scale.durationSeconds, 0),
    bytes: datasets.reduce((total, dataset) => total + dataset.scale.bytes, 0),
    contributors: new Set(datasets.flatMap((dataset) => dataset.contributors.map((entry) => entry.github.toLowerCase()))).size,
  };
}

export interface ContributorAggregate {
  github: string;
  roles: string[];
  datasets: Array<{ slug: string; title: string; cover: string }>;
  datasetCount: number;
}

export function getContributors(lang: Lang, role?: string): ContributorAggregate[] {
  const all = getAllDatasets(lang);
  const map = new Map<string, ContributorAggregate>();
  const roleOrder = getTagDefinitions('contributorRoles').map((roleTag) => roleTag.slug);

  for (const dataset of all) {
    for (const contributor of dataset.contributors as Contributor[]) {
      const key = contributor.github.toLowerCase();
      const existing = map.get(key) ?? {
        github: contributor.github,
        roles: [],
        datasets: [],
        datasetCount: 0,
      };
      for (const item of contributor.roles) {
        if (!existing.roles.includes(item)) existing.roles.push(item);
      }
      existing.datasets.push({ slug: dataset.slug, title: dataset.meta.title, cover: dataset.meta.cover });
      existing.datasetCount = existing.datasets.length;
      map.set(key, existing);
    }
  }

  return [...map.values()]
    .filter((contributor) => !role || contributor.roles.includes(role))
    .map((contributor) => ({
      ...contributor,
      roles: contributor.roles.sort((a, b) => roleOrder.indexOf(a) - roleOrder.indexOf(b)),
    }))
    .sort((a, b) => b.datasetCount - a.datasetCount || a.github.localeCompare(b.github));
}

export function getLatestUpdateDate(): string {
  return validateRawDatasets()
    .map((dataset) => dataset.updatedAt)
    .sort()
    .at(-1) ?? new Date().toISOString().slice(0, 10);
}
