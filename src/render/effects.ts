import * as THREE from "three";
import { fromScreenAxes } from "../../shared/geometry";
import type { EffectKind, Incident, Vec2 } from "../../shared/types";
import type { RenderAssets } from "./assets";
import { hashString, seededRange } from "./hash";

/** Where a district's plaza is, or null when the district is not in the world. */
export type EffectLocator = (districtId: string) => Vec2 | null;

export interface EffectSlot {
  readonly group: THREE.Group;
  update(incident: VisibleIncident, locator: EffectLocator): void;
  animate(time: number): void;
  dispose(): void;
}

/** One drawn effect: its objects and how they move. Everything it creates is its own to dispose. */
interface EffectVisual {
  group: THREE.Group;
  animate(time: number): void;
}

/** An incident the world draws; incidents without an effect only appear in Problems. */
export type VisibleIncident = Incident & { effect: EffectKind };

export function hasEffect(incident: Incident): incident is VisibleIncident {
  return incident.effect !== null;
}

function incidentSignature(incident: Incident): string {
  return [
    incident.effect,
    incident.focus.x,
    incident.focus.z,
    incident.targets.districts.join(","),
    incident.targets.towers.join(","),
    incident.targets.creatures.join(","),
  ].join("|");
}

function puffMaterial(assets: RenderAssets, colour: number, opacity: number): THREE.SpriteMaterial {
  return new THREE.SpriteMaterial({ map: assets.softTexture, color: colour, transparent: true, opacity, depthWrite: false });
}

// Fire, smoke and the crowd ring stand where the incident says to look: the
// failing tower, the full nursery, the crowded plaza.

function createFire(incident: Incident, assets: RenderAssets): EffectVisual {
  const group = new THREE.Group();
  group.position.set(incident.focus.x, 0, incident.focus.z);
  const seed = hashString(incident.id);
  const phase = seededRange(seed, 80, 0, Math.PI * 2);
  const flameGeometry = new THREE.ConeGeometry(0.3, 1.1, 5);
  const flameMaterials = [0xff6d2f, 0xffc454].map(
    (color) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.92, toneMapped: false }),
  );
  const flames: THREE.Mesh[] = [];
  for (let index = 0; index < 7; index += 1) {
    const flame = new THREE.Mesh(flameGeometry, flameMaterials[index % 2]);
    const angle = seededRange(seed, index * 2, 0, Math.PI * 2);
    const radius = seededRange(seed, index * 2 + 1, 0.05, 0.75);
    flame.position.set(Math.cos(angle) * radius, 0.5, Math.sin(angle) * radius);
    flames.push(flame);
  }
  const smokeMaterial = puffMaterial(assets, 0x3c4252, 0.5);
  const smoke: THREE.Sprite[] = [];
  for (let index = 0; index < 6; index += 1) {
    const puff = new THREE.Sprite(smokeMaterial);
    puff.position.x = seededRange(seed, 40 + index, -0.55, 0.55);
    smoke.push(puff);
  }
  group.add(...flames, ...smoke);
  return {
    group,
    animate(time: number): void {
      flames.forEach((flame, index) => {
        const pulse = 0.78 + Math.sin(time * 8 + phase + index) * 0.2;
        flame.scale.set(pulse, 0.75 + pulse * 0.42, pulse);
        flame.position.y = 0.48 + Math.sin(time * 6 + index) * 0.13;
      });
      smoke.forEach((puff, index) => {
        // Each puff rises through its own stretch of the column, growing as it goes.
        const rise = (time * 0.38 + index / smoke.length) % 1;
        puff.position.y = 1.3 + rise * 3.4;
        const size = 0.8 + rise * 1.5;
        puff.scale.set(size, size, 1);
      });
    },
  };
}

