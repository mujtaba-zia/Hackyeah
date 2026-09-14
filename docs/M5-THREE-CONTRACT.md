# Three.js port contract

The renderer changes, the organization does not. Phaser is removed entirely and the world is
rebuilt in three.js as two real cities.

```
src/simulation      unchanged, no renderer imports
src/game/state      unchanged domain model plus a wider BuildingId union
src/game/events     unchanged director, focus points now come from the 3D city plan
        |
        v
src/three           renderer, camera, picking, world, systems, effects, event controllers
        |
        v
src/components      unchanged React shell, hover payloads arrive from the raycaster
```

Everything under `src/game/scenes`, `src/game/entities`, `src/game/fx`, `src/game/world` and the
Phaser systems in `src/game/systems` is deleted at integration. Keep `src/game/state`,
`src/game/events`, `src/game/systems/EventBus.ts` and `src/game/systems/events.ts`.

## A. World shape

Two cities on one ground plane, separated by water with a bridge.

- **Geo**: the big city. Roughly 60 by 60 world units of dense blocks, a downtown cluster of
  tall towers, four districts, and every pipeline landmark: Build Factory, Test Lab, Security
  Hub, Packaging Station, Deployment Port, Review Hall, Merge Gate.
- **b3d**: the smaller city across the water, roughly 28 by 28 units, low rise, with its own
  Build Factory and Test Lab so it can run its own pipelines.

One world unit is one metre. Ground is the XZ plane, Y is up. The camera looks at Geo on load
with b3d visible in the distance.

## B. `src/three/world/cityPlan.ts`

```ts
export type CityId = 'geo' | 'b3d';

export type BuildingId =
  | 'geo-build' | 'geo-test' | 'geo-security' | 'geo-package' | 'geo-port'
  | 'geo-review' | 'geo-merge'
  | 'b3d-build' | 'b3d-test';

export interface Vec3 { x: number; y: number; z: number }

export interface CityDef {
  id: CityId;
  name: string;            // "Geo", "b3d"
  center: Vec3;
  radius: number;          // rough footprint radius in metres
  tone: number;            // base building colour for this city
}
export const CITIES: readonly CityDef[];

export interface LandmarkDef {
  id: BuildingId;
  city: CityId;
  name: string;            // "Build Factory"
  kind: 'build' | 'test' | 'security' | 'package' | 'port' | 'review' | 'merge';
  position: Vec3;
  footprint: { w: number; d: number; h: number };
  description: string;
}
export const LANDMARKS: readonly LandmarkDef[];

/** Static decoration: blocks of ordinary buildings, parks, props. */
export interface BlockDef { position: Vec3; w: number; d: number; h: number; tone: number }
export const BLOCKS: readonly BlockDef[];        // 300+ across both cities

export interface RoadDef { from: Vec3; to: Vec3; width: number }
export const ROADS: readonly RoadDef[];

export const VEHICLE_ROUTES: readonly (readonly Vec3[])[];     // closed loops on roads
export const PEDESTRIAN_ROUTES: readonly (readonly Vec3[])[];
export const PIPELINE_LEGS: readonly (readonly Vec3[])[];      // build->test->security->package->deploy in Geo
export const PR_SPAWN: Vec3;
export const REVIEW_WAITING_SPOTS: readonly Vec3[];            // 12 around Review Hall
export const PR_ROUTE_TO_REVIEW: readonly Vec3[];
export const PR_ROUTE_TO_MERGE: readonly Vec3[];
export const PR_ROUTE_BACK: readonly Vec3[];
export const WATER: { center: Vec3; w: number; d: number };
export function cityOf(id: BuildingId): CityId;
export function landmark(id: BuildingId): LandmarkDef;
```

## C. `src/three/core`

