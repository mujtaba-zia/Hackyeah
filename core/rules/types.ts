import type { AppConfig, Creature, District, Incident, Tower } from "../../shared/types";

export interface RuleContext {
  config: AppConfig;
  now: Date;
  districts: readonly District[];
  creatures: readonly Creature[];
  towers: readonly Tower[];
  /** Incidents emitted by earlier rules; used by meltdown. */
  incidents: readonly Incident[];
}

export type IncidentRule = (context: RuleContext) => Incident[];

/** Names the district that hosts a tower for concise incident copy. */
export function towerPlaceName(context: RuleContext, tower: Tower): string {
  if (tower.islandId === "outskirts") return "the outskirts";

  const district = context.districts.find((candidate) => candidate.id === tower.islandId);
  return district?.name ?? "the outskirts";
}