function createSmoke(incident: Incident, assets: RenderAssets): EffectVisual {
  const group = new THREE.Group();
  group.position.set(incident.focus.x, 0, incident.focus.z);
  const seed = hashString(incident.id);
  const materials = [0x697284, 0x87909e].map((colour) => puffMaterial(assets, colour, 0.55));
  const puffs: THREE.Sprite[] = [];
  for (let index = 0; index < 9; index += 1) {
    const puff = new THREE.Sprite(materials[index % 2]);
    puff.position.set(seededRange(seed, index * 3 + 1, -0.45, 0.45), 0, seededRange(seed, index * 3 + 2, -0.45, 0.45));
    puffs.push(puff);
  }
  group.add(...puffs);
  return {
    group,
    animate(time: number): void {
      puffs.forEach((puff, index) => {
        const rise = (time * 0.3 + index / puffs.length) % 1;
        puff.position.y = 0.8 + rise * 3;
        const size = 0.7 + rise * 1.1 + Math.sin(time + index) * 0.06;
        puff.scale.set(size, size, 1);
      });
    },
  };
}

function createCrowd(incident: Incident): EffectVisual {
  const group = new THREE.Group();
  group.position.set(incident.focus.x, 0.2, incident.focus.z);
  const phase = seededRange(hashString(incident.id), 99, 0, Math.PI * 2);
  // A ring round the plaza: the review queue is the crowd of creatures inside it.
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(3.1, 0.09, 6, 40),
    new THREE.MeshBasicMaterial({ color: 0xffcf68, transparent: true, opacity: 0.9, toneMapped: false }),
  );
  ring.rotation.x = Math.PI * 0.5;
  group.add(ring);
  return {
    group,
    animate(time: number): void {
      const pulse = 0.96 + Math.sin(time * 2.6 + phase) * 0.05;
      ring.scale.set(pulse, pulse, pulse);
      ring.rotation.z = time * 0.18;
    },
  };
}

/**
 * The camera looks down from +x/+z, so anything above the plaza is drawn over
 * whatever stands behind it, and the town hall always stands behind the plaza.
 * The storm therefore hangs low over the plaza's front edge (towards the
 * viewer) and spreads sideways across the view rather than in depth.
 */
const STORM_FORWARD = 5.2;
const STORM_HEIGHT = 3.3;
const STORM_CLOUDS = 5;
const RAIN_DROPS = 18;

function createStorm(incident: Incident, locator: EffectLocator): EffectVisual {
  const group = new THREE.Group();
  const positions = incident.targets.districts.flatMap((id) => locator(id) ?? []);
  if (positions.length === 0) positions.push(incident.focus);
  const seed = hashString(incident.id);
  const tintGeometry = new THREE.CircleGeometry(4.8, 28).rotateX(-Math.PI / 2);
  const tintMaterial = new THREE.MeshBasicMaterial({ color: 0xcc3646, transparent: true, opacity: 0.2, depthWrite: false });
  const cloudGeometry = new THREE.DodecahedronGeometry(0.9, 0);
  const cloudMaterial = new THREE.MeshStandardMaterial({ color: 0x3a4256, flatShading: true, roughness: 1, transparent: true, opacity: 0.88 });
  const rainMaterial = new THREE.LineBasicMaterial({ color: 0x8fd4ff, transparent: true, opacity: 0.78 });
  const clouds: { mesh: THREE.Mesh; height: number }[] = [];
  const rain: THREE.LineSegments[] = [];

  positions.forEach((position, target) => {
    const tint = new THREE.Mesh(tintGeometry, tintMaterial);
    tint.position.set(position.x, 0.16, position.z);
    group.add(tint);
    for (let index = 0; index < STORM_CLOUDS; index += 1) {
      const salt = (target * STORM_CLOUDS + index) * 3;
      // `across` runs left-right on screen, `depth` towards/away from the camera.
      const across = (index - (STORM_CLOUDS - 1) / 2) * 0.95 + seededRange(seed, salt, -0.2, 0.2);
      const depth = seededRange(seed, salt + 1, -0.35, 0.35);
      const height = STORM_HEIGHT + seededRange(seed, salt + 2, 0, 0.45);
      const mesh = new THREE.Mesh(cloudGeometry, cloudMaterial);
      mesh.position.set(position.x + STORM_FORWARD + depth + across, height, position.z + STORM_FORWARD + depth - across);
      mesh.scale.set(1.3, 0.7, 1.0);
      clouds.push({ mesh, height });
      group.add(mesh);
    }
    const drops = new Float32Array(RAIN_DROPS * 6);
    for (let index = 0; index < RAIN_DROPS; index += 1) {
      const salt = 200 + target * 60 + index * 3;
      const x = seededRange(seed, salt, -2, 2);
      const z = seededRange(seed, salt + 1, -2, 2);
      const y = seededRange(seed, salt + 2, 0.9, 3.4);
      drops.set([x, y, z, x - 0.08, y - 0.72, z - 0.08], index * 6);
    }
    const lines = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(drops, 3)), rainMaterial);
    lines.position.set(position.x + STORM_FORWARD, 0, position.z + STORM_FORWARD);
    rain.push(lines);
    group.add(lines);
  });
  return {
    group,
    animate(time: number): void {
      clouds.forEach(({ mesh, height }, index) => {
        mesh.position.y = height + Math.sin(time + index) * 0.13;
      });
      rain.forEach((lines, index) => {
        lines.position.y = -((time * 3.2 + index * 0.2) % 0.82);
      });
    },
  };
}

