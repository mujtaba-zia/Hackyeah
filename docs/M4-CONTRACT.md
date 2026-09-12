# Milestone 4 module contract

Two goals: a visual overhaul, and a City Event Director that turns engineering health into
funny city consequences. The Milestone 3 architecture does not change.

```
SimulationEngine -> GameEvent -> gameStore -> GameState
                                      |
                                      v
                            CityEventDirector (reads state, never writes sim state)
                                      |
                                      v
                    CITY_EVENT_STARTED / CITY_EVENT_ENDED -> CityEventStage -> world
```

Hard rule: city events are presentation only. A tornado, UFO or meteor must never remove or
mutate a repository, run or pull request. They may only add and remove their own sprites,
particles and tweens.

## A. City event state, owned by state (`gameState.ts`, `events.ts`)

```ts
export type CityEventSeverity = 'minor' | 'moderate' | 'major' | 'chaotic';
export type HealthBand = 'critical' | 'unstable' | 'healthy' | 'thriving';

export type CityEventId =
  | 'tornado' | 'ufo' | 'bug-invasion' | 'factory-fire' | 'pr-protest'
  | 'deployment-parade' | 'blackout' | 'traffic-jam' | 'meteor'
  | 'fireworks' | 'rainbow' | 'construction-boom' | 'repair-crew';

export interface ActiveCityEvent {
  id: CityEventId;
  name: string;              // "Tornado Warning"
  blurb: string;             // "Critical engineering health."
  severity: CityEventSeverity;
  startedAtSim: number;
  endsAtReal: number;        // Date.now() based, presentation timing
  /** World point the event happens at, for the View Event button and edge marker. */
  focus: { x: number; y: number } | null;
}

export interface CityEventLogEntry {
  key: string;
  eventId: CityEventId;
  name: string;
  simTime: number;
}

export interface CityEventsState {
  active: ActiveCityEvent[];
  history: CityEventLogEntry[];   // newest first, capped at 10
}
```

`GameState` gains `cityEvents: CityEventsState`. New game events:

```ts
| { type: 'CITY_EVENT_STARTED'; event: ActiveCityEvent }
| { type: 'CITY_EVENT_ENDED'; eventId: CityEventId }
```

`healthBand(health)` is exported from `gameState.ts`: 0-39 critical, 40-64 unstable,
65-84 healthy, 85-100 thriving. `PIPELINE_RESET` style resets clear `cityEvents`.
`SIM_RESET` must clear both `active` and `history`.

## B. Effects library, owned by `src/game/fx/Effects.ts`

Reusable, scene owned, used by every event controller. No state imports.

```ts
export interface FxHandle { stop(): void; destroy(): void }

export class Effects {
  constructor(scene: Phaser.Scene);
  smoke(x: number, y: number, opts?: { tint?: number; rate?: number; depth?: number }): FxHandle;
  fire(x: number, y: number, depth?: number): FxHandle;
  sparks(x: number, y: number, tint?: number, count?: number): void;
  confetti(x: number, y: number, count?: number): void;
  stars(x: number, y: number): void;
  explosion(x: number, y: number): void;
  dust(x: number, y: number): void;
  debris(x: number, y: number, radius?: number): FxHandle;
  beam(x: number, y: number, height: number): FxHandle;
  warningPulse(x: number, y: number): FxHandle;
  wind(): FxHandle;
  rain(): FxHandle;
  shake(intensity?: number, durationMs?: number): void;
  flash(color: number, durationMs?: number): void;
  destroy(): void;
}
```

Every `FxHandle.destroy()` must remove all emitters, sprites and tweens it created, so an
event that ends leaves nothing behind. Effects must be safe to call repeatedly.

## C. City Event Director, owned by `src/game/events/`

```ts
// types.ts
export interface CityEventContext {
  health: number;
  band: HealthBand;
  simTime: number;
  runningRuns: number;
  recentFailures: number;      // failed runs ended within 240 simulated minutes
  failureStreak: number;       // consecutive failures across history, newest first
  recentDeploys: number;       // successful deploys within 240 simulated minutes
  successRate: number;         // 0..1 across the last 20 history entries
  openPrs: number;
  oldPrs: number;              // older than 48 simulated hours
  waitingPrs: number;
  averagePrAgeHours: number;
  healthDelta: number;         // health now minus health about 2 real minutes ago
  activeSeverities: CityEventSeverity[];
}

export interface CityEventDefinition {
  id: CityEventId;
  name: string;
  blurb: string;
  severity: CityEventSeverity;
  durationMs: number;
  cooldownMs: number;
  canTrigger(ctx: CityEventContext): boolean;
  /** Relative selection weight. Zero means never right now. */
  weight(ctx: CityEventContext): number;
}

// registry.ts
export const CITY_EVENT_DEFINITIONS: readonly CityEventDefinition[];

// CityEventDirector.ts
export class CityEventDirector {
  constructor(seed?: number);
  start(): void;
  stop(): void;
  reset(): void;
  force(id: CityEventId): void;
  destroy(): void;
}
export const cityEvents: CityEventDirector;
```

