import { isRecord } from "./guards";
import { RULE_IDS, type AppConfig, type ProviderKind, type RuleId, type Thresholds } from "./types";

export const DEFAULT_THRESHOLDS: Thresholds = {
  staleDays: 7,
  waitingHours: 24,
  crowdSize: 5,
  draftPileup: 5,
  failStreakHot: 3,
  releaseStaleDays: 14,
};

export const DEFAULT_CONFIG: AppConfig = {
  provider: "mock",
  scenario: "demo",
  watchedRepoIds: null,
  maxRepos: 12,
  maxPrsPerRepo: 40,
  pollSeconds: 30,
  thresholds: DEFAULT_THRESHOLDS,
  rules: Object.fromEntries(RULE_IDS.map((id) => [id, true])) as Record<RuleId, boolean>,
  coverage: {},
};

const PROVIDERS: readonly ProviderKind[] = ["mock", "azure", "github"];

const LIMITS = {
  maxRepos: [1, 64],
  maxPrsPerRepo: [1, 200],
  pollSeconds: [10, 3600],
} as const;

const THRESHOLD_LIMITS: Record<keyof Thresholds, readonly [number, number]> = {
  staleDays: [1, 365],
  waitingHours: [1, 24 * 30],
  crowdSize: [2, 100],
  draftPileup: [2, 100],
  failStreakHot: [2, 50],
  releaseStaleDays: [1, 365],
};

function clampInt(value: unknown, [min, max]: readonly [number, number], fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function stringList(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return [...new Set(value.filter((v): v is string => typeof v === "string" && v.length > 0))];
}

/**
 * Merge an untrusted patch over a base config, dropping anything malformed and
 * clamping numbers into sane ranges. Unknown keys are ignored, so a patch can
 * never smuggle extra fields (or secrets) into the broadcast config.
 */
export function normalizeConfig(patch: unknown, base: AppConfig = DEFAULT_CONFIG): AppConfig {
  const p = isRecord(patch) ? patch : {};
  const thresholdPatch = isRecord(p.thresholds) ? p.thresholds : {};
  const rulesPatch = isRecord(p.rules) ? p.rules : {};

  const thresholds = { ...base.thresholds };
  for (const key of Object.keys(THRESHOLD_LIMITS) as (keyof Thresholds)[]) {
    thresholds[key] = clampInt(thresholdPatch[key], THRESHOLD_LIMITS[key], base.thresholds[key]);
  }

  const rules = { ...base.rules };
  for (const id of RULE_IDS) {
    if (typeof rulesPatch[id] === "boolean") rules[id] = rulesPatch[id];
  }

  let coverage = base.coverage;
  if (isRecord(p.coverage)) {
    coverage = {};
    for (const [pipeline, repos] of Object.entries(p.coverage)) {
      const list = stringList(repos);
      if (list) coverage[pipeline] = list;
    }
  }

  let watchedRepoIds = base.watchedRepoIds;
  if (p.watchedRepoIds === null) watchedRepoIds = null;
  else if (p.watchedRepoIds !== undefined) watchedRepoIds = stringList(p.watchedRepoIds) ?? base.watchedRepoIds;

  return {
    provider: PROVIDERS.includes(p.provider as ProviderKind) ? (p.provider as ProviderKind) : base.provider,
    scenario: typeof p.scenario === "string" && /^[a-z0-9-]{1,64}$/.test(p.scenario) ? p.scenario : base.scenario,
    watchedRepoIds,
    maxRepos: clampInt(p.maxRepos, LIMITS.maxRepos, base.maxRepos),
    maxPrsPerRepo: clampInt(p.maxPrsPerRepo, LIMITS.maxPrsPerRepo, base.maxPrsPerRepo),
    pollSeconds: clampInt(p.pollSeconds, LIMITS.pollSeconds, base.pollSeconds),
    thresholds,
    rules,
    coverage,
  };
}
