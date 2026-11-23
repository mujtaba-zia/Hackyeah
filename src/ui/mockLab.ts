import type { ClientState, MockOp, RunResult } from "../../shared/types";
import type { Store, UiState } from "../app/store";
import type { HudActions } from "./actions";
import { copy, resultLabel } from "./copy";
import { el } from "./dom";

const RESULTS = Object.keys(resultLabel) as RunResult[];

function select(options: readonly { value: string; label: string }[]): HTMLSelectElement {
  const control = el("select");
  for (const { value, label } of options) control.append(el("option", { text: label, attrs: { value } }));
  return control;
}

/** Every pipeline, grouped under its repository so one can be found among hundreds. */
function pipelineSelect(server: ClientState): HTMLSelectElement {
  const control = el("select", { attrs: { "aria-label": copy.pipelines } });
  const city = server.city;
  if (!city) return control;
  const homes = new Map(city.districts.map((district) => [district.id, district.name]));
  const groups = new Map<string, HTMLOptGroupElement>();
  const towers = [...city.towers].sort((left, right) => {
    const leftHome = homes.get(left.islandId);
    const rightHome = homes.get(right.islandId);
    // Repositories by name, the outskirts last, then pipelines by name.
    if (leftHome !== rightHome) return leftHome === undefined ? 1 : rightHome === undefined ? -1 : leftHome.localeCompare(rightHome);
    return left.name.localeCompare(right.name);
  });
  for (const tower of towers) {
    const home = homes.get(tower.islandId) ?? copy.outskirts;
    let group = groups.get(home);
    if (!group) {
      group = el("optgroup", { attrs: { label: home } });
      groups.set(home, group);
      control.append(group);
    }
    group.append(el("option", { text: tower.name, attrs: { value: tower.id } }));
  }
  return control;
}

export function mountMockLab(panel: HTMLElement, store: Store, actions: HudActions): void {
  const body = el("div", { class: "lab-body" });
  panel.append(el("header", {}, el("h2", { text: copy.mockLab })), body);

  /** Keeps a control's current choice when the lab is rebuilt with new options. */
  function carryOver(role: string, next: HTMLSelectElement | HTMLInputElement): void {
    const previous = body.querySelector(`[data-role="${role}"]`);
    next.dataset.role = role;
    if (!(previous instanceof HTMLSelectElement || previous instanceof HTMLInputElement)) return;
    if (next instanceof HTMLSelectElement && ![...next.options].some((option) => option.value === previous.value)) return;
    next.value = previous.value;
  }

  function build(server: ClientState): void {
    const pipelines = pipelineSelect(server);
    const results = select(RESULTS.map((result) => ({ value: result, label: resultLabel[result] })));
    const repos = select(server.repoCatalog.map((repo) => ({ value: repo.id, label: repo.name })));
    const days = el("input", { attrs: { type: "number", min: "1", step: "1", value: "3", "aria-label": copy.agePrs } });
    carryOver("pipeline", pipelines);
    carryOver("result", results);
    carryOver("repo", repos);
    carryOver("days", days);
    /** A button that sends one mock operation for the chosen repository. */
    const add = (label: string, op: (repoId: string) => MockOp) =>
      el("button", { text: label, attrs: { type: "button" }, on: { click: () => actions.send({ type: "mockOp", op: op(repos.value) }) } });

    body.replaceChildren(
      el(
        "section",
        { class: "inline" },
        pipelines,
        results,
        el("button", {
          text: copy.setResult,
          attrs: { type: "button" },
          on: {
            click: () => {
              const result = RESULTS.find((value) => value === results.value);
              if (pipelines.value && result) actions.send({ type: "mockOp", op: { kind: "setPipelineResult", pipelineId: pipelines.value, result } });
            },
          },
        }),
      ),
      el(
        "section",
        { class: "inline" },
        repos,
        add(copy.addPr, (repoId) => ({ kind: "addPullRequest", repoId, draft: false })),
        add(copy.addDraft, (repoId) => ({ kind: "addPullRequest", repoId, draft: true })),
        add(copy.addPipeline, (repoId) => ({ kind: "addPipeline", repoId, release: false })),
        add(copy.addRelease, (repoId) => ({ kind: "addPipeline", repoId, release: true })),
      ),
      el(
        "section",
        { class: "inline" },
        el("label", { class: "field" }, el("span", { text: copy.agePrs }), days),
        el("button", {
          text: copy.apply,
          attrs: { type: "button" },
          on: {
            click: () => {
              const value = Number(days.value);
              if (Number.isFinite(value) && value > 0) actions.send({ type: "mockOp", op: { kind: "agePullRequests", days: value } });
            },
          },
        }),
      ),
      el("section", { class: "inline" }, el("button", { class: "danger", text: copy.reset, attrs: { type: "button" }, on: { click: () => actions.send({ type: "mockOp", op: { kind: "reset" } }) } })),
    );
  }

  let lastKey = "";
  let lastServer: ClientState | null = null;
  function render(state: UiState): void {
    const server = state.server;
    const mock = server?.config.provider === "mock";
    panel.hidden = !state.panels.mockLab || !mock;
    if (!server || !mock || server === lastServer) return;
    lastServer = server;
    // Rebuild only when the choices change, so open dropdowns keep their selection across broadcasts.
    const key = JSON.stringify([server.repoCatalog, server.city?.towers.map((tower) => [tower.id, tower.name, tower.islandId])]);
    if (key === lastKey) return;
    lastKey = key;
    build(server);
  }

  render(store.get());
  store.subscribe(render);
}
