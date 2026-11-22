import type { EffectKind, Mood, ProviderKind, RuleId, RunResult, Severity, SyncPhase, Thresholds } from "../../shared/types";
import type { NavTab } from "../app/store";

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** Every fixed string the HUD shows. Short, plain, and about the user's estate. */
export const copy = {
  product: "Repo Isles",
  browse: "Browse",
  problems: "Problems",
  repos: "Repos",
  pipelines: "Pipelines",
  legend: "Legend",
  settings: "Settings",
  mockLab: "Mock lab",
  close: "Close",
  allClear: "All clear",
  nothingMatches: "Nothing matches",
  waitingForServer: "Waiting for server",
  loading: "Loading…",
  reconnecting: "Reconnecting…",
  connecting: "Connecting…",
  noWebgl: "3D view unavailable in this browser. Everything else still works.",
  modelsFailed: "The 3D models could not be loaded. Everything else still works.",
  refreshNow: "Refresh now",
  notConfigured: "not configured on server",
  watchAll: "All",
  watchNone: "None",
  searchRepos: "Filter repositories",
  watchedRepos: "Watched repositories",
  thresholds: "Thresholds",
  rules: "Rules",
  limits: "Limits",
  provider: "Source",
  scenario: "Scenario",
  pollSeconds: "Poll every (seconds)",
  maxRepos: "Show at most (repositories)",
  maxPrsPerRepo: "PRs per repository",
  apply: "Apply",
  addPr: "Add PR",
  addDraft: "Add draft",
  addPipeline: "Add CI pipeline",
  addRelease: "Add release",
  agePrs: "Age every PR by (days)",
  reset: "Reset scenario",
  setResult: "Set latest run",
  open: "Open",
  runs: "Recent runs",
  covers: "Covers",
  outskirts: "Outskirts",
  worstFirst: "Worst first",
  clearSearch: "Clear search",
  zoomIn: "Zoom in",
  zoomOut: "Zoom out",
  fit: "Show everything",
  help: "Controls",
  ci: "CI",
  release: "Release",
  ciPipeline: "CI pipeline",
  releasePipeline: "Release pipeline",
  alsoBuiltBy: "Also built by",
  pullRequests: "Pull requests",
  failing: "failing",
  running: "running",
  waiting: "waiting",
  all: "All",
  updated: (ago: string) => `Updated ${ago}`,
  repoCount: (n: number) => plural(n, "repo"),
  pipelineCount: (n: number) => plural(n, "pipeline"),
  prCount: (n: number) => plural(n, "PR"),
  draftCount: (n: number) => plural(n, "draft"),
  problemsCount: (n: number) => plural(n, "problem"),
  more: (n: number) => `${n} more`,
  moreRefine: (n: number) => `${n} more: refine the search`,
  showing: (shown: number, total: number) => `Showing ${shown} of ${total} repositories.`,
  passed: (passed: number, total: number) => `${passed} of ${total} recent runs passed`,
  hoursAgo: (hours: number) => (hours < 48 ? `${Math.round(hours)} h old` : `${Math.round(hours / 24)} days old`),
} as const;

export const searchPlaceholder: Record<NavTab, string> = {
  problems: "Search problems",
  repos: "Search repositories",
  pipelines: "Search pipelines",
};

/** How to move around the world, for the help card. */
export const controlsHelp: readonly (readonly [keys: string, action: string])[] = [
  ["Drag", "Pan"],
  ["Scroll or pinch", "Zoom"],
  ["Click", "Select"],
  ["Double-click", "Fly there"],
  ["Arrow keys", "Pan"],
  ["+  −", "Zoom"],
  ["0", "Show everything"],
  ["Esc", "Clear selection"],
  ["/", "Search"],
];

/** Plain rows in the legend that explain the world rather than count things in it. */
export const worldLegend: readonly string[] = [
  "Island: a repository; it grows with its pipelines",
  "Glow round an island: amber needs attention, red is failing",
  "Red beam: a failing pipeline",
  "Lighthouse: CI pipeline",
  "Keep with an airship: release pipeline",
  "Foundations, scaffolding, finished, broken: queued, running, passing, failing",
];

/** Legend wording for pipelines: the status, and what its tower looks like. */
export const pipelineLegendLabel: Record<RunResult, string> = {
  success: "Passing · built",
  partial: "Partial · built",
  failure: "Failing · broken",
  running: "Running · being built",
  queued: "Queued · foundations",
  cancelled: "Cancelled · foundations",
  none: "No runs · foundations",
};

export const providerLabel: Record<ProviderKind, string> = {
  mock: "Mock",
  azure: "Azure DevOps",
  github: "GitHub",
};

export const severityLabel: Record<Severity | "all", string> = {
  all: "All",
  critical: "Critical",
  error: "Error",
  warning: "Warning",
};

export const phaseLabel: Record<SyncPhase, string> = {
  loading: "Loading",
  ok: "Live",
  error: "Error",
  throttled: "Throttled",
};

export const moodLabel: Record<Mood, string> = {
  egg: "Draft",
  fresh: "New",
  waiting: "Waiting for review",
  approved: "Approved",
  changes: "Changes requested",
  stale: "Stale",
  blocked: "Merge conflict",
  rejected: "Rejected",
};

export const resultLabel: Record<RunResult, string> = {
  success: "Passing",
  failure: "Failing",
  partial: "Partial",
  cancelled: "Cancelled",
  running: "Running",
  queued: "Queued",
  none: "No runs",
};

/** A run that ended (or began) some time ago, as a verb: "Failed 2 h ago". */
export const runVerb: Record<RunResult, string> = {
  success: "Passed",
  failure: "Failed",
  partial: "Partly passed",
  cancelled: "Cancelled",
  running: "Started",
  queued: "Queued",
  none: "No runs",
};

export const effectLabel: Record<EffectKind, string> = {
  fire: "Fire: failing pipeline",
  smoke: "Smoke: drafts piling up or release overdue",
  crowd: "Ring: review queue",
  storm: "Storm: shared pipeline down",
  giant: "Giant: meltdown",
};

export const ruleLabel: Record<RuleId, string> = {
  pipelineFailing: "Failing pipelines",
  sharedOutage: "Shared outages",
  reviewCrowd: "Review crowds",
  draftPileup: "Draft pile-ups",
  stalePrs: "Stale PRs",
  staleRelease: "Overdue releases",
  meltdown: "Meltdown",
};

export const thresholdLabel: Record<keyof Thresholds, string> = {
  staleDays: "Stale after (days)",
  waitingHours: "Waiting after (hours)",
  crowdSize: "Crowd size",
  draftPileup: "Draft pile-up",
  failStreakHot: "Hot failure streak",
  releaseStaleDays: "Release overdue after (days)",
};
