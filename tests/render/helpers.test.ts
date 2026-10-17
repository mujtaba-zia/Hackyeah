import { describe, expect, it } from "vitest";
import type { Bridge, Island } from "../../shared/types";
import { reconcileById } from "../../src/render/diff";
import { placeScenery } from "../../src/render/scenery";
import { selectWaterfallEdges } from "../../src/render/waterfalls";

describe("waterfall edge selection", () => {
  const islands: Island[] = [
    { id: "grid-a", kind: "district", origin: { x: 0, z: 0 }, size: { x: 14, z: 14 }, seed: 10 },
    { id: "grid-east", kind: "district", origin: { x: 20, z: 0 }, size: { x: 14, z: 14 }, seed: 11 },
    { id: "grid-south", kind: "district", origin: { x: 0, z: 20 }, size: { x: 14, z: 14 }, seed: 12 },
    { id: "bridged", kind: "outskirts", origin: { x: 0, z: 40 }, size: { x: 14, z: 14 }, seed: 13 },
    { id: "open", kind: "filler", origin: { x: 40, z: 40 }, size: { x: 14, z: 14 }, seed: 14 },
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

describe("seeded scenery", () => {
  it("stays on the round island and clear of the HQ, plaza, nursery and towers", () => {
    const island: Island = { id: "district", kind: "district", origin: { x: 0, z: 0 }, size: { x: 16, z: 16 }, seed: 847 };
    const reservations = {
      hq: { x: 4.5, z: 4.5 },
      plaza: { center: { x: 8, z: 8 }, radius: 2.6 },
      nursery: { center: { x: 11.55, z: 4.45 }, radius: 1.5 },
      towerPositions: [{ x: 3.3, z: 10.7 }, { x: 2.6, z: 8 }],
    };
    const distance = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
    const placements = placeScenery(island, reservations);

    expect(placements.length).toBeGreaterThan(5);
    for (const { position, variant } of placements) {
      expect(distance(position, { x: 8, z: 8 })).toBeLessThanOrEqual(8 * 0.88 - 0.6);
      expect(distance(position, reservations.hq)).toBeGreaterThanOrEqual(2.3);
      expect(distance(position, reservations.plaza.center)).toBeGreaterThanOrEqual(2.6 + 0.9);
      expect(distance(position, reservations.nursery.center)).toBeGreaterThanOrEqual(1.5 + 0.85);
      for (const tower of reservations.towerPositions) expect(distance(position, tower)).toBeGreaterThanOrEqual(2.4);
      expect([0, 1, 2]).toContain(variant);
    }
    expect(placeScenery(island, reservations)).toEqual(placements);
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
