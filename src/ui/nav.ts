import { STATUS_ORDER, compareTowers, emptyStatusCounts, summarizeIslands, type IslandSummary } from "../../shared/summary";
import type { CityModel, District, Health, Incident, RunResult, Severity, Tower } from "../../shared/types";
import type { NavTab, Store, UiState } from "../app/store";
import type { PickTarget } from "../render/index";
import type { HudActions } from "./actions";
import { copy, resultLabel, searchPlaceholder, severityLabel } from "./copy";
import { el } from "./dom";
import { ago, dot, latestRunAt, runStrip, statusBar } from "./parts";

const TABS: readonly NavTab[] = ["problems", "repos", "pipelines"];
const TAB_LABEL: Record<NavTab, string> = { problems: copy.problems, repos: copy.repos, pipelines: copy.pipelines };
const SEVERITIES: readonly (Severity | "all")[] = ["all", "critical", "error", "warning"];
const HEALTH_RANK: Record<Health, number> = { bad: 0, warn: 1, good: 2 };
/** Rows drawn in the pipelines list before asking for a narrower search. */
const MAX_PIPELINE_ROWS = 200;

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

function matches(query: string, ...texts: readonly string[]): boolean {
  return query === "" || texts.some((text) => text.toLowerCase().includes(query));
}

function isSelected(state: UiState, target: PickTarget | null): boolean {
  return target !== null && state.selection?.kind === target.kind && state.selection.id === target.id;
}

/** A filter button in a segmented control or chip row. */
function choice(label: string, count: number | null, pressed: boolean, onClick: () => void, status?: RunResult): HTMLButtonElement {
  return el(
    "button",
    { class: "choice", attrs: { type: "button", "aria-pressed": String(pressed) }, on: { click: onClick } },
    status ? dot("status", status) : null,
    label,
    count === null ? null : el("span", { class: "count", text: String(count) }),
  );
}

/** A list row. `key` names what it stands for, so focus can follow it across re-renders. */
function row(key: string, className: string, selected: boolean, onClick: () => void, ...children: (Node | string | null)[]): HTMLLIElement {
  return el(
    "li",
    {},
    el(
      "button",
      {
        class: `row ${className}${selected ? " selected" : ""}`,
        attrs: { type: "button", "data-key": key, "aria-current": String(selected) },
        on: { click: onClick },
      },
      ...children,
    ),
  );
}

