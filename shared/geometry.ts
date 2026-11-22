// Geometry both the layout (core) and the renderer rely on.

import type { Vec2 } from "./types";

/**
 * The renderer keeps every island's shoreline outside this share of its
 * half-size, and the layout keeps everything it places inside it.
 */
export const ISLAND_USABLE = 0.9;

/** Half-width of the strip in front of a plaza, towards the camera, that stays free of anything tall. */
export const VIEW_CORRIDOR = 3.6;

// The game camera looks from +x/+z and never turns, so on screen `across` runs
// left to right and `depth` runs towards the viewer.

/** Where the camera stands relative to what it looks at: level with the diagonal, 34 up for every 30 along each axis. */
export const CAMERA_OFFSET = 30;
export const CAMERA_HEIGHT = 34;

/**
 * How much shorter a length on the ground looks when it runs towards the
 * viewer than when it runs across the screen (the sine of the camera's pitch).
 */
export const GROUND_FORESHORTENING = CAMERA_HEIGHT / Math.hypot(CAMERA_OFFSET, CAMERA_HEIGHT, CAMERA_OFFSET);

export function screenAxes(x: number, z: number): { across: number; depth: number } {
  return { across: (x - z) / Math.SQRT2, depth: (x + z) / Math.SQRT2 };
}

export function fromScreenAxes(across: number, depth: number): Vec2 {
  return { x: (across + depth) / Math.SQRT2, z: (depth - across) / Math.SQRT2 };
}
