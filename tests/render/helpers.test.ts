import { describe, expect, it } from "vitest";
import type { Bridge, Island } from "../../shared/types";
import { reconcileById } from "../../src/render/diff";
import { creatureTextureKey } from "../../src/render/textures";
import { isSceneryPlacementFree, placeScenery } from "../../src/render/scenery";
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
  it("keeps scenery off district areas and the reserved tower row", () => {
    const island: Island = {
      id: "district",
      kind: "district",
      origin: { x: 0, z: 0 },
      size: { x: 14, z: 14 },
      seed: 847,
    };
    const reservations = {
      hq: { x: 3, z: 3 },
      plaza: { center: { x: 7, z: 7 }, radius: 2.5 },
      nursery: { center: { x: 4, z: 10 }, radius: 2 },
      towerPositions: [{ x: 11.2, z: 4.2 }],
    };
    const placements = placeScenery(island, reservations);

    expect(placements.length).toBeGreaterThan(0);
    for (let index = 0; index < placements.length; index += 1) {
      const placement = placements[index];
      expect(placement).toBeDefined();
      if (!placement) continue;
      expect(isSceneryPlacementFree(island, placement.position, reservations)).toBe(true);
      expect(placement.position.x).toBeLessThanOrEqual(11.55);
    }
  });
});

describe("creature texture keys", () => {
  it("keeps mood and check overlays in distinct cache slots", () => {
    expect(creatureTextureKey("egg", "pending")).toBe("egg:pending");
    expect(creatureTextureKey("egg", "failure")).not.toBe(creatureTextureKey("egg", "pending"));
    expect(creatureTextureKey("fresh", "pending")).not.toBe(creatureTextureKey("egg", "pending"));
    expect(creatureTextureKey("rejected", "none")).toBe("rejected:none");
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
