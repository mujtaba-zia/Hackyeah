import type { Incident } from "../../shared/types";
import type { RuleContext } from "./types";

/** Marks a failed pipeline as a shared outage when it reaches multiple districts. */
export function sharedOutage(context: RuleContext): Incident[] {
  const incidents: Incident[] = [];

  for (const tower of context.towers) {
    if (tower.status !== "failure" || tower.coversDistrictIds.length < 2) continue;

    incidents.push({
      id: `sharedOutage:${tower.id}`,
      ruleId: "sharedOutage",
      severity: "critical",
      title: `${tower.name} is failing in ${tower.coversDistrictIds.length} repos`,
      detail: "One failed pipeline is affecting several districts.",
      effect: "storm",
      targets: { districts: [...tower.coversDistrictIds], towers: [tower.id], creatures: [] },
      focus: tower.position,
    });
  }

  return incidents;
}
