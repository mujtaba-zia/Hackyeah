// One palette for the 3D world, its nameplates and the HUD, so a colour means
// the same thing wherever it appears. sRGB hex strings.

import type { Health, Mood, RunResult, Severity } from "./types";

export const STATUS_COLOURS: Record<RunResult, string> = {
  success: "#4fd67f",
  failure: "#ff4d63",
  partial: "#ffb347",
  running: "#4ea8ff",
  queued: "#a9d3ff",
  cancelled: "#8e99aa",
  none: "#687385",
};

export const HEALTH_COLOURS: Record<Health, string> = {
  good: "#4fd67f",
  warn: "#ffc24d",
  bad: "#ff4d63",
};

export const MOOD_COLOURS: Record<Mood, string> = {
  egg: "#f5e7b8",
  fresh: "#6dd9ff",
  waiting: "#ffd166",
  approved: "#77e28d",
  changes: "#ffad66",
  stale: "#b99cff",
  blocked: "#f1788d",
  rejected: "#e85465",
};

export const SEVERITY_COLOURS: Record<Severity, string> = {
  critical: "#ff4d6a",
  error: "#ff8a3d",
  warning: "#ffd25f",
};

/** The palette as CSS custom properties: `--status-failure`, `--health-bad`, `--mood-stale`, `--severity-error`. */
export function paletteVariables(): Record<string, string> {
  const variables: Record<string, string> = {};
  const groups: Record<string, Record<string, string>> = {
    status: STATUS_COLOURS,
    health: HEALTH_COLOURS,
    mood: MOOD_COLOURS,
    severity: SEVERITY_COLOURS,
  };
  for (const [group, colours] of Object.entries(groups)) {
    for (const [name, colour] of Object.entries(colours)) variables[`--${group}-${name}`] = colour;
  }
  return variables;
}
