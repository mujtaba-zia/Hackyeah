# Repo Isles — functional specification

Repo Isles turns the health of your source-control and CI estate into a living,
isometric 3D world of floating islands. It reads repositories, pull requests and
pipeline runs from **Azure DevOps**, **GitHub**, or a built-in **mock** dataset,
and shows them as places, creatures and buildings. Anyone can clone it, put their
own credentials in `.env`, and see their own estate.

It is for people who watch many repositories and many pipelines at once: the
whole estate has to be readable from one screen, and one glance has to say
where the trouble is.

Clean-room rule for every contributor: this is written from this specification
only. Do not read, copy or paraphrase any other existing codebase.

## Concept

| Real thing | In the world |
| --- | --- |
| Repository | A **district**: a floating island with an HQ building, a plaza and a nursery, as large as its pipelines need |
| Project (GitHub owner, Azure DevOps project) | A **group**: its districts' islands float together, joined by bridges, under the project's name |
| Open (non-draft) pull request | A **creature** wandering its district's plaza |
| Draft pull request | An **egg** in its district's nursery |
| Pipeline / workflow | A **tower** standing on its home district (or on the Outskirts island when its home is not watched/unknown) |
| Detected problem | An **incident** with a visual **effect** (fire, smoke, crowd, storm, giant), or only a row in the Problems list |

Creatures never leave their own district. A backed-up review queue shows up as a
crowd in the plaza. A failing pipeline that covers several repos throws a storm
over every covered district: one failure, many places hurt.

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
- A tower carries its last 10 runs (result, when it started and finished, branch) for the
  run strip in the HUD.
- Wherever pipelines are listed they come most urgent first: failing, partial, running,
  queued, cancelled, never run, passing; then by name.

## Incident rules (each can be toggled in config)

| Rule id | Fires when | Severity | Effect | Targets |
| --- | --- | --- | --- | --- |
| `pipelineFailing` | tower status `failure` | `error`; `critical` if `failStreak ≥ failStreakHot` | `fire` | tower + home district |
| `sharedOutage` | failing tower covers ≥ 2 watched districts | `critical` | `storm` | tower + every covered district |
| `reviewCrowd` | ≥ `crowdSize` plaza creatures in mood `waiting`/`stale`/`changes` in one district | `warning`; `error` at 2× | `crowd` | district + those creatures |
| `draftPileup` | ≥ `draftPileup` eggs in one district | `warning` | `smoke` | district + eggs |
| `stalePrs` | ≥ 1 `stale` PR in a district (open or draft) | `warning` | none (listed only) | district + those creatures |
| `staleRelease` | a `release` tower with no `success` run finishing within `releaseStaleDays` | `warning` | `smoke` | tower + home district |
| `meltdown` | ≥ 3 districts with an `error`/`critical` incident | `critical` | `giant` | those districts |

District `health`: `bad` if any error/critical incident targets it, `warn` if a warning does, else `good`.
A group's health is the worst of its districts'.
Incidents are sorted critical → error → warning, then by title. Incident ids are stable
(`<ruleId>:<primary target id>`), so the UI can keep selections across updates.

## Layout (deterministic, pure)

- Same input → same world, byte for byte. Use a seeded string hash, never `Math.random`, in core.
- **Island size follows the pipelines.** Islands are square plots of side 18, 22, 26, 30, 34, 38 or
  42 units holding a round island; a district gets the smallest whose tower spots hold all its
  towers (8, 20, 25, 43, 61, 82 and 108 spots). Each island's silhouette is seeded from its id.
- **Groups.** Districts are grouped by project; projects and the districts inside them are in name
  order. A project's islands form a round cluster on a grid, 5 units of sky apart, and wooden
  **bridges** join horizontally/vertically adjacent islands of the same project.
- **Packing.** The clusters are packed largest first, at least 12 units of sky apart, each where it
  keeps the smallest screen-shaped (wider than tall) view of the whole world, so the estate fills
  the screen instead of trailing off one edge.
- **Outskirts.** Towers whose home repository is not shown stand on one extra island (id
  `outskirts`), a group of its own. It exists only while there is such a tower. There are no
  scenery-only islands.
