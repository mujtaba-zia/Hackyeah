import * as THREE from "three";
import { HEALTH_COLOURS, MOOD_COLOURS, STATUS_COLOURS } from "../../shared/palette";
import type { Health, Mood, RunResult } from "../../shared/types";
import { BILLBOARD_BASIS } from "./camera";
import type { ModelKit } from "./kit";

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

/** A puffy cloud: overlapping soft blobs, flat underneath. */
function drawCloudTexture(): THREE.CanvasTexture {
  const [canvas, context] = canvasWithContext(256, 128);
  const puffs: readonly (readonly [x: number, y: number, radius: number])[] = [
    [62, 82, 34],
    [104, 60, 46],
    [156, 66, 40],
    [198, 84, 30],
    [128, 88, 42],
  ];
  for (const [x, y, radius] of puffs) {
    const gradient = context.createRadialGradient(x, y - radius * 0.2, radius * 0.1, x, y, radius);
    gradient.addColorStop(0, "rgba(255, 255, 255, 0.95)");
    gradient.addColorStop(0.7, "rgba(244, 250, 255, 0.8)");
    gradient.addColorStop(1, "rgba(232, 244, 255, 0)");
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }
  return finishCanvasTexture(canvas);
}

function drawRadialTexture(stops: readonly (readonly [offset: number, alpha: number])[]): THREE.CanvasTexture {
  const [canvas, context] = canvasWithContext(128, 128);
  const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
  for (const [offset, alpha] of stops) gradient.addColorStop(offset, `rgba(255, 255, 255, ${alpha})`);
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  return finishCanvasTexture(canvas);
}

/** A shaft of light: bright along its middle, fading out towards the top. */
function drawBeamTexture(): THREE.CanvasTexture {
  const [canvas, context] = canvasWithContext(32, 128);
  const image = context.createImageData(32, 128);
  for (let y = 0; y < 128; y += 1) {
    // Row 0 is the top of the texture, which is the top of the beam.
    const rise = y / 127;
    for (let x = 0; x < 32; x += 1) {
      const side = 1 - Math.abs(x - 15.5) / 15.5;
      const alpha = side ** 2 * rise ** 1.4;
      const offset = (y * 32 + x) * 4;
      image.data[offset] = 255;
      image.data[offset + 1] = 255;
      image.data[offset + 2] = 255;
      image.data[offset + 3] = Math.round(alpha * 255);
    }
  }
  context.putImageData(image, 0, 0);
  return finishCanvasTexture(canvas);
}

/** The badge floating over a PR whose checks are running (hourglass) or failing (cross). */
function drawCheckBadge(checks: "pending" | "failure"): THREE.CanvasTexture {
  const [canvas, context] = canvasWithContext(64, 64);
  context.fillStyle = "rgba(20, 28, 44, 0.86)";
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

/** One clone of a kit material per key, in that key's colour; `glow` makes it emissive. */
function recoloured<K extends string>(template: THREE.Material, colours: Record<K, string>, glow: number): Record<K, THREE.Material> {
  const out = {} as Record<K, THREE.Material>;
  for (const key of Object.keys(colours) as K[]) {
    const material = template.clone();
    if (material instanceof THREE.MeshStandardMaterial) {
      material.color.set(colours[key]);
      if (glow > 0) {
        material.emissive.set(colours[key]);
        material.emissiveIntensity = glow;
      }
    }
    out[key] = material;
  }
  return out;
}

/** A translucent, unlit, textured material: `additive` adds light (glows), otherwise it paints its own colour. */
function overlay(map: THREE.Texture, colour: THREE.ColorRepresentation, opacity: number, additive = false): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    map,
    color: colour,
    opacity,
    transparent: true,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    depthWrite: false,
    toneMapped: false,
  });
}

