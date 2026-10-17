/** Small deterministic hash helpers used only for visual variation. */
export function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Returns a stable pseudo-random value in [0, 1) without keeping mutable state. */
export function seededUnit(seed: number, index: number): number {
  let value = (seed + Math.imul(index + 1, 0x9e3779b9)) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x21f0aaad);
  value ^= value >>> 15;
  value = Math.imul(value, 0x735a2d97);
  value ^= value >>> 15;
  return (value >>> 0) / 0x1_0000_0000;
}

export function seededRange(seed: number, index: number, minimum: number, maximum: number): number {
  return minimum + seededUnit(seed, index) * (maximum - minimum);
}
