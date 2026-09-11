# Milestone 2 module contract

Shared interfaces between the parallel workstreams. Anything not listed here is owned by
the integration pass (scene, entities, choreography, camera).

Tile maths is unchanged: `src/game/world/iso.ts`, `TILE_W = 64`, `TILE_H = 32`,
`tileToWorld({ tx, ty })`. Tile coordinates may be fractional.

## A. `src/game/world/cityLayout.ts` (owner: world)

```ts
export type DistrictId = 'industrial' | 'tech' | 'center' | 'residential' | 'logistics';
export type BuildingId =
  | 'build-factory' | 'test-lab' | 'security-hub' | 'packaging-station' | 'deployment-port';

export const TERRAIN: readonly string[];      // 44 rows x 44 cols
export const TERRAIN_W: number;
export const TERRAIN_H: number;

export interface DistrictDef { id: DistrictId; name: string; tile: TilePos }
export const DISTRICTS: readonly DistrictDef[];

export interface BuildingDef {
  id: BuildingId; name: string; tile: TilePos; texture: string;
  district: DistrictId; description: string;
}
export const KEY_BUILDINGS: readonly BuildingDef[];   // exactly 5, in pipeline order

export interface PropDef { tile: TilePos; texture: string; scale?: number; flipX?: boolean }
export const PROPS: readonly PropDef[];               // 28+ structures plus small props

export const CITY_CENTER: TilePos;
export const BUILDING_DOOR: Record<BuildingId, TilePos>;      // road tile touching each landmark
export const VEHICLE_ROUTES: readonly (readonly TilePos[])[]; // >= 5 closed loops, road tiles only
export const PEDESTRIAN_ROUTES: readonly (readonly TilePos[])[]; // >= 4 loops on sidewalk/plaza
export const PIPELINE_LEGS: readonly (readonly TilePos[])[];  // exactly 4 legs, road tiles
export const EMERGENCY_ROUTE: readonly TilePos[];             // depot -> build factory door
```

Terrain codes: `G` grass, `R` road, `S` sidewalk, `P` plaza, `W` water, `K` dock, `A` asphalt.

`PIPELINE_LEGS[i]` runs build->test, test->security, security->package, package->deploy.
Each leg starts at `BUILDING_DOOR[source]` and ends at `BUILDING_DOOR[destination]`, with
waypoints on road tiles only, and turns only at intersections (no diagonal shortcuts).

## B. `src/game/world/textures.ts` (owner: world)

Keeps `TEXTURE_ORIGIN` and `createTextures(scene)`. Must register every key below.

- terrain: `t-grass`, `t-grass2`, `t-road`, `t-sidewalk`, `t-plaza`, `t-water`, `t-dock`, `t-asphalt`
- landmarks: `b-factory`, `b-testlab`, `b-security`, `b-packaging`, `b-port`, `b-citycenter`
- structures: `p-house-a`, `p-house-b`, `p-apartment-a`, `p-apartment-b`, `p-office-a`,
  `p-office-b`, `p-shop`, `p-cafe`, `p-techoffice`, `p-warehouse`, `p-factory`, `p-server`
- props: `p-tree`, `p-bench`, `p-lamp`, `p-container`, `p-crane`, `p-fountain`
- vehicles: `a-car`, `a-car2`, `a-van`, `a-truck`, `a-bus`, `a-firetruck`, `a-pipeline-truck`
- actors: `a-worker`, `a-ped-a`, `a-ped-b`, `a-ped-c`
- effects: `fx-gear`, `fx-spark`, `fx-smoke`, `fx-check`, `fx-alert`, `fx-cloud`,
  `fx-shield`, `fx-scan`, `fx-crate`

`fx-crate` is the pipeline artifact (small isometric software crate, ~28x28).
Vehicle sprites face "down-right" along +tx; the integration layer flips them per heading.

## C. `src/game/systems/TrafficSystem.ts` + `PedestrianSystem.ts` (owner: traffic)

```ts
export class TrafficSystem {
  constructor(scene: Phaser.Scene);
  /** 0..1 multiplier applied to spawn density/speed; 1 is normal. */
  setActivity(level: number): void;
  destroy(): void;
}
export class PedestrianSystem {
  constructor(scene: Phaser.Scene);
  setActivity(level: number): void;
  destroy(): void;
}
```

12-18 vehicles, 10-14 pedestrians, tween driven, depth = world y, no per frame update loop,
no pathfinding. Vehicles must not use `PIPELINE_LEGS` or `EMERGENCY_ROUTE`.

## D. `src/game/state/*` + React UI (owner: pipeline)

```ts
export type PipelineStage = 'build' | 'test' | 'security' | 'package' | 'deploy';
export type StageStatus = 'pending' | 'running' | 'success' | 'failed';
export type PipelineStatus = 'idle' | 'running' | 'success' | 'failed';

export const STAGES: readonly PipelineStage[];          // build,test,security,package,deploy
export const STAGE_BUILDING: Record<PipelineStage, BuildingId>;

export interface PipelineState {
  id: string; name: string;
  status: PipelineStatus;
  currentStage: PipelineStage | null;
  stages: Record<PipelineStage, StageStatus>;
  /** Demo only: presenter arms a stage to fail. */
  failAt: PipelineStage | null;
}
export interface GameState { cityHealth: number; pipeline: PipelineState; followCamera: boolean }
```

Events (`src/game/systems/events.ts`):

```ts
export type GameEvent =
  | { type: 'PIPELINE_STARTED' }
  | { type: 'PIPELINE_STAGE_STARTED'; stage: PipelineStage }
  | { type: 'PIPELINE_STAGE_SUCCEEDED'; stage: PipelineStage }
  | { type: 'PIPELINE_STAGE_FAILED'; stage: PipelineStage }
  | { type: 'PIPELINE_COMPLETED' }
  | { type: 'PIPELINE_RESET' }
  | { type: 'SET_FAIL_STAGE'; stage: PipelineStage | null }
  | { type: 'SET_FOLLOW_CAMERA'; follow: boolean };
```

Health: stage success +1, deploy success +5, stage failure -10, deploy failure -15,
reset to 85, clamped 0..100.

Only the scene choreographer dispatches the `PIPELINE_STAGE_*` and `PIPELINE_COMPLETED`
events. React dispatches `PIPELINE_STARTED`, `PIPELINE_RESET`, `SET_FAIL_STAGE`,
`SET_FOLLOW_CAMERA`, and `PIPELINE_STAGE_FAILED` for the currently running stage only.
