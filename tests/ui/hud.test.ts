// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../../shared/config";
import type { ClientState, Incident, Vec2 } from "../../shared/types";
import { createStore, reconcileSelection, type UiState } from "../../src/app/store";
import type { PickTarget } from "../../src/render/index";
import type { HudActions } from "../../src/ui/actions";
import { safeHref } from "../../src/ui/dom";
import { mountNav } from "../../src/ui/nav";
import { toggleWatched } from "../../src/ui/settings";
import { mountTopBar } from "../../src/ui/topBar";
import { sampleCity } from "../fixtures/sampleCity";

function serverState(overrides: Partial<ClientState> = {}): ClientState {
  return {
    config: DEFAULT_CONFIG,
    status: { provider: "mock", phase: "ok" },
    city: sampleCity,
    repoCatalog: sampleCity.districts.map((district) => ({ id: district.id, name: district.name, project: district.project })),
    scenarios: ["demo"],
    available: { mock: true, azure: false, github: false },
    sourceLabel: "demo",
    ...overrides,
  };
}

function uiState(server: ClientState | null, overrides: Partial<UiState> = {}): UiState {
  return {
    server,
    connection: "open",
    selection: null,
    panels: { nav: true, legend: false, settings: false, mockLab: false },
    tab: "problems",
    query: "",
    severity: "all",
    status: "all",
    hover: null,
    notice: null,
    webgl: true,
    ...overrides,
  };
}

function mount(server: ClientState | null, overrides: Partial<UiState> = {}) {
  const panel = document.createElement("aside");
  const store = createStore(uiState(server, overrides));
  const went: PickTarget[] = [];
  const looked: Vec2[] = [];
  const actions: HudActions = {
    send: () => {},
    select: () => {},
    goTo: (target) => went.push(target),
    lookAt: (point) => looked.push(point),
    fitWorld: () => {},
    zoom: () => {},
  };
  mountNav(panel, store, actions);
  const titles = () => [...panel.querySelectorAll(".row .title")].map((node) => node.textContent);
  const empty = () => panel.querySelector(".empty")?.textContent;
  const row = (title: string) => [...panel.querySelectorAll<HTMLButtonElement>(".row")].find((node) => node.querySelector(".title")?.textContent === title);
  return { panel, store, went, looked, titles, empty, row };
}

describe("Problems list", () => {
  it("never claims all clear before it has seen a world", () => {
    const { store, empty } = mount(null);
    expect(empty()).toBe("Waiting for server");
    store.set({ server: serverState({ city: null, status: { provider: "github", phase: "error", message: "GitHub authentication failed" } }) });
    expect(empty()).toBe("GitHub authentication failed");
    store.set({ server: serverState({ city: { ...sampleCity, incidents: [] } }) });
    expect(empty()).toBe("All clear");
  });

  it("filters by severity and by what is typed, and says when nothing is left", () => {
    const { store, titles, empty } = mount(serverState());
    const critical = sampleCity.incidents.filter((incident) => incident.severity === "critical").map((incident) => incident.title);
    expect(critical.length).toBeGreaterThan(0);
    store.set({ severity: "critical" });
    expect(titles()).toEqual(critical);

    store.set({ severity: "all", query: "  DOCS " });
    expect(titles()).toEqual(sampleCity.incidents.filter((incident) => incident.title.includes("Docs")).map((incident) => incident.title));
    store.set({ query: "no such problem" });
    expect(titles()).toEqual([]);
    expect(empty()).toBe("Nothing matches");
  });

  it("renders provider text as text, never markup", () => {
    const hostile: Incident = { ...sampleCity.incidents[0]!, id: "x", title: '<img src=x onerror="alert(1)">' };
    const { panel, titles } = mount(serverState({ city: { ...sampleCity, incidents: [hostile] } }));
    expect(titles()).toEqual(['<img src=x onerror="alert(1)">']);
    expect(panel.querySelector("img")).toBeNull();
  });

  it("goes to the incident's tower before its district, and to its focus when it has neither", () => {
    const withTargets: Incident = { ...sampleCity.incidents[0]!, id: "a", title: "With targets", targets: { towers: ["t1"], districts: ["d1"], creatures: ["c1"] } };
    const without: Incident = { ...withTargets, id: "b", title: "Without targets", targets: { towers: [], districts: [], creatures: [] }, focus: { x: 4, z: 9 } };
    const { row, went, looked } = mount(serverState({ city: { ...sampleCity, incidents: [withTargets, without] } }));
    row("With targets")?.click();
    row("Without targets")?.click();
    expect(went).toEqual([{ kind: "tower", id: "t1" }]);
    expect(looked).toEqual([{ x: 4, z: 9 }]);
  });
});

