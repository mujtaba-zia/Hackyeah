import * as THREE from "three";
import type { Creature } from "../../shared/types";
import type { RenderAssets } from "./assets";
import { hashString, seededRange } from "./hash";
export { creatureTextureKey } from "./textures";

export interface CreatureVisual {
  readonly root: THREE.Group;
  data: Creature;
  update(creature: Creature): void;
  animate(time: number): void;
  dispose(): void;
}

export function createCreatureVisual(initial: Creature, assets: RenderAssets): CreatureVisual {
  const root = new THREE.Group();
  root.name = `creature:${initial.id}`;
  const material = new THREE.SpriteMaterial({
    map: assets.creatureTexture(initial.mood, initial.checks),
    transparent: true,
    depthWrite: false,
  });
  const body = new THREE.Sprite(material);
  const phase = seededRange(hashString(initial.id), 3, 0, Math.PI * 2);
  const wanderRadius = seededRange(hashString(initial.id), 4, 0.28, 0.72);
  body.scale.set(initial.mood === "egg" ? 1.25 : 1.45, initial.mood === "egg" ? 1.25 : 1.45, 1);
  body.position.y = initial.mood === "egg" ? 0.68 : 0.85;
  root.position.set(initial.home.x, 0, initial.home.z);
  root.add(body);
  let data = initial;

  return {
    root,
    get data(): Creature {
      return data;
    },
    set data(next: Creature) {
      data = next;
    },
    update(next: Creature): void {
      if (next.mood !== data.mood || next.checks !== data.checks) {
        material.map = assets.creatureTexture(next.mood, next.checks);
        material.needsUpdate = true;
        const size = next.mood === "egg" ? 1.25 : 1.45;
        body.scale.set(size, size, 1);
        body.position.y = next.mood === "egg" ? 0.68 : 0.85;
      }
      data = next;
    },
    animate(time: number): void {
      root.position.x = data.home.x + Math.sin(time * 0.72 + phase) * wanderRadius;
      root.position.z = data.home.z + Math.cos(time * 0.59 + phase * 1.7) * wanderRadius;
      root.rotation.z = data.mood === "egg" ? Math.sin(time * 3 + phase) * 0.11 : 0;
    },
    dispose(): void {
      material.dispose();
      root.removeFromParent();
    },
  };
}
