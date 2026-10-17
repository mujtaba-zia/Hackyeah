import * as THREE from "three";
import type { EffectKind, Incident, Vec2 } from "../../shared/types";
import type { RenderAssets } from "./assets";
import { hashString, seededRange } from "./hash";

export interface EffectLocator {
  district(id: string): Vec2 | null;
  tower(id: string): Vec2 | null;
  creature(id: string): Vec2 | null;
}

export interface EffectSlot {
  readonly group: THREE.Group;
  update(incident: Incident, locator: EffectLocator): void;
  animate(time: number): void;
  dispose(): void;
}

interface EffectBase {
  kind: EffectKind;
  group: THREE.Group;
}

interface FireEffect extends EffectBase {
  kind: "fire";
  flames: THREE.Mesh[];
  smoke: THREE.Sprite[];
  phase: number;
}

interface SmokeEffect extends EffectBase {
  kind: "smoke";
  puffs: THREE.Sprite[];
  phase: number;
}

interface CrowdEffect extends EffectBase {
  kind: "crowd";
  ring: THREE.Mesh;
  cluster: THREE.Mesh[];
  phase: number;
}

interface StormEffect extends EffectBase {
  kind: "storm";
  clouds: THREE.Mesh[];
  cloudHeights: Float32Array;
  rain: THREE.LineSegments[];
  phase: number;
}

interface BeaconEffect extends EffectBase {
  kind: "beacon";
  pillar: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>;
  light: THREE.PointLight;
  phase: number;
}

interface GiantEffect extends EffectBase {
  kind: "giant";
  body: THREE.Mesh;
  head: THREE.Mesh;
  phase: number;
}

type EffectVisual = FireEffect | SmokeEffect | CrowdEffect | StormEffect | BeaconEffect | GiantEffect;

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

function collectIncidentPositions(incident: Incident, locator: EffectLocator): Vec2[] {
  const positions: Vec2[] = [];
  for (let index = 0; index < incident.targets.districts.length; index += 1) {
    const position = locator.district(incident.targets.districts[index] ?? "");
    if (position) positions.push(position);
  }
  for (let index = 0; index < incident.targets.towers.length; index += 1) {
    const position = locator.tower(incident.targets.towers[index] ?? "");
    if (position) positions.push(position);
  }
  for (let index = 0; index < incident.targets.creatures.length; index += 1) {
    const position = locator.creature(incident.targets.creatures[index] ?? "");
    if (position) positions.push(position);
  }
  if (positions.length === 0) positions.push(incident.focus);
  return positions;
}

function createFireEffect(incident: Incident, locator: EffectLocator, assets: RenderAssets): FireEffect {
  const group = new THREE.Group();
  group.name = `effect:fire:${incident.id}`;
  const position = collectIncidentPositions(incident, locator)[0] ?? incident.focus;
  group.position.set(position.x, 0, position.z);
  const flames: THREE.Mesh[] = [];
  const smoke: THREE.Sprite[] = [];
  const seed = hashString(incident.id);
  for (let index = 0; index < 7; index += 1) {
    const flameMaterial = new THREE.MeshBasicMaterial({
      color: index % 2 === 0 ? 0xff6d2f : 0xffc454,
      transparent: true,
      opacity: 0.92,
    });
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.27, 0.95, 5), flameMaterial);
    const angle = seededRange(seed, index * 2, 0, Math.PI * 2);
    const radius = seededRange(seed, index * 2 + 1, 0.05, 0.7);
    flame.position.set(Math.cos(angle) * radius, 0.48, Math.sin(angle) * radius);
    flames.push(flame);
    group.add(flame);
  }
  for (let index = 0; index < 5; index += 1) {
    const material = new THREE.SpriteMaterial({
      map: assets.particleTexture,
      color: 0x485062,
      transparent: true,
      opacity: 0.56,
      depthWrite: false,
    });
    const puff = new THREE.Sprite(material);
    puff.position.set(seededRange(seed, 40 + index, -0.55, 0.55), 1.25 + index * 0.3, 0);
    puff.scale.set(0.75 + index * 0.1, 0.75 + index * 0.1, 1);
    smoke.push(puff);
    group.add(puff);
  }
  return { kind: "fire", group, flames, smoke, phase: seededRange(seed, 80, 0, Math.PI * 2) };
}

