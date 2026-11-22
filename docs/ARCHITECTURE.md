# Architecture

```
GitHub / Azure DevOps / mock ──poll──▶ server (Node) ──WebSocket /ws──▶ every browser tab
                                        │                                │
                                        │ Snapshot ─▶ buildCity() ─▶ CityModel   world view (three.js)
                                        │                                │  + HUD (DOM)
                                        ◀──────── setConfig / refresh / mockOp
```

The server is the only source of truth. It polls one provider, turns the raw
data into a `CityModel` with a pure function, and pushes the result to every
connected tab. Browsers only draw what they receive and send back requests.
Credentials exist only in the server's environment.

## Layers

| Directory | Role | May import |
| --- | --- | --- |
| `shared/` | The contract: `types.ts` (Snapshot, AppConfig, CityModel, ClientState), `protocol.ts` (WebSocket messages), `config.ts` (defaults and the untrusted-input normalizer), `guards.ts`. Also what the world and the HUD must agree on: `summary.ts` (counts per island and for the whole estate, pipeline urgency order), `palette.ts` (every status, health, mood and severity colour, once) and `geometry.ts` (the camera's angle and the ground's screen axes). | nothing |
| `core/` | Pure, deterministic logic: `selectRepos` (watch list + cap), `layout.ts` (island sizes, tower spots, project archipelagos, packing), `buildCity` (moods, towers, groups, health), `rules/` (one module per kind of problem). No clocks, randomness or I/O. | `shared` |
| `server/providers/` | Read-only data sources implementing `Provider`: `github/`, `azure/`, `mock/` (with JSON scenarios). | `shared` |
| `server/` | `env.ts` (environment + `isles.config.json`), `state.ts` (poll loop, caching, throttling, provider switching), `app.ts` (HTTP, `/health`, `/ws`, static files), `main.ts`. | `shared`, `core`, providers |
| `src/render/` | The three.js world behind `createWorldView()`. See below. | `shared` |
| `art/blender/` | Blender Python that builds every model (`kitlib.py` primitives, `models_*.py`, `build_kit.py` export and validation). Output: `public/models/kit.glb`. | Blender only |
| `src/app/`, `src/ui/` | The client: socket with reconnect, a small store, and the HUD (`topBar`, `nav` with its three lists, `detail`, `legend`, `settings`, `mockLab`, `viewControls`, `tooltip`). | `shared`, `src/render` |

## One poll

1. `provider.listRepos()` lists everything the credentials can see, for the
   Settings watch list.
2. `selectRepos()` applies the watch list and `maxRepos`.
3. `provider.fetchSnapshot()` fetches PRs and pipeline runs for those repos only.
4. `buildCity(snapshot, config, now)` produces the world: islands sized and
   grouped by project, districts, creatures, towers, bridges, and incidents
   sorted by severity.
5. The server broadcasts `ClientState` to every tab.

When only thresholds or rules change, step 4 reruns on the cached snapshot
without refetching. On a provider error the last good world stays on screen and
the status explains what happened. If the provider throttles, the next poll
waits `max(Retry-After, 2 × poll interval)`.

## The world view

`world.ts` owns the scene, the frame loop, input and picking, and hands each
new `CityModel` to one layer per kind of thing.

| Module | Draws |
| --- | --- |
| `kit.ts`, `assets.ts` | The model kit split into parts (geometry + material) per model, and every shared material and texture. Colours come from `shared/palette.ts`. |
| `batch.ts` | `ModelBatch`: one instanced mesh per model part, refilled on every update, with per-instance colour and picking. Everything that repeats goes through it, so the number of draw calls depends on the kinds of thing in the world, not on how many there are. |
| `islands.ts` | Terrain (vertex-coloured grass, shore, rock) and the health glow around the shore. |
| `districts.ts`, `towers.ts`, `creatures.ts`, `scenery.ts`, `bridges.ts` | Town halls, plazas, nurseries, footpaths; pipeline towers with their status paint, glow and failing beam; pull requests; trees, rocks, bushes, flowers; bridges. |
| `effects.ts`, `sky.ts`, `water.ts`, `waterfalls.ts` | Incident effects, clouds, waterfalls. |
| `camera.ts` | `CameraRig`: the orthographic camera, ground ↔ screen mapping, pan and zoom limits, and the pose that frames a set of islands inside the part of the view the panels leave free. |
| `overlay.ts` | Nameplates, tower names and project titles as DOM elements over the canvas, so text stays sharp and the same size at every zoom. It decides what to show at each zoom level and hides plates that would overlap. |

The HUD never reaches into the scene: it calls `WorldView` (`select`,
`focusOn`, `fit`, `zoomBy`, `setInsets`) and listens for `onPick` and
`onHover`.

## Add a data source

1. Create `server/providers/<name>/` with a settings reader
   (`<name>SettingsFromEnv(env)`, returning `null` when unconfigured) and a
   factory that returns a `Provider` (`server/providers/types.ts`).
2. Prefix every id with your provider name so ids never collide.
3. Map failures to `ProviderError` codes (`auth`, `notFound`, `throttled`,
   `network`, `config`), and never put a credential in a message.
4. Add the kind to `ProviderKind` in `shared/types.ts`, and wire it in `server/env.ts`.
5. Test it against a fake `FetchFn`. See `tests/providers/github/`.

## Add a kind of problem

1. Add an id to `RuleId` and `RULE_IDS` in `shared/types.ts`.
2. Write `core/rules/<id>.ts` as a pure `(context) => Incident[]` and register
   it in `core/rules/catalog.ts`. Use an existing `EffectKind`, or add one and
   draw it in `src/render/effects.ts`.
3. Give it a label in `src/ui/copy.ts` and a test in `tests/core/`.

## Add or change a model

1. Build it in `art/blender/models_*.py` from the `kitlib.py` primitives and
   register it in `build_kit.py`. Use the materials named `Accent`, `Status`,
   `Beacon` and `Body` for the parts the app recolours.
2. Add its name to `KIT_MODELS` in `src/render/kit.ts` and draw it from a layer
   through a `ModelBatch`.
3. `npm run models` rebuilds the kit and refuses a model that does not fit.

## Tests

`npm run check` runs the typechecker and Vitest. Core, providers, server and
renderer-geometry tests run in Node. HUD tests opt into jsdom. Nothing needs
network access or a GPU.
