import * as THREE from "three";
import type { RenderAssets } from "./assets";
import { ModelBatch } from "./batch";
import { BILLBOARD_BASIS } from "./camera";
import { seededRange } from "./hash";

/** Drift speed range of a cloud, in world units per second. */
const DRIFT = [0.1, 0.34] as const;
/** How far beyond the world's edge clouds roam before wrapping round. */
const MARGIN = 30;

interface Cloud {
  x: number;
  y: number;
  z: number;
  width: number;
  speed: number;
}

/** The backdrop: a gradient fixed to the camera and clouds drifting below the islands. */
export class SkySystem {
  readonly clouds = new THREE.Group();
  private readonly skyGeometry = new THREE.PlaneGeometry(2, 2);
  private readonly skyMaterial = new THREE.ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    // Bright haze at the top where the world recedes, deep air at the bottom, and a touch of light behind the middle.
    fragmentShader: `
      varying vec2 vUv;
      void main() {
        vec3 deep = vec3(0.13, 0.27, 0.47);
        vec3 mid = vec3(0.30, 0.55, 0.80);
        vec3 haze = vec3(0.66, 0.86, 0.97);
        vec3 color = mix(deep, mid, smoothstep(0.0, 0.55, vUv.y));
        color = mix(color, haze, smoothstep(0.45, 1.0, vUv.y));
        color += 0.05 * (1.0 - smoothstep(0.0, 0.75, distance(vUv, vec2(0.5, 0.62))));
        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });
  private readonly sky = new THREE.Mesh(this.skyGeometry, this.skyMaterial);
  private readonly cloudMaterial: THREE.MeshBasicMaterial;
  /** One unit wide, half as tall, facing the camera; clouds scale it evenly. */
  private readonly cloudGeometry = new THREE.PlaneGeometry(1, 0.5).applyMatrix4(BILLBOARD_BASIS);
  private readonly batch: ModelBatch;
  private readonly matrix = new THREE.Matrix4();
  private drifting: Cloud[] = [];
  private worldWidth = -1;
  private worldDepth = -1;

  constructor(camera: THREE.OrthographicCamera, assets: RenderAssets) {
    this.cloudMaterial = new THREE.MeshBasicMaterial({
      map: assets.cloudTexture,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
      toneMapped: false,
    });
    this.batch = new ModelBatch([{ geometry: this.cloudGeometry, material: this.cloudMaterial }], { animated: true, renderOrder: 1 });
    this.clouds.name = "clouds-below-islands";
    this.clouds.add(this.batch.group);
    this.sky.position.z = -3000;
    this.sky.renderOrder = -100;
    this.sky.frustumCulled = false;
    camera.add(this.sky);
  }

  /** Stretches the backdrop over the whole view, given its extent in world units. */
  resize(viewWidth: number, viewHeight: number): void {
    this.sky.scale.set(viewWidth * 0.5, viewHeight * 0.5, 1);
  }

  setWorldSize(width: number, depth: number): void {
    if (width === this.worldWidth && depth === this.worldDepth) return;
    this.worldWidth = width;
    this.worldDepth = depth;
    const count = Math.round(THREE.MathUtils.clamp(((width + MARGIN * 2) * (depth + MARGIN * 2)) / 700, 14, 90));
    this.drifting = [];
    for (let index = 0; index < count; index += 1) {
      // Two decks: small clouds just under the islands, broad ones far below.
      const low = index % 3 === 0;
      this.drifting.push({
        x: seededRange(421, index * 5, -MARGIN, width + MARGIN),
        y: low ? seededRange(421, index * 5 + 1, -34, -20) : seededRange(421, index * 5 + 1, -11, -4.5),
        z: seededRange(421, index * 5 + 2, -MARGIN, depth + MARGIN),
        width: low ? seededRange(421, index * 5 + 3, 16, 30) : seededRange(421, index * 5 + 3, 5, 10),
        speed: seededRange(421, index * 5 + 4, DRIFT[0], DRIFT[1]),
      });
    }
    this.update(0);
  }

  update(delta: number): void {
    this.batch.begin();
    for (const cloud of this.drifting) {
      cloud.x += cloud.speed * delta;
      if (cloud.x > this.worldWidth + MARGIN) cloud.x = -MARGIN;
      this.matrix.makeScale(cloud.width, cloud.width, cloud.width).setPosition(cloud.x, cloud.y, cloud.z);
      this.batch.add("", this.matrix);
    }
    this.batch.end();
  }

  dispose(): void {
    this.sky.removeFromParent();
    this.clouds.removeFromParent();
    this.batch.dispose();
    this.skyGeometry.dispose();
    this.cloudGeometry.dispose();
    this.skyMaterial.dispose();
    this.cloudMaterial.dispose();
    this.drifting = [];
  }
}
