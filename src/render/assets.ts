import * as THREE from "three";
import type { CheckState, Health, IslandKind, Mood, RunResult } from "../../shared/types";
import type { ModelKit } from "./kit";

const MOOD_COLOURS: Record<Mood, number> = {
  egg: 0xf5e7b8,
  fresh: 0x6dd9ff,
  waiting: 0xffd166,
  approved: 0x77e28d,
  changes: 0xffad66,
  stale: 0xb99cff,
  blocked: 0xf1788d,
  rejected: 0xe85465,
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

const HEALTH_COLOURS: Record<Health, number> = {
  good: 0x3fae74,
  warn: 0xe0993f,
  bad: 0xd4495a,
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

/** The badge floating over a PR whose checks are running (hourglass) or failing (cross). */
function drawCheckBadge(checks: "pending" | "failure"): THREE.CanvasTexture {
  const [canvas, context] = canvasWithContext(64, 64);
  context.fillStyle = "rgba(20, 28, 44, 0.82)";
  context.beginPath();
  context.arc(32, 32, 29, 0, Math.PI * 2);
  context.fill();
  context.lineCap = "round";
  if (checks === "pending") {
    context.strokeStyle = "#ffd766";
    context.fillStyle = "#ffd766";
    context.lineWidth = 5;
    context.beginPath();
    context.moveTo(20, 16);
    context.lineTo(44, 16);
    context.moveTo(20, 48);
    context.lineTo(44, 48);
    context.stroke();
    context.beginPath();
    context.moveTo(23, 18);
    context.lineTo(41, 18);
    context.lineTo(32, 32);
    context.lineTo(41, 46);
    context.lineTo(23, 46);
    context.lineTo(32, 32);
    context.closePath();
    context.fill();
  } else {
    context.strokeStyle = "#ff5367";
    context.lineWidth = 8;
    context.beginPath();
    context.moveTo(20, 20);
    context.lineTo(44, 44);
    context.moveTo(44, 20);
    context.lineTo(20, 44);
    context.stroke();
  }
  return finishCanvasTexture(canvas);
}

function recoloured<K extends string>(template: THREE.Material, colours: Record<K, number>, glow: boolean): Record<K, THREE.Material> {
  const out = {} as Record<K, THREE.Material>;
  for (const key of Object.keys(colours) as K[]) {
    const material = template.clone();
    if (material instanceof THREE.MeshStandardMaterial) {
      material.color.setHex(colours[key]);
      if (glow) {
        material.emissive.setHex(colours[key]);
        material.emissiveIntensity = 1.4;
      }
    }
    out[key] = material;
  }
  return out;
}

/** Shared geometries, materials and textures for one world, built around the model kit. */
export class RenderAssets {
  readonly kit: ModelKit;
  readonly grassMaterials: Record<IslandKind, THREE.MeshStandardMaterial>;
  /** HQ spire, banner and flag, per district health. */
  readonly accentMaterials: Record<Health, THREE.Material>;
  /** Tower lantern / brazier, per latest run. */
  readonly beaconMaterials: Record<RunResult, THREE.Material>;
  /** Creature body and egg shell, per mood. */
  readonly bodyMaterials: Record<Mood, THREE.Material>;
  readonly checkBadges: Record<"pending" | "failure", THREE.SpriteMaterial>;
  readonly rockMaterial = new THREE.MeshStandardMaterial({ color: 0x5c5c70, flatShading: true, roughness: 1 });
  readonly bridgeMaterial = new THREE.MeshStandardMaterial({ color: 0x9a673d, roughness: 0.9 });
  readonly bridgeRopeMaterial = new THREE.LineBasicMaterial({ color: 0xd6b078, transparent: true, opacity: 0.72 });
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
  readonly bridgePlankGeometry = new THREE.BoxGeometry(0.72, 0.14, 0.8);
  readonly bridgePostGeometry = new THREE.CylinderGeometry(0.06, 0.08, 0.72, 5);
  readonly pickSurfaceGeometry = new THREE.PlaneGeometry(1, 1);
  readonly selectionGeometry = new THREE.RingGeometry(0.72, 0.92, 28);
  readonly waterfallGeometry = new THREE.PlaneGeometry(1, 1, 1, 8);

  constructor(kit: ModelKit) {
    this.kit = kit;
    this.grassMaterials = {
      district: new THREE.MeshStandardMaterial({ color: 0x62ae5f, roughness: 0.95, flatShading: true }),
      outskirts: new THREE.MeshStandardMaterial({ color: 0x6f9f6a, roughness: 0.95, flatShading: true }),
      filler: new THREE.MeshStandardMaterial({ color: 0x7ca56d, roughness: 1, flatShading: true }),
    };
    this.accentMaterials = recoloured(kit.template("hq", "Accent"), HEALTH_COLOURS, false);
    this.beaconMaterials = recoloured(kit.template("tower_ci", "Beacon"), STATUS_COLOURS, true);
    this.bodyMaterials = recoloured(kit.template("creature", "Body"), MOOD_COLOURS, false);
    const pending = drawCheckBadge("pending");
    const failure = drawCheckBadge("failure");
    this.checkBadges = {
      pending: new THREE.SpriteMaterial({ map: pending, transparent: true, depthWrite: false }),
      failure: new THREE.SpriteMaterial({ map: failure, transparent: true, depthWrite: false }),
    };
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

  checkBadge(checks: CheckState): THREE.SpriteMaterial | null {
    return checks === "pending" || checks === "failure" ? this.checkBadges[checks] : null;
  }

  statusColour(status: RunResult): number {
    return STATUS_COLOURS[status];
  }

  dispose(): void {
    const owned: { dispose(): void }[] = [
      this.rockMaterial,
      this.bridgeMaterial,
      this.bridgeRopeMaterial,
      this.pickMaterial,
      this.selectionMaterial,
      this.mistMaterial,
      this.waterfallMaterial,
      this.cloudTexture,
      this.particleTexture,
      this.bridgePlankGeometry,
      this.bridgePostGeometry,
      this.pickSurfaceGeometry,
      this.selectionGeometry,
      this.waterfallGeometry,
      ...Object.values(this.grassMaterials),
      ...Object.values(this.accentMaterials),
      ...Object.values(this.beaconMaterials),
      ...Object.values(this.bodyMaterials),
    ];
    for (const badge of Object.values(this.checkBadges)) {
      badge.map?.dispose();
      owned.push(badge);
    }
    for (const item of owned) item.dispose();
    this.kit.dispose();
  }
}