function createSmokeEffect(incident: Incident, locator: EffectLocator, assets: RenderAssets): SmokeEffect {
  const group = new THREE.Group();
  group.name = `effect:smoke:${incident.id}`;
  const position = collectIncidentPositions(incident, locator)[0] ?? incident.focus;
  group.position.set(position.x, 0, position.z);
  const puffs: THREE.Sprite[] = [];
  const seed = hashString(incident.id);
  for (let index = 0; index < 9; index += 1) {
    const material = new THREE.SpriteMaterial({
      map: assets.particleTexture,
      color: index % 2 === 0 ? 0x697284 : 0x87909e,
      transparent: true,
      opacity: 0.58,
      depthWrite: false,
    });
    const puff = new THREE.Sprite(material);
    const size = seededRange(seed, index * 3, 0.64, 1.15);
    puff.position.set(
      seededRange(seed, index * 3 + 1, -0.45, 0.45),
      0.75 + index * 0.32,
      seededRange(seed, index * 3 + 2, -0.45, 0.45),
    );
    puff.scale.set(size, size, 1);
    puffs.push(puff);
    group.add(puff);
  }
  return { kind: "smoke", group, puffs, phase: seededRange(seed, 88, 0, Math.PI * 2) };
}

function createCrowdEffect(incident: Incident, locator: EffectLocator): CrowdEffect {
  const group = new THREE.Group();
  group.name = `effect:crowd:${incident.id}`;
  const position = collectIncidentPositions(incident, locator)[0] ?? incident.focus;
  group.position.set(position.x, 0.1, position.z);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(2.3, 0.08, 6, 28),
    new THREE.MeshBasicMaterial({ color: 0xffcf68, transparent: true, opacity: 0.88 }),
  );
  ring.rotation.x = Math.PI * 0.5;
  const cluster: THREE.Mesh[] = [];
  const seed = hashString(incident.id);
  for (let index = 0; index < 15; index += 1) {
    const person = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.18, 0),
      new THREE.MeshStandardMaterial({ color: index % 2 === 0 ? 0xf2bf6a : 0x91c7d4, flatShading: true }),
    );
    const angle = seededRange(seed, index * 2, 0, Math.PI * 2);
    const radius = seededRange(seed, index * 2 + 1, 0.25, 1.4);
    person.position.set(Math.cos(angle) * radius, 0.24, Math.sin(angle) * radius);
    cluster.push(person);
    group.add(person);
  }
  group.add(ring);
  return { kind: "crowd", group, ring, cluster, phase: seededRange(seed, 99, 0, Math.PI * 2) };
}

