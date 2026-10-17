# Repo Isles — functional specification

Repo Isles turns the health of your source-control and CI estate into a living,
isometric 3D world of floating islands. It reads repositories, pull requests and
pipeline runs from **Azure DevOps**, **GitHub**, or a built-in **mock** dataset,
and shows them as places, creatures and buildings. Anyone can clone it, put their
own credentials in `.env`, and see their own estate.

Clean-room rule for every contributor: this is written from this specification
only. Do not read, copy or paraphrase any other existing codebase.

## Concept

| Real thing | In the world |
| --- | --- |
| Repository | A **district**: a floating island with an HQ building, a plaza and a nursery |
| Open (non-draft) pull request | A **creature** wandering its district's plaza |
| Draft pull request | An **egg** in its district's nursery |
| Pipeline / workflow | A **tower** standing on its home district (or on the Outskirts island when its home is not watched/unknown) |
| Pipeline covering several repos | **Links** (glowing cables) from the tower to every covered district |
| Detected problem | An **incident** with a visual **effect** (fire, smoke, crowd, storm, beacon, giant) and a row in the Problems panel |

Creatures never leave their own district. A backed-up review queue shows up as a
crowd in the plaza. A failing pipeline that covers several repos shows broken
red links and a storm over every covered district: one failure, many places hurt.

## Runtime architecture

```
provider (mock | azure | github)  --poll-->  server (Node, port 8787)
                                               | holds config + snapshot in memory
                                               | buildCity(snapshot, config, now)  (pure)
                                               v
                                   WebSocket /ws  --state-->  browser (Vite + three.js)
                                               <--setConfig / refresh / mockOp--
```

- The **server is the source of truth**. Every connected tab sees the same world.
  A reload costs nothing. Nothing is written to disk.
- **Secrets live only in server environment variables**. They are never sent to
  the browser, never logged, never part of any config object.
- `npm run dev`: starts the server (tsx watch) and Vite together. Vite proxies `/ws` and `/health` to the server.
- `npm run build && npm start`: the server also serves `dist/` so one port does everything.
- `GET /health` → `200 {"ok":true}`.
- If the server goes away, the page shows *Reconnecting* and retries with capped
  backoff (1s doubling to 15s). It never claims "no problems" for a world it has not received.

## Data model (normalized snapshot)

All providers produce the same `Snapshot` (see `shared/types.ts`, the binding contract).
IDs are provider-prefixed strings so they never collide (e.g. `gh:owner/name`,
`az:<guid>`, `mock:payments`).

## Pull request mood (first match wins)

`ageHours` = now − `updatedAt ?? createdAt`.

Drafts (zone `nursery`): `stale` if age ≥ `staleDays`, otherwise `egg`.

Open PRs (zone `plaza`):
1. verdict `rejected` → `rejected`
2. `hasConflicts` → `blocked`
3. verdict `changesRequested` or `waitingOnAuthor` → `changes`
4. verdict `approved` → `approved`
5. age ≥ `staleDays` → `stale`
6. age ≥ `waitingHours` → `waiting`
7. otherwise → `fresh`

Check state (`none|pending|success|failure`) is a separate overlay on the creature:
hourglass while pending, red X on failure, nothing otherwise.

## Pipelines

- `status` = result of the newest run (`none` when there are no runs).
- `failStreak` = number of consecutive newest runs with result `failure`.
- `kind` is `release` when the provider says so (ADO folder path or name containing
  "release"/"deploy"; GitHub workflow name/path containing "release"/"deploy"), else `ci`.
- Coverage: a pipeline covers its home repo, plus any repos listed for it in the
  optional `isles.config.json` `coverage` map (pipeline name → repo names). Providers
  cannot discover cross-repo coverage themselves.

## Incident rules (each can be toggled in config)