describe("Repos list", () => {
  it("groups repositories by project and narrows to a name or project that is typed", () => {
    const { panel, store, titles } = mount(serverState(), { tab: "repos" });
    expect([...panel.querySelectorAll(".group-head span:not(.count)")].map((node) => node.textContent)).toEqual(sampleCity.groups.filter((group) => group.id !== "outskirts").map((group) => group.name));
    expect(titles()).toContain("Outskirts");

    store.set({ query: "reven" });
    expect(titles()).toEqual(["Billing", "Checkout"]);
    store.set({ query: "atl" });
    expect(titles()).toEqual(["Atlas"]);
  });

  it("puts the repositories in the most trouble first when asked", () => {
    const { panel, titles } = mount(serverState(), { tab: "repos" });
    [...panel.querySelectorAll<HTMLButtonElement>(".nav-tools .choice")].find((button) => button.textContent === "Worst first")?.click();
    const health = new Map(sampleCity.districts.map((district) => [district.name, district.health]));
    const order = titles().filter((title) => title !== "Outskirts").map((title) => health.get(title ?? ""));
    expect(order).toEqual([...order].sort((left, right) => ["bad", "warn", "good"].indexOf(left ?? "") - ["bad", "warn", "good"].indexOf(right ?? "")));
    expect(order[0]).toBe("bad");
  });

  it("flies to a repository when its row is clicked, and to the outskirts island for pipelines without one", () => {
    const { row, went, looked } = mount(serverState(), { tab: "repos" });
    row("Checkout")?.click();
    row("Outskirts")?.click();
    const outskirts = sampleCity.islands.find((island) => island.kind === "outskirts")!;
    expect(went).toEqual([{ kind: "district", id: "mock:checkout" }]);
    expect(looked).toEqual([{ x: outskirts.origin.x + outskirts.size.x / 2, z: outskirts.origin.z + outskirts.size.z / 2 }]);
  });

  it("says so when the server can see more repositories than are shown", () => {
    const hidden = [
      { id: "mock:zeta", name: "Zeta", project: "Platform" },
      { id: "mock:yak", name: "Yak", project: "Platform" },
    ];
    const all = mount(serverState(), { tab: "repos" });
    expect(all.panel.querySelector(".nav-foot")?.textContent).toBe("");
    const capped = mount(serverState({ repoCatalog: [...serverState().repoCatalog, ...hidden] }), { tab: "repos" });
    expect(capped.panel.querySelector(".nav-foot")?.textContent).toContain("Showing 7 of 9 repositories.");
  });
});

describe("Pipelines list", () => {
  it("lists the most urgent pipelines first and narrows to one status", () => {
    const { store, titles } = mount(serverState(), { tab: "pipelines" });
    expect(titles()).toEqual(["Billing Release", "Frontend CI", "Edge Release", "Checkout CI", "Infra CI", "Atlas CI", "Docs CI", "Partner Sync"]);
    store.set({ status: "failure" });
    expect(titles()).toEqual(["Billing Release", "Frontend CI"]);
  });

  it("shows everything again once the last pipeline with the chosen status has moved on", () => {
    const healed = { ...sampleCity, towers: sampleCity.towers.map((tower) => ({ ...tower, status: "success" as const })) };
    const { titles } = mount(serverState({ city: healed }), { tab: "pipelines", status: "failure" });
    expect(titles()).toHaveLength(sampleCity.towers.length);
  });

  it("finds pipelines by their own name or their repository's, and goes to the one clicked", () => {
    const { store, titles, row, went } = mount(serverState(), { tab: "pipelines" });
    store.set({ query: "release" });
    expect(titles()).toEqual(["Billing Release", "Edge Release"]);
    store.set({ query: "outskirts" });
    expect(titles()).toEqual(["Partner Sync"]);
    row("Partner Sync")?.click();
    expect(went).toEqual([{ kind: "tower", id: "mock:pipeline:partner-sync" }]);
  });
});

describe("top bar", () => {
  it("opens the failing pipelines from the pipelines chip, and every pipeline when none is failing", () => {
    const bar = document.createElement("header");
    const store = createStore(uiState(serverState(), { panels: { nav: false, legend: false, settings: false, mockLab: false } }));
    mountTopBar(bar, store);
    const chip = bar.querySelector<HTMLButtonElement>('[data-chip="pipelines"]')!;
    expect(chip.textContent).toContain("8 pipelines");
    expect(chip.textContent).toContain("2 failing");

    chip.click();
    expect(store.get()).toMatchObject({ tab: "pipelines", status: "failure", panels: { nav: true } });

    store.set({ server: serverState({ city: { ...sampleCity, towers: sampleCity.towers.map((tower) => ({ ...tower, status: "success" as const })) } }) });
    chip.click();
    expect(store.get().status).toBe("all");
  });
});

describe("watch list and selection", () => {
  it("turns hand-written names into ids when a repo is toggled", () => {
    const server = serverState();
    const [first, second] = server.repoCatalog;
    const named = serverState({ config: { ...DEFAULT_CONFIG, watchedRepoIds: [first!.name.toUpperCase(), second!.name] } });
    expect(toggleWatched(named, second!.id, false)).toEqual([first!.id]);
  });

  it("expands 'watch everything' into an explicit list when one repo is unticked", () => {
    const server = serverState();
    const [first, ...rest] = server.repoCatalog.map((repo) => repo.id);
    expect(toggleWatched(server, first!, false)).toEqual(rest);
    const narrowed = serverState({ config: { ...DEFAULT_CONFIG, watchedRepoIds: rest } });
    expect(toggleWatched(narrowed, first!, true)).toEqual([...rest, first]);
  });

  it("drops a selection whose PR vanished from the newest world", () => {
    const creature = sampleCity.creatures[0]!;
    const selection: PickTarget = { kind: "creature", id: creature.id };
    expect(reconcileSelection(selection, serverState())).toEqual(selection);
    const without = { ...sampleCity, creatures: sampleCity.creatures.slice(1) };
    expect(reconcileSelection(selection, serverState({ city: without }))).toBeNull();
  });

  it("only lets http(s) links out", () => {
    expect(safeHref("https://github.com/o/r/pull/1")).toBe("https://github.com/o/r/pull/1");
    expect(safeHref("javascript:alert(1)")).toBeNull();
    expect(safeHref("data:text/html,hi")).toBeNull();
    expect(safeHref(undefined)).toBeNull();
  });
});
