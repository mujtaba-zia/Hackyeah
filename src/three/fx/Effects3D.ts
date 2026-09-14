import * as THREE from 'three';
import type { Vec3 } from '../../domain/ids';
import type { WorldContext } from '../core/context';
import { emissiveMaterials, fxMaterials } from '../core/materials';

/** A running effect. Both methods are safe to call more than once. */
export interface FxHandle {
  stop(): void;
  destroy(): void;
}

type FrameTask = (dtSeconds: number, elapsed: number) => boolean;

interface HandleParts {
  object: THREE.Object3D;
  geometries?: readonly THREE.BufferGeometry[];
  materials?: readonly THREE.Material[];
  task?: FrameTask;
  stop?: () => void;
}

interface BurstOptions {
  colour: number;
  count: number;
  lifespan: number;
  speed: number;
  gravity: number;
  size: number;
}

interface CameraShake {
  intensity: number;
  remaining: number;
}

const TAU = Math.PI * 2;
const WORLD_HALF_WIDTH = 76;
const WORLD_HALF_DEPTH = 48;

/**
 * Procedural effects for the three dimensional city.
 *
 * Each live effect owns its frame task and local resources. Shared effect
 * materials stay in the core palette, while one-off material clones are
 * disposed with the effect that changes them.
 */
export class Effects3D {
  private readonly ctx: WorldContext;
  private readonly live = new Set<FxHandle>();
  private readonly tasks = new Set<FrameTask>();
  private readonly frameUnsubscribe: () => void;
  private readonly confettiGeometry = new THREE.PlaneGeometry(0.28, 0.48);
  private readonly debrisGeometry = new THREE.IcosahedronGeometry(0.34, 0);
  private readonly overlayGeometry = new THREE.PlaneGeometry(2, 2);
  private readonly overlayMaterial = fxMaterials.overlay.clone();
  private readonly overlay: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly lastShakeOffset = new THREE.Vector3();
  private readonly lastShakenPosition = new THREE.Vector3();
  private readonly shakes: CameraShake[] = [];

  private flashRemaining = 0;
  private flashDuration = 0;
  private shakeTime = 0;
  private hasShakeOffset = false;
  private destroyed = false;

  constructor(ctx: WorldContext) {
    this.ctx = ctx;
    this.overlay = new THREE.Mesh(this.overlayGeometry, this.overlayMaterial);
    this.overlay.visible = false;
    this.overlay.renderOrder = 10_000;
    ctx.renderer.camera.add(this.overlay);
    this.frameUnsubscribe = ctx.renderer.onFrame((dtSeconds, elapsed) => this.update(dtSeconds, elapsed));
  }

  /** Number of running effects, useful for lifecycle probes. */
  get liveCount(): number {
    return this.live.size;
  }

