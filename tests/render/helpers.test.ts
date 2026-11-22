import { describe, expect, it } from "vitest";
import { ISLAND_USABLE } from "../../shared/geometry";
import type { Bridge, Island } from "../../shared/types";
import { CameraRig } from "../../src/render/camera";
import { reconcileById } from "../../src/render/diff";
import { shoreShare } from "../../src/render/islands";
import { placeScenery } from "../../src/render/scenery";
import { selectWaterfallEdges } from "../../src/render/waterfalls";

describe("waterfall edge selection", () => {
  const islands: Island[] = [
    { id: "grid-a", kind: "district", origin: { x: 0, z: 0 }, size: { x: 14, z: 14 }, seed: 10 },
    { id: "grid-east", kind: "district", origin: { x: 20, z: 0 }, size: { x: 14, z: 14 }, seed: 11 },
    { id: "grid-south", kind: "district", origin: { x: 0, z: 20 }, size: { x: 14, z: 14 }, seed: 12 },
    { id: "bridged", kind: "outskirts", origin: { x: 0, z: 40 }, size: { x: 14, z: 14 }, seed: 13 },
    { id: "open", kind: "district", origin: { x: 40, z: 40 }, size: { x: 14, z: 14 }, seed: 14 },
  ];
  const bridges: Bridge[] = [
    { id: "a-east", from: { x: 14, z: 7 }, to: { x: 20, z: 7 } },
    { id: "a-south", from: { x: 7, z: 14 }, to: { x: 7, z: 20 } },
    { id: "bridged-east", from: { x: 14, z: 47 }, to: { x: 20, z: 47 } },
  ];

  it("caps deterministic exterior falls and omits bridged or interior edges", () => {
    const first = selectWaterfallEdges(islands, bridges);
    const second = selectWaterfallEdges(islands, bridges);

    expect(first).toEqual(second);
    expect(first.length).toBeLessThanOrEqual(3);
    expect(first.find((edge) => edge.islandId === "grid-a")).toBeUndefined();
    expect(first.find((edge) => edge.id === "bridged:east")).toBeUndefined();
  });
});

describe("island shoreline", () => {
  it("never comes inside the ground the layout builds on, and meets a bridge exactly at each compass point", () => {
    for (const seed of [0, 1, 847, 0x9e3779b9, 0xffffffff]) {
      for (let step = 0; step < 720; step += 1) {
        const share = shoreShare(seed, (step / 720) * Math.PI * 2);
        expect(share).toBeGreaterThanOrEqual(ISLAND_USABLE);
        expect(share).toBeLessThanOrEqual(1);
      }
      for (const quarter of [0, 1, 2, 3]) expect(shoreShare(seed, (quarter * Math.PI) / 2)).toBeCloseTo(1, 10);
    }
  });
});

describe("seeded scenery", () => {
  it("stays on the island and clear of the town hall, plaza, nursery, towers and bridge landings", () => {
    const island: Island = { id: "district", kind: "district", origin: { x: 0, z: 0 }, size: { x: 22, z: 22 }, seed: 847 };
    const reservations = {
      hq: { x: 7, z: 7 },
      plaza: { center: { x: 11, z: 11 }, radius: 3 },
      nursery: { center: { x: 16.2, z: 13 }, radius: 1.8 },
      towerPositions: [{ x: 5.9, z: 12.7 }, { x: 16.1, z: 5.9 }],
    };
    const distance = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
    const placements = placeScenery(island, reservations);

    expect(placements.length).toBeGreaterThan(20);
    expect(new Set(placements.map((placement) => placement.kind))).toEqual(new Set(["tree", "rock", "bush", "flowers"]));
    for (const { position, kind } of placements) {
      expect(distance(position, { x: 11, z: 11 })).toBeLessThan(11 * ISLAND_USABLE);
      expect(distance(position, reservations.hq)).toBeGreaterThan(2.1);
      expect(distance(position, reservations.plaza.center)).toBeGreaterThan(3 + 0.55);
      expect(distance(position, reservations.nursery.center)).toBeGreaterThan(1.8 + 0.7);
      for (const tower of reservations.towerPositions) expect(distance(position, tower)).toBeGreaterThan(1.75);
      for (const landing of [{ x: 22, z: 11 }, { x: 0, z: 11 }, { x: 11, z: 22 }, { x: 11, z: 0 }]) {
        expect(distance(position, landing)).toBeGreaterThan(1.7);
      }
      // Nothing tall stands between the camera (looking from +x/+z) and the plaza.
      const across = (position.x - 11 - (position.z - 11)) / Math.SQRT2;
      const depth = (position.x - 11 + (position.z - 11)) / Math.SQRT2;
      if (kind === "tree") expect(depth > 0 && Math.abs(across) < 3.6).toBe(false);
    }
    expect(placeScenery(island, reservations)).toEqual(placements);
  });
});

