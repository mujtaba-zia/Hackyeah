import { RULE_IDS, type AppConfig, type ClientState, type ProviderKind, type Thresholds } from "../../shared/types";
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

/** The watch list after toggling one repo; `null` (watch everything) expands to an explicit list first. */
export function toggleWatched(server: ClientState, repoId: string, watched: boolean): string[] {
  const current = server.config.watchedRepoIds ?? server.repoCatalog.map((repo) => repo.id);
  const next = current.filter((id) => id !== repoId);
  if (watched) next.push(repoId);
  return next;
}

export function mountSettings(panel: HTMLElement, store: Store, actions: HudActions): void {
  const setConfig = (patch: Partial<AppConfig>) => actions.send({ type: "setConfig", patch });
  const search = el("input", { attrs: { type: "search", placeholder: copy.searchRepos, "aria-label": copy.searchRepos } });
  const body = el("div", { class: "settings-body" });
  panel.append(el("header", {}, el("h2", { text: copy.settings })), body);

  let lastKey = "";
  let repoList = el("ul", { class: "repo-list" });

  function applySearch(): void {
    const query = search.value.trim().toLowerCase();
    for (const item of repoList.children) {
      if (item instanceof HTMLElement) item.hidden = query !== "" && !(item.dataset.name ?? "").includes(query);
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

    const watching = new Set(config.watchedRepoIds ?? server.repoCatalog.map((repo) => repo.id));
    repoList = el("ul", { class: "repo-list" });
    for (const repo of server.repoCatalog) {
      const box = el("input", { attrs: { type: "checkbox" } });
      box.checked = watching.has(repo.id);
      box.addEventListener("change", () => setConfig({ watchedRepoIds: toggleWatched(server, repo.id, box.checked) }));
      const item = el("li", { attrs: { "data-name": `${repo.name} ${repo.project}`.toLowerCase() } }, el("label", {}, box, el("span", { text: repo.name }), el("small", { text: repo.project })));
      repoList.append(item);
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
          { class: "row" },
          search,
          el("button", { text: copy.watchAll, attrs: { type: "button" }, on: { click: () => setConfig({ watchedRepoIds: null }) } }),
          el("button", { text: copy.watchNone, attrs: { type: "button" }, on: { click: () => setConfig({ watchedRepoIds: [] }) } }),
        ),
        repoList,
      ),
      el("section", {}, el("h3", { text: copy.thresholds }), thresholds),
      el("section", {}, el("h3", { text: copy.rules }), rules),
      el(
        "section",
        { class: "row" },
        field(copy.pollSeconds, numberInput(config.pollSeconds, (value) => setConfig({ pollSeconds: value }))),
        el("button", { text: copy.refreshNow, attrs: { type: "button" }, on: { click: () => actions.send({ type: "refresh" }) } }),
      ),
    );
    applySearch();
  }

  function render(state: UiState): void {
    panel.hidden = !state.panels.settings;
    const server = state.server;
    if (!server) return;
    const key = JSON.stringify([server.config, server.repoCatalog, server.available, server.scenarios]);
    if (key === lastKey) return;
    lastKey = key;
    build(server);
  }

  render(store.get());
  store.subscribe(render);
}
