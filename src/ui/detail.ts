import type { CityModel, Creature, District, Tower } from "../../shared/types";
import type { Store, UiState } from "../app/store";
import type { HudActions } from "./actions";
import { copy, moodLabel, resultLabel } from "./copy";
import { el, externalLink } from "./dom";

function facts(rows: readonly [label: string, value: string][]): HTMLDListElement {
  const list = el("dl", { class: "facts" });
  for (const [label, value] of rows) list.append(el("dt", { text: label }), el("dd", { text: value }));
  return list;
}

function districtBody(city: CityModel, district: District): (Node | string)[] {
  const towers = city.towers.filter((tower) => tower.islandId === district.id || tower.coversDistrictIds.includes(district.id));
  const problems = city.incidents.filter((incident) => incident.targets.districts.includes(district.id));
  return [
    facts([
      ["Project", district.project],
      ["Open PRs", String(district.openPrs)],
      ["Drafts", String(district.draftPrs)],
      ["Pipelines", towers.map((tower) => tower.name).join(", ") || "None"],
      ["Problems", problems.map((incident) => incident.title).join("; ") || copy.allClear],
    ]),
    externalLink(district.url, `${copy.open} repository`) ?? "",
  ];
}

function creatureBody(city: CityModel, creature: Creature): (Node | string)[] {
  const district = city.districts.find((item) => item.id === creature.districtId);
  return [
    facts([
      ["Repository", district?.name ?? creature.districtId],
      ["Author", creature.author],
      ["State", moodLabel[creature.mood]],
      ["Checks", creature.checks === "none" ? "None" : creature.checks],
      ["Age", copy.hoursAgo(creature.ageHours)],
    ]),
    externalLink(creature.url, `${copy.open} pull request`) ?? "",
  ];
}

function towerBody(city: CityModel, tower: Tower): (Node | string)[] {
  const covered = tower.coversDistrictIds.map((id) => city.districts.find((district) => district.id === id)?.name ?? id);
  const strip = el("ol", { class: "run-strip", attrs: { "aria-label": copy.runs } });
  // Oldest on the left so the strip reads like a timeline.
  for (const run of [...tower.history].reverse()) {
    const label = `${resultLabel[run.result]}${run.finishedAt ? ` · ${new Date(run.finishedAt).toLocaleString()}` : ""}`;
    const bar = el("li", { class: `run run-${run.result}`, title: label, attrs: { "aria-label": label } });
    strip.append(bar);
  }
  return [
    facts([
      ["Kind", tower.kind === "release" ? "Release" : "CI"],
      ["Status", resultLabel[tower.status]],
      ["Failures in a row", String(tower.failStreak)],
      [copy.covers, covered.join(", ") || "None"],
    ]),
    el("h3", { text: copy.runs }),
    strip,
    externalLink(tower.url, `${copy.open} pipeline`) ?? "",
  ];
}

export function mountDetail(panel: HTMLElement, store: Store, actions: HudActions): void {
  const title = el("h2");
  const close = el("button", {
    class: "close",
    text: "×",
    attrs: { type: "button", "aria-label": copy.close },
    on: { click: () => actions.select(null) },
  });
  const body = el("div", { class: "detail-body" });
  panel.append(el("header", {}, title, close), body);

  let lastKey = "";
  function render(state: UiState): void {
    const city = state.server?.city;
    const selection = state.selection;
    let heading = "";
    let content: (Node | string)[] = [];
    if (city && selection?.kind === "district") {
      const district = city.districts.find((item) => item.id === selection.id);
      if (district) [heading, content] = [district.name, districtBody(city, district)];
    } else if (city && selection?.kind === "creature") {
      const creature = city.creatures.find((item) => item.id === selection.id);
      if (creature) [heading, content] = [`#${creature.number} ${creature.title}`, creatureBody(city, creature)];
    } else if (city && selection?.kind === "tower") {
      const tower = city.towers.find((item) => item.id === selection.id);
      if (tower) [heading, content] = [tower.name, towerBody(city, tower)];
    }
    panel.hidden = heading === "";
    const key = JSON.stringify([selection, city?.generatedAt]);
    if (key === lastKey) return;
    lastKey = key;
    title.textContent = heading;
    body.replaceChildren(...content);
  }

  render(store.get());
  store.subscribe(render);
}
