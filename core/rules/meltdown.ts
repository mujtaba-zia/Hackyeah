import type { Incident, Severity } from "../../shared/types";
import type { RuleContext } from "./types";

const BAD_SEVERITIES: Record<Severity, boolean> = {
  critical: true,
  error: true,
  warning: false,
};

/** Escalates when three or more districts are already in an error state. */
export function meltdown(context: RuleContext): Incident[] {
  const existingDistrictIds: Record<string, true> = Object.create(null);
  const affectedDistrictIds: Record<string, true> = Object.create(null);

  for (const district of context.districts) existingDistrictIds[district.id] = true;

  for (const incident of context.incidents) {
    if (incident.ruleId === "meltdown" || !BAD_SEVERITIES[incident.severity]) continue;

    for (const districtId of incident.targets.districts) {
      if (Object.hasOwn(existingDistrictIds, districtId)) affectedDistrictIds[districtId] = true;
    }
  }

  const affectedDistricts = context.districts.filter((district) => Object.hasOwn(affectedDistrictIds, district.id));
  const primaryDistrict = affectedDistricts[0];
  if (affectedDistricts.length < 3 || primaryDistrict === undefined) return [];

  return [
    {
      id: `meltdown:${primaryDistrict.id}`,
      ruleId: "meltdown",
      severity: "critical",
      title: `${affectedDistricts.length} districts are in trouble`,
      detail: "Several districts need immediate attention.",
      effect: "giant",
      targets: {
        districts: affectedDistricts.map((district) => district.id),
        towers: [],
        creatures: [],
      },
      focus: primaryDistrict.hq,
    },
  ];
}
