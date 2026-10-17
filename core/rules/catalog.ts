import type { RuleId } from "../../shared/types";
import { draftPileup } from "./draftPileup";
import { meltdown } from "./meltdown";
import { pipelineFailing } from "./pipelineFailing";
import { reviewCrowd } from "./reviewCrowd";
import { sharedOutage } from "./sharedOutage";
import { stalePrs } from "./stalePrs";
import { staleRelease } from "./staleRelease";
import type { IncidentRule } from "./types";

/** Every incident rule is registered under its persisted configuration id. */
export const RULE_CATALOG: Record<RuleId, IncidentRule> = {
  pipelineFailing,
  sharedOutage,
  reviewCrowd,
  draftPileup,
  stalePrs,
  staleRelease,
  meltdown,
};
