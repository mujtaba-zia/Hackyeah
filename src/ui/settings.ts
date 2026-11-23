import { RULE_IDS, type AppConfig, type ClientState, type ProviderKind, type Thresholds } from "../../shared/types";
import { isWatched } from "../../core/selectRepos";
import type { Store, UiState } from "../app/store";
import type { HudActions } from "./actions";
import { copy, providerLabel, ruleLabel, thresholdLabel } from "./copy";
import { el } from "./dom";

const PROVIDERS: readonly ProviderKind[] = ["mock", "azure", "github"];

function field(label: string, control: HTMLElement): HTMLLabelElement {
  return el("label", { class: "field" }, el("span", { text: label }), control);
}

function numberInput(value: number, onCommit: (value: number) => void): HTMLInputElement {
  const input = el("input", { attrs: { type: "number", min: "1", step: "1", value: String(value), inputmode: "numeric" } });
  input.addEventListener("change", () => {
    const parsed = Number(input.value);
    if (Number.isFinite(parsed)) onCommit(parsed);
  });
  return input;
}

/**
 * The watch list after toggling one repo, always as repo ids. `null` (watch
 * everything) and hand-written names from isles.config.json are resolved
 * against the catalog first.
 */
export function toggleWatched(server: ClientState, repoId: string, watched: boolean): string[] {
  const configured = server.config.watchedRepoIds;
  const current = server.repoCatalog.filter((repo) => configured === null || isWatched(repo, configured)).map((repo) => repo.id);
  const next = current.filter((id) => id !== repoId);
  if (watched) next.push(repoId);
  return next;
}

export function mountSettings(panel: HTMLElement, store: Store, actions: HudActions): void {
  const setConfig = (patch: Partial<AppConfig>) => actions.send({ type: "setConfig", patch });
  const search = el("input", { attrs: { type: "search", placeholder: copy.searchRepos, "aria-label": copy.searchRepos } });
  const body = el("div", { class: "settings-body" });
  panel.append(el("header", {}, el("h2", { text: copy.settings })), body);

  let lastServer: ClientState | null = null;
  let lastKey = "";
  let repoList = el("ul", { class: "repo-list" });

  /** Hides repositories the filter does not match, and project headings left with nothing under them. */
  function applySearch(): void {
    const query = search.value.trim().toLowerCase();
    let heading: HTMLElement | null = null;
    for (const item of repoList.children) {
      if (!(item instanceof HTMLElement)) continue;
      if (item.dataset.name === undefined) {
        heading = item;
        heading.hidden = true;
        continue;
      }
      item.hidden = query !== "" && !item.dataset.name.includes(query);
      if (!item.hidden && heading) heading.hidden = false;
    }
  }
  search.addEventListener("input", applySearch);

  function build(server: ClientState): void {
    const { config } = server;
    const provider = el("select", { on: { change: () => setConfig({ provider: PROVIDERS.find((kind) => kind === provider.value) ?? config.provider }) } });
    for (const kind of PROVIDERS) {
      const available = server.available[kind];
      const option = el("option", {
        text: available ? providerLabel[kind] : `${providerLabel[kind]} (${copy.notConfigured})`,
        attrs: { value: kind },
      });
      option.disabled = !available;
      option.selected = kind === config.provider;
      provider.append(option);
    }

    const scenario = el("select", { on: { change: () => setConfig({ scenario: scenario.value }) } });
    for (const name of server.scenarios) {
      const option = el("option", { text: name, attrs: { value: name } });
      option.selected = name === config.scenario;
      scenario.append(option);
    }

    // The watch list, under a heading per project once there is more than one.
    const byProject = [...server.repoCatalog].sort((left, right) => left.project.localeCompare(right.project) || left.name.localeCompare(right.name));
    const grouped = new Set(byProject.map((repo) => repo.project)).size > 1;
    repoList = el("ul", { class: "repo-list" });
    let project: string | null = null;
    for (const repo of byProject) {
      if (grouped && repo.project !== project) {
        project = repo.project;
        repoList.append(el("li", { class: "repo-project", text: project }));
      }
      const box = el("input", { attrs: { type: "checkbox" } });
      box.checked = config.watchedRepoIds === null || isWatched(repo, config.watchedRepoIds);
      box.addEventListener("change", () => setConfig({ watchedRepoIds: toggleWatched(server, repo.id, box.checked) }));
      repoList.append(
        el("li", { attrs: { "data-name": `${repo.name} ${repo.project}`.toLowerCase() } }, el("label", {}, box, el("span", { text: repo.name }))),
      );
    }

    const thresholds = el("div", { class: "grid" });
    for (const key of Object.keys(thresholdLabel) as (keyof Thresholds)[]) {
      thresholds.append(
        field(thresholdLabel[key], numberInput(config.thresholds[key], (value) => setConfig({ thresholds: { ...config.thresholds, [key]: value } }))),
      );
    }

    const rules = el("div", { class: "rules" });
    for (const id of RULE_IDS) {
      const box = el("input", { attrs: { type: "checkbox" } });
      box.checked = config.rules[id];
      box.addEventListener("change", () => setConfig({ rules: { ...config.rules, [id]: box.checked } }));
      rules.append(el("label", { class: "check" }, box, el("span", { text: ruleLabel[id] })));
    }

    body.replaceChildren(
      el("section", {}, field(copy.provider, provider), config.provider === "mock" ? field(copy.scenario, scenario) : null),
      el(
        "section",
        {},
        el("h3", { text: copy.watchedRepos }),
        el(
          "div",
          { class: "inline" },
          search,
          el("button", { text: copy.watchAll, attrs: { type: "button" }, on: { click: () => setConfig({ watchedRepoIds: null }) } }),
          el("button", { text: copy.watchNone, attrs: { type: "button" }, on: { click: () => setConfig({ watchedRepoIds: [] }) } }),
        ),
        repoList,
      ),
      el(
        "section",
        {},
        el("h3", { text: copy.limits }),
        el(
          "div",
          { class: "grid" },
          field(copy.maxRepos, numberInput(config.maxRepos, (value) => setConfig({ maxRepos: value }))),
          field(copy.maxPrsPerRepo, numberInput(config.maxPrsPerRepo, (value) => setConfig({ maxPrsPerRepo: value }))),
        ),
      ),
      el("section", {}, el("h3", { text: copy.thresholds }), thresholds),
      el("section", {}, el("h3", { text: copy.rules }), rules),
      el(
        "section",
        { class: "inline" },
        field(copy.pollSeconds, numberInput(config.pollSeconds, (value) => setConfig({ pollSeconds: value }))),
        el("button", { text: copy.refreshNow, attrs: { type: "button" }, on: { click: () => actions.send({ type: "refresh" }) } }),
      ),
    );
    applySearch();
  }

  function render(state: UiState): void {
    panel.hidden = !state.panels.settings;
    const server = state.server;
    if (!server || server === lastServer) return;
    lastServer = server;
    const key = JSON.stringify([server.config, server.repoCatalog, server.available, server.scenarios]);
    if (key === lastKey) return;
    lastKey = key;
    build(server);
  }

  render(store.get());
  store.subscribe(render);
}
