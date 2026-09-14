import * as THREE from 'three';
import type { WorldContext } from '../core/context';
import { emissiveMaterials, vehicleMaterials } from '../core/materials';
import { PIPELINE_LEGS, type Vec3 } from '../world/cityPlan';
import { gameStore } from '../../game/state/gameStore';
import { STAGES } from '../../game/state/gameState';
import type { GameEvent } from '../../game/systems/events';

const FLEET_SIZE = 4;
const TRUCK_SPEED = 11;
const MAX_FRAME_SECONDS = 0.25;
const ROUTE_EPSILON = 0.0001;
const TRUCK_CENTER_Y = 0.48;

type RunStageAdvancedEvent = Extract<GameEvent, { type: 'RUN_STAGE_ADVANCED' }>;

interface Rig {
  root: THREE.Group;
  crate: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>;
  route: readonly Vec3[] | null;
  waypoint: number;
  x: number;
  y: number;
  z: number;
  busy: boolean;
}

/** Pools delivery rigs so overlapping pipelines add motion without unbounded scene work. */
export class DeliveryFleet {
  private readonly scene: THREE.Scene;
  private readonly bodyGeometry: THREE.BoxGeometry;
  private readonly cabGeometry: THREE.BoxGeometry;
  private readonly stripeGeometry: THREE.BoxGeometry;
  private readonly crateGeometry: THREE.BoxGeometry;
  private readonly rigs: Rig[] = [];
  private readonly stopFrame: () => void;
  private unsubscribe: (() => void) | null = null;
  private destroyed = false;

  constructor(ctx: WorldContext) {
    this.scene = ctx.scene;
    this.bodyGeometry = new THREE.BoxGeometry(2.35, 0.72, 1.02);
    this.cabGeometry = new THREE.BoxGeometry(0.7, 0.68, 0.94);
    this.stripeGeometry = new THREE.BoxGeometry(0.82, 0.09, 1.05);
    this.crateGeometry = new THREE.BoxGeometry(0.46, 0.46, 0.46);

    for (let index = 0; index < FLEET_SIZE; index += 1) {
      this.rigs.push(this.createRig(index));
    }
    this.stopFrame = ctx.renderer.onFrame(this.update);
  }

  attach(): void {
    if (this.destroyed || this.unsubscribe) return;

    this.unsubscribe = gameStore.bus.on('RUN_STAGE_ADVANCED', this.onRunStageAdvanced);
  }

  /** Returns every leased rig immediately, so reset cannot leave stale artifacts in the city. */
  reset(): void {
    for (let index = 0; index < this.rigs.length; index += 1) {
      this.returnRig(this.rigs[index]!);
    }
  }

  destroy(): void {
    if (this.destroyed) return;

    this.destroyed = true;
    this.stopFrame();
    this.unsubscribe?.();
    this.unsubscribe = null;
    for (let index = 0; index < this.rigs.length; index += 1) {
      this.scene.remove(this.rigs[index]!.root);
    }
    this.rigs.length = 0;
    this.bodyGeometry.dispose();
    this.cabGeometry.dispose();
    this.stripeGeometry.dispose();
    this.crateGeometry.dispose();
  }

  private readonly onRunStageAdvanced = (event: RunStageAdvancedEvent): void => {
    const toStage = STAGES.indexOf(event.stage);
    if (toStage <= 0) return;

    const leg = PIPELINE_LEGS[toStage - 1];
    if (!leg || leg.length < 2) return;

    for (let index = 0; index < this.rigs.length; index += 1) {
      const rig = this.rigs[index]!;
      if (rig.busy) continue;
      this.leaseRig(rig, leg);
      return;
    }
  };

  private readonly update = (dtSeconds: number): void => {
    if (this.destroyed) return;

    const frameSeconds = Math.min(MAX_FRAME_SECONDS, Math.max(0, dtSeconds));
    if (!(frameSeconds > 0)) return;

    for (let index = 0; index < this.rigs.length; index += 1) {
      const rig = this.rigs[index]!;
      if (rig.busy) this.advanceRig(rig, TRUCK_SPEED * frameSeconds);
    }
  };

  private createRig(index: number): Rig {
    const root = new THREE.Group();
    const body = new THREE.Mesh(this.bodyGeometry, vehicleMaterials.truck);
    const cab = new THREE.Mesh(this.cabGeometry, vehicleMaterials.blue);
    const stripe = new THREE.Mesh(this.stripeGeometry, vehicleMaterials.yellow);
    const crate = new THREE.Mesh(this.crateGeometry, emissiveMaterials.crate);
    cab.position.set(0.78, 0.1, 0);
    stripe.position.set(-0.35, 0.4, 0);
    crate.position.set(-0.58, 0.62, 0);
    crate.visible = false;
    root.add(body, cab, stripe, crate);
    root.name = `delivery-truck-${index + 1}`;
    root.visible = false;
    this.scene.add(root);

    return {
      root,
      crate,
      route: null,
      waypoint: 0,
      x: 0,
      y: 0,
      z: 0,
      busy: false,
    };
  }

  private leaseRig(rig: Rig, route: readonly Vec3[]): void {
    const start = route[0]!;
    rig.route = route;
    rig.waypoint = 1;
    rig.x = start.x;
    rig.y = start.y;
    rig.z = start.z;
    rig.busy = true;
    rig.root.visible = true;
    rig.crate.visible = true;
    rig.root.position.set(rig.x, rig.y + TRUCK_CENTER_Y, rig.z);

    const firstDestination = route[1]!;
    rig.root.rotation.y = Math.atan2(firstDestination.z - rig.z, firstDestination.x - rig.x);
  }

  private advanceRig(rig: Rig, distance: number): void {
    const route = rig.route;
    if (!route) return;

    let remaining = distance;
    let traversed = 0;
    while (remaining > 0 && rig.busy && traversed < route.length) {
      const target = route[rig.waypoint]!;
      const dx = target.x - rig.x;
      const dy = target.y - rig.y;
      const dz = target.z - rig.z;
      const length = Math.hypot(dx, dy, dz);
      if (length <= ROUTE_EPSILON) {
        this.advanceWaypoint(rig);
        traversed += 1;
        continue;
      }

      rig.root.rotation.y = Math.atan2(dz, dx);
      if (remaining < length) {
        const progress = remaining / length;
        rig.x += dx * progress;
        rig.y += dy * progress;
        rig.z += dz * progress;
        remaining = 0;
        break;
      }

      rig.x = target.x;
      rig.y = target.y;
      rig.z = target.z;
      remaining -= length;
      this.advanceWaypoint(rig);
      traversed += 1;
    }

    if (rig.busy) rig.root.position.set(rig.x, rig.y + TRUCK_CENTER_Y, rig.z);
  }

  private advanceWaypoint(rig: Rig): void {
    const route = rig.route;
    if (!route) return;

    rig.waypoint += 1;
    if (rig.waypoint >= route.length) this.returnRig(rig);
  }

  private returnRig(rig: Rig): void {
    rig.busy = false;
    rig.route = null;
    rig.waypoint = 0;
    rig.crate.visible = false;
    rig.root.visible = false;
  }
}