| Rule id | Fires when | Severity | Effect | Targets |
| --- | --- | --- | --- | --- |
| `pipelineFailing` | tower status `failure` | `error`; `critical` if `failStreak ≥ failStreakHot` | `fire` | tower + home district |
| `sharedOutage` | failing tower covers ≥ 2 watched districts | `critical` | `storm` | tower + every covered district; its links become `broken` |
| `reviewCrowd` | ≥ `crowdSize` plaza creatures in mood `waiting`/`stale`/`changes` in one district | `warning`; `error` at 2× | `crowd` | district + those creatures |
| `draftPileup` | ≥ `draftPileup` eggs in one district | `warning` | `smoke` | district + eggs |
| `stalePrs` | ≥ 1 `stale` PR in a district (open or draft) | `warning` | `beacon` | district + those creatures |
| `staleRelease` | a `release` tower with no `success` run finishing within `releaseStaleDays` | `warning` | `smoke` | tower |
| `meltdown` | ≥ 3 districts with an `error`/`critical` incident | `critical` | `giant` | those districts |

District `health`: `bad` if any error/critical incident targets it, `warn` if a warning does, else `good`.
Incidents are sorted critical → error → warning, then by title. Incident ids are stable
(`<ruleId>:<primary target id>`), so the UI can keep selections across updates.

## Layout (deterministic, pure)

- Same input → same world, byte for byte. Use a seeded string hash, never `Math.random`, in core.
- Districts sorted by name, placed on a grid `cols = ceil(sqrt(n))`, each island 22×22 units, 6-unit gaps.
- Empty grid cells become **filler** islands (scenery only). There is always one
  **Outskirts** island (id `outskirts`) placed after the grid for towers without a watched home.
- Wooden **bridges** connect horizontally/vertically adjacent islands.
- Each district is laid out around the island centre (the camera looks from +x/+z): the plaza in the
  middle (radius 3), the HQ at the back so it never hides creatures, the nursery to the right
  (radius 1.8), and pipeline towers on four rings around them, filling inner rings first from the
  back-left. No tower stands between the camera and the plaza. 76 towers per island get their own
  non-overlapping spot; everything stays inside the island's rounded outline.
- Creature home positions are hashed inside their zone.

## The world (renderer)

- Orthographic isometric camera. Drag to pan: the ground you grab stays under the cursor (a press
  that moves under 6px is a click). Wheel, trackpad pinch and touch pinch zoom towards the cursor;
  arrow keys pan and +/- zoom. The view can pan anywhere over the world plus a little under half a
  screen, so the world never leaves the screen. Click selects; selection ring highlights.
- **Floating islands**: grass-topped slab with an irregular rocky underside that tapers
  to a point. Rock depth and silhouette are seeded per island.
- **Sky**: vertical gradient background with drifting clouds **below** the islands (decorative, not pickable).
- **Waterfalls**: at most 3 in the world, falling off camera-facing exterior island edges
  that are not blocked by a bridge. Animated with a single time uniform. Mist at the base.
- **Models**: every building, creature and piece of scenery is a real low-poly model, built
  from Blender Python scripts in `art/blender/` and exported to `public/models/kit.glb`
  (`npm run models`). The app ships the exported kit, so Blender is only needed to change it.
  Materials named `Accent`, `Beacon` and `Body` are recoloured at runtime.
- **Scenery**: pine, round and birch trees and three mossy boulders on free ground (instanced), seeded.
- **HQ**: a timber-framed town hall with a shingled roof and a stone corner tower; the spire,
  banner and flag take the district's health colour.
- **Towers**: CI pipelines are lighthouses fed by brass pipes; releases are harbour keeps with a
  brazier, crates and a crane. The lantern or brazier glows in the latest run's status colour.
  Towers follow the data: a pipeline that appears or disappears between polls gains or loses
  its tower without a reload.
- **Plaza and nursery**: a cobbled square with lamps and benches; a fenced hay paddock.
- **Creatures**: round 3D critters coloured by mood that waddle around their home spot facing
  where they walk; drafts are speckled eggs in straw nests that wobble. A check badge
  (hourglass, cross) floats above.
- **Links**: arcs from a tower to every *other* district it covers (none to its own home).
  Calm cyan when fine, pulsing red when broken.
- **Effects**: fire+smoke particles (`fire`), grey smoke (`smoke`), a ring + tight cluster (`crowd`),
  a low line of storm clouds with rain over the district's front edge plus a red ground tint, kept
  on the camera side so it never hides buildings (`storm`), a vertical light pillar (`beacon`),
  a huge low-poly monster towering over the affected districts (`giant`).
