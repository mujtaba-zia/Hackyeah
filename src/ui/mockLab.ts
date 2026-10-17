import type { ClientState, RunResult } from "../../shared/types";
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

export function mountMockLab(panel: HTMLElement, store: Store, actions: HudActions): void {
  const body = el("div", { class: "lab-body" });
  panel.append(el("header", {}, el("h2", { text: copy.mockLab })), body);

  function build(server: ClientState): void {
    const city = server.city;
    const pipelines = select((city?.towers ?? []).map((tower) => ({ value: tower.id, label: tower.name })));
    const results = select(RESULTS.map((result) => ({ value: result, label: resultLabel[result] })));
    const repos = select(server.repoCatalog.map((repo) => ({ value: repo.id, label: repo.name })));
    const days = el("input", { attrs: { type: "number", min: "1", step: "1", value: "3", "aria-label": copy.agePrs } });

    body.replaceChildren(
      el(
        "section",
        { class: "row" },
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
        { class: "row" },
        repos,
        el("button", { text: copy.addPr, attrs: { type: "button" }, on: { click: () => actions.send({ type: "mockOp", op: { kind: "addPullRequest", repoId: repos.value, draft: false } }) } }),
        el("button", { text: copy.addDraft, attrs: { type: "button" }, on: { click: () => actions.send({ type: "mockOp", op: { kind: "addPullRequest", repoId: repos.value, draft: true } }) } }),
      ),
      el(
        "section",
        { class: "row" },
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
      el("section", { class: "row" }, el("button", { class: "danger", text: copy.reset, attrs: { type: "button" }, on: { click: () => actions.send({ type: "mockOp", op: { kind: "reset" } }) } })),
    );
  }

  let lastKey = "";
  function render(state: UiState): void {
    const server = state.server;
    const mock = server?.config.provider === "mock";
    panel.hidden = !state.panels.mockLab || !mock;
    if (!server || !mock) return;
    // Rebuild only when the choices change, so open dropdowns keep their selection across broadcasts.
    const key = JSON.stringify([server.repoCatalog, server.city?.towers.map((tower) => [tower.id, tower.name])]);
    if (key === lastKey) return;
    lastKey = key;
    build(server);
  }

  render(store.get());
  store.subscribe(render);
}
