# Living City

A 2.5D web prototype that visualizes software engineering activity as a living city.
A build artifact is produced in the Industrial District and then physically travels by
truck through the road network to Test, Security, Packaging and finally the Deployment
Port, while traffic and pedestrians keep the city alive around it.

Everything is simulated locally. There is no Azure DevOps integration, no backend, no
authentication and no network access. Demo controls produce the same generic game events
that a real Azure DevOps adapter would produce later.

## Milestone status

Milestone 1: living city foundation. Done.
Milestone 2: expanded city and the full five stage pipeline journey. Done.

## What works

World

- 44 x 44 isometric tile city with five recognizable districts: Industrial, Tech,
  City Centre, Residential and Logistics.
- A real road network: ring road, main cross roads, intersections, side roads and
  sidewalks. Every landmark touches a road.
- Roughly 33 structures plus trees, benches, lamps, containers and cranes.
- Water and docks in the south east for the Deployment Port.

Life

- 12 to 18 vehicles looping predefined road routes.
- 10 to 14 pedestrians walking sidewalk and plaza routes.
- Clouds, the plaza fountain and industrial chimney smoke.
- After a failed stage the district visibly calms down for a few seconds, and a fire
  truck rolls out when the Build Factory itself breaks.

Pipeline

- Five stages: build, test, security, package, deploy.
- The artifact appears at the Build Factory, is loaded onto a clearly marked pipeline
  truck, drives the road legs between landmarks and is unloaded at each stage. It never
  teleports.
- Each landmark reacts to its stage: spinning gear or scanner pulse while running,
  workers, glow, a check or shield on success, and alert, smoke and a wobble on failure.
- A full demo run takes about 24 seconds.

UI

- City Health bar plus a five stage progress list with pending, running, success and
  failed markers.
- Demo controls: Run Full Pipeline, Fail Current Stage, Fail At selector, Follow
  Pipeline toggle, Reset Demo and Reset Camera.
- Click any of the five landmarks for a panel with its district, pipeline stage and
  stage status.

Camera

- Left drag to pan, wheel to zoom (0.28x to 2.2x), WASD and arrow keys, Reset Camera.
- Camera bounds cover the whole expanded world, and the camera can follow the pipeline
  truck during a demo run.

## Setup

```bash
npm install
npm run dev     # http://localhost:5173
```

Other scripts:

```bash
npm run build   # type check plus production build
npm run preview
```

## Architecture

```
React (DOM overlays)                 Phaser (canvas world)
  HUD / BuildingPanel / DemoControls   CityScene + PipelineChoreographer
            |                              |
            |  dispatch(GameEvent)         |  subscribe(state) + bus events
            +---------> gameStore <--------+
                          |
                     reduce() -> GameState
```

The rule that matters: the world reacts to generic game events, never to buttons.

- `src/game/state/gameState.ts` holds the normalized `GameState` (city health plus the
  five stage pipeline) and a pure reducer. It imports neither React nor Phaser.
- `src/game/state/gameStore.ts` is the single channel. `dispatch(event)` reduces state,
  notifies subscribers (React through `useSyncExternalStore`, Phaser through `CityScene`),
  then emits the raw event on the `EventBus` for one-shot reactions.
- `src/game/systems/PipelineChoreographer.ts` turns pipeline events into a physical
  journey: it runs the stage timers, drives the truck along road legs and dispatches the
  next stage event when the truck arrives. It is the only component that emits
  `PIPELINE_STAGE_STARTED`, `PIPELINE_STAGE_SUCCEEDED` and `PIPELINE_COMPLETED`.
- `src/game/entities/` holds `Building`, `StageBuilding` (reacts to a `StageStatus` and
  nothing else), `PipelineTruck` and `PipelineArtifact`.
- `src/game/systems/` also holds `TrafficSystem`, `PedestrianSystem`, `AmbientLife`,
  `CameraController` and the `EventBus`.
- `src/game/world/` holds the isometric maths, the hand authored layout with all routes,
  and every texture. Art is generated at runtime as flat shaded isometric blocks, so
  there are no binary assets to manage.
- `src/components/` holds `GameCanvas` (the Phaser host), `HUD`, `BuildingPanel` and
  `DemoControls`.
- `docs/M2-CONTRACT.md` documents the module boundaries used to build Milestone 2.

### Adding real Azure DevOps later

Translate an Azure DevOps webhook or poll result into a `GameEvent` and call
`gameStore.dispatch(...)`. The scene, the choreographer and the entities do not change.

### Notes

- `main.tsx` renders without `StrictMode`: its dev only double mount boots two Phaser
  games, and the discarded one keeps the visible canvas while its scene is torn down.
- No backend, no authentication and no Azure DevOps integration, by design.
