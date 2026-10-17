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
| `shared/` | The contract: `types.ts` (Snapshot, AppConfig, CityModel, ClientState), `protocol.ts` (WebSocket messages), `config.ts` (defaults and the untrusted-input normalizer), `guards.ts`. | nothing |
| `core/` | Pure, deterministic logic: `selectRepos` (watch list + cap), `buildCity` (moods, towers, links, layout), `rules/` (one module per kind of problem). No clocks, randomness or I/O. | `shared` |
| `server/providers/` | Read-only data sources implementing `Provider`: `github/`, `azure/`, `mock/` (with JSON scenarios). | `shared` |
| `server/` | `env.ts` (environment + `isles.config.json`), `state.ts` (poll loop, caching, throttling, provider switching), `app.ts` (HTTP, `/health`, `/ws`, static files), `main.ts`. | `shared`, `core`, providers |
| `src/render/` | The three.js world behind `createWorldView()`: islands, sky, water, scenery, buildings, creatures, links, effects, labels, picking. | `shared` |
| `src/app/`, `src/ui/` | The client: socket with reconnect, a small store, and the HUD panels. | `shared`, `src/render` |

## One poll

1. `provider.listRepos()` lists everything the credentials can see, for the
   Settings watch list.
2. `selectRepos()` applies the watch list and `maxRepos`.
3. `provider.fetchSnapshot()` fetches PRs and pipeline runs for those repos only.
4. `buildCity(snapshot, config, now)` produces the world: districts, creatures,
   towers, links, bridges, and incidents sorted by severity.
5. The server broadcasts `ClientState` to every tab.

When only thresholds or rules change, step 4 reruns on the cached snapshot
without refetching. On a provider error the last good world stays on screen and
the status explains what happened. If the provider throttles, the next poll
waits `max(Retry-After, 2 × poll interval)`.

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

## Tests

`npm run check` runs the typechecker and Vitest. Core, providers and server
tests run in Node. HUD tests opt into jsdom. Nothing needs network access or a
GPU.
