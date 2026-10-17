import type { Incident, Mood } from "../../shared/types";
import type { RuleContext } from "./types";

const CROWD_MOODS: Record<Mood, boolean> = {
  egg: false,
  fresh: false,
  waiting: true,
  approved: false,
  changes: true,
  stale: true,
  blocked: false,
  rejected: false,
};

/** Finds plaza queues that have grown beyond the review-crowd threshold. */
export function reviewCrowd(context: RuleContext): Incident[] {
  const incidents: Incident[] = [];
  const { crowdSize } = context.config.thresholds;

  for (const district of context.districts) {
    const crowd = context.creatures.filter(
      (creature) =>
        creature.districtId === district.id && creature.zone === "plaza" && CROWD_MOODS[creature.mood],
    );

    if (crowd.length < crowdSize) continue;

    incidents.push({
      id: `reviewCrowd:${district.id}`,
      ruleId: "reviewCrowd",
      severity: crowd.length >= crowdSize * 2 ? "error" : "warning",
      title: `${crowd.length} PRs waiting in ${district.name}`,
      detail: "Reviews need attention in this district.",
      effect: "crowd",
      targets: { districts: [district.id], towers: [], creatures: crowd.map((creature) => creature.id) },
      focus: district.plaza.center,
    });
  }

  return incidents;
}