  /** Rising puffs use one dynamic points buffer instead of one mesh per puff. */
  smoke(at: Vec3, opts: { colour?: number; rate?: number } = {}): FxHandle {
    const count = 28;
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    const ages = new Float32Array(count);
    const colours = new Float32Array(count * 3);
    const geometry = new THREE.BufferGeometry();
    const positionAttribute = new THREE.BufferAttribute(positions, 3);
    const colourAttribute = new THREE.BufferAttribute(colours, 3);
    geometry.setAttribute('position', positionAttribute);
    geometry.setAttribute('color', colourAttribute);
    const material = fxMaterials.smoke.clone();
    material.color.setHex(0xffffff);
    material.vertexColors = true;
    const smokeColour = new THREE.Color(opts.colour ?? 0x6b7280);
    const fadeColour = new THREE.Color(0xf1f5f9);
    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    this.ctx.scene.add(points);

    const interval = Math.max(0.04, (opts.rate ?? 180) / 1000);
    let elapsedSinceSpawn = interval;
    let cursor = 0;
    for (let index = 0; index < count; index += 1) {
      ages[index] = 3;
      positions[index * 3 + 1] = -100;
    }

    const spawn = (index: number) => {
      const offset = index * 3;
      positions[offset] = at.x + (Math.random() - 0.5) * 1.6;
      positions[offset + 1] = at.y + Math.random() * 0.45;
      positions[offset + 2] = at.z + (Math.random() - 0.5) * 1.6;
      velocities[offset] = (Math.random() - 0.5) * 0.55;
      velocities[offset + 1] = 1.15 + Math.random() * 0.8;
      velocities[offset + 2] = (Math.random() - 0.5) * 0.55;
      colours[offset] = smokeColour.r;
      colours[offset + 1] = smokeColour.g;
      colours[offset + 2] = smokeColour.b;
      ages[index] = 0;
    };

    const task: FrameTask = (dtSeconds) => {
      elapsedSinceSpawn += dtSeconds;
      while (elapsedSinceSpawn >= interval) {
        elapsedSinceSpawn -= interval;
        spawn(cursor);
        cursor = (cursor + 1) % count;
      }
      for (let index = 0; index < count; index += 1) {
        const offset = index * 3;
        ages[index] += dtSeconds;
        if (ages[index] >= 2) {
          positions[offset + 1] = -100;
          continue;
        }
        positions[offset] += velocities[offset] * dtSeconds;
        positions[offset + 1] += velocities[offset + 1] * dtSeconds;
        positions[offset + 2] += velocities[offset + 2] * dtSeconds;
        const opacity = 1 - ages[index] * 0.5;
        colours[offset] = fadeColour.r + (smokeColour.r - fadeColour.r) * opacity;
        colours[offset + 1] = fadeColour.g + (smokeColour.g - fadeColour.g) * opacity;
        colours[offset + 2] = fadeColour.b + (smokeColour.b - fadeColour.b) * opacity;
      }
      positionAttribute.needsUpdate = true;
      colourAttribute.needsUpdate = true;
      return true;
    };

    return this.createHandle({ object: points, geometries: [geometry], materials: [material], task });
  }

  /** An emissive flickering flame cluster and point light make factory fires read at distance. */
  fire(at: Vec3): FxHandle {
    const group = new THREE.Group();
    const geometry = new THREE.ConeGeometry(0.52, 1.7, 7);
    const material = emissiveMaterials.fire.clone();
    const flames: THREE.Mesh[] = [];
    const flameOffsets = [
      [-0.48, 0, -0.2],
      [0.15, 0.14, 0.3],
      [0.48, -0.03, -0.3],
      [-0.1, 0.24, 0.15],
    ] as const;
    for (let index = 0; index < flameOffsets.length; index += 1) {
      const flame = new THREE.Mesh(geometry, material);
      const [x, y, z] = flameOffsets[index];
      flame.position.set(x, y + 0.82, z);
      flame.scale.setScalar(0.65 + index * 0.1);
      group.add(flame);
      flames.push(flame);
    }
    const light = new THREE.PointLight(0xff8b3d, 2.4, 14, 2);
    light.position.set(0, 1.4, 0);
    group.add(light);
    group.position.set(at.x, at.y, at.z);
    this.ctx.scene.add(group);

    let phase = 0;
    const task: FrameTask = (dtSeconds) => {
      phase += dtSeconds;
      for (let index = 0; index < flames.length; index += 1) {
        const flame = flames[index];
        const pulse = 0.78 + Math.sin(phase * (6 + index) + index) * 0.16;
        flame.scale.setScalar(pulse);
        flame.position.y = 0.82 + flameOffsets[index][1] + Math.sin(phase * 5 + index) * 0.12;
      }
      light.intensity = 2.15 + Math.sin(phase * 8) * 0.45;
      return true;
    };

    return this.createHandle({ object: group, geometries: [geometry], materials: [material], task });
  }

  sparks(at: Vec3, colour = 0xffd166, count = 20): void {
    this.createBurst(at, {
      colour,
      count,
      lifespan: 1,
      speed: 5.5,
      gravity: 9,
      size: 0.32,
    });
  }

