import type { Incident } from "../../shared/types";
import type { RuleContext } from "./types";

/** Finds nurseries holding too many non-stale draft eggs. */
export function draftPileup(context: RuleContext): Incident[] {
  const incidents: Incident[] = [];
  const { draftPileup: threshold } = context.config.thresholds;

  for (const district of context.districts) {
    const eggs = context.creatures.filter(
      (creature) => creature.districtId === district.id && creature.zone === "nursery" && creature.mood === "egg",
    );

    if (eggs.length < threshold) continue;

    incidents.push({
      id: `draftPileup:${district.id}`,
      ruleId: "draftPileup",
      severity: "warning",
      title: `${eggs.length} drafts waiting in ${district.name}`,
      detail: "The nursery has a growing draft queue.",
      effect: "smoke",
      targets: { districts: [district.id], towers: [], creatures: eggs.map((egg) => egg.id) },
      focus: district.nursery.center,
    });
  }

  return incidents;
}
