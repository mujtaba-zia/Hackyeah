import * as THREE from "three";
import type { RenderAssets } from "./assets";
import type { WaterfallEdge } from "./waterfalls";

export interface WaterfallVisual {
  readonly group: THREE.Group;
  update(edge: WaterfallEdge): void;
  dispose(): void;
}

function edgeSignature(edge: WaterfallEdge): string {
  return `${edge.side}:${edge.position.x}:${edge.position.z}:${edge.width}:${edge.depth}`;
}

function applyWaterfallTransform(group: THREE.Group, sheet: THREE.Mesh, edge: WaterfallEdge): void {
  group.position.set(edge.position.x, 0, edge.position.z);
  sheet.scale.set(edge.width, edge.depth, 1);
  sheet.position.y = -edge.depth / 2;
  if (edge.side === "east" || edge.side === "west") sheet.rotation.y = Math.PI * 0.5;
  else sheet.rotation.y = 0;
}

export function createWaterfallVisual(initial: WaterfallEdge, assets: RenderAssets): WaterfallVisual {
  const group = new THREE.Group();
  group.name = `waterfall:${initial.id}`;
  const sheet = new THREE.Mesh(assets.waterfallGeometry, assets.waterfallMaterial);
  sheet.renderOrder = 4;
  const mistLeft = new THREE.Sprite(assets.mistMaterial);
  const mistCenter = new THREE.Sprite(assets.mistMaterial);
  const mistRight = new THREE.Sprite(assets.mistMaterial);
  mistLeft.position.set(-initial.width * 0.32, -initial.depth + 0.14, 0.1);
  mistCenter.position.set(0, -initial.depth + 0.18, 0.15);
  mistRight.position.set(initial.width * 0.32, -initial.depth + 0.1, 0.1);
  mistLeft.scale.set(1.1, 0.68, 1);
  mistCenter.scale.set(1.38, 0.8, 1);
  mistRight.scale.set(0.98, 0.64, 1);
  group.add(sheet, mistLeft, mistCenter, mistRight);
  let signature = edgeSignature(initial);
  applyWaterfallTransform(group, sheet, initial);

  return {
    group,
    update(next: WaterfallEdge): void {
      const nextSignature = edgeSignature(next);
      if (nextSignature === signature) return;
      applyWaterfallTransform(group, sheet, next);
      mistLeft.position.set(-next.width * 0.32, -next.depth + 0.14, 0.1);
      mistCenter.position.set(0, -next.depth + 0.18, 0.15);
      mistRight.position.set(next.width * 0.32, -next.depth + 0.1, 0.1);
      signature = nextSignature;
    },
    dispose(): void {
      group.removeFromParent();
    },
  };
}
