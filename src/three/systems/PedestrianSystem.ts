import * as THREE from 'three';
import type { WorldContext } from '../core/context';
import { characterMaterials } from '../core/materials';
import { PEDESTRIAN_ROUTES, type Vec3 } from '../world/cityPlan';

const PEDESTRIAN_COUNT = 26;
const MIN_ACTIVITY = 0.2;
const MAX_FRAME_SECONDS = 0.25;
const ROUTE_EPSILON = 0.0001;
const BODY_CENTER_Y = 0.38;
const HEAD_CENTER_Y = 0.84;
const HIDDEN_MATRIX = new THREE.Matrix4().makeScale(0, 0, 0);

interface Pedestrian {
  route: readonly Vec3[];
  instance: number;
  speed: number;
  legIndex: number;
  legDistance: number;
  legLength: number;
  legDx: number;
  legDy: number;
  legDz: number;
  heading: number;
  x: number;
  y: number;
  z: number;
  bobPhase: number;
  bobSpeed: number;
  visible: boolean;
  bodyMatrix: THREE.Matrix4;
  headMatrix: THREE.Matrix4;
}

/** Adds a readable, batched population that keeps the enlarged streets alive. */
export class PedestrianSystem {
  private readonly scene: THREE.Scene;
  private readonly bodyGeometry: THREE.CapsuleGeometry;
  private readonly headGeometry: THREE.SphereGeometry;
  private readonly bodyMesh: THREE.InstancedMesh;
  private readonly headMesh: THREE.InstancedMesh;
  private readonly pedestrians: Pedestrian[] = [];
  private readonly stopFrame: () => void;
  private activity = 1;
  private destroyed = false;

  constructor(ctx: WorldContext) {
    this.scene = ctx.scene;
    const routes = usableRoutes(PEDESTRIAN_ROUTES);
    if (routes.length === 0) {
      throw new Error('PedestrianSystem requires at least one closed pedestrian route.');
    }

    this.bodyGeometry = new THREE.CapsuleGeometry(0.17, 0.38, 4, 8);
    this.headGeometry = new THREE.SphereGeometry(0.145, 10, 8);
    this.bodyMesh = new THREE.InstancedMesh(this.bodyGeometry, characterMaterials.geo, PEDESTRIAN_COUNT);
    this.headMesh = new THREE.InstancedMesh(this.headGeometry, characterMaterials.skin, PEDESTRIAN_COUNT);
    this.bodyMesh.name = 'pedestrians-body';
    this.headMesh.name = 'pedestrians-head';
    this.bodyMesh.frustumCulled = false;
    this.headMesh.frustumCulled = false;
    this.bodyMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.headMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.scene.add(this.bodyMesh, this.headMesh);

    for (let index = 0; index < PEDESTRIAN_COUNT; index += 1) {
      const route = routes[index % routes.length]!;
      const pedestrian: Pedestrian = {
        route,
        instance: index,
        speed: 2.25 + (index % 4) * 0.22,
        legIndex: 0,
        legDistance: 0,
        legLength: 0,
        legDx: 0,
        legDy: 0,
        legDz: 0,
        heading: 0,
        x: 0,
        y: 0,
        z: 0,
        bobPhase: index * 0.73,
        bobSpeed: 4 + (index % 3) * 0.35,
        visible: true,
        bodyMatrix: new THREE.Matrix4(),
        headMatrix: new THREE.Matrix4(),
      };

      this.setLeg(pedestrian, index % route.length);
      pedestrian.legDistance = pedestrian.legLength * (0.06 + (index * 0.41421356237 % 0.88));
      this.placeOnLeg(pedestrian);
      this.writeMatrices(pedestrian, 0);
      this.pedestrians.push(pedestrian);
    }
    this.markMatricesDirty();

    this.stopFrame = ctx.renderer.onFrame(this.update);
  }

  /** Dampens walking speed and reduces visible street life without rebuilding instances. */
  setActivity(level: number): void {
    const activity = Number.isFinite(level)
      ? Math.min(1, Math.max(MIN_ACTIVITY, level))
      : MIN_ACTIVITY;
    if (activity === this.activity || this.destroyed) return;

    this.activity = activity;
    const visibleCount = Math.ceil(this.pedestrians.length * activity);
    for (let index = 0; index < this.pedestrians.length; index += 1) {
      const pedestrian = this.pedestrians[index]!;
      const visible = index < visibleCount;
      if (pedestrian.visible === visible) continue;

      pedestrian.visible = visible;
      if (visible) {
        this.writeMatrices(pedestrian, 0);
      } else {
        this.bodyMesh.setMatrixAt(pedestrian.instance, HIDDEN_MATRIX);
        this.headMesh.setMatrixAt(pedestrian.instance, HIDDEN_MATRIX);
      }
    }
    this.markMatricesDirty();
  }

