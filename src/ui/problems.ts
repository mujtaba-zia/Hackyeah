import type { Incident, Severity } from "../../shared/types";
import type { PickTarget } from "../render/index";
import type { Store, UiState } from "../app/store";
import type { HudActions } from "./actions";
import { copy, severityLabel } from "./copy";
import { el } from "./dom";

const FILTERS: readonly (Severity | "all")[] = ["all", "critical", "error", "warning"];

/** The entity a problem row selects: its tower, else its district, else its first PR. */
export function primaryTarget(incident: Incident): PickTarget | null {
  const tower = incident.targets.towers[0];
  if (tower) return { kind: "tower", id: tower };
  const district = incident.targets.districts[0];
  if (district) return { kind: "district", id: district };
  const creature = incident.targets.creatures[0];
  return creature ? { kind: "creature", id: creature } : null;
}

function emptyText(state: UiState): string {
  const server = state.server;
  if (!server) return copy.waitingForServer;
  if (!server.city) return server.status.message ?? copy.loading;
  return copy.allClear;
}

export function mountProblems(panel: HTMLElement, store: Store, actions: HudActions): void {
  const filter = el("select", {
    attrs: { "aria-label": "Severity" },
    on: { change: () => store.set({ severity: FILTERS.find((value) => value === filter.value) ?? "all" }) },
  });
  for (const value of FILTERS) filter.append(el("option", { text: severityLabel[value], attrs: { value } }));
  const list = el("ol", { class: "problem-list" });
  panel.append(el("header", {}, el("h2", { text: copy.problems }), filter), list);

  let lastKey = "";
  function render(state: UiState): void {
    panel.hidden = !state.panels.problems;
    filter.value = state.severity;
    const incidents = state.server?.city?.incidents ?? [];
    const key = JSON.stringify([incidents, state.severity, state.selection, emptyText(state)]);
    if (key === lastKey) return;
    lastKey = key;

    const shown = incidents.filter((incident) => state.severity === "all" || incident.severity === state.severity);
    list.replaceChildren();
    if (shown.length === 0) {
      list.append(el("li", { class: "empty", text: emptyText(state) }));
      return;
    }
    for (const incident of shown) {
      const target = primaryTarget(incident);
      const selected = target !== null && state.selection?.kind === target.kind && state.selection.id === target.id;
      list.append(
        el(
          "li",
          {},
          el(
            "button",
            {
              class: `problem severity-${incident.severity}${selected ? " selected" : ""}`,
              attrs: { type: "button", "data-incident": incident.id },
              on: { click: () => actions.select(target, incident.focus) },
            },
            el("span", { class: "dot", attrs: { "aria-hidden": "true" } }),
            el("span", { class: "title", text: incident.title }),
            el("span", { class: "sub", text: incident.detail }),
          ),
        ),
      );
    }
  }

  render(store.get());
  store.subscribe(render);
}
