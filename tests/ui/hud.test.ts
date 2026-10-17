// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../../shared/config";
import type { ClientState, Incident } from "../../shared/types";
import { createStore, reconcileSelection, type UiState } from "../../src/app/store";
import type { PickTarget } from "../../src/render/index";
import { safeHref } from "../../src/ui/dom";
import { mountProblems } from "../../src/ui/problems";
import { toggleWatched } from "../../src/ui/settings";
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

function uiState(server: ClientState | null): UiState {
  return {
    server,
    connection: "open",
    selection: null,
    panels: { problems: true, legend: false, settings: false, mockLab: false },
    severity: "all",
    notice: null,
    webgl: true,
  };
}

function mount(server: ClientState | null) {
  const panel = document.createElement("aside");
  const store = createStore(uiState(server));
  const selected: { target: PickTarget | null; focus: unknown }[] = [];
  mountProblems(panel, store, { send: () => {}, select: (target, focus) => selected.push({ target, focus }) });
  const titles = () => [...panel.querySelectorAll(".problem .title")].map((node) => node.textContent);
  const empty = () => panel.querySelector(".empty")?.textContent;
  return { panel, store, selected, titles, empty };
}

describe("Problems panel", () => {
  it("never claims all clear before it has seen a world", () => {
    const { store, empty } = mount(null);
    expect(empty()).toBe("Waiting for server");
    store.set({ server: serverState({ city: null, status: { provider: "github", phase: "error", message: "GitHub authentication failed" } }) });
    expect(empty()).toBe("GitHub authentication failed");
    store.set({ server: serverState({ city: { ...sampleCity, incidents: [] } }) });
    expect(empty()).toBe("All clear");
  });

  it("filters by severity", () => {
    const { store, titles } = mount(serverState());
    const critical = sampleCity.incidents.filter((incident) => incident.severity === "critical").map((incident) => incident.title);
    store.set({ severity: "critical" });
    expect(titles()).toEqual(critical);
  });

  it("renders provider text as text, never markup", () => {
    const hostile: Incident = { ...sampleCity.incidents[0]!, id: "x", title: '<img src=x onerror="alert(1)">' };
    const { panel, titles } = mount(serverState({ city: { ...sampleCity, incidents: [hostile] } }));
    expect(titles()).toEqual(['<img src=x onerror="alert(1)">']);
    expect(panel.querySelector("img")).toBeNull();
  });

  it("selects the incident's tower before its district and flies to its focus", () => {
    const incident: Incident = {
      ...sampleCity.incidents[0]!,
      targets: { towers: ["t1"], districts: ["d1"], creatures: ["c1"] },
      focus: { x: 4, z: 9 },
    };
    const { panel, selected } = mount(serverState({ city: { ...sampleCity, incidents: [incident] } }));
    panel.querySelector<HTMLButtonElement>(".problem")?.click();
    expect(selected).toEqual([{ target: { kind: "tower", id: "t1" }, focus: { x: 4, z: 9 } }]);
  });
});

describe("watch list and selection", () => {
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
