import type { Incident } from "../../shared/types";
import type { RuleContext } from "./types";

/** Reports every district with at least one stale open PR or draft. */
export function stalePrs(context: RuleContext): Incident[] {
  const incidents: Incident[] = [];

  for (const district of context.districts) {
    const stale = context.creatures.filter(
      (creature) => creature.districtId === district.id && creature.mood === "stale",
    );

    if (stale.length === 0) continue;

    const label = stale.length === 1 ? "PR" : "PRs";
    incidents.push({
      id: `stalePrs:${district.id}`,
      ruleId: "stalePrs",
      severity: "warning",
      title: `${stale.length} stale ${label} in ${district.name}`,
      detail: "These pull requests have not changed recently.",
      effect: "beacon",
      targets: { districts: [district.id], towers: [], creatures: stale.map((creature) => creature.id) },
      focus: district.hq,
    });
  }

  return incidents;
}
