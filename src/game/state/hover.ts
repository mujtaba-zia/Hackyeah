import type { RepoId } from './gameState';
import type { BuildingId } from '../../domain/ids';

/**
 * What the scene reports under the cursor. Declared next to the state rather
 * than inside a component so the Phaser side never has to import React code.
 * `x` and `y` are screen pixels relative to the canvas.
 */
export type HoverPayload =
  | { kind: 'factory'; buildingId: BuildingId; x: number; y: number }
  | { kind: 'pr'; prId: string; x: number; y: number }
  | { kind: 'pr-group'; repoId: RepoId; prIds: string[]; x: number; y: number };
