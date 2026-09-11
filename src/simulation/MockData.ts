export const PR_TITLES: readonly string[] = [
  'Improve request caching',
  'Fix login redirect',
  'Add audit log filtering',
  'Simplify error messages',
  'Update dashboard loading state',
  'Harden session expiry handling',
  'Reduce bundle startup time',
  'Add export validation',
  'Improve retry visibility',
  'Fix keyboard navigation',
  'Refine notification grouping',
  'Add repository health summary',
  'Correct time zone display',
  'Streamline deployment notes',
  'Improve search result ranking',
  'Add dependency update report',
  'Fix empty state layout',
  'Improve build log links',
  'Validate release metadata',
  'Add test coverage report',
  'Reduce duplicate requests',
  'Improve form submission feedback',
  'Fix mobile navigation state',
  'Add changelog preview',
  'Refine access request flow',
];

export const PIPELINE_NAMES: readonly string[] = [
  'CI Build',
  'UI Tests',
  'Security Scan',
  'Nightly Build',
  'Release Deploy',
];

export interface WeightedOption<T> {
  value: T;
  weight: number;
}

/** Creates a repeatable random stream so a reset is reproducible. */
export function createRng(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export function pick<T>(rng: () => number, options: readonly T[]): T {
  if (options.length === 0) {
    throw new Error('Cannot choose from an empty list');
  }

  return options[Math.floor(rng() * options.length)]!;
}

/** Returns an inclusive whole-number sample for simulation durations and identifiers. */
export function randomInt(rng: () => number, minimum: number, maximum: number): number {
  if (!Number.isInteger(minimum) || !Number.isInteger(maximum) || maximum < minimum) {
    throw new Error('Random range must have ordered integer bounds');
  }

  return minimum + Math.floor(rng() * (maximum - minimum + 1));
}

export function pickWeighted<T>(
  rng: () => number,
  options: readonly WeightedOption<T>[],
): T {
  let totalWeight = 0;
  let lastValidIndex = -1;

  for (let index = 0; index < options.length; index += 1) {
    const option = options[index]!;
    if (Number.isFinite(option.weight) && option.weight > 0) {
      totalWeight += option.weight;
      lastValidIndex = index;
    }
  }

  if (lastValidIndex === -1) {
    throw new Error('Weighted choices require a positive weight');
  }

  let threshold = rng() * totalWeight;
  for (const option of options) {
    if (!Number.isFinite(option.weight) || option.weight <= 0) continue;
    threshold -= option.weight;
    if (threshold < 0) return option.value;
  }

  return options[lastValidIndex]!.value;
}
