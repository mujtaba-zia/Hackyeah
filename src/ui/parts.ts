import { STATUS_ORDER, type StatusCounts } from "../../shared/summary";
import type { Tower } from "../../shared/types";
import { resultLabel } from "./copy";
import { el, safeHref } from "./dom";

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "just now", "12 s ago", "3 min ago", "2 h ago", "4 d ago"; empty when the time is unknown. */
export function ago(iso: string | undefined, now: number): string {
  const then = iso === undefined ? Number.NaN : Date.parse(iso);
  if (!Number.isFinite(then)) return "";
  const elapsed = Math.max(0, now - then);
  if (elapsed < 10 * SECOND) return "just now";
  if (elapsed < MINUTE) return `${Math.floor(elapsed / SECOND)} s ago`;
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)} min ago`;
  if (elapsed < 2 * DAY) return `${Math.floor(elapsed / HOUR)} h ago`;
  return `${Math.floor(elapsed / DAY)} d ago`;
}

/** How long a run took: "35 s", "4 min", "1 h 12 min"; empty when it cannot be told. */
export function took(startedAt: string | undefined, finishedAt: string | undefined): string {
  const elapsed = Date.parse(finishedAt ?? "") - Date.parse(startedAt ?? "");
  if (!Number.isFinite(elapsed) || elapsed <= 0) return "";
  if (elapsed < MINUTE) return `${Math.round(elapsed / SECOND)} s`;
  if (elapsed < HOUR) return `${Math.round(elapsed / MINUTE)} min`;
  return `${Math.floor(elapsed / HOUR)} h ${Math.round((elapsed % HOUR) / MINUTE)} min`;
}

/** When a tower's latest run ended, or began if it has not ended. */
export function latestRunAt(tower: Tower): string | undefined {
  const latest = tower.history[0];
  return latest?.finishedAt ?? latest?.startedAt;
}

export type DotKind = "status" | "health" | "mood" | "severity";

/** A small disc in a palette colour: `data-status="failure"`, `data-health="bad"` and so on. */
export function dot(kind: DotKind, value: string): HTMLElement {
  return el("i", { class: "dot", attrs: { [`data-${kind}`]: value, "aria-hidden": "true" } });
}

/** One bar split by pipeline status, widest share first in urgency order. */
export function statusBar(counts: StatusCounts): HTMLElement {
  const bar = el("span", { class: "bar", attrs: { "aria-hidden": "true" } });
  for (const status of STATUS_ORDER) {
    if (counts[status] === 0) continue;
    const segment = el("i", { attrs: { "data-status": status } });
    segment.style.flexGrow = String(counts[status]);
    bar.append(segment);
  }
  return bar;
}

/**
 * A pipeline's recent runs, oldest on the left so it reads like a timeline.
 * With `linked`, runs that have a safe URL open it in a new tab.
 */
export function runStrip(history: Tower["history"], linked = false): HTMLElement {
  const strip = el("span", { class: "run-strip" });
  for (const run of [...history].reverse()) {
    const when = run.finishedAt ?? run.startedAt;
    const label = `${resultLabel[run.result]}${when ? ` · ${new Date(when).toLocaleString()}` : ""}`;
    const href = linked ? safeHref(run.url) : null;
    const attrs: Record<string, string> = { "data-status": run.result, "aria-label": label };
    strip.append(
      href
        ? el("a", { class: "run", title: label, attrs: { ...attrs, href, target: "_blank", rel: "noopener noreferrer" } })
        : el("i", { class: "run", title: label, attrs }),
    );
  }
  return strip;
}
