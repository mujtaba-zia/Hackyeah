import { summarizeIslands } from "../../shared/summary";
import type { CityModel } from "../../shared/types";
import type { Store, UiState } from "../app/store";
import type { PickTarget } from "../render/index";
import { copy, moodLabel, resultLabel } from "./copy";
import { el } from "./dom";
import { ago, dot, latestRunAt } from "./parts";

/** How far from the pointer the tooltip sits, and how close it may come to the edge of the window. */
const OFFSET = 14;
const EDGE = 8;

function describe(city: CityModel, target: PickTarget): (Node | string)[] | null {
  if (target.kind === "district") {
    const district = city.districts.find((item) => item.id === target.id);
    const summary = summarizeIslands(city).get(target.id);
    if (!district || !summary) return null;
    const facts = [copy.pipelineCount(summary.towers.length)];
    if (summary.statuses.failure > 0) facts.push(`${summary.statuses.failure} ${copy.failing}`);
    if (summary.openPrs > 0) facts.push(copy.prCount(summary.openPrs));
    return [el("strong", {}, dot("health", district.health), district.name), el("span", { text: facts.join(" · ") })];
  }
  if (target.kind === "tower") {
    const tower = city.towers.find((item) => item.id === target.id);
    if (!tower) return null;
    const facts = [tower.kind === "release" ? copy.release : copy.ci, resultLabel[tower.status], ago(latestRunAt(tower), Date.now())];
    return [el("strong", {}, dot("status", tower.status), tower.name), el("span", { text: facts.filter(Boolean).join(" · ") })];
  }
  const creature = city.creatures.find((item) => item.id === target.id);
  if (!creature) return null;
  return [
    el("strong", {}, dot("mood", creature.mood), `#${creature.number} ${creature.title}`),
    el("span", { text: `${moodLabel[creature.mood]} · ${creature.author}` }),
  ];
}

/** Says what is under the pointer in the world, next to the pointer. */
export function mountTooltip(root: HTMLElement, store: Store): void {
  let pointerX = 0;
  let pointerY = 0;

  function place(): void {
    const left = Math.max(EDGE, Math.min(pointerX + OFFSET, window.innerWidth - root.offsetWidth - EDGE));
    const below = pointerY + OFFSET + 4;
    // Flip above the pointer rather than run off the bottom of the window.
    const top = below + root.offsetHeight > window.innerHeight - EDGE ? pointerY - root.offsetHeight - OFFSET : below;
    root.style.transform = `translate(${Math.round(left)}px, ${Math.round(Math.max(EDGE, top))}px)`;
  }

  window.addEventListener(
    "pointermove",
    (event) => {
      pointerX = event.clientX;
      pointerY = event.clientY;
      if (!root.hidden) place();
    },
    { passive: true },
  );

  let lastHover: PickTarget | null = null;
  let lastCity: CityModel | null = null;
  function render(state: UiState): void {
    const city = state.server?.city ?? null;
    if (state.hover === lastHover && city === lastCity) return;
    lastHover = state.hover;
    lastCity = city;
    const content = city && state.hover ? describe(city, state.hover) : null;
    root.hidden = content === null;
    if (content === null) return;
    root.replaceChildren(...content);
    place();
  }

  render(store.get());
  store.subscribe(render);
}