export function mountNav(panel: HTMLElement, store: Store, actions: HudActions): void {
  const tabs = TABS.map((tab) =>
    el("button", { class: "tab", attrs: { type: "button", role: "tab", "data-tab": tab }, on: { click: () => store.set({ tab }) } }),
  );
  const tabList = el("div", { class: "tabs", attrs: { role: "tablist", "aria-label": copy.browse } }, ...tabs);
  tabList.addEventListener("keydown", (event) => {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (step === 0) return;
    const next = TABS[(TABS.indexOf(store.get().tab) + step + TABS.length) % TABS.length] ?? "problems";
    store.set({ tab: next });
    tabs[TABS.indexOf(next)]?.focus();
    event.preventDefault();
  });

  const search = el("input", { attrs: { type: "search", autocomplete: "off", spellcheck: "false" } });
  const clear = el("button", { class: "clear", text: "×", attrs: { type: "button", "aria-label": copy.clearSearch } });
  search.addEventListener("input", () => store.set({ query: search.value }));
  search.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    store.set({ query: "" });
    search.blur();
    event.stopPropagation();
  });
  clear.addEventListener("click", () => {
    store.set({ query: "" });
    search.focus();
  });
  // "/" jumps to the search box from anywhere that is not already a text field.
  document.addEventListener("keydown", (event) => {
    const typing = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement;
    if (event.key !== "/" || typing || event.metaKey || event.ctrlKey || event.altKey) return;
    store.set({ panels: { ...store.get().panels, nav: true } });
    search.focus();
    event.preventDefault();
  });

  const tools = el("div", { class: "nav-tools" });
  const list = el("ol", { class: "nav-list", attrs: { role: "tabpanel" } });
  const foot = el("p", { class: "nav-foot" });
  panel.append(tabList, el("div", { class: "search" }, search, clear), tools, list, foot);

  let worstFirst = false;
  let lastKey: unknown[] = [];
  let lastSelection: PickTarget | null = null;

  function problemRows(state: UiState, city: CityModel, query: string): HTMLLIElement[] {
    const counts: Record<Severity | "all", number> = { all: city.incidents.length, critical: 0, error: 0, warning: 0 };
    for (const incident of city.incidents) counts[incident.severity] += 1;
    tools.append(
      el(
        "div",
        { class: "choices", attrs: { role: "group", "aria-label": "Severity" } },
        ...SEVERITIES.map((severity) =>
          choice(severityLabel[severity], counts[severity], state.severity === severity, () => store.set({ severity })),
        ),
      ),
    );
    return city.incidents
      .filter((incident) => state.severity === "all" || incident.severity === state.severity)
      .filter((incident) => matches(query, incident.title, incident.detail))
      .map((incident) => {
        const target = primaryTarget(incident);
        const item = row(
          `incident:${incident.id}`,
          "problem",
          isSelected(state, target),
          () => (target ? actions.goTo(target) : actions.lookAt(incident.focus)),
          dot("severity", incident.severity),
          el("span", { class: "title", text: incident.title }),
          el("span", { class: "sub", text: incident.detail }),
        );
        item.firstElementChild?.setAttribute("data-severity", incident.severity);
        return item;
      });
  }

  function repoRow(state: UiState, district: District, summary: IslandSummary): HTMLLIElement {
    const target: PickTarget = { kind: "district", id: district.id };
    const facts = [copy.pipelineCount(summary.towers.length), copy.prCount(summary.openPrs)];
    if (summary.draftPrs > 0) facts.push(copy.draftCount(summary.draftPrs));
    const badge =
      summary.incidents > 0 && summary.worst
        ? el("span", { class: "badge", text: String(summary.incidents), attrs: { "data-severity": summary.worst, title: copy.problemsCount(summary.incidents) } })
        : null;
    return row(
      `district:${district.id}`,
      "repo",
      isSelected(state, target),
      () => actions.goTo(target),
      dot("health", district.health),
      el("span", { class: "title", text: district.name, title: district.name }),
      badge,
      el("span", { class: "sub" }, summary.towers.length > 0 ? statusBar(summary.statuses) : null, facts.join(" · ")),
    );
  }

  function repoRows(state: UiState, city: CityModel, query: string): HTMLElement[] {
    const summaries = summarizeIslands(city);
    const districts = new Map(city.districts.map((district) => [district.id, district]));
    const shown = (district: District): boolean => matches(query, district.name, district.project);
    tools.append(
      el("button", {
        class: "choice",
        text: copy.worstFirst,
        attrs: { type: "button", "aria-pressed": String(worstFirst) },
        on: {
          click: () => {
            worstFirst = !worstFirst;
            render(store.get());
          },
        },
      }),
    );

    const rows: HTMLElement[] = [];
    if (worstFirst) {
      const ranked = city.districts.filter(shown).sort((left, right) => {
        const incidents = (summaries.get(right.id)?.incidents ?? 0) - (summaries.get(left.id)?.incidents ?? 0);
        return HEALTH_RANK[left.health] - HEALTH_RANK[right.health] || incidents || left.name.localeCompare(right.name);
      });
      for (const district of ranked) {
        const summary = summaries.get(district.id);
        if (summary) rows.push(repoRow(state, district, summary));
      }
    } else {
      for (const group of city.groups) {
        const members = group.islandIds.flatMap((id) => districts.get(id) ?? []).filter(shown);
        if (members.length === 0) continue;
        rows.push(
          el(
            "li",
            { class: "group-head" },
            dot("health", group.health),
            el("span", { text: group.name }),
            el("span", { class: "count", text: copy.repoCount(members.length) }),
          ),
        );
        for (const district of members) {
          const summary = summaries.get(district.id);
          if (summary) rows.push(repoRow(state, district, summary));
        }
      }
    }

    // Pipelines whose repository is not shown stand on the outskirts island, which has no district to select.
    const outskirts = city.islands.find((island) => island.kind === "outskirts");
    const strays = outskirts ? summaries.get(outskirts.id) : undefined;
    if (outskirts && strays && matches(query, copy.outskirts)) {
      const centre = { x: outskirts.origin.x + outskirts.size.x / 2, z: outskirts.origin.z + outskirts.size.z / 2 };
      rows.push(
        row(
          "outskirts",
          "repo",
          false,
          () => actions.lookAt(centre),
          el("i", { class: "dot" }),
          el("span", { class: "title", text: copy.outskirts }),
          el("span", { class: "sub" }, statusBar(strays.statuses), copy.pipelineCount(strays.towers.length)),
        ),
      );
    }

    const total = state.server?.repoCatalog.length ?? 0;
    if (total > city.districts.length) {
      foot.append(
        copy.showing(city.districts.length, total),
        " ",
        el("button", {
          class: "link",
          text: copy.settings,
          attrs: { type: "button" },
          on: { click: () => store.set({ panels: { ...store.get().panels, settings: true } }) },
        }),
      );
    }
    return rows;
  }

  function pipelineRows(state: UiState, city: CityModel, query: string): HTMLElement[] {
    const districts = new Map(city.districts.map((district) => [district.id, district.name]));
    const home = (tower: Tower): string => districts.get(tower.islandId) ?? copy.outskirts;
    const counts = emptyStatusCounts();
    for (const tower of city.towers) counts[tower.status] += 1;
    // A filter whose last pipeline has moved on would leave an empty list with no way to tell why.
    const status = state.status !== "all" && counts[state.status] > 0 ? state.status : "all";
    tools.append(
      el(
        "div",
        { class: "choices", attrs: { role: "group", "aria-label": "Status" } },
        choice(copy.all, city.towers.length, status === "all", () => store.set({ status: "all" })),
        ...STATUS_ORDER.filter((candidate) => counts[candidate] > 0).map((candidate) =>
          choice(resultLabel[candidate], counts[candidate], status === candidate, () => store.set({ status: candidate }), candidate),
        ),
      ),
    );

    const now = Date.now();
    const found = city.towers
      .filter((tower) => status === "all" || tower.status === status)
      .filter((tower) => matches(query, tower.name, home(tower)))
      .sort(compareTowers);
    const rows: HTMLElement[] = found.slice(0, MAX_PIPELINE_ROWS).map((tower) => {
      const target: PickTarget = { kind: "tower", id: tower.id };
      return row(
        `tower:${tower.id}`,
        "pipeline",
        isSelected(state, target),
        () => actions.goTo(target),
        dot("status", tower.status),
        el("span", { class: "title", text: tower.name, title: tower.name }),
        el("span", { class: "when", text: ago(latestRunAt(tower), now) }),
        el(
          "span",
          { class: "sub" },
          el("span", { class: "tag", text: tower.kind === "release" ? copy.release : copy.ci }),
          el("span", { class: "where", text: home(tower) }),
          runStrip(tower.history),
        ),
      );
    });
    if (found.length > MAX_PIPELINE_ROWS) rows.push(el("li", { class: "empty", text: copy.moreRefine(found.length - MAX_PIPELINE_ROWS) }));
    return rows;
  }

  function render(state: UiState): void {
    panel.hidden = !state.panels.nav;
    const city = state.server?.city ?? null;
    tabs.forEach((tab, index) => {
      const id = TABS[index] ?? "problems";
      const count = city ? { problems: city.incidents.length, repos: city.districts.length, pipelines: city.towers.length }[id] : null;
      const selected = state.tab === id;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
      tab.replaceChildren(TAB_LABEL[id], count === null ? "" : el("span", { class: "count", text: String(count) }));
    });
    if (search.value !== state.query) search.value = state.query;
    search.placeholder = searchPlaceholder[state.tab];
    search.setAttribute("aria-label", searchPlaceholder[state.tab]);
    clear.hidden = state.query === "";

    const key = [city, state.tab, state.query, state.severity, state.status, state.selection, worstFirst, state.server?.repoCatalog.length, emptyText(state)];
    if (key.every((value, index) => value === lastKey[index])) return;
    lastKey = key;

    tools.replaceChildren();
    foot.replaceChildren();
    const query = state.query.trim().toLowerCase();
    let rows: HTMLElement[] = [];
    if (city) {
      if (state.tab === "problems") rows = problemRows(state, city, query);
      else if (state.tab === "repos") rows = repoRows(state, city, query);
      else rows = pipelineRows(state, city, query);
    }
    if (rows.length === 0) {
      const nothingToFilter = !city || (state.tab === "problems" && city.incidents.length === 0);
      rows = [el("li", { class: "empty", text: nothingToFilter ? emptyText(state) : copy.nothingMatches })];
    }
    // Rebuilding the list would drop keyboard focus; hand it back to the row for the same thing.
    const focused = document.activeElement instanceof HTMLElement && list.contains(document.activeElement) ? document.activeElement.dataset.key : undefined;
    list.replaceChildren(...rows);
    if (focused !== undefined) {
      for (const candidate of list.querySelectorAll<HTMLElement>("[data-key]")) {
        if (candidate.dataset.key === focused) candidate.focus();
      }
    }
    tools.hidden = tools.childElementCount === 0;
    foot.hidden = foot.childNodes.length === 0;

    // Bring a row into view when the selection came from the world rather than from this list.
    if (state.selection !== lastSelection) {
      lastSelection = state.selection;
      list.querySelector(".row.selected")?.scrollIntoView?.({ block: "nearest" });
    }
  }

  render(store.get());
  store.subscribe(render);
}