- Each district is laid out around the island centre (the camera looks from +x/+z): the plaza in the
  middle (radius 3), the HQ at the back so it never hides creatures, the nursery in front to the
  right (radius 1.8), and pipeline towers in staggered rows that face the camera (3.2 apart across
  the screen, rows 2.4 deep, every other row shifted half a spot), so each tower shows between the
  two in front of it. Spots fill outwards from the plaza, at least 2.88 apart, never in the strip
  between the camera and the plaza, and never outside the ground every island is guaranteed to
  have (90% of its radius). A larger island's spots begin with a smaller island's, so a repository
  that outgrows its island keeps its towers where they were.
- Creature home positions are hashed inside their zone.

## The world (renderer)

- Orthographic isometric camera. Drag to pan: the ground you grab stays under the cursor (a press
  that moves under 6px is a click). Wheel, trackpad pinch and touch pinch zoom towards the cursor;
  arrow keys pan, +/- zoom and 0 or Home shows everything. The view can pan anywhere over the world
  plus a little under half a screen, so the world never leaves the screen. Click selects and
  double-click flies there; a ring marks the selection.
- **Framing.** The view starts with the whole world fitted into the part of the screen that panels
  leave free, and refits when panels open or close or the world changes, until the user moves the
  camera. Flying to a district frames its island; a tower or a pull request zooms in closer.
- **Scale.** Everything that repeats (towers, trees, creatures, bridges, plazas) is drawn instanced,
  one batch per model part, so draw calls do not grow with the size of the estate. There are no
  per-tower lights; lights that glow are additive sprites.
- **Floating islands**: a round grassy top with a sandy shore and an irregular rocky underside that
  tapers to a point. Outline and rock depth are seeded per island.
- **Health glow**: a band around a district's shore, amber for `warn` and red for `bad`, strongest
  when zoomed out. Healthy islands have none, so trouble stands out.
- **Sky**: vertical gradient background with drifting clouds **below** the islands (decorative, not pickable).
- **Waterfalls**: at most 3 in the world, falling off camera-facing exterior island edges
  that are not blocked by a bridge. Animated with a single time uniform. Mist at the base.
- **Models**: every building, creature and piece of scenery is a real low-poly model, built
  from Blender Python scripts in `art/blender/` and exported to `public/models/kit.glb`
  (`npm run models`). The app ships the exported kit, so Blender is only needed to change it.
  Materials named `Accent`, `Status`, `Beacon` and `Body` are recoloured at runtime. The build
  refuses a model that would not fit: a tower wider than its spot, a stage whose height does not
  tell it from the others, a missing recoloured material.
- **Scenery**: pine, round and birch trees, mossy boulders, bushes and flower patches on free
  ground (instanced), seeded. Nothing tall grows between the camera and the plaza.
- **HQ**: a timber-framed town hall with a shingled roof and a stone corner tower; the spire,
  banner and flag take the district's health colour. The outskirts island has a small waystation
  instead.
