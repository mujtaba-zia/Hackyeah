import { STATUS_ORDER, summarizeIslands, type IslandSummary } from "../../shared/summary";
import type { CityModel, RunResult, Tower } from "../../shared/types";
import type { CameraRig, ScreenPoint } from "./camera";
import type { PickTarget } from "./contracts";

/** How much detail labels carry, from the zoom: `far` shows names and a bar, `near` adds every tower's name. */
type Detail = "far" | "mid" | "near";

/** Up to this many pipelines each get their own pip on a nameplate; beyond it the bar shows proportions. */
const MAX_PIPS = 12;
/** Tower names appear for failing towers from `mid` detail on and for every tower when this close (pixels per world unit). */
const ALL_TOWER_NAMES = 30;
/** Labels this far outside the view are not worth placing. */
const OFFSCREEN_MARGIN = 80;
const TOWER_LABEL_HEIGHT = 20;

interface Anchor {
  x: number;
  y: number;
  z: number;
}

interface Label {
  element: HTMLElement;
  anchor: Anchor;
  target: PickTarget | null;
  /** Lower places first when labels compete for room. */
  rank: number;
  width: number;
  height: number;
  /** Where it was last placed: its box on screen, for picking and for keeping labels apart. */
  left: number;
  top: number;
  shown: boolean;
  /** A label at the same anchor that this one stacks on top of. */
  above?: Label;
}

interface TowerLabel extends Label {
  tower: Tower;
}

/** Where the world's labels hang, in world units above the ground. */
export interface LabelHeights {
  hall: number;
  waystation: number;
  tower(tower: Tower): number;
}

