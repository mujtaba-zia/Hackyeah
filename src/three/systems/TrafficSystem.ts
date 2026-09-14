import * as THREE from 'three';
import type { WorldContext } from '../core/context';
import { glassMaterial, vehicleMaterials } from '../core/materials';
import { VEHICLE_ROUTES, type Vec3 } from '../world/cityPlan';

const VEHICLE_COUNT = 28;
const MIN_ACTIVITY = 0.2;
const MAX_FRAME_SECONDS = 0.25;
const ROUTE_EPSILON = 0.0001;
const HIDDEN_MATRIX = new THREE.Matrix4().makeScale(0, 0, 0);

const VEHICLE_KINDS = ['car', 'van', 'bus', 'truck'] as const;

type VehicleKind = typeof VEHICLE_KINDS[number];

interface VehicleMeshSet {
  body: THREE.InstancedMesh;
  cabin: THREE.InstancedMesh;
}

type VehicleMeshes = Record<VehicleKind, VehicleMeshSet>;

interface VehicleShape {
  length: number;
  height: number;
  width: number;
  cabinLength: number;
  cabinHeight: number;
  cabinWidth: number;
  cabinOffsetX: number;
  speed: number;
}

interface Vehicle {
  route: readonly Vec3[];
  meshes: VehicleMeshSet;
  instance: number;
  rideHeight: number;
  cabinOffsetX: number;
  cabinOffsetY: number;
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
  visible: boolean;
  bodyMatrix: THREE.Matrix4;
  cabinMatrix: THREE.Matrix4;
}

const VEHICLE_SHAPES: Record<VehicleKind, VehicleShape> = {
  car: {
    length: 1.78,
    height: 0.38,
    width: 0.9,
    cabinLength: 0.92,
    cabinHeight: 0.28,
    cabinWidth: 0.72,
    cabinOffsetX: 0.05,
    speed: 9.5,
  },
  van: {
    length: 2.15,
    height: 0.5,
    width: 0.98,
    cabinLength: 1.42,
    cabinHeight: 0.43,
    cabinWidth: 0.78,
    cabinOffsetX: 0.18,
    speed: 8.5,
  },
  bus: {
    length: 3.25,
    height: 0.56,
    width: 1.02,
    cabinLength: 2.82,
    cabinHeight: 0.5,
    cabinWidth: 0.83,
    cabinOffsetX: 0,
    speed: 7.6,
  },
  truck: {
    length: 2.8,
    height: 0.62,
    width: 1.04,
    cabinLength: 0.74,
    cabinHeight: 0.56,
    cabinWidth: 0.86,
    cabinOffsetX: 0.86,
    speed: 7.9,
  },
};

/** Keeps both cities active, while batching each vehicle silhouette into one draw call. */
export class TrafficSystem {
  private readonly scene: THREE.Scene;
  private readonly meshes: VehicleMeshes;
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly vehicles: Vehicle[] = [];
  private readonly stopFrame: () => void;
  private activity = 1;
  private destroyed = false;

