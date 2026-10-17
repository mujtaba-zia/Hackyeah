// The contract every layer agrees on. No DOM, no Node, no three.js in here:
// providers produce a Snapshot, core turns it into a CityModel, the server
// ships it, the browser draws it.

export type ProviderKind = "mock" | "azure" | "github";

/** ISO-8601 timestamp string. */
export type Iso = string;

// ---------------------------------------------------------------- snapshot

export interface RepoInfo {
  /** Provider-prefixed and globally unique, e.g. `gh:octo/app`, `az:<guid>`, `mock:payments`. */
  id: string;
  name: string;
  /** ADO project, GitHub owner, or mock group. */
  project: string;
  url?: string;
  defaultBranch?: string;
}

export type ReviewVerdict = "none" | "approved" | "changesRequested" | "waitingOnAuthor" | "rejected";
export type CheckState = "none" | "pending" | "success" | "failure";

export interface PullRequestInfo {
  id: string;
  repoId: string;
  number: number;
  title: string;
  author: string;
  url?: string;
  draft: boolean;
  createdAt: Iso;
  updatedAt?: Iso;
  /** Number of reviewers assigned or requested. */
  reviewers: number;
  verdict: ReviewVerdict;
  hasConflicts: boolean;
  checks: CheckState;
}

export type RunResult = "success" | "failure" | "partial" | "cancelled" | "running" | "queued" | "none";

export interface PipelineRun {
  id: string;
  result: RunResult;
  startedAt?: Iso;
  finishedAt?: Iso;
  branch?: string;
  url?: string;
}

export type PipelineKind = "ci" | "release";

export interface PipelineInfo {
  id: string;
  name: string;
  /** Repo whose definition/workflow file owns it; null when unknown. */
  homeRepoId: string | null;
  /** Every repo this pipeline builds or ships, home included. */
  coversRepoIds: string[];
  kind: PipelineKind;
  url?: string;
  /** Newest first, at most 10. */
  runs: PipelineRun[];
}

export interface Snapshot {
  provider: ProviderKind;
  fetchedAt: Iso;
  repos: RepoInfo[];
  pullRequests: PullRequestInfo[];
  pipelines: PipelineInfo[];
}

// ---------------------------------------------------------------- config

export type RuleId =
  | "pipelineFailing"
  | "sharedOutage"
  | "reviewCrowd"
  | "draftPileup"
  | "stalePrs"
  | "staleRelease"
  | "meltdown";

export const RULE_IDS: readonly RuleId[] = [
  "pipelineFailing",
  "sharedOutage",
  "reviewCrowd",
  "draftPileup",
  "stalePrs",
  "staleRelease",
  "meltdown",
];

export interface Thresholds {
  staleDays: number;
  waitingHours: number;
  crowdSize: number;
  draftPileup: number;
  failStreakHot: number;
  releaseStaleDays: number;
}

/** Everything the user can change at runtime. Never contains secrets. */
export interface AppConfig {
  provider: ProviderKind;
  /** Mock scenario name; ignored by other providers. */
  scenario: string;
  /** null = watch every repo (up to maxRepos, by name). */
  watchedRepoIds: string[] | null;
  maxRepos: number;
  maxPrsPerRepo: number;
  pollSeconds: number;
  thresholds: Thresholds;
  rules: Record<RuleId, boolean>;
  /** Pipeline name -> extra repo names it covers (beyond its home repo). */
  coverage: Record<string, string[]>;
}

// ---------------------------------------------------------------- city model

/** World units on the ground plane. Islands sit at y = 0. */
export interface Vec2 {
  x: number;
  z: number;
}

export type IslandKind = "district" | "outskirts" | "filler";

export interface Island {
  /** District islands reuse the repo id; outskirts is `outskirts`; fillers `filler:<n>`. */
  id: string;
  kind: IslandKind;
  /** Minimum corner. */
  origin: Vec2;
  size: Vec2;
  /** Stable per island, for scenery/rock variation. */
  seed: number;
}

export type Health = "good" | "warn" | "bad";

export interface District {
  /** = repo id = island id. */
  id: string;
  name: string;
  project: string;
  url?: string;
  health: Health;
  hq: Vec2;
  plaza: { center: Vec2; radius: number };
  nursery: { center: Vec2; radius: number };
  openPrs: number;
  draftPrs: number;
}

export type Mood = "egg" | "fresh" | "waiting" | "approved" | "changes" | "stale" | "blocked" | "rejected";
export type Zone = "plaza" | "nursery";

export interface Creature {
  /** = pull request id. */
  id: string;
  districtId: string;
  zone: Zone;
  home: Vec2;
  mood: Mood;
  checks: CheckState;
  number: number;
  title: string;
  author: string;
  ageHours: number;
  url?: string;
}

export interface Tower {
  /** = pipeline id. */
  id: string;
  name: string;
  /** Island it stands on: a district id or `outskirts`. */
  islandId: string;
  position: Vec2;
  kind: PipelineKind;
  status: RunResult;
  failStreak: number;
  /** Newest first, at most 10. */
  history: { result: RunResult; finishedAt?: Iso; url?: string }[];
  coversDistrictIds: string[];
  url?: string;
}

export interface Link {
  /** `<towerId>-><districtId>` */
  id: string;
  towerId: string;
  districtId: string;
  from: Vec2;
  to: Vec2;
  broken: boolean;
}

export interface Bridge {
  id: string;
  from: Vec2;
  to: Vec2;
}

export type Severity = "critical" | "error" | "warning";
export type EffectKind = "fire" | "smoke" | "crowd" | "storm" | "beacon" | "giant";

export interface Incident {
  /** `<ruleId>:<primary target id>`, stable across updates. */
  id: string;
  ruleId: RuleId;
  severity: Severity;
  title: string;
  detail: string;
  effect: EffectKind;
  targets: { districts: string[]; towers: string[]; creatures: string[] };
  /** Where the camera should look. */
  focus: Vec2;
}

export interface CityModel {
  generatedAt: Iso;
  /** Bounding box of every island, from (0,0). */
  worldSize: Vec2;
  islands: Island[];
  districts: District[];
  creatures: Creature[];
  towers: Tower[];
  links: Link[];
  bridges: Bridge[];
  /** Sorted critical → error → warning, then title. */
  incidents: Incident[];
}

// ---------------------------------------------------------------- server state

export type SyncPhase = "loading" | "ok" | "error" | "throttled";

export interface ServerStatus {
  provider: ProviderKind;
  phase: SyncPhase;
  /** Human-readable, no secrets. Present on error/throttled. */
  message?: string;
  lastSuccessAt?: Iso;
  nextPollAt?: Iso;
}

export interface RepoChoice {
  id: string;
  name: string;
  project: string;
}

/** What every browser tab receives. */
export interface ClientState {
  config: AppConfig;
  status: ServerStatus;
  /** null until the first successful fetch. */
  city: CityModel | null;
  /** Every repo the provider can see, for the watch list. */
  repoCatalog: RepoChoice[];
  scenarios: string[];
  /** Which providers have credentials on the server. Mock is always true. */
  available: Record<ProviderKind, boolean>;
  /** Human-readable label for the data source, e.g. scenario, org, owner. */
  sourceLabel: string;
}

export type MockOp =
  | { kind: "setPipelineResult"; pipelineId: string; result: RunResult }
  | { kind: "addPullRequest"; repoId: string; draft: boolean }
  | { kind: "addPipeline"; repoId: string; release: boolean }
  | { kind: "agePullRequests"; days: number }
  | { kind: "reset" };
