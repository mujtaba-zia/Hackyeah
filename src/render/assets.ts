import * as THREE from "three";
import type { CheckState, Health, IslandKind, Mood, RunResult } from "../../shared/types";
import { creatureTextureKey } from "./textures";

const MOOD_COLOURS: Record<Mood, string> = {
  egg: "#f5e7b8",
  fresh: "#6dd9ff",
  waiting: "#ffd166",
  approved: "#77e28d",
  changes: "#ffad66",
  stale: "#b99cff",
  blocked: "#f1788d",
  rejected: "#e85465",
};

const STATUS_COLOURS: Record<RunResult, number> = {
  success: 0x6ee78a,
  failure: 0xff435d,
  partial: 0xffb457,
  cancelled: 0x8e99aa,
  running: 0x69b9ff,
  queued: 0xe8d96b,
  none: 0x7d899a,
};

function canvasWithContext(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("canvas-2d-unavailable");
  return [canvas, context];
}

function finishCanvasTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function drawCloudTexture(): THREE.CanvasTexture {
  const [canvas, context] = canvasWithContext(128, 72);
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "rgba(255, 255, 255, 0.68)";
  context.beginPath();
  context.arc(36, 42, 20, 0, Math.PI * 2);
  context.arc(58, 29, 24, 0, Math.PI * 2);
  context.arc(84, 41, 18, 0, Math.PI * 2);
  context.arc(64, 47, 22, 0, Math.PI * 2);
  context.fill();
  return finishCanvasTexture(canvas);
}