/** Shared geometries, materials and textures for one world, built around the model kit. */
export class RenderAssets {
  readonly kit: ModelKit;
  /** Town hall spire, banner and flag, per district health. */
  readonly accentMaterials: Record<Health, THREE.Material>;
  /** Tower lantern, lamps and embers, per latest run. */
  readonly beaconMaterials: Record<RunResult, THREE.Material>;
  /** Tower roof, bands, pennant and airship, per latest run. */
  readonly statusMaterials: Record<RunResult, THREE.Material>;
  /** Creature body and egg shell, per mood. */
  readonly bodyMaterials: Record<Mood, THREE.Material>;
  readonly statusColours = {} as Record<RunResult, THREE.Color>;

  readonly cloudTexture = drawCloudTexture();
  /** A soft round dot: smoke, mist, glows and the shadows under creatures. */
  readonly softTexture = drawRadialTexture([
    [0, 0.95],
    [0.35, 0.55],
    [1, 0],
  ]);
  /** A band of colour that hugs an island's shore when the disc it is on lies just under the grass. */
  readonly haloTexture = drawRadialTexture([
    [0.66, 0],
    [0.735, 0.95],
    [0.85, 0.4],
    [1, 0],
  ]);
  readonly beamTexture = drawBeamTexture();

  readonly terrainMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 });
  readonly haloMaterials: Record<Exclude<Health, "good">, THREE.MeshBasicMaterial>;
  readonly glowMaterial: THREE.MeshBasicMaterial;
  readonly beamMaterial: THREE.MeshBasicMaterial;
  readonly blobShadowMaterial: THREE.MeshBasicMaterial;
  readonly checkBadgeMaterials: Record<"pending" | "failure", THREE.MeshBasicMaterial>;
  /** Trodden earth: the footpaths between a district's buildings. */
  readonly pathMaterial = new THREE.MeshStandardMaterial({ color: 0xd6c08a, roughness: 1 });
  readonly bridgeMaterial = new THREE.MeshStandardMaterial({ color: 0x9a673d, roughness: 0.9, flatShading: true });
  readonly bridgeRopeMaterial = new THREE.LineBasicMaterial({ color: 0xe2c08a, transparent: true, opacity: 0.85 });
  readonly selectionMaterial = new THREE.MeshBasicMaterial({
    color: 0xffe786,
    transparent: true,
    opacity: 0.9,
    side: THREE.DoubleSide,
    depthWrite: false,
    toneMapped: false,
  });
  readonly mistMaterial: THREE.SpriteMaterial;
  readonly waterfallUniforms = { time: { value: 0 } };
  readonly waterfallMaterial: THREE.ShaderMaterial;

  /** A unit quad that always faces the fixed camera. */
  readonly billboardGeometry = new THREE.PlaneGeometry(1, 1).applyMatrix4(BILLBOARD_BASIS);
  /** A unit quad standing on the ground, turned towards the camera. */
  readonly beamGeometry = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0).rotateY(Math.PI / 4);
  /** A unit disc lying on the ground. */
  readonly discGeometry = new THREE.CircleGeometry(0.5, 20).rotateX(-Math.PI / 2);
  /** A unit square lying on the ground. */
  readonly pathGeometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  readonly bridgePlankGeometry = new THREE.BoxGeometry(0.62, 0.12, 1.5);
  readonly bridgePostGeometry = new THREE.CylinderGeometry(0.09, 0.11, 1.0, 6);
  /** Rings of unit radius: a broad one for small things, a hairline to trace an island's shore. */
  readonly selectionGeometry = new THREE.RingGeometry(0.8, 1, 40).rotateX(-Math.PI / 2);
  readonly shoreRingGeometry = new THREE.RingGeometry(0.972, 1, 72).rotateX(-Math.PI / 2);
  readonly waterfallGeometry = new THREE.PlaneGeometry(1, 1, 1, 8);

  constructor(kit: ModelKit) {
    this.kit = kit;
    this.accentMaterials = recoloured(kit.template("hq", "Accent"), HEALTH_COLOURS, 0);
    this.beaconMaterials = recoloured(kit.template("tower_ci", "Beacon"), STATUS_COLOURS, 1.5);
    this.statusMaterials = recoloured(kit.template("tower_ci", "Status"), STATUS_COLOURS, 0);
    this.bodyMaterials = recoloured(kit.template("creature", "Body"), MOOD_COLOURS, 0);
    for (const status of Object.keys(STATUS_COLOURS) as RunResult[]) this.statusColours[status] = new THREE.Color(STATUS_COLOURS[status]);

    this.haloMaterials = {
      warn: overlay(this.haloTexture, HEALTH_COLOURS.warn, 0.7),
      bad: overlay(this.haloTexture, HEALTH_COLOURS.bad, 0.9),
    };
    this.glowMaterial = overlay(this.softTexture, 0xffffff, 0.75, true);
    this.beamMaterial = overlay(this.beamTexture, STATUS_COLOURS.failure, 0.85);
    this.blobShadowMaterial = overlay(this.softTexture, 0x10202c, 0.5);
    this.checkBadgeMaterials = {
      pending: new THREE.MeshBasicMaterial({ map: drawCheckBadge("pending"), transparent: true, depthWrite: false, toneMapped: false }),
      failure: new THREE.MeshBasicMaterial({ map: drawCheckBadge("failure"), transparent: true, depthWrite: false, toneMapped: false }),
    };
    this.mistMaterial = new THREE.SpriteMaterial({
      map: this.softTexture,
      color: 0xe6f9ff,
      transparent: true,
      opacity: 0.6,
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
      // Strands of water: each falls at its own pace, with dashes of foam, on a sheet that thins out towards the bottom.
      fragmentShader: `
        uniform float time;
        varying vec2 vUv;
        void main() {
          float fall = 1.0 - vUv.y;
          float strand = floor(vUv.x * 7.0);
          float pace = 0.8 + 0.4 * fract(sin(strand * 12.9898) * 43758.5453);
          float foam = smoothstep(0.6, 1.0, 0.5 + 0.5 * sin(fall * 30.0 - time * 6.0 * pace + strand * 2.1));
          float gap = smoothstep(0.0, 0.12, fract(vUv.x * 7.0)) * smoothstep(1.0, 0.88, fract(vUv.x * 7.0));
          float edge = smoothstep(0.0, 0.15, vUv.x) * smoothstep(1.0, 0.85, vUv.x);
          float fade = 1.0 - smoothstep(0.5, 1.0, fall);
          vec3 water = mix(vec3(0.38, 0.76, 0.97), vec3(0.94, 0.98, 1.0), foam * 0.8);
          gl_FragColor = vec4(water, (0.42 + 0.2 * gap + foam * 0.3) * edge * fade);
        }
      `,
    });
  }

  dispose(): void {
    const owned: { dispose(): void }[] = [
      this.cloudTexture,
      this.softTexture,
      this.haloTexture,
      this.beamTexture,
      this.terrainMaterial,
      this.glowMaterial,
      this.beamMaterial,
      this.blobShadowMaterial,
      this.bridgeMaterial,
      this.pathMaterial,
      this.pathGeometry,
      this.bridgeRopeMaterial,
      this.selectionMaterial,
      this.mistMaterial,
      this.waterfallMaterial,
      this.billboardGeometry,
      this.beamGeometry,
      this.discGeometry,
      this.bridgePlankGeometry,
      this.bridgePostGeometry,
      this.selectionGeometry,
      this.shoreRingGeometry,
      this.waterfallGeometry,
      ...Object.values(this.haloMaterials),
      ...Object.values(this.accentMaterials),
      ...Object.values(this.beaconMaterials),
      ...Object.values(this.statusMaterials),
      ...Object.values(this.bodyMaterials),
    ];
    for (const badge of Object.values(this.checkBadgeMaterials)) {
      badge.map?.dispose();
      owned.push(badge);
    }
    for (const item of owned) item.dispose();
    this.kit.dispose();
  }
}
