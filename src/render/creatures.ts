import * as THREE from "three";
import type { Creature } from "../../shared/types";
import type { RenderAssets } from "./assets";
import { hashString, seededRange } from "./hash";

export interface CreatureVisual {
  readonly root: THREE.Group;
  data: Creature;
  update(creature: Creature): void;
  animate(time: number): void;
  dispose(): void;
}

const CREATURE_SCALE = 1.15;
const BADGE_HEIGHT = { creature: 1.2, egg: 0.72 } as const;

function modelFor(creature: Creature): "creature" | "egg" {
  return creature.zone === "nursery" ? "egg" : "creature";
}

/**
 * An open PR waddles around its home spot facing where it walks; a draft sits
 * in its nest and wobbles. The body colour is the PR's mood.
 */
export function createCreatureVisual(initial: Creature, assets: RenderAssets): CreatureVisual {
  const root = new THREE.Group();
  root.name = `creature:${initial.id}`;
  const seed = hashString(initial.id);
  const phase = seededRange(seed, 3, 0, Math.PI * 2);
  const wanderRadius = seededRange(seed, 4, 0.22, 0.6);
  const badge = new THREE.Sprite();
  badge.scale.set(0.34, 0.34, 1);
  let kind = modelFor(initial);
  let body = assets.kit.create(kind, { Body: assets.bodyMaterials[initial.mood] });
  body.scale.setScalar(kind === "egg" ? 1 : CREATURE_SCALE);
  body.rotation.y = kind === "egg" ? seededRange(seed, 5, 0, Math.PI * 2) : Math.PI / 4;
  root.add(body, badge);
  root.position.set(initial.home.x, 0.05, initial.home.z);
  let data = initial;

  function applyBadge(creature: Creature): void {
    const material = assets.checkBadge(creature.checks);
    badge.visible = material !== null;
    if (material) badge.material = material;
    badge.position.y = BADGE_HEIGHT[kind];
  }

  applyBadge(initial);

  return {
    root,
    get data(): Creature {
      return data;
    },
    set data(next: Creature) {
      data = next;
    },
    update(next: Creature): void {
      const nextKind = modelFor(next);
      if (nextKind !== kind) {
        root.remove(body);
        kind = nextKind;
        body.scale.setScalar(kind === "egg" ? 1 : CREATURE_SCALE);
        body.rotation.y = kind === "egg" ? seededRange(seed, 5, 0, Math.PI * 2) : Math.PI / 4;
        root.add(body);
      } else if (next.mood !== data.mood) {
        for (const child of body.children) {
          if (child instanceof THREE.Mesh && child.name === "Body") child.material = assets.bodyMaterials[next.mood];
        }
      }
      applyBadge(next);
      data = next;
    },
    animate(time: number): void {
      if (kind === "egg") {
        root.position.set(data.home.x, 0.05, data.home.z);
        body.rotation.z = Math.sin(time * 3 + phase) * 0.12;
        return;
      }
      const a = time * 0.72 + phase;
      const b = time * 0.59 + phase * 1.7;
      root.position.x = data.home.x + Math.sin(a) * wanderRadius;
      root.position.z = data.home.z + Math.cos(b) * wanderRadius;
      // Face the direction of travel (the derivative of the wander path).
      body.rotation.y = Math.atan2(Math.cos(a) * 0.72, -Math.sin(b) * 0.59);
      root.position.y = 0.05 + Math.abs(Math.sin(time * 5.5 + phase)) * 0.07;
    },
    dispose(): void {
      root.removeFromParent();
    },
  };
}
