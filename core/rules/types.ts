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