function element(tag: string, className: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function detailFor(pixelsPerUnit: number): Detail {
  if (pixelsPerUnit < 7) return "far";
  return pixelsPerUnit < 22 ? "mid" : "near";
}

/** The status bar on a nameplate: a pip per pipeline, or proportional stripes when there are too many for pips. */
function statusBar(summary: IslandSummary): HTMLElement {
  const bar = element("span", "plate-bar");
  const merged = summary.towers.length > MAX_PIPS;
  if (merged) bar.dataset.merged = "";
  const add = (status: RunResult, weight: number): void => {
    const piece = element("i", "");
    piece.dataset.status = status;
    if (merged) piece.style.flexGrow = String(weight);
    bar.append(piece);
  };
  if (merged) {
    for (const status of STATUS_ORDER) {
      if (summary.statuses[status] > 0) add(status, summary.statuses[status]);
    }
  } else {
    for (const tower of summary.towers) add(tower.status, 1);
  }
  return bar;
}

function overlaps(label: Label, placed: readonly Label[]): boolean {
  for (const other of placed) {
    if (label.left < other.left + other.width && other.left < label.left + label.width && label.top < other.top + other.height && other.top < label.top + label.height) {
      return true;
    }
  }
  return false;
}

/**
 * Nameplates over islands, names over towers and titles over projects, drawn as
 * DOM over the canvas so text stays sharp and the same size at any zoom. The
 * overlay never takes pointer events itself: the world asks it what is under
 * the pointer.
 */
export class WorldOverlay {
  private readonly plates = new Map<string, Label>();
  private readonly titles = new Map<string, Label>();
  private readonly towerLabels = new Map<string, TowerLabel>();
  private towers: readonly Tower[] = [];
  private heights: LabelHeights | null = null;
  private selected: PickTarget | null = null;
  private hovered: PickTarget | null = null;
  private detail: Detail | null = null;
  private stale = true;
  private readonly point: ScreenPoint = { x: 0, y: 0 };

  constructor(private readonly root: HTMLElement) {}

  update(city: CityModel, heights: LabelHeights): void {
    this.heights = heights;
    this.towers = city.towers;
    const summaries = summarizeIslands(city);
    const islands = new Map(city.islands.map((island) => [island.id, island]));

    const plateIds = new Set<string>();
    for (const district of city.districts) {
      const summary = summaries.get(district.id);
      if (!summary) continue;
      plateIds.add(district.id);
      const rank = district.health === "bad" ? 2 : district.health === "warn" ? 3 : 4;
      const plate = this.plate(district.id, { kind: "district", id: district.id }, { x: district.hq.x, y: heights.hall, z: district.hq.z }, rank);
      const signature = JSON.stringify([district.name, district.health, summary.towers.map((tower) => tower.status), summary.openPrs, summary.incidents, summary.worst]);
      if (plate.element.dataset.signature === signature) continue;
      plate.element.dataset.signature = signature;
      plate.element.dataset.health = district.health;
      const head = element("span", "plate-head");
      head.append(element("i", "plate-dot"), element("span", "plate-name", district.name));
      if (summary.incidents > 0 && summary.worst) {
        const alert = element("b", "plate-alert", String(summary.incidents));
        alert.dataset.severity = summary.worst;
        head.append(alert);
      }
      const facts = element("span", "plate-facts");
      if (summary.towers.length > 0) facts.append(statusBar(summary));
      if (summary.towers.length > MAX_PIPS) facts.append(element("span", "plate-count", String(summary.towers.length)));
      if (summary.openPrs > 0) facts.append(element("span", "plate-prs", `${summary.openPrs} PR${summary.openPrs === 1 ? "" : "s"}`));
      plate.element.replaceChildren(head, facts);
      this.stale = true;
    }
    const outskirts = islands.get("outskirts");
    const outskirtsSummary = summaries.get("outskirts");
    if (outskirts && outskirtsSummary) {
      plateIds.add(outskirts.id);
      const centre = { x: outskirts.origin.x + outskirts.size.x / 2, y: heights.waystation, z: outskirts.origin.z + outskirts.size.z / 2 };
      const plate = this.plate(outskirts.id, null, centre, 4);
      const signature = JSON.stringify(outskirtsSummary.towers.map((tower) => tower.status));
      if (plate.element.dataset.signature !== signature) {
        plate.element.dataset.signature = signature;
        plate.element.dataset.health = "none";
        const head = element("span", "plate-head");
        head.append(element("span", "plate-name", "Outskirts"));
        const facts = element("span", "plate-facts");
        facts.append(statusBar(outskirtsSummary));
        plate.element.replaceChildren(head, facts);
        this.stale = true;
      }
    }
    this.prune(this.plates, plateIds);

    const titleIds = new Set<string>();
    for (const group of city.groups) {
      // With a single project its name would only repeat what the status pill already says.
      if (city.groups.length < 2 || group.id === "outskirts") continue;
      titleIds.add(group.id);
      let title = this.titles.get(group.id);
      if (!title) {
        title = this.label(element("div", "group-title"), null, 5);
        this.titles.set(group.id, title);
      }
      // The title floats over the project's rearmost island, which is the highest on screen.
      let rear: { x: number; z: number } | null = null;
      let rearId = "";
      for (const district of city.districts) {
        if (!group.islandIds.includes(district.id)) continue;
        if (rear === null || district.hq.x + district.hq.z < rear.x + rear.z) {
          rear = district.hq;
          rearId = district.id;
        }
      }
      if (rear === null) continue;
      title.anchor = { x: rear.x, y: heights.hall, z: rear.z };
      title.above = this.plates.get(rearId);
      if (title.element.textContent !== group.name || title.element.dataset.health !== group.health) {
        title.element.textContent = group.name;
        title.element.dataset.health = group.health;
        this.stale = true;
      }
    }
    this.prune(this.titles, titleIds);

    const towerIds = new Set(city.towers.map((tower) => tower.id));
    this.prune(this.towerLabels, towerIds);
    for (const tower of city.towers) {
      const label = this.towerLabels.get(tower.id);
      if (!label) continue;
      label.tower = tower;
      label.anchor = { x: tower.position.x, y: heights.tower(tower), z: tower.position.z };
      this.fillTowerLabel(label);
    }
  }

  setSelected(target: PickTarget | null): void {
    this.mark(this.selected, "selected", false);
    this.selected = target;
    this.mark(target, "selected", true);
    this.stale = true;
  }

  setHovered(target: PickTarget | null): void {
    this.mark(this.hovered, "hovered", false);
    this.hovered = target;
    this.mark(target, "hovered", true);
    this.stale = true;
  }

  /** Places every label for the camera as it is now. Call whenever the view or the data changed. */
  layout(rig: CameraRig): void {
    const detail = detailFor(rig.pixelsPerUnit);
    if (detail !== this.detail) {
      this.detail = detail;
      this.root.dataset.detail = detail;
      this.stale = true;
    }
    if (this.stale) {
      // Sizes depend on text and on the detail level. Show everything, read every size, then hide again: one reflow.
      const sized = [...this.plates.values(), ...this.titles.values()];
      for (const label of sized) label.element.hidden = false;
      for (const label of sized) {
        label.width = label.element.offsetWidth;
        label.height = label.element.offsetHeight;
      }
      for (const label of sized) label.element.hidden = !label.shown;
      this.stale = false;
    }

    const placed: Label[] = [];
    const plates = [...this.plates.values()].sort((left, right) => this.rankOf(left) - this.rankOf(right));
    for (const plate of plates) this.place(plate, rig, placed, 8);
    for (const title of this.titles.values()) this.place(title, rig, placed, 8);

    const failingOnly = detail !== "far" && rig.pixelsPerUnit < ALL_TOWER_NAMES;
    const everyTower = rig.pixelsPerUnit >= ALL_TOWER_NAMES;
    const wanted: TowerLabel[] = [];
    for (const tower of this.towers) {
      const chosen = this.is(this.selected, "tower", tower.id) || this.is(this.hovered, "tower", tower.id);
      if (!chosen && !everyTower && !(failingOnly && tower.status === "failure")) {
        const hidden = this.towerLabels.get(tower.id);
        if (hidden) this.hide(hidden);
        continue;
      }
      wanted.push(this.towerLabel(tower, chosen));
    }
    wanted.sort((left, right) => left.rank - right.rank || STATUS_ORDER.indexOf(left.tower.status) - STATUS_ORDER.indexOf(right.tower.status));
    for (const label of wanted) this.place(label, rig, placed, 4);
  }

  /** What a label under this canvas pixel stands for. */
  hitTest(x: number, y: number): PickTarget | null {
    for (const labels of [this.towerLabels, this.plates]) {
      for (const label of labels.values()) {
        if (label.shown && label.target && x >= label.left && x <= label.left + label.width && y >= label.top && y <= label.top + label.height) {
          return label.target;
        }
      }
    }
    return null;
  }

  dispose(): void {
    this.root.replaceChildren();
    this.plates.clear();
    this.titles.clear();
    this.towerLabels.clear();
  }

  private label(node: HTMLElement, target: PickTarget | null, rank: number): Label {
    node.hidden = true;
    this.root.append(node);
    return { element: node, anchor: { x: 0, y: 0, z: 0 }, target, rank, width: 0, height: 0, left: 0, top: 0, shown: false };
  }

  private plate(id: string, target: PickTarget | null, anchor: Anchor, rank: number): Label {
    let plate = this.plates.get(id);
    if (!plate) {
      plate = this.label(element("div", "plate"), target, rank);
      this.plates.set(id, plate);
      if (this.is(this.selected, "district", id)) plate.element.dataset.selected = "";
    }
    plate.anchor = anchor;
    plate.rank = rank;
    return plate;
  }

  private towerLabel(tower: Tower, chosen: boolean): TowerLabel {
    let label = this.towerLabels.get(tower.id);
    if (!label) {
      const base = this.label(element("div", "tower-name"), { kind: "tower", id: tower.id }, 6);
      label = { ...base, tower, height: TOWER_LABEL_HEIGHT };
      label.anchor = { x: tower.position.x, y: this.heights?.tower(tower) ?? 0, z: tower.position.z };
      this.towerLabels.set(tower.id, label);
      this.fillTowerLabel(label);
    }
    label.rank = chosen ? 0 : 6;
    return label;
  }

  private fillTowerLabel(label: TowerLabel): void {
    const { tower, element: node } = label;
    const status: RunResult = tower.status;
    if (node.dataset.status === status && node.lastChild?.textContent === tower.name) return;
    node.dataset.status = status;
    node.replaceChildren(element("i", ""), element("span", "", tower.name));
    // Names are capped at 168px by the stylesheet; a guess is close enough to keep labels apart.
    label.width = Math.min(168, 30 + tower.name.length * 6.6);
  }

  private mark(target: PickTarget | null, flag: "selected" | "hovered", on: boolean): void {
    if (!target) return;
    const label = target.kind === "district" ? this.plates.get(target.id) : target.kind === "tower" ? this.towerLabels.get(target.id) : undefined;
    if (!label) return;
    if (on) label.element.dataset[flag] = "";
    else delete label.element.dataset[flag];
  }

  private is(target: PickTarget | null, kind: PickTarget["kind"], id: string): boolean {
    return target?.kind === kind && target.id === id;
  }

  /** The selected and hovered plates always win their spot. */
  private rankOf(plate: Label): number {
    if (plate.target && this.is(this.selected, plate.target.kind, plate.target.id)) return 0;
    if (plate.target && this.is(this.hovered, plate.target.kind, plate.target.id)) return 1;
    return plate.rank;
  }

  /** Puts a label above its anchor unless it is off screen or would cover one already placed. */
  private place(label: Label, rig: CameraRig, placed: Label[], gap: number): void {
    rig.project(label.anchor.x, label.anchor.y, label.anchor.z, this.point);
    label.left = Math.round(this.point.x - label.width / 2);
    label.top = Math.round(this.point.y - label.height - gap - (label.above?.shown ? label.above.height + 8 : 0));
    const offscreen =
      label.left > rig.width + OFFSCREEN_MARGIN ||
      label.left + label.width < -OFFSCREEN_MARGIN ||
      label.top > rig.height + OFFSCREEN_MARGIN ||
      label.top + label.height < -OFFSCREEN_MARGIN;
    if (offscreen || (label.rank > 1 && overlaps(label, placed))) {
      this.hide(label);
      return;
    }
    label.element.style.transform = `translate(${label.left}px, ${label.top}px)`;
    if (!label.shown) {
      label.element.hidden = false;
      label.shown = true;
    }
    placed.push(label);
  }

  private hide(label: Label): void {
    if (!label.shown) return;
    label.element.hidden = true;
    label.shown = false;
  }

  private prune<T extends Label>(labels: Map<string, T>, keep: ReadonlySet<string>): void {
    for (const [id, label] of labels) {
      if (keep.has(id)) continue;
      label.element.remove();
      labels.delete(id);
    }
  }
}
