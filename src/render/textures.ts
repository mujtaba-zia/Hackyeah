import type { CheckState, Mood } from "../../shared/types";

/** Cache key for the procedural body and its independent check-state overlay. */
export function creatureTextureKey(mood: Mood, checks: CheckState): string {
  return `${mood}:${checks}`;
}
