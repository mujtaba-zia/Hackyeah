import * as THREE from 'three';
import type { WorldContext } from '../core/context';
import { fxMaterials } from '../core/materials';
import { CITIES, LANDMARKS } from '../world/cityPlan';

const CLOUD_COUNT = 6;
const CLOUD_PUFFS = 3;
const SMOKE_PUFFS_PER_SOURCE = 4;
const SMOKE_LIFETIME_SECONDS = 5.2;
const CLOUD_SCALE_X: readonly number[] = [1.2, 1.65, 1.05];
const CLOUD_SCALE_Y: readonly number[] = [0.62, 0.76, 0.56];
const CLOUD_SCALE_Z: readonly number[] = [0.82, 1.05, 0.74];
const CLOUD_OFFSET_X: readonly number[] = [-0.78, 0, 0.9];
const CLOUD_OFFSET_Y: readonly number[] = [0, 0.12, -0.05];
const CLOUD_OFFSET_Z: readonly number[] = [0.04, -0.18, 0.12];

interface Cloud {
  y: number;
  z: number;
  speed: number;
  phase: number;
}

interface SmokeSource {
  x: number;
  y: number;
  z: number;
  phase: number;
}

/** Supplies low-cost motion in the sky, water and industrial districts. */
export class Ambient {
  private readonly scene: THREE.Scene;
  private readonly cloudGeometry: THREE.SphereGeometry;
  private readonly cloudMesh: THREE.InstancedMesh;
  private readonly cloudMatrix = new THREE.Matrix4();
  private readonly clouds: Cloud[] = [];
  private readonly smokeGeometry: THREE.BufferGeometry;
  private readonly smokeMesh: THREE.Points;
  private readonly smokePositions: Float32Array;
  private readonly smokeAttribute: THREE.BufferAttribute;
  private readonly smokeSources: SmokeSource[] = [];
  private readonly cloudMinX: number;
  private readonly cloudSpan: number;
  private readonly stopFrame: () => void;
  private waterAttribute: THREE.BufferAttribute | null = null;
  private waterPositions: Float32Array | null = null;
  private waterBasePositions: Float32Array | null = null;
  private waterHeightOffset = 1;
  private waterWaveZOffset = 2;
  private destroyed = false;

  constructor(ctx: WorldContext) {
    this.scene = ctx.scene;
    const cloudBounds = cityBounds();
    this.cloudMinX = cloudBounds.minX - 18;
    this.cloudSpan = cloudBounds.maxX - cloudBounds.minX + 36;
    for (let index = 0; index < CLOUD_COUNT; index += 1) {
      this.clouds.push({
        y: 21 + (index % 3) * 3.2,
        z: cloudBounds.minZ + 13 + (index * 23 % Math.max(1, cloudBounds.maxZ - cloudBounds.minZ - 26)),
        speed: 1.2 + (index % 3) * 0.26,
        phase: index * 2.1,
      });
    }

    this.cloudGeometry = new THREE.SphereGeometry(0.86, 10, 7);
    this.cloudMesh = new THREE.InstancedMesh(
      this.cloudGeometry,
      fxMaterials.cloud,
      CLOUD_COUNT * CLOUD_PUFFS,
    );
    this.cloudMesh.name = 'ambient-clouds';
    this.cloudMesh.frustumCulled = false;
    this.cloudMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.scene.add(this.cloudMesh);

    this.addSmokeSources();
    this.smokePositions = new Float32Array(this.smokeSources.length * SMOKE_PUFFS_PER_SOURCE * 3);
    this.smokeGeometry = new THREE.BufferGeometry();
    this.smokeAttribute = new THREE.BufferAttribute(this.smokePositions, 3);
    this.smokeAttribute.setUsage(THREE.DynamicDrawUsage);
    this.smokeGeometry.setAttribute('position', this.smokeAttribute);
    this.smokeMesh = new THREE.Points(this.smokeGeometry, fxMaterials.smoke);
    this.smokeMesh.name = 'ambient-smoke';
    this.smokeMesh.frustumCulled = false;
    this.scene.add(this.smokeMesh);

    this.captureWater(ctx.scene);
    this.animateClouds(0);
    this.animateSmoke(0);
    this.stopFrame = ctx.renderer.onFrame(this.update);
  }

  destroy(): void {
    if (this.destroyed) return;

    this.destroyed = true;
    this.stopFrame();
    this.restoreWater();
    this.scene.remove(this.cloudMesh, this.smokeMesh);
    this.cloudGeometry.dispose();
    this.smokeGeometry.dispose();
    this.clouds.length = 0;
    this.smokeSources.length = 0;
  }

  private readonly update = (_dtSeconds: number, elapsed: number): void => {
    if (this.destroyed) return;

    this.animateWater(elapsed);
    this.animateClouds(elapsed);
    this.animateSmoke(elapsed);
  };

