import * as THREE from "three";
import type { Bridge } from "../../shared/types";
import type { RenderAssets } from "./assets";
import { ModelBatch } from "./batch";

const PLANK_PITCH = 0.72;
/** Half the walkway's width: where the posts and hand ropes run. */
const RAIL_OFFSET = 0.72;
const POST_HEIGHT = 1;
const ROPE_SEGMENTS = 8;
const UP = new THREE.Vector3(0, 1, 0);

/** Every rope bridge: planks and posts as two instanced draws, hand ropes as one set of lines. */
export class BridgeLayer {
  readonly group = new THREE.Group();
  private readonly planks: ModelBatch;
  private readonly posts: ModelBatch;
  private readonly ropes: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  private signature = "";

  constructor(assets: RenderAssets) {
    this.planks = new ModelBatch([{ geometry: assets.bridgePlankGeometry, material: assets.bridgeMaterial }], { receiveShadow: true });
    this.posts = new ModelBatch([{ geometry: assets.bridgePostGeometry, material: assets.bridgeMaterial }], { castShadow: true });
    this.ropes = new THREE.LineSegments(new THREE.BufferGeometry(), assets.bridgeRopeMaterial);
    this.group.add(this.planks.group, this.posts.group, this.ropes);
  }

  update(bridges: readonly Bridge[]): void {
    const signature = bridges.map((bridge) => `${bridge.from.x},${bridge.from.z},${bridge.to.x},${bridge.to.z}`).join(";");
    if (signature === this.signature) return;
    this.signature = signature;

    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const turn = new THREE.Quaternion();
    const one = new THREE.Vector3(1, 1, 1);
    const ropePoints: number[] = [];
    this.planks.begin();
    this.posts.begin();
    for (const bridge of bridges) {
      const dx = bridge.to.x - bridge.from.x;
      const dz = bridge.to.z - bridge.from.z;
      const length = Math.max(0.1, Math.hypot(dx, dz));
      const alongX = dx / length;
      const alongZ = dz / length;
      const sag = Math.min(0.4, length * 0.035);
      // The walkway hangs a little lower in the middle; `at` is a point along it, offset sideways.
      const at = (share: number, side: number, height: number): THREE.Vector3 =>
        position.set(
          bridge.from.x + dx * share - alongZ * side,
          height - sag * Math.sin(Math.PI * share),
          bridge.from.z + dz * share + alongX * side,
        );
      turn.setFromAxisAngle(UP, Math.atan2(-dz, dx));

      const planks = Math.max(3, Math.round(length / PLANK_PITCH));
      for (let index = 0; index < planks; index += 1) {
        matrix.compose(at((index + 0.5) / planks, 0, 0.1), turn, one);
        this.planks.add(bridge.id, matrix);
      }
      for (const side of [-RAIL_OFFSET, RAIL_OFFSET]) {
        for (const share of [0, 1]) {
          matrix.compose(at(share, side, POST_HEIGHT / 2), turn, one);
          this.posts.add(bridge.id, matrix);
        }
        for (let index = 0; index < ROPE_SEGMENTS; index += 1) {
          // The hand rope dips further than the planks do.
          for (const share of [index / ROPE_SEGMENTS, (index + 1) / ROPE_SEGMENTS]) {
            const point = at(share, side, POST_HEIGHT - 0.06 - 0.3 * Math.sin(Math.PI * share));
            ropePoints.push(point.x, point.y, point.z);
          }
        }
      }
    }
    this.planks.end();
    this.posts.end();
    this.ropes.geometry.dispose();
    this.ropes.geometry = new THREE.BufferGeometry();
    this.ropes.geometry.setAttribute("position", new THREE.Float32BufferAttribute(ropePoints, 3));
  }

  dispose(): void {
    this.planks.dispose();
    this.posts.dispose();
    this.ropes.geometry.dispose();
    this.group.removeFromParent();
  }
}