  constructor(ctx: WorldContext) {
    this.scene = ctx.scene;

    const routes = usableRoutes(VEHICLE_ROUTES);
    if (routes.length === 0) {
      throw new Error('TrafficSystem requires at least one closed vehicle route.');
    }

    const kinds: VehicleKind[] = [];
    const counts: Record<VehicleKind, number> = { car: 0, van: 0, bus: 0, truck: 0 };
    for (let index = 0; index < VEHICLE_COUNT; index += 1) {
      const kind = VEHICLE_KINDS[index % VEHICLE_KINDS.length]!;
      kinds.push(kind);
      counts[kind] += 1;
    }

    this.meshes = {
      car: this.createMeshes('car', counts.car),
      van: this.createMeshes('van', counts.van),
      bus: this.createMeshes('bus', counts.bus),
      truck: this.createMeshes('truck', counts.truck),
    };

    const nextInstance: Record<VehicleKind, number> = { car: 0, van: 0, bus: 0, truck: 0 };
    for (let index = 0; index < VEHICLE_COUNT; index += 1) {
      const kind = kinds[index]!;
      const shape = VEHICLE_SHAPES[kind];
      const route = routes[index % routes.length]!;
      const vehicle: Vehicle = {
        route,
        meshes: this.meshes[kind],
        instance: nextInstance[kind],
        rideHeight: shape.height * 0.5 + 0.06,
        cabinOffsetX: shape.cabinOffsetX,
        cabinOffsetY: shape.height * 0.5 + shape.cabinHeight * 0.5 - 0.02,
        speed: shape.speed + (index % 3) * 0.45,
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
        visible: true,
        bodyMatrix: new THREE.Matrix4(),
        cabinMatrix: new THREE.Matrix4(),
      };

      nextInstance[kind] += 1;
      this.setLeg(vehicle, index % route.length);
      vehicle.legDistance = vehicle.legLength * (0.08 + (index * 0.61803398875 % 0.84));
      this.placeOnLeg(vehicle);
      this.writeMatrices(vehicle);
      this.vehicles.push(vehicle);
    }
    this.markMatricesDirty();

    this.stopFrame = ctx.renderer.onFrame(this.update);
  }

  /** Dampens road motion and leaves only a proportional fraction of traffic visible. */
  setActivity(level: number): void {
    const activity = Number.isFinite(level)
      ? Math.min(1, Math.max(MIN_ACTIVITY, level))
      : MIN_ACTIVITY;
    if (activity === this.activity || this.destroyed) return;

    this.activity = activity;
    const visibleCount = Math.ceil(this.vehicles.length * activity);
    for (let index = 0; index < this.vehicles.length; index += 1) {
      const vehicle = this.vehicles[index]!;
      const visible = index < visibleCount;
      if (vehicle.visible === visible) continue;

      vehicle.visible = visible;
      if (visible) {
        this.writeMatrices(vehicle);
      } else {
        vehicle.meshes.body.setMatrixAt(vehicle.instance, HIDDEN_MATRIX);
        vehicle.meshes.cabin.setMatrixAt(vehicle.instance, HIDDEN_MATRIX);
      }
    }
    this.markMatricesDirty();
  }

  destroy(): void {
    if (this.destroyed) return;

    this.destroyed = true;
    this.stopFrame();
    this.scene.remove(
      this.meshes.car.body,
      this.meshes.car.cabin,
      this.meshes.van.body,
      this.meshes.van.cabin,
      this.meshes.bus.body,
      this.meshes.bus.cabin,
      this.meshes.truck.body,
      this.meshes.truck.cabin,
    );
    for (let index = 0; index < this.geometries.length; index += 1) {
      this.geometries[index]!.dispose();
    }
    this.geometries.length = 0;
    this.vehicles.length = 0;
  }

  private readonly update = (dtSeconds: number): void => {
    if (this.destroyed) return;

    const frameSeconds = Math.min(MAX_FRAME_SECONDS, Math.max(0, dtSeconds));
    if (!(frameSeconds > 0)) return;

    const distance = frameSeconds * this.activity;
    for (let index = 0; index < this.vehicles.length; index += 1) {
      const vehicle = this.vehicles[index]!;
      this.moveVehicle(vehicle, vehicle.speed * distance);
      if (vehicle.visible) this.writeMatrices(vehicle);
    }
    this.markMatricesDirty();
  };

  private createMeshes(kind: VehicleKind, count: number): VehicleMeshSet {
    const shape = VEHICLE_SHAPES[kind];
    const bodyGeometry = new THREE.BoxGeometry(shape.length, shape.height, shape.width);
    const cabinGeometry = new THREE.BoxGeometry(shape.cabinLength, shape.cabinHeight, shape.cabinWidth);
    const body = new THREE.InstancedMesh(bodyGeometry, materialFor(kind), count);
    const cabin = new THREE.InstancedMesh(cabinGeometry, glassMaterial, count);
    body.name = `traffic-${kind}-body`;
    cabin.name = `traffic-${kind}-cabin`;
    body.frustumCulled = false;
    cabin.frustumCulled = false;
    body.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    cabin.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.scene.add(body, cabin);
    this.geometries.push(bodyGeometry, cabinGeometry);
    return { body, cabin };
  }

