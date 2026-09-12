# Living City

A 2.5D web prototype that visualizes software engineering activity as a living city.

A mock engineering organization runs itself: six repositories start pipelines, artifacts
travel by truck through the road network, pull requests are born as citizens who walk to
Review Hall, get reviewed, grow impatient with age and eventually merge through the Merge
Gate. City health is calculated from that activity. You watch and hover rather than press
buttons.

Everything is simulated locally. There is no Azure DevOps integration, no backend, no
authentication and no network access.

## Milestone status

Milestone 1: living city foundation. Done.
Milestone 2: expanded city and the full five stage pipeline journey. Done.
Milestone 3: autonomous living city simulation. Done.
Milestone 4: city events and visual overhaul. Done.

## City events

A City Event Director watches the simulated organization and stages consequences. It only
reads simulation state and only emits two presentation events, so a tornado can never
delete a repository, a run or a pull request.

```
engineering health + failure streaks + PR pressure
          |
          v
   CityEventDirector   weighted pick, per event and per severity cooldowns
          |
          v
CITY_EVENT_STARTED -> CityEventStage -> controllers -> sprites, particles, tweens
```

Thirteen events across four severities: tornado, UFO, meteor, factory fire, blackout,
traffic jam, bug invasion, pull request protest, deployment parade, fireworks, rainbow,
construction boom and repair crews. Disasters need an unstable or critical city,
celebrations need a healthy one, and the software flavoured events key off failures and
review pressure rather than the health number alone. At most one major or chaotic event
runs at a time, the last three fired events are penalised so nothing repeats, and every
controller tracks what it created so it cleans itself up on end, on reset and on shutdown.

## What works

Autonomous simulation

- The simulation starts on page load. No button press is needed.
- Six repositories: Backend API, Web Client, Data Service, Authentication, Infrastructure,
  Desktop App, each with its own pipelines, pull requests and history.
- Two to four pipeline runs are typically in flight at once across different factories,
  each moving through build, test, security, package and deploy.
- Runs succeed about 85 percent of the time. A failure smokes the factory, and the
  repository recovers and starts a fresh run after a cooldown.
- Pull requests appear over time, wait for review, get approved or receive changes, and
  merge. Their characters change mood with simulated age, from happy to angry.
- The clock runs at 5 simulated minutes per real second, with 1x, 2x, 4x and Pause.

World

- 44 x 44 isometric city with five districts, a real road network, water and docks.
- Ten interactive landmarks: four repository factories, the five pipeline stage sites, plus
  Review Hall and the Merge Gate.
- 12 to 18 vehicles, 10 to 14 pedestrians, clouds, fountain and chimney smoke, all running
  independently of the engineering simulation.
- Factory workers scale with the number of jobs the repository is running, so workload is
  readable without opening anything.
- Delivery trucks carry artifacts between stage sites, up to four deliveries at once.

Milestone 4 additions

- Reusable effect library (smoke, fire, sparks, confetti, debris, beam, dust, wind, rain,
  shake, flash) that every event controller shares.
- Event banners with a View Event button, a city event history panel, and an edge marker
  that points at an event happening off screen.
- City Health now shows a band: THRIVING, HEALTHY, UNSTABLE or CRITICAL, and the band
  gates which events can fire. A damaged city also gets quieter streets.
- Debug panel can force any of the thirteen events through the same director path used by
  automatic triggers, alongside the existing simulation controls.
- Lightweight synthesised audio (no binary assets), muted by default with a volume slider.

Interface

- Hover first, click second. Hovering a factory shows its repository, pipeline health,
  every active run with stage and progress, recent history and open PR count. Hovering a
  pull request shows its number, repository, title, age, status and reviewers. Grouped PR
  characters show an aggregate summary.
- A compact SimBar with the live indicator, simulated clock, speed and Pause.
- A live activity feed of the latest 8 events.
- City Health, derived from the simulation, with a one line pipeline summary.
- Developer controls are collapsed behind a gear button: Trigger Failure, Create PR,
  Trigger Deployment, Reset Simulation, speed, Follow Camera and Reset Camera.

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
src/simulation            mock engineering organization, no Phaser, no React
        |
        |  GameEvent
        v
src/game/state            pure reducer, derived city health
        |
        |  GameState
        v
src/game/scenes           CityScene renders state, entities react
        |
        +--> src/components   React overlays read the same state
```

The rule that matters: the simulator produces domain events, the store reduces them, and
the world renders the result. Nothing in the simulation touches Phaser, and nothing in the
world imports the simulator. Replacing `src/simulation` with an Azure DevOps adapter that
dispatches the same events would not require changing the city.

- `src/simulation/SimulationEngine.ts` owns the clock, the seeded randomness and the two
  sub simulators, and builds the startup ecosystem so the city is alive within a second.
- `src/game/state/gameState.ts` holds the domain model and a pure reducer. City health is
  derived by `computeCityHealth` after every event and never set by a button.
- `src/game/state/gameStore.ts` is the single channel: reduce, notify subscribers, then
  emit on the `EventBus` for one-shot spectacle.
- `src/game/entities/WorkBuilding.ts` splits continuous state (`setBusy`, `setWorkload`)
  from one-shot effects (`flashSuccess`, `flashFailure`), so the four times a second state
  sync can never cancel an animation.
- `src/game/systems/PRCrowd.ts` derives the pull request population from state: individual
  characters per PR, and one badged character for the overflow once a repository has more
  than five open, so Review Hall stays readable.
- `src/game/systems/DeliveryFleet.ts` leases one of four trucks per stage change.
- `src/game/world/` holds the isometric maths, the hand authored layout with every route,
  and all textures, generated at runtime so there are no binary assets.
- `docs/M2-CONTRACT.md` and `docs/M3-CONTRACT.md` record the module boundaries.

### Notes

- `main.tsx` renders without `StrictMode`: its dev only double mount boots two Phaser
  games, and the discarded one keeps the visible canvas while its scene is torn down.
- The simulation is seeded (default 42), so a session can be reproduced while debugging.