  private captureWater(scene: THREE.Scene): void {
    const water = scene.getObjectByName('water');
    if (!(water instanceof THREE.Mesh) || !(water.geometry instanceof THREE.BufferGeometry)) return;

    const attribute = water.geometry.getAttribute('position');
    if (!(attribute.array instanceof Float32Array)) return;

    this.waterAttribute = attribute;
    this.waterPositions = attribute.array;
    this.waterBasePositions = new Float32Array(attribute.array);
    if (Math.abs(water.rotation.x) > Math.PI * 0.25) {
      this.waterHeightOffset = 2;
      this.waterWaveZOffset = 1;
    }
  }

  private animateWater(elapsed: number): void {
    const attribute = this.waterAttribute;
    const positions = this.waterPositions;
    const basePositions = this.waterBasePositions;
    if (!attribute || !positions || !basePositions) return;

    for (let offset = 0; offset < positions.length; offset += 3) {
      const x = basePositions[offset]!;
      const z = basePositions[offset + this.waterWaveZOffset]!;
      positions[offset + this.waterHeightOffset] = basePositions[offset + this.waterHeightOffset]!
        + Math.sin(elapsed * 1.65 + x * 0.19 + z * 0.14) * 0.07
        + Math.sin(elapsed * 0.8 - x * 0.08 + z * 0.21) * 0.035;
    }
    attribute.needsUpdate = true;
  }

  private animateClouds(elapsed: number): void {
    let instance = 0;
    for (let cloudIndex = 0; cloudIndex < this.clouds.length; cloudIndex += 1) {
      const cloud = this.clouds[cloudIndex]!;
      const cloudX = this.cloudMinX + (elapsed * cloud.speed + cloud.phase * 9) % this.cloudSpan;
      for (let puff = 0; puff < CLOUD_PUFFS; puff += 1) {
        const sway = Math.sin(elapsed * 0.45 + cloud.phase + puff) * 0.14;
        this.cloudMatrix.makeScale(
          CLOUD_SCALE_X[puff]!,
          CLOUD_SCALE_Y[puff]!,
          CLOUD_SCALE_Z[puff]!,
        );
        this.cloudMatrix.setPosition(
          cloudX + CLOUD_OFFSET_X[puff]!,
          cloud.y + CLOUD_OFFSET_Y[puff]! + sway,
          cloud.z + CLOUD_OFFSET_Z[puff]!,
        );
        this.cloudMesh.setMatrixAt(instance, this.cloudMatrix);
        instance += 1;
      }
    }
    this.cloudMesh.instanceMatrix.needsUpdate = true;
  }

  private animateSmoke(elapsed: number): void {
    let particle = 0;
    for (let sourceIndex = 0; sourceIndex < this.smokeSources.length; sourceIndex += 1) {
      const source = this.smokeSources[sourceIndex]!;
      for (let puff = 0; puff < SMOKE_PUFFS_PER_SOURCE; puff += 1) {
        const age = (elapsed + source.phase + puff * (SMOKE_LIFETIME_SECONDS / SMOKE_PUFFS_PER_SOURCE))
          % SMOKE_LIFETIME_SECONDS;
        const offset = particle * 3;
        this.smokePositions[offset] = source.x + Math.sin(age * 1.8 + source.phase) * (0.15 + age * 0.07);
        this.smokePositions[offset + 1] = source.y + age * 0.82;
        this.smokePositions[offset + 2] = source.z + Math.cos(age * 1.35 + source.phase) * (0.12 + age * 0.05);
        particle += 1;
      }
    }
    this.smokeAttribute.needsUpdate = true;
  }

  private addSmokeSources(): void {
    for (let index = 0; index < LANDMARKS.length; index += 1) {
      const landmark = LANDMARKS[index]!;
      if (
        landmark.kind !== 'build'
        && landmark.kind !== 'test'
        && landmark.kind !== 'security'
        && landmark.kind !== 'package'
        && landmark.kind !== 'port'
      ) continue;

      this.smokeSources.push({
        x: landmark.position.x + landmark.footprint.w * 0.22,
        y: landmark.position.y + landmark.footprint.h + 0.6,
        z: landmark.position.z - landmark.footprint.d * 0.22,
        phase: index * 0.91,
      });
    }
  }

  private restoreWater(): void {
    const attribute = this.waterAttribute;
    const positions = this.waterPositions;
    const basePositions = this.waterBasePositions;
    if (!attribute || !positions || !basePositions) return;

    for (let offset = this.waterHeightOffset; offset < positions.length; offset += 3) {
      positions[offset] = basePositions[offset]!;
    }
    attribute.needsUpdate = true;
  }
}

function cityBounds(): { minX: number; maxX: number; minZ: number; maxZ: number } {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;

  for (let index = 0; index < CITIES.length; index += 1) {
    const city = CITIES[index]!;
    minX = Math.min(minX, city.center.x - city.radius);
    maxX = Math.max(maxX, city.center.x + city.radius);
    minZ = Math.min(minZ, city.center.z - city.radius);
    maxZ = Math.max(maxZ, city.center.z + city.radius);
  }

  return { minX, maxX, minZ, maxZ };
}