function createRainGeometry(seed: number, offset: number): THREE.BufferGeometry {
  const drops = 18;
  const positions = new Float32Array(drops * 6);
  for (let index = 0; index < drops; index += 1) {
    const x = seededRange(seed, offset + index * 3, -2, 2);
    const z = seededRange(seed, offset + index * 3 + 1, -2, 2);
    const y = seededRange(seed, offset + index * 3 + 2, 0.9, 3.4);
    const position = index * 6;
    positions[position] = x;
    positions[position + 1] = y;
    positions[position + 2] = z;
    positions[position + 3] = x - 0.08;
    positions[position + 4] = y - 0.72;
    positions[position + 5] = z - 0.08;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  return geometry;
}

/**
 * The camera looks down from +x/+z, so anything above the plaza is drawn over
 * whatever stands behind it, and the HQ always stands behind the plaza. The
 * storm therefore hangs low over the plaza's front edge (towards the viewer):
 * on screen it lands in front of the HQ's doorstep instead of across its walls.
 * Clouds spread sideways (across the view) rather than in depth.
 */
const STORM_FORWARD = 4.4;
const STORM_HEIGHT = 3.3;

function createStormEffect(incident: Incident, locator: EffectLocator): StormEffect {
  const group = new THREE.Group();
  group.name = `effect:storm:${incident.id}`;
  const positions: Vec2[] = [];
  for (let index = 0; index < incident.targets.districts.length; index += 1) {
    const position = locator.district(incident.targets.districts[index] ?? "");
    if (position) positions.push(position);
  }
  if (positions.length === 0) positions.push(incident.focus);
  const seed = hashString(incident.id);
  const clouds: THREE.Mesh[] = [];
  const CLOUDS = 5;
  const cloudHeights = new Float32Array(positions.length * CLOUDS);
  const rain: THREE.LineSegments[] = [];

  for (let targetIndex = 0; targetIndex < positions.length; targetIndex += 1) {
    const position = positions[targetIndex];
    if (!position) continue;
    const tint = new THREE.Mesh(
      new THREE.CircleGeometry(3.8, 28),
      new THREE.MeshBasicMaterial({ color: 0xcc3646, transparent: true, opacity: 0.2, depthWrite: false }),
    );
    tint.rotation.x = -Math.PI * 0.5;
    tint.position.set(position.x, 0.06, position.z);
    group.add(tint);
    for (let cloudIndex = 0; cloudIndex < CLOUDS; cloudIndex += 1) {
      const cloud = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.9, 0),
        new THREE.MeshStandardMaterial({ color: 0x3a4256, flatShading: true, roughness: 1, transparent: true, opacity: 0.86 }),
      );
      const combinedIndex = targetIndex * CLOUDS + cloudIndex;
      // `across` runs left-right on screen, `depth` towards/away from the camera.
      const across = (cloudIndex - (CLOUDS - 1) / 2) * 0.95 + seededRange(seed, combinedIndex * 3, -0.2, 0.2);
      const depth = seededRange(seed, combinedIndex * 3 + 1, -0.35, 0.35);
      const y = STORM_HEIGHT + seededRange(seed, combinedIndex * 3 + 2, 0, 0.45);
      cloud.position.set(
        position.x + STORM_FORWARD + depth + across,
        y,
        position.z + STORM_FORWARD + depth - across,
      );
      cloud.scale.set(1.3, 0.7, 1.0);
      clouds.push(cloud);
      cloudHeights[combinedIndex] = y;
      group.add(cloud);
    }
    const rainMaterial = new THREE.LineBasicMaterial({ color: 0x7bcaff, transparent: true, opacity: 0.74 });
    const rainLines = new THREE.LineSegments(createRainGeometry(seed, 200 + targetIndex * 60), rainMaterial);
    rainLines.position.set(position.x + STORM_FORWARD, 0, position.z + STORM_FORWARD);
    rain.push(rainLines);
    group.add(rainLines);
  }
  return { kind: "storm", group, clouds, cloudHeights, rain, phase: seededRange(seed, 300, 0, Math.PI * 2) };
}

function createBeaconEffect(incident: Incident, locator: EffectLocator): BeaconEffect {
  const group = new THREE.Group();
  group.name = `effect:beacon:${incident.id}`;
  const position = collectIncidentPositions(incident, locator)[0] ?? incident.focus;
  group.position.set(position.x, 0, position.z);
  const material = new THREE.MeshBasicMaterial({ color: 0xffd25f, transparent: true, opacity: 0.42, depthWrite: false });
  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.86, 6.4, 12, 1, true), material);
  const light = new THREE.PointLight(0xffd25f, 1.3, 11, 2);
  pillar.position.y = 3.2;
  light.position.y = 4.5;
  group.add(pillar, light);
  return { kind: "beacon", group, pillar, light, phase: seededRange(hashString(incident.id), 7, 0, Math.PI * 2) };
}

