# Living City — Milestone 1

A 2.5D web prototype that visualizes software engineering activity as a living city.
Pipelines, builds and deployments will eventually come from Azure DevOps; in this
milestone every event is produced by the on-screen **Demo Controls**.

Milestone 1 proves one loop end to end:

```
Demo event  ->  Game state  ->  Game entity  ->  Visible world reaction
```

## What works

- Small hand-authored isometric city: roads, grass, water, trees, houses.
- Four interactive landmarks: **Build Factory**, **Test Lab**, **Review Hall**, **Deployment Port**.
- Camera: left-drag pan, mouse-wheel zoom (0.45x–2.2x), WASD / arrow keys, **Reset Camera**.
- Click a landmark: it is highlighted and a React info panel opens.
- Demo controls dispatch `PIPELINE_STARTED` / `PIPELINE_SUCCEEDED` / `PIPELINE_FAILED` / `RESET_DEMO`.
- The Build Factory reacts to those four states:
  - **idle** – quiet building
  - **running** – spinning gear, chimney smoke, bobbing workers, pulsing glow
  - **success** – green glow, check-mark pop, confetti burst, City Health +5
  - **failed** – red tint, alert icon, sparks, dark smoke, wobble, City Health −15
- City Health HUD (clamped 0–100, default 85) and live pipeline status.
- Ambient life: a looping car, drifting clouds, a fountain splash.

## Setup

```bash
npm install
npm run dev     # http://localhost:5173
```

Other scripts:

```bash
npm run build   # type-check + production build
npm run preview
```

## Architecture

```
React (DOM overlays)                 Phaser (canvas world)
  HUD / BuildingPanel / DemoControls   CityScene
            |                              |
            |  dispatch(GameEvent)         |  subscribe(state) + bus events
            +---------> gameStore <--------+
                          |
                     reduce() -> GameState
```

- **`src/game/state/gameState.ts`** — normalized `GameState` (`cityHealth`, `pipelines`) plus a
  pure reducer. No Azure DevOps, React or Phaser types anywhere in it.
- **`src/game/state/gameStore.ts`** — the single channel. `dispatch(event)` reduces state,
  notifies subscribers (React via `useSyncExternalStore`, Phaser via `CityScene`), then emits the
  raw event on the `EventBus` for one-shot reactions.
- **`src/game/systems/EventBus.ts`** — tiny typed pub/sub; the future Azure DevOps adapter will
  dispatch the exact same `GameEvent`s, so entities never learn where an event came from.
- **`src/game/entities/`** — `Building` (placement, selection) and `BuildFactory` (the first
  reactive entity; consumes `PipelineStatus`, nothing else).
- **`src/game/world/`** — isometric maths, the hand-authored layout, and all placeholder art,
  which is generated at runtime as flat-shaded isometric blocks (no binary assets to manage).
- **`src/components/`** — `GameCanvas` (Phaser host), `HUD`, `BuildingPanel`, `DemoControls`.

### Adding real Azure DevOps later

Translate an ADO webhook/poll result into a `GameEvent` and call `gameStore.dispatch(...)`.
Nothing in the scene or the entities changes.

### Notes

- `main.tsx` renders without `StrictMode`: its dev-only double mount boots two Phaser games and
  the discarded one keeps the visible canvas while its scene is torn down.
- No backend, no authentication, no ADO integration in this milestone by design.
