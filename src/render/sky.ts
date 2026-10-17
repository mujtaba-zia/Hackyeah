import * as THREE from "three";
import type { RenderAssets } from "./assets";
import { seededRange } from "./hash";

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
    fragmentShader: `
      varying vec2 vUv;
      void main() {
        vec3 horizon = vec3(0.17, 0.30, 0.48);
        vec3 zenith = vec3(0.55, 0.77, 0.92);
        vec3 color = mix(horizon, zenith, smoothstep(0.0, 1.0, vUv.y));
        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });
  private readonly sky = new THREE.Mesh(this.skyGeometry, this.skyMaterial);
  private readonly cloudMaterial: THREE.SpriteMaterial;
  private sprites: THREE.Sprite[] = [];
  private speeds = new Float32Array(0);
  private worldWidth = -1;
  private worldDepth = -1;

  constructor(camera: THREE.OrthographicCamera, assets: RenderAssets) {
    this.cloudMaterial = new THREE.SpriteMaterial({
      map: assets.cloudTexture,
      transparent: true,
      opacity: 0.44,
      depthWrite: false,
      depthTest: false,
    });
    this.sky.position.z = -1000;
    this.sky.renderOrder = -100;
    this.sky.frustumCulled = false;
    camera.add(this.sky);
    this.clouds.name = "clouds-below-islands";
  }

  resize(viewWidth: number, viewHeight: number): void {
    this.sky.scale.set(viewWidth * 0.5, viewHeight * 0.5, 1);
  }

  setWorldSize(width: number, depth: number): void {
    if (width === this.worldWidth && depth === this.worldDepth) return;
    this.worldWidth = width;
    this.worldDepth = depth;
    this.clouds.clear();
    this.sprites = [];
    this.speeds = new Float32Array(12);
    for (let index = 0; index < 12; index += 1) {
      const sprite = new THREE.Sprite(this.cloudMaterial);
      const scale = seededRange(421, index * 4, 3.8, 7.2);
      sprite.position.set(
        seededRange(421, index * 4 + 1, -7, width + 7),
        seededRange(421, index * 4 + 2, -7.8, -3.5),
        seededRange(421, index * 4 + 3, -7, depth + 7),
      );
      sprite.scale.set(scale, scale * 0.56, 1);
      this.speeds[index] = seededRange(421, index + 120, 0.12, 0.31);
      this.sprites.push(sprite);
      this.clouds.add(sprite);
    }
  }

  update(delta: number): void {
    for (let index = 0; index < this.sprites.length; index += 1) {
      const sprite = this.sprites[index];
      const speed = this.speeds[index];
      if (!sprite || speed === undefined) continue;
      sprite.position.x += speed * delta;
      if (sprite.position.x > this.worldWidth + 8) sprite.position.x = -8;
    }
  }

  dispose(): void {
    this.sky.removeFromParent();
    this.clouds.removeFromParent();
    this.skyGeometry.dispose();
    this.skyMaterial.dispose();
    this.cloudMaterial.dispose();
    this.sprites = [];
    this.speeds = new Float32Array(0);
  }
}
