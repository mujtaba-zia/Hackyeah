import type { Incident } from "../../shared/types";
import { towerPlaceName, type RuleContext } from "./types";

const MILLIS_PER_DAY = 24 * 60 * 60 * 1000;

/** Reports release towers without a recent completed successful run. */
export function staleRelease(context: RuleContext): Incident[] {
  const incidents: Incident[] = [];
  const nowMillis = context.now.getTime();
  const { releaseStaleDays } = context.config.thresholds;
  const staleAfterMillis = releaseStaleDays * MILLIS_PER_DAY;

  for (const tower of context.towers) {
    if (tower.kind !== "release") continue;

    let hasRecentSuccess = false;
    for (const run of tower.history) {
      if (run.result !== "success" || run.finishedAt === undefined) continue;

      const finishedMillis = Date.parse(run.finishedAt);
      if (Number.isFinite(finishedMillis) && nowMillis - finishedMillis <= staleAfterMillis) {
        hasRecentSuccess = true;
        break;
      }
    }

    if (hasRecentSuccess) continue;

    const place = towerPlaceName(context, tower);
    const dayLabel = releaseStaleDays === 1 ? "day" : "days";
    incidents.push({
      id: `staleRelease:${tower.id}`,
      ruleId: "staleRelease",
      severity: "warning",
      title: `${tower.name} in ${place} has no recent success`,
      detail: `No successful release finished in the last ${releaseStaleDays} ${dayLabel}.`,
      effect: "smoke",
      targets: { districts: [], towers: [tower.id], creatures: [] },
      focus: tower.position,
    });
  }

  return incidents;
}
