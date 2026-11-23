import { summarizeIslands } from "../../shared/summary";
import type { CityModel, Creature, District, Tower } from "../../shared/types";
import type { Store, UiState } from "../app/store";
import type { HudActions } from "./actions";
import { copy, moodLabel, resultLabel, runVerb } from "./copy";
import { el, externalLink } from "./dom";
import { ago, dot, latestRunAt, runStrip, took } from "./parts";

/** Pull requests listed for a repository before the rest collapse into "n more". */
const MAX_PR_ROWS = 12;

interface Body {
  title: (Node | string)[];
  sub: (Node | string)[];
  content: (Node | string | null)[];
}

function facts(rows: readonly (readonly [label: string, value: Node | string] | null)[]): HTMLDListElement {
  const list = el("dl", { class: "facts" });
  for (const entry of rows) {
    if (entry) list.append(el("dt", { text: entry[0] }), el("dd", {}, entry[1]));
  }
  return list;
}

function section(heading: string, ...rows: HTMLElement[]): HTMLElement | null {
  return rows.length === 0 ? null : el("section", {}, el("h3", { text: heading }), el("ul", { class: "rows" }, ...rows));
}

export function mountDetail(panel: HTMLElement, store: Store, actions: HudActions): void {
  const title = el("h2");
  const sub = el("p", { class: "detail-sub" });
  const close = el("button", {
    class: "close",
    text: "×",
    attrs: { type: "button", "aria-label": copy.close },
    on: { click: () => actions.select(null) },
  });
  const body = el("div", { class: "detail-body" });
  panel.append(el("header", {}, el("div", { class: "detail-head" }, title, sub), close), body);

  /** A text button that flies to a repository. */
  function districtLink(city: CityModel, districtId: string): HTMLElement | string {
    const district = city.districts.find((item) => item.id === districtId);
    if (!district) return copy.outskirts;
    return el("button", { class: "link", text: district.name, attrs: { type: "button" }, on: { click: () => actions.goTo({ kind: "district", id: district.id }) } });
  }

  function towerRow(tower: Tower): HTMLElement {
    return el(
      "li",
      {},
      el(
        "button",
        { class: "row pipeline", attrs: { type: "button" }, on: { click: () => actions.goTo({ kind: "tower", id: tower.id }) } },
        dot("status", tower.status),
        el("span", { class: "title", text: tower.name, title: tower.name }),
        el("span", { class: "tag", text: tower.kind === "release" ? copy.release : copy.ci }),
        runStrip(tower.history),
      ),
    );
  }

  function creatureRow(creature: Creature): HTMLElement {
    const label = `#${creature.number} ${creature.title}`;
    return el(
      "li",
      {},
      el(
        "button",
        { class: "row pull-request", attrs: { type: "button" }, on: { click: () => actions.goTo({ kind: "creature", id: creature.id }) } },
        dot("mood", creature.mood),
        el("span", { class: "title", text: label, title: label }),
        el("span", { class: "when", text: copy.hoursAgo(creature.ageHours) }),
      ),
    );
  }

  function districtBody(city: CityModel, district: District): Body {
    const summary = summarizeIslands(city).get(district.id);
    const towers = summary?.towers ?? [];
    const elsewhere = city.towers.filter((tower) => tower.islandId !== district.id && tower.coversDistrictIds.includes(district.id));
    const pullRequests = city.creatures.filter((creature) => creature.districtId === district.id);
    const problems = city.incidents.filter((incident) => incident.targets.districts.includes(district.id));
    const failing = summary?.statuses.failure ?? 0;
    const prRows = pullRequests.slice(0, MAX_PR_ROWS).map(creatureRow);
    if (pullRequests.length > MAX_PR_ROWS) prRows.push(el("li", { class: "empty", text: copy.more(pullRequests.length - MAX_PR_ROWS) }));
    return {
      title: [dot("health", district.health), district.name],
      sub: [district.project],
      content: [
        facts([
          ["Open PRs", String(district.openPrs)],
          ["Drafts", String(district.draftPrs)],
          ["Pipelines", failing > 0 ? `${towers.length} · ${failing} ${copy.failing}` : String(towers.length)],
        ]),
        section(copy.problems, ...problems.map((incident) => el("li", { class: "problem-line" }, dot("severity", incident.severity), incident.title))),
        section(copy.pipelines, ...towers.map(towerRow)),
        section(copy.alsoBuiltBy, ...elsewhere.map(towerRow)),
        section(copy.pullRequests, ...prRows),
        externalLink(district.url, `${copy.open} repository`),
      ],
    };
  }

  function towerBody(city: CityModel, tower: Tower): Body {
    const latest = tower.history[0];
    const when = ago(latestRunAt(tower), Date.now());
    const duration = took(latest?.startedAt, latest?.finishedAt);
    const run = [runVerb[tower.status], when, duration ? `took ${duration}` : "", latest?.branch ?? ""].filter(Boolean).join(" · ");
    const finished = tower.history.filter((entry) => entry.result !== "running" && entry.result !== "queued");
    const passed = finished.filter((entry) => entry.result === "success").length;
    const covered = tower.coversDistrictIds.filter((id) => id !== tower.islandId);
    return {
      title: [dot("status", tower.status), tower.name],
      sub: [tower.kind === "release" ? copy.releasePipeline : copy.ciPipeline, " · ", districtLink(city, tower.islandId)],
      content: [
        facts([
          ["Status", resultLabel[tower.status]],
          latest ? ["Latest run", run] : null,
          tower.failStreak > 0 ? ["Failures in a row", String(tower.failStreak)] : null,
          finished.length > 0 ? ["History", copy.passed(passed, finished.length)] : null,
          covered.length > 0 ? ["Also covers", el("span", { class: "links" }, ...covered.map((id) => districtLink(city, id)))] : null,
        ]),
        tower.history.length > 0 ? el("section", {}, el("h3", { text: copy.runs }), runStrip(tower.history, true)) : null,
        externalLink(tower.url, `${copy.open} pipeline`),
      ],
    };
  }

  function creatureBody(city: CityModel, creature: Creature): Body {
    return {
      title: [`#${creature.number} ${creature.title}`],
      sub: ["Pull request · ", districtLink(city, creature.districtId)],
      content: [
        facts([
          ["Author", creature.author],
          ["State", el("span", { class: "with-dot" }, dot("mood", creature.mood), moodLabel[creature.mood])],
          ["Checks", creature.checks === "none" ? "None" : creature.checks],
          ["Age", copy.hoursAgo(creature.ageHours)],
        ]),
        externalLink(creature.url, `${copy.open} pull request`),
      ],
    };
  }

  let lastKey = "";
  function render(state: UiState): void {
    const city = state.server?.city;
    const selection = state.selection;
    const key = JSON.stringify([selection, city?.generatedAt]);
    if (key === lastKey) return;
    lastKey = key;

    let found: Body | null = null;
    if (city && selection?.kind === "district") {
      const district = city.districts.find((item) => item.id === selection.id);
      if (district) found = districtBody(city, district);
    } else if (city && selection?.kind === "creature") {
      const creature = city.creatures.find((item) => item.id === selection.id);
      if (creature) found = creatureBody(city, creature);
    } else if (city && selection?.kind === "tower") {
      const tower = city.towers.find((item) => item.id === selection.id);
      if (tower) found = towerBody(city, tower);
    }
    panel.hidden = found === null;
    if (found === null) return;
    title.replaceChildren(...found.title);
    sub.replaceChildren(...found.sub);
    body.replaceChildren(...found.content.filter((node) => node !== null));
  }

  render(store.get());
  store.subscribe(render);
}
