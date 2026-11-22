import * as THREE from "three";
import type { Creature, Mood, Vec2 } from "../../shared/types";
import type { RenderAssets } from "./assets";
import { BatchSet, ModelBatch, type BatchHit } from "./batch";
import { hashString, seededRange } from "./hash";

const CREATURE_SCALE = 1.15;
const BADGE_SIZE = 0.38;
const BADGE_HEIGHT = { creature: 1.25, egg: 0.78 } as const;
/** The top of the plaza's cobbles and of the nursery's hay, which they stand on. */
const FLOOR = { creature: 0.14, egg: 0.08 } as const;
const UP = new THREE.Vector3(0, 1, 0);
const LEAN = new THREE.Vector3(0, 0, 1);

type Kind = "creature" | "egg";
type Variant = `${Kind}|${Mood}`;

interface Walker {
  data: Creature;
  kind: Kind;
  phase: number;
  wander: number;
  /** Which way an egg lies in its nest. */
  turn: number;
  /** Where it is right now. */
  x: number;
  z: number;
}

/**
 * Every pull request: open ones waddle around their home spot facing where they
 * walk, drafts sit in their nests and wobble. The body colour is the PR's mood.
 */
export class CreatureLayer {
  readonly group = new THREE.Group();
  private readonly bodies: BatchSet<Variant>;
  private readonly shadows: ModelBatch;
  private readonly badges: BatchSet<"pending" | "failure">;
  private readonly walkers = new Map<string, Walker>();
  private readonly matrix = new THREE.Matrix4();
  private readonly position = new THREE.Vector3();
  private readonly rotation = new THREE.Quaternion();
  private readonly wobble = new THREE.Quaternion();
  private readonly scale = new THREE.Vector3();

  constructor(assets: RenderAssets) {
    this.bodies = new BatchSet<Variant>((variant) => {
      const [kind, mood] = variant.split("|") as [Kind, Mood];
      return new ModelBatch(assets.kit.parts(kind, { Body: assets.bodyMaterials[mood] }), { animated: true, receiveShadow: true });
    });
    this.shadows = new ModelBatch([{ geometry: assets.discGeometry, material: assets.blobShadowMaterial }], {
      animated: true,
      renderOrder: 3,
    });
    this.badges = new BatchSet(
      (checks) =>
        new ModelBatch([{ geometry: assets.billboardGeometry, material: assets.checkBadgeMaterials[checks] }], {
          animated: true,
          renderOrder: 8,
        }),
    );
    this.group.add(this.shadows.group, this.bodies.group, this.badges.group);
  }

  update(creatures: readonly Creature[]): void {
    const seen = new Set<string>();
    for (const data of creatures) {
      seen.add(data.id);
      const existing = this.walkers.get(data.id);
      const kind: Kind = data.zone === "nursery" ? "egg" : "creature";
      if (existing) {
        existing.data = data;
        existing.kind = kind;
        continue;
      }
      const seed = hashString(data.id);
      this.walkers.set(data.id, {
        data,
        kind,
        phase: seededRange(seed, 3, 0, Math.PI * 2),
        wander: seededRange(seed, 4, 0.22, 0.6),
        turn: seededRange(seed, 5, 0, Math.PI * 2),
        x: data.home.x,
        z: data.home.z,
      });
    }
    for (const id of this.walkers.keys()) {
      if (!seen.has(id)) this.walkers.delete(id);
    }
  }

  /** Moves everyone to where they are at `time` and redraws them. */
  animate(time: number): void {
    this.bodies.begin();
    this.shadows.begin();
    this.badges.begin();
    for (const walker of this.walkers.values()) {
      const { data, kind, phase } = walker;
      let hop = 0;
      if (kind === "egg") {
        walker.x = data.home.x;
        walker.z = data.home.z;
        this.rotation.setFromAxisAngle(UP, walker.turn).multiply(this.wobble.setFromAxisAngle(LEAN, Math.sin(time * 3 + phase) * 0.12));
        this.scale.setScalar(1);
      } else {
        const a = time * 0.72 + phase;
        const b = time * 0.59 + phase * 1.7;
        walker.x = data.home.x + Math.sin(a) * walker.wander;
        walker.z = data.home.z + Math.cos(b) * walker.wander;
        // Face the direction of travel: the derivative of the wander path.
        this.rotation.setFromAxisAngle(UP, Math.atan2(Math.cos(a) * 0.72, -Math.sin(b) * 0.59));
        this.scale.setScalar(CREATURE_SCALE);
        hop = Math.abs(Math.sin(time * 5.5 + phase)) * 0.07;
      }
      const floor = FLOOR[kind];
      this.matrix.compose(this.position.set(walker.x, floor + hop, walker.z), this.rotation, this.scale);
      this.bodies.add(`${kind}|${data.mood}`, data.id, this.matrix);

      const shadow = kind === "egg" ? 0.62 : 0.8 - hop * 2;
      this.matrix.makeScale(shadow, 1, shadow).setPosition(walker.x, floor + 0.02, walker.z);
      this.shadows.add(data.id, this.matrix);

      if (data.checks === "pending" || data.checks === "failure") {
        this.matrix.makeScale(BADGE_SIZE, BADGE_SIZE, BADGE_SIZE).setPosition(walker.x, floor + BADGE_HEIGHT[kind] + hop, walker.z);
        this.badges.add(data.checks, data.id, this.matrix);
      }
    }
    this.bodies.end();
    this.shadows.end();
    this.badges.end();
  }

  /** Where a pull request is standing right now. */
  positionOf(id: string): Vec2 | null {
    return this.walkers.get(id) ?? null;
  }

  pick(raycaster: THREE.Raycaster, hits: THREE.Intersection[]): BatchHit | null {
    return this.bodies.pick(raycaster, hits);
  }

  dispose(): void {
    this.bodies.dispose();
    this.shadows.dispose();
    this.badges.dispose();
    this.walkers.clear();
    this.group.removeFromParent();
  }
}