Director rules:

- Evaluates every 2 real seconds against live `gameStore` state.
- Weighted random pick among definitions where `canTrigger` is true and weight is above 0.
- Per event cooldown from the definition, plus global cooldowns by severity: minor 20 to 40
  seconds, moderate 40 to 90 seconds, major 90 to 180 seconds, chaotic 240 to 420 seconds.
- At most one `major` or `chaotic` event at a time. Minor events may coexist, at most 3
  active events total.
- The last 3 fired event ids get a heavy weight penalty so the same disaster does not repeat.
- `force(id)` bypasses cooldowns and `canTrigger` but still respects the one major at a time
  rule by ending the conflicting event first. It uses exactly the same dispatch path as an
  automatic trigger.
- `reset()` clears cooldowns, history and active events.
- The director never dispatches simulation events and never mutates repositories, runs or PRs.

Required events with rough intent: tornado and meteor and ufo chaotic, blackout and
factory-fire and traffic-jam major or moderate, bug-invasion moderate, pr-protest moderate,
deployment-parade and fireworks and rainbow and construction-boom positive, repair-crew
recovery. Positive events require a healthy or thriving band, disasters require unstable or
critical, except bug-invasion which keys off failures.

## D. Art additions, owned by `src/game/world/`

Ground and roads: subtle grass variants, flowers, rocks, shrubs, road lane markings,
crosswalks, curbs, parking bays, plaza detail, fences, small gardens. Nothing noisy.

New props: `p-flowers`, `p-rock`, `p-shrub`, `p-fence`, `p-trafficlight`, `p-busstop`,
`p-sign`, `p-billboard`, `p-watertower`, `p-streetlight`, `p-scaffold`, `p-cone`,
`p-garbage`, `p-foodtruck`, plus taller office variants `p-tower-a`, `p-tower-b`.

New terrain tiles: `t-crosswalk`, `t-roadline`, `t-parking`, `t-garden`.

Landmark identity upgrades keep the existing keys (`b-factory`, `b-testlab`, `b-security`,
`b-packaging`, `b-port`, `b-reviewhall`, `b-mergegate`, `b-frontend`, `b-data`, `b-infra`)
but must read clearly at a glance: gears and loading dock, glass and scanner, shield and
barrier, conveyor and bays, columns and steps, cranes and containers.

Character sprites gain readable states. Existing `pr-happy` through `pr-angry` stay. Add
`a-worker-hammer`, `a-worker-cheer`, `a-worker-panic`, `a-firefighter`, `a-repair`.

Event art: `ev-tornado`, `ev-ufo`, `ev-bug`, `ev-meteor`, `ev-crater`, `ev-float`,
`ev-rainbow`, `ev-sign-a`, `ev-sign-b`, `ev-sign-c`, `ev-balloon`, `ev-firework`.

Effect art used by `Effects`: existing `fx-smoke`, `fx-spark`, `fx-confetti`, plus
`fx-fire`, `fx-dust`, `fx-debris`, `fx-beam`, `fx-star`, `fx-drop`, `fx-ring`.

## E. React shell additions, owned by `src/components/`

- `EventBanner`: shows the newest active event with an icon, name and blurb, and a
  `View Event` button that calls `onViewEvent(focus)`. Auto dismisses, never blocks the city.
- `CityEventsPanel`: the latest 8 entries of `cityEvents.history` with simulated timestamps.
- `HUD`: City Health with the band word (THRIVING, HEALTHY, UNSTABLE, CRITICAL), coloured
  by band, plus the existing one line summary.
- `DebugPanel`: adds a Force Event grid with one button per `CityEventId`, calling
  `cityEvents.force(id)`, plus the existing controls.
- `SoundBar` controls inside `SimBar`: mute toggle and a small volume slider.
- Sound lives in `src/audio/SoundManager.ts`, generating tones with the Web Audio API so no
  binary assets are needed. It starts muted because browsers block autoplay, and it exposes
  `play(cue)`, `setMuted`, `setVolume`, `resume()`.

Cues: `success`, `failure`, `alarm`, `ufo`, `wind`, `celebrate`, `pop`.
