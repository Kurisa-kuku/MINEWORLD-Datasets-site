export type Locale = 'en' | 'zh';

export interface Localized {
  en?: string;
  zh?: string;
}

export interface TagDefinition {
  slug: string;
  name: Localized;
  description?: Localized;
  short?: Localized;
  tone?: TagTone;
  color?: string;
  url?: string | null;
  open?: boolean;
  minBytes?: number;
  maxBytes?: number | null;
}

export type TagTone = 'grass' | 'stone' | 'sky' | 'amethyst' | 'gold' | 'nether' | 'end' | 'red';

export interface LinkItem {
  label: string;
  url: string;
  kind: LinkKind;
}

export type LinkKind =
  | 'download'
  | 'mirror'
  | 'request'
  | 'sample'
  | 'homepage'
  | 'paper'
  | 'benchmark';

export type FormatSlug = 'mwarecorder' | 'minecraft-replay' | 'raw-video' | 'custom-dataset' | 'other';
export type EnvironmentSlug = 'singleplayer' | 'multiplayer' | 'mixed' | 'server' | 'custom-map';
export type VerificationSlug = 'verified' | 'self-reported' | 'unverified' | 'not-applicable';
export type AccessType = 'open' | 'request' | 'restricted';
export type StreamSlug = 'video' | 'state' | 'action' | 'events';
export type TaskSlug =
  | 'building'
  | 'mining'
  | 'combat'
  | 'exploration'
  | 'farming'
  | 'crafting'
  | 'redstone'
  | 'navigation'
  | 'survival'
  | 'trading'
  | 'fishing'
  | 'parkour'
  | 'pvp'
  | 'speedrun';
export type DimensionSlug = 'overworld' | 'nether' | 'end' | 'mixed' | 'superflat';
export type TrainingUseSlug =
  | 'world-model'
  | 'imitation-learning'
  | 'offline-rl'
  | 'video-prediction'
  | 'agent-benchmark'
  | 'representation-learning'
  | 'navigation'
  | 'planning';
export type QualitySlug =
  | 'strict-verified'
  | 'alignment-checked'
  | 'community-reviewed'
  | 'clean-controls'
  | 'redacted'
  | 'needs-review'
  | 'experimental';
export type LicenseSlug =
  | 'cc-by-4.0'
  | 'cc-by-sa-4.0'
  | 'cc0-1.0'
  | 'mit'
  | 'apache-2.0'
  | 'odc-by-1.0'
  | 'research-only'
  | 'all-rights-reserved'
  | 'other';

export interface Contributor {
  github: string;
  roles: Array<'uploader' | 'curator' | 'annotator' | 'maintainer'>;
  note?: string;
}

export interface HistoryEntry {
  date: string;
  version?: string | null;
  type: 'release' | 'metadata' | 'correction' | 'deprecation';
  note: Localized;
  url?: string;
}

export interface Dataset {
  slug: string;
  title: Localized;
  summary: Localized;
  license: LicenseSlug;
  cover?: string;
  coverThumb?: string;
  featured?: boolean;
  featuredRank?: number;
  demo?: boolean;
  format: FormatSlug;
  compatibility: {
    minecraftVersions: string[];
    modVersions?: string[];
    loader?: string | null;
    dataFormatVersion?: string | null;
    verification: VerificationSlug;
    streams: StreamSlug[];
  };
  environment: EnvironmentSlug;
  scale: {
    episodes: number;
    bytes: number;
    durationSeconds: number;
  };
  tags: {
    tasks: TaskSlug[];
    dimensions: DimensionSlug[];
    trainingUses: TrainingUseSlug[];
    quality: QualitySlug[];
  };
  access: {
    type: AccessType;
    links: LinkItem[];
    privacy: {
      personalData: boolean;
      thirdPartyContent: boolean;
      redistributionPermitted: boolean;
    };
  };
  usage: {
    howToLoad: Localized;
    recommendedUse: Localized;
    limitations: Localized;
    examples: LinkItem[];
  };
  contributors: Contributor[];
  history: HistoryEntry[];
  deprecation?: {
    status: 'active' | 'deprecated' | 'superseded';
    replacedBy?: string | null;
    note?: Localized;
  };
  createdAt: string;
  updatedAt: string;
  submission?: {
    issueNumber?: number;
    submittedBy?: string;
    source?: 'issue-form' | 'web-editor' | 'manual';
  };
  community?: {
    issueNumber?: number;
    discussionUrl?: string;
  };
}

export interface TagVocabulary {
  groups: Record<string, Localized>;
  format: TagDefinition[];
  environment: TagDefinition[];
  verification: TagDefinition[];
  streams: TagDefinition[];
  license: TagDefinition[];
  tasks: TagDefinition[];
  dimensions: TagDefinition[];
  trainingUses: TagDefinition[];
  quality: TagDefinition[];
  accessTypes: TagDefinition[];
  linkTypes: TagDefinition[];
  contributorRoles: TagDefinition[];
  sizeRanges: TagDefinition[];
  sort: TagDefinition[];
}

export interface CommunityStat {
  issueNumber?: number;
  likes: number;
  comments: number;
  updatedAt?: string;
}

export type CommunityStats = Record<string, CommunityStat>;

export interface DatasetFilters {
  q: string;
  format: string[];
  mc: string[];
  mod: string[];
  env: string[];
  verify: string[];
  task: string[];
  dim: string[];
  use: string[];
  quality: string[];
  license: string[];
  size: string[];
  video: boolean;
  events: boolean;
  access: string[];
  sort: SortSlug;
}

export type SortSlug = 'latest' | 'updated' | 'likes' | 'comments' | 'size';

export interface DatasetWithMeta extends Dataset {
  meta: {
    title: string;
    summary: string;
    fallback: boolean;
    hasTranslationGap: boolean;
    cover: string;
    coverThumb: string;
    primaryTask?: TaskSlug;
    likeCount: number;
    commentCount: number;
    issueNumber?: number;
    sizeRange: string;
    streamSet: Set<StreamSlug>;
    searchText: string;
  };
}