```ts
// ThreeRenderer.ts
export class ThreeRenderer {
  constructor(canvasParent: HTMLElement);
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  /** Register a per frame callback. Returns an unsubscribe. */
  onFrame(fn: (dtSeconds: number, elapsed: number) => void): () => void;
  start(): void;
  resize(): void;
  destroy(): void;
}

// CameraRig.ts  replaces CameraController
export class CameraRig {
  constructor(camera: THREE.PerspectiveCamera, dom: HTMLElement, home: { target: Vec3; distance: number });
  update(dt: number): void;
  focusOn(point: Vec3, distance?: number): void;
  follow(getPoint: () => Vec3 | null): void;
  stopFollow(): void;
  reset(animated?: boolean): void;
  /** True once the user drags, wheels or uses the keys, so scripted moves yield. */
  readonly userMoved: boolean;
  destroy(): void;
}

// Picker.ts
export class Picker {
  constructor(renderer: ThreeRenderer, dom: HTMLElement);
  /** Objects registered here become hoverable and clickable. */
  register(object: THREE.Object3D, payload: PickPayload): void;
  unregister(object: THREE.Object3D): void;
  onHover(fn: (payload: HoverPayload | null) => void): () => void;
  onClick(fn: (payload: PickPayload | null) => void): () => void;
  destroy(): void;
}
export type PickPayload =
  | { kind: 'factory'; buildingId: BuildingId }
  | { kind: 'pr'; prId: string }
  | { kind: 'pr-group'; repoId: RepoId; prIds: string[] };
```

Controls: left drag orbits, right drag or shift drag pans, wheel zooms, WASD and arrows pan,
and `reset()` returns home. Zoom is clamped so the camera cannot pass through the ground or
fly beyond the world.

## D. `src/three/systems`

Same responsibilities as the Phaser versions, same public shape.

```ts
export class TrafficSystem { constructor(ctx: WorldContext); setActivity(level: number): void; destroy(): void }
export class PedestrianSystem { constructor(ctx: WorldContext); setActivity(level: number): void; destroy(): void }
export class PRCrowd { constructor(ctx: WorldContext, onHover: ...); sync(state: GameState): void; destroy(): void }
export class DeliveryFleet { constructor(ctx: WorldContext); attach(): void; reset(): void; destroy(): void }
export class Ambient { constructor(ctx: WorldContext); destroy(): void }

export interface WorldContext {
  scene: THREE.Scene;
  renderer: ThreeRenderer;
  picker: Picker;
}
```

Movement uses the frame callback with real delta time, not tweens. Vehicles and pedestrians are
`InstancedMesh` where possible, since the world is much larger than the 2.5D city was.

## E. `src/three/fx/Effects3D.ts`

```ts
export interface FxHandle { stop(): void; destroy(): void }
export class Effects3D {
  constructor(ctx: WorldContext);
  smoke(at: Vec3, opts?: { colour?: number; rate?: number }): FxHandle;
  fire(at: Vec3): FxHandle;
  sparks(at: Vec3, colour?: number, count?: number): void;
  confetti(at: Vec3, count?: number): void;
  explosion(at: Vec3): void;
  dust(at: Vec3): void;
  debris(at: Vec3, radius?: number): FxHandle;
  beam(from: Vec3, to: Vec3): FxHandle;
  warningPulse(at: Vec3): FxHandle;
  wind(): FxHandle;
  rain(): FxHandle;
  shake(intensity?: number, ms?: number): void;
  flash(colour: number, ms?: number): void;
  destroy(): void;
}
```

Same lifetime discipline as the 2D version: every handle removes its meshes, geometries and
materials on `destroy()`, and `Effects3D.destroy()` sweeps everything still alive. Geometries
and materials are shared and disposed once, never per particle.

## F. City events

`src/three/events/CityEventStage.ts` mirrors the existing stage: it listens for
`CITY_EVENT_STARTED` and `CITY_EVENT_ENDED`, runs one controller per event, and guarantees
cleanup on end, on `SIM_RESET` and on teardown. All thirteen events keep their ids and meanings.
The `TrackedController` discipline carries over: track meshes, timers and handles, release them
all in `stop()`.

## G. Domain changes

`src/game/state/gameState.ts` keeps its model, with two changes:

- `REPOSITORIES` becomes: `geo` (Geo, the large monolith, factory `geo-build`), `b3d` (b3d,
  factory `b3d-build`), plus four smaller services that live in Geo and reuse its factories.
- `BuildingId` is imported from `src/three/world/cityPlan`.

`src/game/events/CityEventDirector.ts` keeps all logic and takes focus points from the city
plan instead of the tile layout. City events may target either city.
