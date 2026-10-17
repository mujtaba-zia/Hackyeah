import type { Incident } from "../../shared/types";
import type { RuleContext } from "./types";

/** Emits one incident for each tower whose newest run failed. */
export function pipelineFailing(context: RuleContext): Incident[] {
  const incidents: Incident[] = [];

  for (const tower of context.towers) {
    if (tower.status !== "failure") continue;

    const districtIds = tower.islandId === "outskirts" ? [] : [tower.islandId];
    const severity = tower.failStreak >= context.config.thresholds.failStreakHot ? "critical" : "error";
    const detail =
      tower.failStreak === 1 ? "The newest run failed." : `${tower.failStreak} consecutive runs have failed.`;

    incidents.push({
      id: `pipelineFailing:${tower.id}`,
      ruleId: "pipelineFailing",
      severity,
      title: `${tower.name} is failing`,
      detail,
      effect: "fire",
      targets: { districts: districtIds, towers: [tower.id], creatures: [] },
      focus: tower.position,
    });
  }

  return incidents;
}
