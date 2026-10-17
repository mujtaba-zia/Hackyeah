import type { EffectKind, Mood, ProviderKind, RuleId, RunResult, Severity, SyncPhase, Thresholds } from "../../shared/types";

/** Every fixed string the HUD shows. Short, plain, and about the user's estate. */
export const copy = {
  product: "Repo Isles",
  problems: "Problems",
  legend: "Legend",
  settings: "Settings",
  mockLab: "Mock lab",
  close: "Close",
  allClear: "All clear",
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
  provider: "Source",
  scenario: "Scenario",
  pollSeconds: "Poll every (seconds)",
  apply: "Apply",
  addPr: "Add PR",
  addDraft: "Add draft",
  agePrs: "Age every PR by (days)",
  reset: "Reset scenario",
  setResult: "Set latest run",
  open: "Open",
  runs: "Recent runs",
  covers: "Covers",
  problemsCount: (n: number) => (n === 1 ? "1 problem" : `${n} problems`),
  hoursAgo: (hours: number) => (hours < 48 ? `${Math.round(hours)} h old` : `${Math.round(hours / 24)} days old`),
} as const;

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

export const effectLabel: Record<EffectKind, string> = {
  fire: "Fire: failing pipeline",
  smoke: "Smoke: drafts piling up or release overdue",
  crowd: "Crowd: review queue",
  storm: "Storm: shared pipeline down",
  beacon: "Beacon: stale PRs",
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