  destroy(): void {
    if (this.destroyed) return;

    this.destroyed = true;
    this.stopFrame();
    this.scene.remove(this.bodyMesh, this.headMesh);
    this.bodyGeometry.dispose();
    this.headGeometry.dispose();
    this.pedestrians.length = 0;
  }

  private readonly update = (dtSeconds: number, elapsed: number): void => {
    if (this.destroyed) return;

    const frameSeconds = Math.min(MAX_FRAME_SECONDS, Math.max(0, dtSeconds));
    if (!(frameSeconds > 0)) return;

    const distance = frameSeconds * this.activity;
    for (let index = 0; index < this.pedestrians.length; index += 1) {
      const pedestrian = this.pedestrians[index]!;
      this.movePedestrian(pedestrian, pedestrian.speed * distance);
      if (pedestrian.visible) this.writeMatrices(pedestrian, elapsed);
    }
    this.markMatricesDirty();
  };

  private movePedestrian(pedestrian: Pedestrian, distance: number): void {
    let remaining = distance;
    let traversed = 0;

    while (remaining > 0 && traversed < pedestrian.route.length) {
      if (pedestrian.legLength <= ROUTE_EPSILON) {
        this.setLeg(pedestrian, (pedestrian.legIndex + 1) % pedestrian.route.length);
        traversed += 1;
        continue;
      }

      const legRemaining = pedestrian.legLength - pedestrian.legDistance;
      if (remaining < legRemaining) {
        pedestrian.legDistance += remaining;
        remaining = 0;
        break;
      }

      remaining -= legRemaining;
      this.setLeg(pedestrian, (pedestrian.legIndex + 1) % pedestrian.route.length);
      traversed += 1;
    }

    this.placeOnLeg(pedestrian);
  }

  private setLeg(pedestrian: Pedestrian, legIndex: number): void {
    const from = pedestrian.route[legIndex]!;
    const to = pedestrian.route[(legIndex + 1) % pedestrian.route.length]!;
    pedestrian.legIndex = legIndex;
    pedestrian.legDistance = 0;
    pedestrian.legDx = to.x - from.x;
    pedestrian.legDy = to.y - from.y;
    pedestrian.legDz = to.z - from.z;
    pedestrian.legLength = Math.hypot(pedestrian.legDx, pedestrian.legDy, pedestrian.legDz);
    pedestrian.heading = Math.atan2(pedestrian.legDz, pedestrian.legDx);
  }

  private placeOnLeg(pedestrian: Pedestrian): void {
    const from = pedestrian.route[pedestrian.legIndex]!;
    const progress = pedestrian.legLength > ROUTE_EPSILON
      ? pedestrian.legDistance / pedestrian.legLength
      : 0;
    pedestrian.x = from.x + pedestrian.legDx * progress;
    pedestrian.y = from.y + pedestrian.legDy * progress;
    pedestrian.z = from.z + pedestrian.legDz * progress;
  }

  private writeMatrices(pedestrian: Pedestrian, elapsed: number): void {
    const bob = Math.sin(elapsed * pedestrian.bobSpeed + pedestrian.bobPhase) * 0.055;
    pedestrian.bodyMatrix.makeRotationY(pedestrian.heading);
    pedestrian.bodyMatrix.setPosition(
      pedestrian.x,
      pedestrian.y + BODY_CENTER_Y + bob,
      pedestrian.z,
    );
    pedestrian.headMatrix.makeTranslation(
      pedestrian.x,
      pedestrian.y + HEAD_CENTER_Y + bob,
      pedestrian.z,
    );
    this.bodyMesh.setMatrixAt(pedestrian.instance, pedestrian.bodyMatrix);
    this.headMesh.setMatrixAt(pedestrian.instance, pedestrian.headMatrix);
  }

  private markMatricesDirty(): void {
    this.bodyMesh.instanceMatrix.needsUpdate = true;
    this.headMesh.instanceMatrix.needsUpdate = true;
  }
}

function usableRoutes(routes: readonly (readonly Vec3[])[]): (readonly Vec3[])[] {
  const usable: (readonly Vec3[])[] = [];
  for (let index = 0; index < routes.length; index += 1) {
    const route = routes[index]!;
    if (route.length > 1) usable.push(route);
  }
  return usable;
}
