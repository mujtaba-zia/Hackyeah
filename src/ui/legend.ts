import type { CityModel, EffectKind, Mood, RunResult } from "../../shared/types";
import type { Store, UiState } from "../app/store";
import { copy, effectLabel, moodLabel, pipelineLegendLabel, resultLabel } from "./copy";
import { el } from "./dom";

function tally<K extends string>(keys: readonly K[], values: readonly K[]): Record<K, number> {
  const counts = Object.fromEntries(keys.map((key) => [key, 0])) as Record<K, number>;
  for (const value of values) counts[value] += 1;
  return counts;
}

function section<K extends string>(heading: string, labels: Record<K, string>, counts: Record<K, number>, swatchClass: string): HTMLElement {
  const list = el("ul", { class: "legend-list" });
  for (const key of Object.keys(labels) as K[]) {
    list.append(
      el(
        "li",
        { class: counts[key] > 0 ? "" : "muted" },
        el("span", { class: `swatch ${swatchClass}-${key}`, attrs: { "aria-hidden": "true" } }),
        el("span", { text: labels[key] }),
        el("span", { class: "count", text: counts[key] > 0 ? String(counts[key]) : "" }),
      ),
    );
  }
  return el("section", {}, el("h3", { text: heading }), list);
}

export function legendCounts(city: CityModel | null | undefined): {
  moods: Record<Mood, number>;
  results: Record<RunResult, number>;
  effects: Record<EffectKind, number>;
} {
  return {
    moods: tally(Object.keys(moodLabel) as Mood[], city?.creatures.map((creature) => creature.mood) ?? []),
    results: tally(Object.keys(resultLabel) as RunResult[], city?.towers.map((tower) => tower.status) ?? []),
    effects: tally(Object.keys(effectLabel) as EffectKind[], city?.incidents.map((incident) => incident.effect) ?? []),
  };
}

export function mountLegend(panel: HTMLElement, store: Store): void {
  const body = el("div", { class: "legend-body" });
  panel.append(el("header", {}, el("h2", { text: copy.legend })), body);

  let lastCity: unknown = undefined;
  function render(state: UiState): void {
    panel.hidden = !state.panels.legend;
    const city = state.server?.city;
    if (city === lastCity) return;
    lastCity = city;
    const counts = legendCounts(city);
    body.replaceChildren(
      section("Pull requests", moodLabel, counts.moods, "mood"),
      section("Pipelines", pipelineLegendLabel, counts.results, "result"),
      section("Problems", effectLabel, counts.effects, "effect"),
    );
  }

  render(store.get());
  store.subscribe(render);
}