/** Where the colossus stands relative to a plaza: behind it and to the left of the town hall, so neither the hall nor its nameplate hides it. */
const GIANT_STANCE = fromScreenAxes(-4.6, -5.4);

/** The colossus stands on the first troubled district and looms over the rest. */
function createGiant(incident: Incident, locator: EffectLocator, assets: RenderAssets): EffectVisual {
  const group = new THREE.Group();
  const first = incident.targets.districts[0];
  const anchor = (first ? locator(first) : null) ?? incident.focus;
  group.position.set(anchor.x + GIANT_STANCE.x, 0, anchor.z + GIANT_STANCE.z);
  group.rotation.y = Math.PI / 4;
  const phase = seededRange(hashString(incident.id), 9, 0, Math.PI * 2);
  for (const part of assets.kit.parts("giant")) {
    const mesh = new THREE.Mesh(part.geometry, part.material);
    mesh.castShadow = true;
    group.add(mesh);
  }
  return {
    group,
    animate(time: number): void {
      // A slow, heavy sway from the feet.
      group.rotation.y = Math.PI / 4 + Math.sin(time * 0.5 + phase) * 0.12;
      group.rotation.z = Math.sin(time * 0.8 + phase) * 0.025;
    },
  };
}

function createEffectVisual(incident: VisibleIncident, locator: EffectLocator, assets: RenderAssets): EffectVisual {
  if (incident.effect === "fire") return createFire(incident, assets);
  if (incident.effect === "smoke") return createSmoke(incident, assets);
  if (incident.effect === "crowd") return createCrowd(incident);
  if (incident.effect === "storm") return createStorm(incident, locator);
  return createGiant(incident, locator, assets);
}

/** Frees what an effect made. Kit geometry and materials (the giant) belong to the kit and stay. */
function disposeEffectVisual(visual: EffectVisual, assets: RenderAssets): void {
  const kitGeometries = new Set(assets.kit.parts("giant").map((part) => part.geometry));
  const done = new Set<THREE.Material | THREE.BufferGeometry>();
  visual.group.traverse((node) => {
    if (node instanceof THREE.Sprite) {
      if (!done.has(node.material)) node.material.dispose();
      done.add(node.material);
      return;
    }
    if (!(node instanceof THREE.Mesh || node instanceof THREE.LineSegments) || kitGeometries.has(node.geometry)) return;
    for (const item of [node.geometry, node.material] as (THREE.Material | THREE.BufferGeometry)[]) {
      if (!done.has(item)) item.dispose();
      done.add(item);
    }
  });
  visual.group.clear();
}

export function createEffectSlot(initial: VisibleIncident, locator: EffectLocator, assets: RenderAssets): EffectSlot {
  const group = new THREE.Group();
  group.name = `incident:${initial.id}`;
  let signature = incidentSignature(initial);
  let visual = createEffectVisual(initial, locator, assets);
  group.add(visual.group);

  return {
    group,
    update(next: VisibleIncident, nextLocator: EffectLocator): void {
      const nextSignature = incidentSignature(next);
      if (nextSignature === signature) return;
      group.remove(visual.group);
      disposeEffectVisual(visual, assets);
      visual = createEffectVisual(next, nextLocator, assets);
      group.add(visual.group);
      signature = nextSignature;
    },
    animate(time: number): void {
      visual.animate(time);
    },
    dispose(): void {
      disposeEffectVisual(visual, assets);
      group.removeFromParent();
    },
  };
}
