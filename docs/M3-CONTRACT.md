# Milestone 3 module contract

The conceptual shift: a simulated software organization produces domain events, those
events reduce into game state, and the city renders that state. Nothing in the simulation
layer may touch Phaser, and nothing in the world may reach into the simulator.

```
SimulationEngine -> GameEvent -> gameStore.reduce -> GameState -> CityScene
```

Milestones 1 and 2 stay: `EventBus`, `gameStore`, `CameraController`, `TrafficSystem`,
`PedestrianSystem`, `AmbientLife`, the isometric layout and the runtime texture factory.

## A. Domain types, owned by `src/game/state/gameState.ts`

```ts
export type RepoId = 'backend' | 'web' | 'data' | 'auth' | 'infra' | 'desktop';

export interface Repository {
  id: RepoId;
  name: string;              // "Backend API"
  short: string;             // "Backend"
  color: number;             // badge tint, 0xRRGGBB
  factory: BuildingId;       // the building that represents this repository
}

export type PipelineStage = 'build' | 'test' | 'security' | 'package' | 'deploy';
export type RunStatus = 'running' | 'success' | 'failed';

export interface PipelineRun {
  id: string;
  repoId: RepoId;
  name: string;              // "CI Build"
  number: number;            // 4821
  status: RunStatus;
  stage: PipelineStage;
  startedAtSim: number;      // simulated minutes
  endedAtSim: number | null;
  /** 0..1 within the current stage, updated on SIM_TICK. */
  progress: number;
}

export interface RunHistoryEntry {
  number: number;
  name: string;
  status: 'success' | 'failed';
  endedAtSim: number;
}

export type PrStatus = 'waiting' | 'changes-requested' | 'updating' | 'approved' | 'merged';
export type PrMood = 'happy' | 'calm' | 'watching' | 'pacing' | 'annoyed' | 'angry';

export interface PullRequest {
  id: string;
  number: number;            // 184
  repoId: RepoId;
  title: string;
  status: PrStatus;
  createdAtSim: number;
  reviewers: number;
}

export interface ActivityEntry {
  id: string;
  simTime: number;
  kind: 'pipeline' | 'deploy' | 'pr' | 'failure';
  text: string;              // "Backend CI started"
}

export interface SimClock {
  /** Simulated minutes since start. */
  time: number;
  speed: 1 | 2 | 4;
  running: boolean;
  seed: number;
}

export interface GameState {
  sim: SimClock;
  repositories: Repository[];
  runs: PipelineRun[];                       // active plus recently finished, capped at 12
  history: Record<RepoId, RunHistoryEntry[]>; // newest first, capped at 5 per repo
  pullRequests: PullRequest[];               // merged PRs are removed on PR_MERGED
  activity: ActivityEntry[];                 // newest first, capped at 8
  cityHealth: number;                        // derived, never set directly
  followCamera: boolean;
}
```

Helper exports required by other modules:

```ts
export const STAGES: readonly PipelineStage[];
export const REPOSITORIES: readonly Repository[];
export const SIM_MINUTES_PER_SECOND = 5;     // 1 real second = 5 simulated minutes
export function prAgeHours(pr: PullRequest, simTime: number): number;
export function prMood(ageHours: number, status: PrStatus): PrMood;
export function computeCityHealth(state: GameState): number;   // pure, clamped 0..100
export function runsForRepo(state: GameState, repoId: RepoId): PipelineRun[];
export function prsForRepo(state: GameState, repoId: RepoId): PullRequest[];
```

Mood thresholds in simulated hours: 0-4 happy, 4-12 calm, 12-24 watching, 24-48 pacing,
48-72 annoyed, 72+ angry. A PR whose status is `changes-requested` is never `happy`.

Health formula, kept understandable:

```
base 100
- 6 per currently failed run in `runs`
- 4 per pull request older than 48 simulated hours
- 2 per pull request older than 24 simulated hours
+ 4 per successful deploy in the last 120 simulated minutes (max +12)
+ 6 when at least half of the last 20 history entries succeeded
clamped 0..100
```

## B. Events, owned by `src/game/systems/events.ts`

```ts
export type GameEvent =
  | { type: 'SIM_TICK'; deltaSim: number }                 // advance clock, age progress
  | { type: 'SIM_SET_SPEED'; speed: 1 | 2 | 4 }
  | { type: 'SIM_SET_RUNNING'; running: boolean }
  | { type: 'SIM_RESET'; seed: number; snapshot: SimSnapshot }
  | { type: 'RUN_STARTED'; run: PipelineRun }
  | { type: 'RUN_STAGE_ADVANCED'; runId: string; stage: PipelineStage }
  | { type: 'RUN_SUCCEEDED'; runId: string }
  | { type: 'RUN_FAILED'; runId: string; stage: PipelineStage }
  | { type: 'PR_CREATED'; pr: PullRequest }
  | { type: 'PR_STATUS_CHANGED'; prId: string; status: PrStatus }
  | { type: 'PR_MERGED'; prId: string }
  | { type: 'SET_FOLLOW_CAMERA'; follow: boolean };

/** Whole world seed state, used for startup and for Reset Simulation. */
export interface SimSnapshot {
  runs: PipelineRun[];
  history: Record<RepoId, RunHistoryEntry[]>;
  pullRequests: PullRequest[];
  activity: ActivityEntry[];
  time: number;
}
```