function drawSoftParticleTexture(): THREE.CanvasTexture {
  const [canvas, context] = canvasWithContext(96, 96);
  const gradient = context.createRadialGradient(48, 48, 3, 48, 48, 48);
  gradient.addColorStop(0, "rgba(255, 255, 255, 0.9)");
  gradient.addColorStop(0.35, "rgba(215, 225, 235, 0.5)");
  gradient.addColorStop(1, "rgba(190, 205, 220, 0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 96, 96);
  return finishCanvasTexture(canvas);
}

function drawCreatureTexture(mood: Mood, checks: CheckState): THREE.CanvasTexture {
  const [canvas, context] = canvasWithContext(128, 128);
  const bodyColour = MOOD_COLOURS[mood];
  context.clearRect(0, 0, 128, 128);

  if (mood === "egg") {
    context.fillStyle = "rgba(55, 42, 55, 0.28)";
    context.beginPath();
    context.ellipse(66, 105, 33, 8, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = bodyColour;
    context.beginPath();
    context.ellipse(64, 71, 34, 46, 0, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = "#d5b96e";
    context.lineWidth = 4;
    context.stroke();
    context.fillStyle = "#e5c875";
    context.beginPath();
    context.arc(48, 59, 5, 0, Math.PI * 2);
    context.arc(76, 83, 5, 0, Math.PI * 2);
    context.fill();
  } else {
    context.fillStyle = "rgba(30, 38, 58, 0.28)";
    context.beginPath();
    context.ellipse(64, 104, 36, 8, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = bodyColour;
    context.beginPath();
    context.arc(64, 68, 34, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = bodyColour;
    context.beginPath();
    context.moveTo(40, 45);
    context.lineTo(42, 21);
    context.lineTo(56, 40);
    context.moveTo(88, 45);
    context.lineTo(86, 21);
    context.lineTo(72, 40);
    context.fill();
    context.fillStyle = "#192339";
    context.beginPath();
    context.arc(52, 65, 4, 0, Math.PI * 2);
    context.arc(76, 65, 4, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = "#192339";
    context.lineWidth = 4;
    context.beginPath();
    context.arc(64, 74, 12, 0.15, Math.PI - 0.15);
    context.stroke();
  }

  if (checks === "pending") {
    context.strokeStyle = "#ffd766";
    context.fillStyle = "#ffd766";
    context.lineWidth = 6;
    context.beginPath();
    context.moveTo(99, 17);
    context.lineTo(116, 17);
    context.moveTo(99, 45);
    context.lineTo(116, 45);
    context.stroke();
    context.beginPath();
    context.moveTo(102, 18);
    context.lineTo(113, 29);
    context.lineTo(102, 44);
    context.closePath();
    context.fill();
  }
  if (checks === "failure") {
    context.strokeStyle = "#ff5367";
    context.lineWidth = 8;
    context.beginPath();
    context.moveTo(99, 19);
    context.lineTo(116, 45);
    context.moveTo(116, 19);
    context.lineTo(99, 45);
    context.stroke();
  }
  return finishCanvasTexture(canvas);
}

function createStatusMaterials(): Record<RunResult, THREE.MeshBasicMaterial> {
  return {
    success: new THREE.MeshBasicMaterial({ color: STATUS_COLOURS.success }),
    failure: new THREE.MeshBasicMaterial({ color: STATUS_COLOURS.failure }),
    partial: new THREE.MeshBasicMaterial({ color: STATUS_COLOURS.partial }),
    cancelled: new THREE.MeshBasicMaterial({ color: STATUS_COLOURS.cancelled }),
    running: new THREE.MeshBasicMaterial({ color: STATUS_COLOURS.running }),
    queued: new THREE.MeshBasicMaterial({ color: STATUS_COLOURS.queued }),
    none: new THREE.MeshBasicMaterial({ color: STATUS_COLOURS.none }),
  };
}

/** Shared geometries, materials, and procedural texture cache for one world. */
export class RenderAssets {
  readonly grassMaterials: Record<IslandKind, THREE.MeshStandardMaterial>;
  readonly hqMaterials: Record<Health, THREE.MeshStandardMaterial>;
  readonly statusMaterials: Record<RunResult, THREE.MeshBasicMaterial>;
  readonly rockMaterial = new THREE.MeshStandardMaterial({ color: 0x5c5c70, flatShading: true, roughness: 1 });
  readonly treeTrunkMaterial = new THREE.MeshStandardMaterial({ color: 0x5b3c28, flatShading: true });
  readonly treeLeafMaterial = new THREE.MeshStandardMaterial({ color: 0x2f874f, flatShading: true });
  readonly sceneryRockMaterial = new THREE.MeshStandardMaterial({ color: 0x808494, flatShading: true });
  readonly bridgeMaterial = new THREE.MeshStandardMaterial({ color: 0x9a673d, roughness: 0.9 });
  readonly bridgeRopeMaterial = new THREE.LineBasicMaterial({ color: 0xd6b078, transparent: true, opacity: 0.72 });
  readonly towerBodyMaterial = new THREE.MeshStandardMaterial({ color: 0x49546b, roughness: 0.65, metalness: 0.2 });
  readonly towerReleaseMaterial = new THREE.MeshStandardMaterial({ color: 0x6a567f, roughness: 0.56, metalness: 0.18 });
  readonly flagMaterial = new THREE.MeshBasicMaterial({ color: 0xf0a85d, side: THREE.DoubleSide });
  readonly windowMaterial = new THREE.MeshBasicMaterial({ color: 0xc5e9ff });
  readonly roofMaterial = new THREE.MeshStandardMaterial({ color: 0x3c4054, flatShading: true });
  readonly pickMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
  readonly selectionMaterial = new THREE.MeshBasicMaterial({
    color: 0xffe786,
    transparent: true,
    opacity: 0.82,
    side: THREE.DoubleSide,
  });
  readonly mistMaterial: THREE.SpriteMaterial;
  readonly cloudTexture: THREE.CanvasTexture;
  readonly particleTexture: THREE.CanvasTexture;
  readonly waterfallUniforms = { time: { value: 0 } };
  readonly waterfallMaterial: THREE.ShaderMaterial;
  readonly treeTrunkGeometry = new THREE.CylinderGeometry(0.11, 0.16, 0.9, 5);
  readonly treeLeafGeometry = new THREE.ConeGeometry(0.57, 1.5, 6);
  readonly sceneryRockGeometry = new THREE.DodecahedronGeometry(0.42, 0);
  readonly bridgePlankGeometry = new THREE.BoxGeometry(0.72, 0.14, 0.8);
  readonly bridgePostGeometry = new THREE.CylinderGeometry(0.06, 0.08, 0.72, 5);
  readonly hqBaseGeometry = new THREE.BoxGeometry(1.7, 1.25, 1.45);
  readonly hqRoofGeometry = new THREE.ConeGeometry(1.35, 1.05, 4);
  readonly hqWindowGeometry = new THREE.BoxGeometry(0.34, 0.3, 0.03);
  readonly towerBaseGeometry = new THREE.CylinderGeometry(0.64, 0.78, 0.32, 8);
  readonly ciTowerGeometry = new THREE.CylinderGeometry(0.25, 0.4, 3.2, 7);
  readonly releaseTowerGeometry = new THREE.CylinderGeometry(0.62, 0.82, 2.15, 8);
  readonly beaconGeometry = new THREE.SphereGeometry(0.23, 10, 8);
  readonly flagGeometry = new THREE.PlaneGeometry(0.85, 0.46);
  readonly pickSurfaceGeometry = new THREE.PlaneGeometry(1, 1);
  readonly selectionGeometry = new THREE.RingGeometry(0.72, 0.92, 28);
  readonly waterfallGeometry = new THREE.PlaneGeometry(1, 1, 1, 8);
  private readonly creatureTextures = new Map<string, THREE.CanvasTexture>();

  constructor() {
    this.grassMaterials = {
      district: new THREE.MeshStandardMaterial({ color: 0x62ae5f, roughness: 0.95, flatShading: true }),
      outskirts: new THREE.MeshStandardMaterial({ color: 0x6f9f6a, roughness: 0.95, flatShading: true }),
      filler: new THREE.MeshStandardMaterial({ color: 0x7ca56d, roughness: 1, flatShading: true }),
    };
    this.hqMaterials = {
      good: new THREE.MeshStandardMaterial({ color: 0x4cae78, roughness: 0.65 }),
      warn: new THREE.MeshStandardMaterial({ color: 0xd79a4e, roughness: 0.65 }),
      bad: new THREE.MeshStandardMaterial({ color: 0xc85b63, roughness: 0.65 }),
    };
    this.statusMaterials = createStatusMaterials();
    this.cloudTexture = drawCloudTexture();
    this.particleTexture = drawSoftParticleTexture();
    this.mistMaterial = new THREE.SpriteMaterial({
      map: this.particleTexture,
      color: 0xdaf6ff,
      transparent: true,
      opacity: 0.56,
      depthWrite: false,
    });
    this.waterfallMaterial = new THREE.ShaderMaterial({
      uniforms: this.waterfallUniforms,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float time;
        varying vec2 vUv;
        void main() {
          float ribbon = 0.46 + 0.32 * sin((vUv.y * 18.0) - time * 5.0);
          float edge = smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.76, vUv.x);
          gl_FragColor = vec4(0.36, 0.82, 1.0, ribbon * edge * 0.78);
        }
      `,
    });
  }

  creatureTexture(mood: Mood, checks: CheckState): THREE.CanvasTexture {
    const key = creatureTextureKey(mood, checks);
    const cached = this.creatureTextures.get(key);
    if (cached) return cached;
    const texture = drawCreatureTexture(mood, checks);
    this.creatureTextures.set(key, texture);
    return texture;
  }

  statusColour(status: RunResult): number {
    return STATUS_COLOURS[status];
  }

  dispose(): void {
    this.rockMaterial.dispose();
    this.treeTrunkMaterial.dispose();
    this.treeLeafMaterial.dispose();
    this.sceneryRockMaterial.dispose();
    this.bridgeMaterial.dispose();
    this.bridgeRopeMaterial.dispose();
    this.towerBodyMaterial.dispose();
    this.towerReleaseMaterial.dispose();
    this.flagMaterial.dispose();
    this.windowMaterial.dispose();
    this.roofMaterial.dispose();
    this.pickMaterial.dispose();
    this.selectionMaterial.dispose();
    this.mistMaterial.dispose();
    this.waterfallMaterial.dispose();
    this.cloudTexture.dispose();
    this.particleTexture.dispose();
    this.treeTrunkGeometry.dispose();
    this.treeLeafGeometry.dispose();
    this.sceneryRockGeometry.dispose();
    this.bridgePlankGeometry.dispose();
    this.bridgePostGeometry.dispose();
    this.hqBaseGeometry.dispose();
    this.hqRoofGeometry.dispose();
    this.hqWindowGeometry.dispose();
    this.towerBaseGeometry.dispose();
    this.ciTowerGeometry.dispose();
    this.releaseTowerGeometry.dispose();
    this.beaconGeometry.dispose();
    this.flagGeometry.dispose();
    this.pickSurfaceGeometry.dispose();
    this.selectionGeometry.dispose();
    this.waterfallGeometry.dispose();

    const islandKinds: IslandKind[] = ["district", "outskirts", "filler"];
    for (let index = 0; index < islandKinds.length; index += 1) {
      const kind = islandKinds[index];
      if (kind) this.grassMaterials[kind].dispose();
    }
    const healths: Health[] = ["good", "warn", "bad"];
    for (let index = 0; index < healths.length; index += 1) {
      const health = healths[index];
      if (health) this.hqMaterials[health].dispose();
    }
    const statuses: RunResult[] = ["success", "failure", "partial", "cancelled", "running", "queued", "none"];
    for (let index = 0; index < statuses.length; index += 1) {
      const status = statuses[index];
      if (status) this.statusMaterials[status].dispose();
    }
    for (const texture of this.creatureTextures.values()) texture.dispose();
    this.creatureTextures.clear();
  }
}