/** A horned stone colossus standing on the first burning district, towering over the rest. */
function createGiantEffect(incident: Incident, locator: EffectLocator): GiantEffect {
  const group = new THREE.Group();
  group.name = `effect:giant:${incident.id}`;
  const firstDistrict = incident.targets.districts[0];
  const anchor = (firstDistrict ? locator.district(firstDistrict) : null) ?? incident.focus;
  // Stand just behind the HQ so the giant reads as looming over the district.
  group.position.set(anchor.x - 2.2, 0, anchor.z - 2.2);
  group.rotation.y = Math.PI / 4;
  group.scale.setScalar(1.35);

  const skin = new THREE.MeshStandardMaterial({ color: 0x704766, flatShading: true, roughness: 0.85 });
  const skinLight = new THREE.MeshStandardMaterial({ color: 0x8e5a7d, flatShading: true, roughness: 0.85 });
  const hornMaterial = new THREE.MeshStandardMaterial({ color: 0x40354d, flatShading: true });
  const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0xffd666 });

  const body = new THREE.Mesh(new THREE.DodecahedronGeometry(1.8, 0), skin);
  body.position.y = 4.1;
  body.scale.set(1.35, 1.55, 1.05);
  const head = new THREE.Mesh(new THREE.DodecahedronGeometry(1.1, 0), skinLight);
  head.position.set(0, 7, 0.2);
  group.add(body, head);

  const legGeometry = new THREE.CylinderGeometry(0.55, 0.7, 2.6, 6);
  const armGeometry = new THREE.CylinderGeometry(0.38, 0.5, 3, 6);
  const hornGeometry = new THREE.ConeGeometry(0.34, 1.2, 5);
  const eyeGeometry = new THREE.SphereGeometry(0.2, 8, 6);
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(legGeometry, skin);
    leg.position.set(side * 0.95, 1.3, 0);
    const arm = new THREE.Mesh(armGeometry, skinLight);
    arm.position.set(side * 2.6, 4.2, 0.3);
    arm.rotation.z = side * 0.5;
    const horn = new THREE.Mesh(hornGeometry, hornMaterial);
    horn.position.set(side * 0.72, 8.05, 0);
    horn.rotation.z = -side * 0.38;
    const eye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    eye.position.set(side * 0.38, 7.12, 1.02);
    group.add(leg, arm, horn, eye);
  }
  return { kind: "giant", group, body, head, phase: seededRange(hashString(incident.id), 9, 0, Math.PI * 2) };
}

function createEffectVisual(incident: Incident, locator: EffectLocator, assets: RenderAssets): EffectVisual {
  if (incident.effect === "fire") return createFireEffect(incident, locator, assets);
  if (incident.effect === "smoke") return createSmokeEffect(incident, locator, assets);
  if (incident.effect === "crowd") return createCrowdEffect(incident, locator);
  if (incident.effect === "storm") return createStormEffect(incident, locator);
  if (incident.effect === "beacon") return createBeaconEffect(incident, locator);
  return createGiantEffect(incident, locator);
}