The reducer appends an `ActivityEntry` for `RUN_STARTED`, `RUN_SUCCEEDED`, `RUN_FAILED`,
`PR_CREATED`, `PR_STATUS_CHANGED` (approved and changes-requested only) and `PR_MERGED`,
and recomputes `cityHealth` after every event.

## C. Simulation layer, owned by `src/simulation/`

```ts
// SimulationClock.ts
export class SimulationClock {
  constructor(onTick: (deltaSimMinutes: number) => void);
  start(): void; stop(): void; destroy(): void;
}

// MockData.ts
export const PR_TITLES: readonly string[];          // 20+ generic fictional titles
export const PIPELINE_NAMES: readonly string[];     // "CI Build", "UI Tests", ...
export function createRng(seed: number): () => number;   // deterministic 0..1

// SimulationEngine.ts
export class SimulationEngine {
  constructor(seed?: number);
  /** Builds the startup ecosystem and dispatches SIM_RESET, then begins ticking. */
  start(): void;
  stop(): void;
  reset(seed?: number): void;
  setSpeed(speed: 1 | 2 | 4): void;
  setRunning(running: boolean): void;
  /** Debug panel hooks. */
  triggerFailure(): void;
  triggerDeployment(): void;
  createPullRequest(): void;
  destroy(): void;
}
export const simulation: SimulationEngine;   // single instance used by React and the scene
```

Pacing, measured in real seconds at speed 1: a significant event every 3 to 8 seconds, a
new PR every 8 to 20 seconds, a deployment every 20 to 45 seconds, pipeline success rate
80 to 90 percent, at most 6 concurrent runs. Startup snapshot: 6 repositories, 9 open PRs
with ages spread from 15 simulated minutes to 3 simulated days, 3 running pipelines, 1
recently failed run, 2 recent successful deploys, and 4 to 5 history entries per repo.

The engine owns all timing and randomness and dispatches through `gameStore.dispatch`. It
must never import Phaser or React.

## D. World additions, owned by `src/game/world/`

`BuildingId` gains: `frontend-factory`, `data-factory`, `infra-factory`, `review-hall`,
`merge-gate`. Every repository in `REPOSITORIES` points at one of the factory buildings
(`build-factory`, `frontend-factory`, `data-factory`, `infra-factory`, plus reuse for the
two remaining repositories).

```ts
export const PR_SPAWN: TilePos;                          // developer district doorstep
export const REVIEW_WAITING_SPOTS: readonly TilePos[];   // 12 spots around Review Hall
export const PR_ROUTE_TO_REVIEW: readonly TilePos[];     // spawn -> review hall
export const PR_ROUTE_TO_MERGE: readonly TilePos[];      // review hall -> merge gate
export const PR_ROUTE_BACK: readonly TilePos[];          // review hall -> developer district
```

New textures: `b-frontend`, `b-data`, `b-infra`, `b-reviewhall`, `b-mergegate`, and PR
character sprites `pr-happy`, `pr-calm`, `pr-watching`, `pr-pacing`, `pr-annoyed`,
`pr-angry` (same silhouette, different face and colour so swapping is instant).

## E. React shell, owned by `src/components/`

- `SimBar`: compact top-left strip, `LIVE` dot, simulated clock, speed `1x/2x/4x`, Pause
  and Resume, and a small button that toggles the debug panel. It replaces the large demo
  controls panel.
- `ActivityFeed`: latest 8 `ActivityEntry` rows with simulated timestamps.
- `DebugPanel`: collapsed by default. Trigger Failure, Create PR, Trigger Deployment,
  Reset Simulation, speed buttons, Follow Camera toggle and Reset Camera.
- `Tooltip`: renders hover payloads from the scene at the cursor. Factory payload shows
  repository, health, every active run with stage and progress, recent history and open PR
  count. PR payload shows number, repository, title, age, status and reviewers. Group
  payload shows the aggregate summary.
- `HUD`: City Health only, plus a one line pipeline summary.

Hover payload passed from the scene to React:

```ts
export type HoverPayload =
  | { kind: 'factory'; buildingId: BuildingId; x: number; y: number }
  | { kind: 'pr'; prId: string; x: number; y: number }
  | { kind: 'pr-group'; repoId: RepoId; prIds: string[]; x: number; y: number };
```

`x` and `y` are screen pixels relative to the canvas.