describe("camera", () => {
  function rig(): CameraRig {
    const camera = new CameraRig();
    camera.resize(1600, 900);
    camera.setWorldSize(400, 400);
    return camera;
  }

  it("maps the ground to the screen and back", () => {
    const camera = rig();
    camera.jumpTo({ x: 120, z: 80, zoom: 0.7 });
    const pixel = camera.project(133.5, 0, 61.25, { x: 0, y: 0 });
    const ground = camera.groundAt(pixel.x, pixel.y, { x: 0, z: 0 });
    expect(ground.x).toBeCloseTo(133.5, 6);
    expect(ground.z).toBeCloseTo(61.25, 6);
    // What the camera looks at is in the middle of the view; raising a point moves it up the screen.
    expect(camera.project(120, 0, 80, { x: 0, y: 0 })).toEqual({ x: 800, y: 450 });
    expect(camera.project(120, 5, 80, { x: 0, y: 0 }).y).toBeLessThan(450);
  });

  it("frames islands inside the part of the view that panels leave free", () => {
    const camera = rig();
    const insets = { top: 58, right: 360, bottom: 0, left: 380 };
    const padding = { top: 90, right: 20, bottom: 20, left: 20 };
    const discs = [
      { x: 20, z: 30, radius: 9, height: 8, depth: 2 },
      { x: 140, z: 60, radius: 15, height: 8, depth: 2 },
      { x: 70, z: 150, radius: 11, height: 8, depth: 2 },
    ];
    camera.setInsets(insets);
    camera.jumpTo(camera.poseFor(discs, 3, padding));

    let left = Infinity;
    let right = -Infinity;
    let top = Infinity;
    let bottom = -Infinity;
    for (const disc of discs) {
      // The disc's rim, its tallest point and its lowest, all the way round.
      for (let step = 0; step < 64; step += 1) {
        const angle = (step / 64) * Math.PI * 2;
        const x = disc.x + Math.cos(angle) * disc.radius;
        const z = disc.z + Math.sin(angle) * disc.radius;
        for (const y of [disc.height, -disc.depth]) {
          const pixel = camera.project(x, y, z, { x: 0, y: 0 });
          left = Math.min(left, pixel.x);
          right = Math.max(right, pixel.x);
          top = Math.min(top, pixel.y);
          bottom = Math.max(bottom, pixel.y);
        }
      }
    }
    expect(left).toBeGreaterThanOrEqual(insets.left + padding.left - 0.5);
    expect(right).toBeLessThanOrEqual(1600 - insets.right - padding.right + 0.5);
    expect(top).toBeGreaterThanOrEqual(insets.top + padding.top - 0.5);
    expect(bottom).toBeLessThanOrEqual(900 - insets.bottom - padding.bottom + 0.5);
    // It fills the frame in at least one direction rather than leaving the world small.
    const slackX = left - (insets.left + padding.left) + (1600 - insets.right - padding.right - right);
    const slackY = top - (insets.top + padding.top) + (900 - insets.bottom - padding.bottom - bottom);
    expect(Math.min(slackX, slackY)).toBeLessThan(2);
  });

  it("zooms about the pointer: the ground under it stays put", () => {
    const camera = rig();
    camera.jumpTo({ x: 200, z: 200, zoom: 1 });
    const before = camera.groundAt(1100, 300, { x: 0, z: 0 });
    camera.zoomAt(1.8, 1100, 300);
    const after = camera.groundAt(1100, 300, { x: 0, z: 0 });
    expect(camera.zoom).toBeCloseTo(1.8, 10);
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.z).toBeCloseTo(before.z, 6);
  });
});

describe("id reconciliation", () => {
  it("updates a changed mood without replacing its stable visual object", () => {
    interface Model {
      id: string;
      mood: string;
    }
    interface Visual {
      id: string;
      mood: string;
    }

    const visuals = new Map<string, Visual>();
    const options = {
      id(model: Model): string {
        return model.id;
      },
      create(model: Model): Visual {
        return { id: model.id, mood: model.mood };
      },
      update(visual: Visual, model: Model): void {
        visual.mood = model.mood;
      },
      dispose(): void {},
    };

    reconcileById(visuals, [{ id: "pr-17", mood: "waiting" }], options);
    const original = visuals.get("pr-17");
    reconcileById(visuals, [{ id: "pr-17", mood: "approved" }], options);

    expect(visuals.get("pr-17")).toBe(original);
    expect(visuals.get("pr-17")?.mood).toBe("approved");
  });
});