  private moveVehicle(vehicle: Vehicle, distance: number): void {
    let remaining = distance;
    let traversed = 0;

    while (remaining > 0 && traversed < vehicle.route.length) {
      if (vehicle.legLength <= ROUTE_EPSILON) {
        this.setLeg(vehicle, (vehicle.legIndex + 1) % vehicle.route.length);
        traversed += 1;
        continue;
      }

      const legRemaining = vehicle.legLength - vehicle.legDistance;
      if (remaining < legRemaining) {
        vehicle.legDistance += remaining;
        remaining = 0;
        break;
      }

      remaining -= legRemaining;
      this.setLeg(vehicle, (vehicle.legIndex + 1) % vehicle.route.length);
      traversed += 1;
    }

    this.placeOnLeg(vehicle);
  }

  private setLeg(vehicle: Vehicle, legIndex: number): void {
    const from = vehicle.route[legIndex]!;
    const to = vehicle.route[(legIndex + 1) % vehicle.route.length]!;
    vehicle.legIndex = legIndex;
    vehicle.legDistance = 0;
    vehicle.legDx = to.x - from.x;
    vehicle.legDy = to.y - from.y;
    vehicle.legDz = to.z - from.z;
    vehicle.legLength = Math.hypot(vehicle.legDx, vehicle.legDy, vehicle.legDz);
    vehicle.heading = Math.atan2(vehicle.legDz, vehicle.legDx);
  }

  private placeOnLeg(vehicle: Vehicle): void {
    const from = vehicle.route[vehicle.legIndex]!;
    const progress = vehicle.legLength > ROUTE_EPSILON
      ? vehicle.legDistance / vehicle.legLength
      : 0;
    vehicle.x = from.x + vehicle.legDx * progress;
    vehicle.y = from.y + vehicle.legDy * progress + vehicle.rideHeight;
    vehicle.z = from.z + vehicle.legDz * progress;
  }

  private writeMatrices(vehicle: Vehicle): void {
    const forwardX = Math.cos(vehicle.heading);
    const forwardZ = Math.sin(vehicle.heading);
    vehicle.bodyMatrix.makeRotationY(vehicle.heading);
    vehicle.bodyMatrix.setPosition(vehicle.x, vehicle.y, vehicle.z);
    vehicle.cabinMatrix.makeRotationY(vehicle.heading);
    vehicle.cabinMatrix.setPosition(
      vehicle.x + forwardX * vehicle.cabinOffsetX,
      vehicle.y + vehicle.cabinOffsetY,
      vehicle.z + forwardZ * vehicle.cabinOffsetX,
    );
    vehicle.meshes.body.setMatrixAt(vehicle.instance, vehicle.bodyMatrix);
    vehicle.meshes.cabin.setMatrixAt(vehicle.instance, vehicle.cabinMatrix);
  }

  private markMatricesDirty(): void {
    this.meshes.car.body.instanceMatrix.needsUpdate = true;
    this.meshes.car.cabin.instanceMatrix.needsUpdate = true;
    this.meshes.van.body.instanceMatrix.needsUpdate = true;
    this.meshes.van.cabin.instanceMatrix.needsUpdate = true;
    this.meshes.bus.body.instanceMatrix.needsUpdate = true;
    this.meshes.bus.cabin.instanceMatrix.needsUpdate = true;
    this.meshes.truck.body.instanceMatrix.needsUpdate = true;
    this.meshes.truck.cabin.instanceMatrix.needsUpdate = true;
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

function materialFor(kind: VehicleKind): THREE.Material {
  switch (kind) {
    case 'car':
      return vehicleMaterials.blue;
    case 'van':
      return vehicleMaterials.yellow;
    case 'bus':
      return vehicleMaterials.orange;
    case 'truck':
      return vehicleMaterials.truck;
  }
}
