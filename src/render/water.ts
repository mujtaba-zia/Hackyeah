import * as THREE from "three";
import type { RenderAssets } from "./assets";
import type { WaterfallEdge } from "./waterfalls";

export interface WaterfallVisual {
  readonly group: THREE.Group;
  update(edge: WaterfallEdge): void;
  dispose(): void;
}

/** A sheet of water pouring off an island's shore, with mist where it thins out. */
export function createWaterfallVisual(initial: WaterfallEdge, assets: RenderAssets): WaterfallVisual {
  const group = new THREE.Group();
  group.name = `waterfall:${initial.id}`;
  const sheet = new THREE.Mesh(assets.waterfallGeometry, assets.waterfallMaterial);
  sheet.renderOrder = 4;
  // A short lip of water on the grass, so the fall has somewhere to come from.
  const spring = new THREE.Mesh(assets.discGeometry, assets.waterfallMaterial);
  spring.renderOrder = 4;
  const mist = [0, 1, 2].map(() => new THREE.Sprite(assets.mistMaterial));
  group.add(sheet, spring, ...mist);
  let signature = "";

  function apply(edge: WaterfallEdge): void {
    const next = `${edge.side}:${edge.position.x}:${edge.position.z}:${edge.width}:${edge.depth}`;
    if (next === signature) return;
    signature = next;
    group.position.set(edge.position.x, 0, edge.position.z);
    group.rotation.y = edge.side === "east" || edge.side === "west" ? Math.PI * 0.5 : 0;
    sheet.scale.set(edge.width, edge.depth, 1);
    sheet.position.set(0, -edge.depth / 2 + 0.02, 0);
    spring.scale.set(edge.width, 1, edge.width * 0.9);
    spring.position.set(0, 0.07, 0);
    mist.forEach((puff, index) => {
      const size = edge.width * (1.5 - index * 0.25);
      puff.scale.set(size, size * 0.6, 1);
      puff.position.set((index - 1) * edge.width * 0.3, -edge.depth * (0.62 + index * 0.1), 0.1);
    });
  }

  apply(initial);
  return {
    group,
    update: apply,
    dispose(): void {
      group.removeFromParent();
    },
  };
}