- **Labels**: district name signs always visible; tower names on hover/selection.
- `prefers-reduced-motion`: freeze all ambient animation (clouds, water, wandering, particles).
- If WebGL is unavailable the canvas hides and the HUD keeps working.

## HUD

- **Top bar**: product name; status pill `<Provider> · <scenario or org> · <n> problems`, plus
  connection state when not connected (`Reconnecting…`/`Offline`); buttons Problems, Legend, Settings.
- **Problems panel**: rows (severity dot, title, sub-line). Severity filter (All/Critical/Error/Warning).
  Click → camera focuses and the detail panel opens. Empty: "All clear". Before first state: "Waiting for server".
- **Detail panel** for the selected district/creature/tower: name, key facts, link out to the real
  PR/pipeline/repo URL (opens in new tab), and for towers a run-history strip (last 10 runs as coloured bars).
- **Legend panel**: moods, tower statuses, effects, with the live count of each in the world.
- **Settings panel**: provider (options for providers without server credentials are disabled with
  reason "not configured on server"), mock scenario, watched repos checklist (search box, select all/none),
  thresholds, rule toggles, poll interval, "Refresh now".
- **Mock lab** (mock provider only): set any pipeline's latest result, add a PR/draft, a CI pipeline
  or a release to a repo, age every PR by N days, reset scenario.
- Copy is short and plain. No tutorials, no "click here", no talk about how it was built.
- Every string from a provider is rendered with `textContent`, never `innerHTML`.

## Providers

### Mock
Scenarios are JSON files in `server/providers/mock/scenarios/`. Timestamps are stored relative
(`"ageHours": 30`) and resolved against "now" when loaded, so demos never go stale.
Required scenarios: `demo` (default; at least one of every rule except meltdown), `calm` (no
incidents), `shared-outage`, `review-crowd`, `nursery`, `meltdown`, `release-drift`, `big-org` (20+ repos).

### Azure DevOps (`PROVIDER=azure`)
Env: `AZURE_DEVOPS_ORG`, `AZURE_DEVOPS_PROJECTS` (comma list), `AZURE_DEVOPS_PAT` (Code: Read, Build: Read),
optional `AZURE_DEVOPS_URL` (default `https://dev.azure.com`). REST api-version 7.1, Basic auth `:<PAT>`.
Repos per project; active PRs per project (one request), reviewer votes → verdict
(10/5 approved, −5 waitingOnAuthor, −10 rejected, any −10 wins, then −5, then all-approved),
`mergeStatus == "conflicts"` → hasConflicts, `isDraft`. Build definitions with their repository id;
last 10 builds per definition (`status inProgress/notStarted` → running/queued; result
succeeded/partiallySucceeded/failed/canceled → success/partial/failure/cancelled).

### GitHub (`PROVIDER=github`)
Env: `GITHUB_TOKEN`, `GITHUB_OWNER` (user or org) and/or `GITHUB_REPOS` (comma list `owner/name`),
optional `GITHUB_API_URL` (default `https://api.github.com`, GitHub Enterprise supported).
Repos via REST (org listing, falling back to user listing; archived repos skipped). PRs per repo via one
GraphQL query: isDraft, reviewDecision (APPROVED/CHANGES_REQUESTED/REVIEW_REQUIRED), mergeable
(CONFLICTING → hasConflicts), statusCheckRollup state (PENDING/EXPECTED → pending, SUCCESS → success,
FAILURE/ERROR → failure). Workflows: REST workflow runs per repo (newest 50, grouped by workflow, 10 kept each);
`status != completed` → running/queued; conclusion success/failure/cancelled/… mapped.

### Errors
Providers throw `ProviderError` with `code` `auth | notFound | throttled | network | config`.
`throttled` carries `retryAfterSeconds`; the server waits `max(retryAfter, 2 × poll interval)` before
the next poll. The server keeps the last good world on error and reports the error in status.

## Config

`AppConfig` (non-secret) is held by the server, editable from Settings, broadcast to every tab.
Optional `isles.config.json` in the repo root seeds it (`watch`, `coverage`, `thresholds`, `rules`);
`isles.config.example.json` documents it. `.env.example` documents environment variables.

## Non-goals

No writes to any provider. No persistence. No user accounts. No sound.