function updateEffectVisual(visual: EffectVisual, time: number): void {
  if (visual.kind === "fire") {
    for (let index = 0; index < visual.flames.length; index += 1) {
      const flame = visual.flames[index];
      if (!flame) continue;
      const pulse = 0.78 + Math.sin(time * 8 + visual.phase + index) * 0.2;
      flame.scale.set(pulse, 0.75 + pulse * 0.42, pulse);
      flame.position.y = 0.42 + Math.sin(time * 6 + index) * 0.13;
    }
    for (let index = 0; index < visual.smoke.length; index += 1) {
      const puff = visual.smoke[index];
      if (!puff) continue;
      puff.position.y = 1.2 + index * 0.31 + ((time * 0.38 + index * 0.17) % 1) * 0.7;
      puff.material.opacity = 0.48 - index * 0.045;
    }
    return;
  }
  if (visual.kind === "smoke") {
    for (let index = 0; index < visual.puffs.length; index += 1) {
      const puff = visual.puffs[index];
      if (!puff) continue;
      puff.position.y = 0.7 + index * 0.28 + ((time * 0.32 + index * 0.13) % 1) * 0.8;
      const scale = 0.7 + index * 0.08 + Math.sin(time + index) * 0.06;
      puff.scale.set(scale, scale, 1);
    }
    return;
  }
  if (visual.kind === "crowd") {
    const pulse = 0.94 + Math.sin(time * 2.6 + visual.phase) * 0.07;
    visual.ring.scale.set(pulse, pulse, pulse);
    visual.ring.rotation.z = time * 0.18;
    for (let index = 0; index < visual.cluster.length; index += 1) {
      const person = visual.cluster[index];
      if (person) person.position.y = 0.24 + Math.sin(time * 3 + index) * 0.055;
    }
    return;
  }
  if (visual.kind === "storm") {
    for (let index = 0; index < visual.clouds.length; index += 1) {
      const cloud = visual.clouds[index];
      const baseY = visual.cloudHeights[index];
      if (cloud && baseY !== undefined) cloud.position.y = baseY + Math.sin(time + index) * 0.13;
    }
    for (let index = 0; index < visual.rain.length; index += 1) {
      const rain = visual.rain[index];
      if (rain) rain.position.y = -((time * 3.2 + index * 0.2) % 0.82);
    }
    return;
  }
  if (visual.kind === "beacon") {
    const intensity = 0.42 + (Math.sin(time * 3 + visual.phase) + 1) * 0.16;
    visual.pillar.material.opacity = intensity;
    visual.light.intensity = 0.9 + intensity;
    return;
  }
  visual.body.rotation.y = Math.sin(time * 0.5 + visual.phase) * 0.16;
  visual.head.position.y = 7 + Math.sin(time * 1.4 + visual.phase) * 0.16;
}

function disposeEffectMaterial(material: THREE.Material | THREE.Material[], disposed: Set<THREE.Material>): void {
  if (Array.isArray(material)) {
    for (let index = 0; index < material.length; index += 1) {
      const candidate = material[index];
      if (candidate && !disposed.has(candidate)) {
        candidate.dispose();
        disposed.add(candidate);
      }
    }
    return;
  }
  if (!disposed.has(material)) {
    material.dispose();
    disposed.add(material);
  }
}

function disposeEffectVisual(visual: EffectVisual): void {
  const disposedMaterials = new Set<THREE.Material>();
  visual.group.traverse((node) => {
    if (node instanceof THREE.Mesh || node instanceof THREE.Line || node instanceof THREE.LineSegments) {
      node.geometry.dispose();
      disposeEffectMaterial(node.material, disposedMaterials);
    }
    if (node instanceof THREE.Sprite) disposeEffectMaterial(node.material, disposedMaterials);
  });
  visual.group.clear();
}

export function createEffectSlot(initial: Incident, locator: EffectLocator, assets: RenderAssets): EffectSlot {
  const group = new THREE.Group();
  group.name = `incident:${initial.id}`;
  let signature = incidentSignature(initial);
  let visual = createEffectVisual(initial, locator, assets);
  group.add(visual.group);

  return {
    group,
    update(next: Incident, nextLocator: EffectLocator): void {
      const nextSignature = incidentSignature(next);
      if (nextSignature === signature) return;
      group.remove(visual.group);
      disposeEffectVisual(visual);
      visual = createEffectVisual(next, nextLocator, assets);
      group.add(visual.group);
      signature = nextSignature;
    },
    animate(time: number): void {
      updateEffectVisual(visual, time);
    },
    dispose(): void {
      disposeEffectVisual(visual);
      group.removeFromParent();
    },
  };
}