- **Towers**: CI pipelines are banded lighthouses; releases are harbour keeps with an airship
  moored to the top. Each tower is built by its pipeline's latest run: queued, cancelled or never
  run shows only the **foundations** (footings, survey stakes, a stone pile); **running** shows it
  half built inside scaffolding with a hoist; **passing** (or partial) shows it finished;
  **failing** shows it snapped, its top fallen among rubble. The stages differ in height enough to
  tell apart from a distance. Every stage carries the status colour twice: as paint (`Status`:
  bands, roof, awnings, the airship's envelope) and as a light (`Beacon`) with a glow; running
  lights pulse. A **red beam** rises from every failing tower and stays visible when zoomed out.
  Towers follow the data: a pipeline that appears or disappears between polls gains or loses
  its tower without a reload.
- **Plaza and nursery**: a cobbled square with lamps and benches; a fenced hay paddock. Sandy
  footpaths run from the plaza to the town hall, the nursery and the nearest towers.
- **Creatures**: round 3D critters coloured by mood that waddle around their home spot facing
  where they walk; drafts are speckled eggs in straw nests that wobble. A check badge
  (hourglass, cross) floats above.
- **Effects**: fire+smoke particles (`fire`), grey smoke (`smoke`), a ring + tight cluster (`crowd`),
  a low line of storm clouds with rain over the district's front edge plus a red ground tint, kept
  on the camera side so it never hides buildings (`storm`),
  a mossy stone colossus standing beside the first affected district's town hall (`giant`).
- **Labels** are drawn over the canvas at a constant size, and carry more as the view zooms in:
  - Every district has a **nameplate** above its town hall: health dot, name, a badge with its
    number of incidents (in the worst severity's colour), one pip per pipeline in its status
    colour (most urgent first; proportional stripes beyond 12 pipelines), and its open pull
    requests. Zoomed far out the plate shrinks to the name and the status bar. Plates that would
    overlap give way, the ones in trouble last; the selected and the hovered one never do.
  - Each group's project name stands above its islands.
  - Failing towers are named from the middle distance; every tower is named up close and on
    hover/selection.
  - Hovering anything shows a tooltip: a district's pipelines, failures and open pull requests; a
    pipeline's kind, status and when it last ran; a pull request's number, title, state and author.
- One palette (`shared/palette.ts`) colours both the world and the HUD, so a status is the same
  colour on a tower, a pip, a chip and in the legend.
- `prefers-reduced-motion`: freeze all ambient animation (clouds, water, wandering, particles).
- If WebGL is unavailable the canvas hides and the HUD keeps working.

## HUD

- **Top bar**: product name; source pill `<Provider> · <scenario or org>` with connection state when
  not connected (`Reconnecting…`/`Offline`) and when the data was last updated; summary chips for
  repositories (count, and how many are `bad` and `warn`), pipelines (a status bar, count, failing
  and running), pull requests (count and how many wait on someone) and problems. A chip opens the
  list behind it; the pipelines chip opens the failing ones when there are any. Buttons Browse,
  Legend, Settings, Mock lab.
- **Browse panel** with three lists and one search box (`/` focuses it, Esc clears it); a row click
  flies the camera there and opens its details:
  - **Problems**: rows (severity dot, title, sub-line), filter All/Critical/Error/Warning with
    counts. Empty: "All clear". Before first state: "Waiting for server".
  - **Repos**: grouped by project with each group's health, or worst first. A row shows health,
    name, incident badge, a status bar of its pipelines, and counts of pipelines, PRs and drafts.
    The outskirts island is listed when it exists. When the source has more repositories than
    `maxRepos`, the list says "Showing n of m repositories."
  - **Pipelines**: every pipeline, most urgent first, with its repository, kind, recent runs and
    when it last ran; filter by status with counts. Long lists are cut off with a prompt to
    refine the search.
  - Search matches names, and for repositories the project, for pipelines the repository.
    When nothing matches: "Nothing matches".
- **Detail panel** for the selected district/creature/tower: name, key facts, link out to the real
  PR/pipeline/repo URL (opens in new tab). A district lists its problems, its pipelines (most
  urgent first, each with a run strip) and its pull requests with their age; a tower shows its
  repository, status, its latest run (when, how long it took, branch), failures in a row, how many
  recent runs passed, the other repositories it covers, and a strip of its last 10 runs. Rows
  inside it select what they name.
- **Legend panel**: how to read the world, then pull request moods, pipeline statuses and problem
  effects with the live count of each.
- **Settings panel**: provider (options for providers without server credentials are disabled with
  reason "not configured on server"), mock scenario, watched repos checklist grouped by project
  (search box, select all/none), limits (`maxRepos`, `maxPrsPerRepo`), thresholds, rule toggles,
  poll interval, "Refresh now".
- **Mock lab** (mock provider only): set any pipeline's latest result, add a PR/draft, a CI pipeline
  or a release to a repo, age every PR by N days, reset scenario.
- **View controls** (bottom right): zoom in, zoom out, show everything, and a card listing the
  mouse and keyboard controls.
- The top bar wraps onto more rows in a narrow window, and the panels start below wherever it ends.
  On a narrow screen the lists become a sheet at the bottom and the other panels sit above it; the
  world is then framed in the band between the top bar and the sheet.
- Copy is short and plain. No tutorials, no "click here", no talk about how it was built.
- Every string from a provider is rendered with `textContent`, never `innerHTML`.

## Providers

### Mock
Scenarios are JSON files in `server/providers/mock/scenarios/`. Timestamps are stored relative
(`"ageHours": 30`) and resolved against "now" when loaded, so demos never go stale; a run may
give `"minutes"`, how long it took.
Required scenarios: `demo` (default; several projects, and at least one of every rule except
meltdown), `calm` (no incidents), `shared-outage`, `review-crowd`, `nursery`, `meltdown`,
`release-drift`, `big-org` (20+ repos and 100+ pipelines, most of them healthy).

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
`maxRepos` (default 24, at most 64) caps how many repositories are shown.

## Non-goals

No writes to any provider. No persistence. No user accounts. No sound.
