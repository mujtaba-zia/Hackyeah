import type { Incident } from "../../shared/types";
import { towerPlaceName, type RuleContext } from "./types";

/** Emits one incident for each tower whose newest run failed. */
export function pipelineFailing(context: RuleContext): Incident[] {
  const incidents: Incident[] = [];

  for (const tower of context.towers) {
    if (tower.status !== "failure") continue;

    const districtIds = tower.islandId === "outskirts" ? [] : [tower.islandId];
    const severity = tower.failStreak >= context.config.thresholds.failStreakHot ? "critical" : "error";
    const place = towerPlaceName(context, tower);
    const detail =
      tower.failStreak === 1 ? "The newest run failed." : `${tower.failStreak} consecutive runs have failed.`;
    const title =
      severity === "critical"
        ? `${tower.name} failed ${tower.failStreak} runs in a row in ${place}`
        : `${tower.name} is failing in ${place}`;

    incidents.push({
      id: `pipelineFailing:${tower.id}`,
      ruleId: "pipelineFailing",
      severity,
      title,
      detail,
      effect: "fire",
      targets: { districts: districtIds, towers: [tower.id], creatures: [] },
      focus: tower.position,
    });
  }

  return incidents;
}