  /** Coloured quads are batched in one instanced mesh for parade and fireworks bursts. */
  confetti(at: Vec3, count = 40): void {
    const mesh = new THREE.InstancedMesh(this.confettiGeometry, fxMaterials.confetti, count);
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    const spins = new Float32Array(count);
    const rotations = new Float32Array(count);
    const matrixObject = new THREE.Object3D();
    const colour = new THREE.Color();
    const colours = [0x4ade80, 0xffd166, 0x8fd0ff, 0xef5f8c] as const;

    for (let index = 0; index < count; index += 1) {
      const offset = index * 3;
      positions[offset] = at.x;
      positions[offset + 1] = at.y + 0.4;
      positions[offset + 2] = at.z;
      velocities[offset] = (Math.random() - 0.5) * 5;
      velocities[offset + 1] = 3.8 + Math.random() * 3.4;
      velocities[offset + 2] = (Math.random() - 0.5) * 5;
      rotations[index] = Math.random() * TAU;
      spins[index] = (Math.random() - 0.5) * 13;
      colour.setHex(colours[index % colours.length]);
      mesh.setColorAt(index, colour);
      matrixObject.position.set(positions[offset], positions[offset + 1], positions[offset + 2]);
      matrixObject.rotation.set(Math.random() * TAU, rotations[index], Math.random() * TAU);
      matrixObject.scale.setScalar(0.8 + Math.random() * 0.5);
      matrixObject.updateMatrix();
      mesh.setMatrixAt(index, matrixObject.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.frustumCulled = false;
    this.ctx.scene.add(mesh);

    let age = 0;
    let handle: FxHandle;
    const task: FrameTask = (dtSeconds) => {
      age += dtSeconds;
      for (let index = 0; index < count; index += 1) {
        const offset = index * 3;
        velocities[offset + 1] -= 8.8 * dtSeconds;
        positions[offset] += velocities[offset] * dtSeconds;
        positions[offset + 1] += velocities[offset + 1] * dtSeconds;
        positions[offset + 2] += velocities[offset + 2] * dtSeconds;
        rotations[index] += spins[index] * dtSeconds;
        matrixObject.position.set(positions[offset], positions[offset + 1], positions[offset + 2]);
        matrixObject.rotation.set(rotations[index] * 0.5, rotations[index], rotations[index] * 0.35);
        matrixObject.updateMatrix();
        mesh.setMatrixAt(index, matrixObject.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (age >= 1.9) {
        handle.destroy();
        return false;
      }
      return true;
    };
    handle = this.createHandle({ object: mesh, task });
  }

  explosion(at: Vec3): void {
    this.createBurst(at, {
      colour: 0xff8b3d,
      count: 28,
      lifespan: 0.72,
      speed: 8.4,
      gravity: 7.5,
      size: 0.54,
    });
    this.dust(at);
    this.shake(0.08, 320);
  }

  dust(at: Vec3): void {
    this.createBurst(at, {
      colour: 0xc9aa84,
      count: 18,
      lifespan: 1.3,
      speed: 3.2,
      gravity: 1.6,
      size: 0.55,
    });
  }

  /** Chunks orbit a point in one instanced mesh, used by the tornado. */
  debris(at: Vec3, radius = 3.8): FxHandle {
    const count = 8;
    const mesh = new THREE.InstancedMesh(this.debrisGeometry, fxMaterials.debris, count);
    const matrixObject = new THREE.Object3D();
    const angles = new Float32Array(count);
    for (let index = 0; index < count; index += 1) {
      angles[index] = (index / count) * TAU;
    }
    mesh.frustumCulled = false;
    this.ctx.scene.add(mesh);

    let phase = 0;
    const task: FrameTask = (dtSeconds) => {
      phase += dtSeconds;
      for (let index = 0; index < count; index += 1) {
        const angle = angles[index] + phase * (2.4 + index * 0.12);
        const orbit = radius * (0.5 + index * 0.07);
        const rise = (phase * 1.8 + index * 0.74) % 5.4;
        matrixObject.position.set(
          at.x + Math.cos(angle) * orbit,
          at.y + 0.7 + rise + Math.sin(phase * 3 + index) * 0.25,
          at.z + Math.sin(angle) * orbit,
        );
        matrixObject.rotation.set(phase * 4 + index, angle, phase * 3 - index);
        matrixObject.scale.setScalar(0.75 + (index % 3) * 0.16);
        matrixObject.updateMatrix();
        mesh.setMatrixAt(index, matrixObject.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      return true;
    };

    return this.createHandle({ object: mesh, task });
  }

  /** A translucent cone connects a hovering UFO to its ground target. */
  beam(from: Vec3, to: Vec3): FxHandle {
    const deltaX = from.x - to.x;
    const deltaY = from.y - to.y;
    const deltaZ = from.z - to.z;
    const length = Math.max(0.1, Math.hypot(deltaX, deltaY, deltaZ));
    const geometry = new THREE.ConeGeometry(Math.max(1.2, length * 0.2), length, 16, 1, true);
    const material = emissiveMaterials.beam.clone();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set((from.x + to.x) * 0.5, (from.y + to.y) * 0.5, (from.z + to.z) * 0.5);
    mesh.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(deltaX / length, deltaY / length, deltaZ / length),
    );
    this.ctx.scene.add(mesh);

    let phase = 0;
    const task: FrameTask = (dtSeconds) => {
      phase += dtSeconds;
      mesh.scale.x = 0.92 + Math.sin(phase * 4) * 0.08;
      mesh.scale.z = mesh.scale.x;
      material.opacity = 0.56 + Math.sin(phase * 5) * 0.16;
      return true;
    };

    return this.createHandle({ object: mesh, geometries: [geometry], materials: [material], task });
  }

  /** An expanding ground ring makes the affected location obvious from far away. */
  warningPulse(at: Vec3): FxHandle {
    const geometry = new THREE.RingGeometry(0.86, 1, 28);
    const material = emissiveMaterials.warning.clone();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(at.x, at.y + 0.06, at.z);
    this.ctx.scene.add(mesh);

    let phase = 0;
    const task: FrameTask = (dtSeconds) => {
      phase = (phase + dtSeconds * 0.72) % 1;
      const scale = 1 + phase * 3.2;
      mesh.scale.set(scale, scale, scale);
      material.opacity = (1 - phase) * 0.8;
      return true;
    };

    return this.createHandle({ object: mesh, geometries: [geometry], materials: [material], task });
  }

  /** Sparse world-sized streaks keep a tornado storm cheap while the camera moves. */
  wind(): FxHandle {
    const count = 132;
    const positions = new Float32Array(count * 3);
    const speeds = new Float32Array(count);
    const geometry = new THREE.BufferGeometry();
    const positionAttribute = new THREE.BufferAttribute(positions, 3);
    geometry.setAttribute('position', positionAttribute);
    for (let index = 0; index < count; index += 1) {
      const offset = index * 3;
      positions[offset] = (Math.random() * 2 - 1) * WORLD_HALF_WIDTH;
      positions[offset + 1] = 0.6 + Math.random() * 22;
      positions[offset + 2] = (Math.random() * 2 - 1) * WORLD_HALF_DEPTH;
      speeds[index] = 18 + Math.random() * 16;
    }
    const points = new THREE.Points(geometry, fxMaterials.wind);
    points.frustumCulled = false;
    this.ctx.scene.add(points);

    const task: FrameTask = (dtSeconds) => {
      for (let index = 0; index < count; index += 1) {
        const offset = index * 3;
        positions[offset] += speeds[index] * dtSeconds;
        positions[offset + 2] += Math.sin(index * 0.7 + positions[offset] * 0.12) * dtSeconds * 1.5;
        if (positions[offset] > WORLD_HALF_WIDTH) positions[offset] = -WORLD_HALF_WIDTH;
      }
      positionAttribute.needsUpdate = true;
      return true;
    };

    return this.createHandle({ object: points, geometries: [geometry], task });
  }

  /** Rain uses one dynamic points buffer over both cities rather than viewport emitters. */
  rain(): FxHandle {
    const count = 180;
    const positions = new Float32Array(count * 3);
    const speeds = new Float32Array(count);
    const geometry = new THREE.BufferGeometry();
    const positionAttribute = new THREE.BufferAttribute(positions, 3);
    geometry.setAttribute('position', positionAttribute);
    for (let index = 0; index < count; index += 1) {
      const offset = index * 3;
      positions[offset] = (Math.random() * 2 - 1) * WORLD_HALF_WIDTH;
      positions[offset + 1] = Math.random() * 31;
      positions[offset + 2] = (Math.random() * 2 - 1) * WORLD_HALF_DEPTH;
      speeds[index] = 18 + Math.random() * 10;
    }
    const points = new THREE.Points(geometry, fxMaterials.rain);
    points.frustumCulled = false;
    this.ctx.scene.add(points);

    const task: FrameTask = (dtSeconds) => {
      for (let index = 0; index < count; index += 1) {
        const offset = index * 3;
        positions[offset] -= dtSeconds * 3;
        positions[offset + 1] -= speeds[index] * dtSeconds;
        if (positions[offset + 1] < 0) {
          positions[offset] = (Math.random() * 2 - 1) * WORLD_HALF_WIDTH;
          positions[offset + 1] = 30;
          positions[offset + 2] = (Math.random() * 2 - 1) * WORLD_HALF_DEPTH;
        }
      }
      positionAttribute.needsUpdate = true;
      return true;
    };

    return this.createHandle({ object: points, geometries: [geometry], task });
  }

  /** Jitter is applied after camera rig movement and restored before the next frame. */
  shake(intensity = 0.006, ms = 400): void {
    if (this.destroyed) return;
    this.shakes.push({ intensity, remaining: Math.max(1, ms) / 1000 });
  }

  /** A camera-attached plane provides a real full-screen flash independent of world depth. */
  flash(colour: number, ms = 300): void {
    if (this.destroyed) return;
    this.overlayMaterial.color.setHex(colour);
    this.flashDuration = Math.max(1, ms) / 1000;
    this.flashRemaining = this.flashDuration;
    this.overlay.visible = true;
    this.resizeOverlay();
  }

  /** Stop all current effects without disposing the shared palette or reusable geometry. */
  clear(): void {
    for (const handle of [...this.live]) handle.destroy();
    this.shakes.length = 0;
    this.restoreCamera();
    this.flashRemaining = 0;
    this.overlay.visible = false;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.clear();
    this.frameUnsubscribe();
    this.overlay.removeFromParent();
    this.overlayGeometry.dispose();
    this.overlayMaterial.dispose();
    this.confettiGeometry.dispose();
    this.debrisGeometry.dispose();
  }

  private createBurst(at: Vec3, options: BurstOptions): void {
    const positions = new Float32Array(options.count * 3);
    const velocities = new Float32Array(options.count * 3);
    const geometry = new THREE.BufferGeometry();
    const positionAttribute = new THREE.BufferAttribute(positions, 3);
    geometry.setAttribute('position', positionAttribute);
    const material = fxMaterials.particle.clone();
    material.color.setHex(options.colour);
    material.size = options.size;
    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    this.ctx.scene.add(points);

    for (let index = 0; index < options.count; index += 1) {
      const offset = index * 3;
      positions[offset] = at.x;
      positions[offset + 1] = at.y + 0.45;
      positions[offset + 2] = at.z;
      const angle = Math.random() * TAU;
      const horizontalSpeed = options.speed * (0.35 + Math.random() * 0.65);
      velocities[offset] = Math.cos(angle) * horizontalSpeed;
      velocities[offset + 1] = options.speed * (0.32 + Math.random() * 0.68);
      velocities[offset + 2] = Math.sin(angle) * horizontalSpeed;
    }

    let age = 0;
    let handle: FxHandle;
    const task: FrameTask = (dtSeconds) => {
      age += dtSeconds;
      for (let index = 0; index < options.count; index += 1) {
        const offset = index * 3;
        velocities[offset + 1] -= options.gravity * dtSeconds;
        positions[offset] += velocities[offset] * dtSeconds;
        positions[offset + 1] += velocities[offset + 1] * dtSeconds;
        positions[offset + 2] += velocities[offset + 2] * dtSeconds;
      }
      material.opacity = Math.max(0, 1 - age / options.lifespan);
      positionAttribute.needsUpdate = true;
      if (age >= options.lifespan) {
        handle.destroy();
        return false;
      }
      return true;
    };
    handle = this.createHandle({ object: points, geometries: [geometry], materials: [material], task });
  }

  private createHandle(parts: HandleParts): FxHandle {
    let stopped = false;
    let destroyed = false;
    const handle: FxHandle = {
      stop: () => {
        if (stopped || destroyed) return;
        stopped = true;
        if (parts.task) this.tasks.delete(parts.task);
        parts.stop?.();
      },
      destroy: () => {
        if (destroyed) return;
        destroyed = true;
        if (parts.task) this.tasks.delete(parts.task);
        parts.object.removeFromParent();
        for (const geometry of parts.geometries ?? []) geometry.dispose();
        for (const material of parts.materials ?? []) material.dispose();
        this.live.delete(handle);
      },
    };
    this.live.add(handle);
    if (parts.task) this.tasks.add(parts.task);
    if (this.destroyed) handle.destroy();
    return handle;
  }

  private update(dtSeconds: number, elapsed: number): void {
    this.updateShake(dtSeconds);
    if (this.flashRemaining > 0) {
      this.flashRemaining = Math.max(0, this.flashRemaining - dtSeconds);
      this.overlay.visible = this.flashRemaining > 0;
      this.overlayMaterial.opacity = (this.flashRemaining / this.flashDuration) * 0.45;
      this.resizeOverlay();
    }
    for (const task of this.tasks) {
      if (!task(dtSeconds, elapsed)) this.tasks.delete(task);
    }
  }

  private updateShake(dtSeconds: number): void {
    this.restoreCamera();
    this.shakeTime += dtSeconds;
    let totalIntensity = 0;
    for (let index = this.shakes.length - 1; index >= 0; index -= 1) {
      const shake = this.shakes[index];
      shake.remaining -= dtSeconds;
      if (shake.remaining <= 0) {
        this.shakes.splice(index, 1);
      } else {
        totalIntensity += shake.intensity * Math.min(1, shake.remaining * 3);
      }
    }
    if (totalIntensity <= 0) return;

    const camera = this.ctx.renderer.camera;
    this.lastShakeOffset.set(
      Math.sin(this.shakeTime * 53) * totalIntensity,
      Math.cos(this.shakeTime * 47) * totalIntensity,
      Math.sin(this.shakeTime * 61) * totalIntensity,
    );
    camera.position.add(this.lastShakeOffset);
    this.lastShakenPosition.copy(camera.position);
    this.hasShakeOffset = true;
  }

  private restoreCamera(): void {
    if (!this.hasShakeOffset) return;
    const cameraPosition = this.ctx.renderer.camera.position;
    if (cameraPosition.distanceToSquared(this.lastShakenPosition) < 0.0000001) {
      cameraPosition.sub(this.lastShakeOffset);
    }
    this.lastShakeOffset.set(0, 0, 0);
    this.hasShakeOffset = false;
  }

  private resizeOverlay(): void {
    const camera = this.ctx.renderer.camera;
    const distance = camera.near + 0.02;
    const halfHeight = Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)) * distance;
    this.overlay.position.set(0, 0, -distance);
    this.overlay.scale.set(halfHeight * camera.aspect, halfHeight, 1);
  }
}
