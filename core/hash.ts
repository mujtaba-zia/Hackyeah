const UINT32_RANGE = 0x1_0000_0000;

/** Returns a stable unsigned 32-bit FNV-1a hash for a string seed. */
export function hashString(seed: string): number {
  let hash = 0x811c9dc5;

  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return hash >>> 0;
}

/** Maps a string seed to a deterministic float in the half-open interval [0, 1). */
export function hashToUnit(seed: string): number {
  return hashString(seed) / UINT32_RANGE;
}
