import * as THREE from 'three';

const sharedMaterials: THREE.Material[] = [];
let materialsDisposed = false;

function sharedLambert(
  parameters: THREE.MeshLambertMaterialParameters,
): THREE.MeshLambertMaterial {
  const material = new THREE.MeshLambertMaterial({ flatShading: true, ...parameters });
  sharedMaterials.push(material);
  return material;
}

function sharedBasic(parameters: THREE.MeshBasicMaterialParameters): THREE.MeshBasicMaterial {
  const material = new THREE.MeshBasicMaterial(parameters);
  sharedMaterials.push(material);
  return material;
}

function sharedPoints(parameters: THREE.PointsMaterialParameters): THREE.PointsMaterial {
  const material = new THREE.PointsMaterial(parameters);
  sharedMaterials.push(material);
  return material;
}

/** Broad, matte colours keep the two cities legible from the high camera. */
export const groundMaterial = sharedLambert({ color: 0x91c96f });
export const waterMaterial = sharedLambert({
  color: 0x55bfe8,
  transparent: true,
  opacity: 0.82,
  depthWrite: false,
});
export const roadMaterial = sharedLambert({ color: 0x64748b });
export const roadLineMaterial = sharedBasic({ color: 0xf8fafc });
export const parkMaterial = sharedLambert({ color: 0x69b868 });
export const bridgeMaterial = sharedLambert({ color: 0x8f9cab });

/** Ordered tones let instanced ordinary blocks share one material per draw call. */
export const buildingMaterials = [
  sharedLambert({ color: 0xf4b183 }),
  sharedLambert({ color: 0xf6d365 }),
  sharedLambert({ color: 0x8ed1c2 }),
  sharedLambert({ color: 0x8fc7e8 }),
  sharedLambert({ color: 0xb6a5e8 }),
  sharedLambert({ color: 0xe8a4b8 }),
] as const;

/** Selects the reusable block material without creating one for an authored tone. */
export function buildingMaterialForTone(tone: number): THREE.MeshLambertMaterial {
  if (!Number.isFinite(tone)) return buildingMaterials[0];
  const index = Math.abs(Math.trunc(tone)) % buildingMaterials.length;
  return buildingMaterials[index];
}

/** Pipeline landmarks use strong accents so their purpose reads at a glance. */
export const landmarkMaterials = {
  build: sharedLambert({ color: 0xf28c4b }),
  test: sharedLambert({ color: 0x65bd7d }),
  security: sharedLambert({ color: 0x9074d4 }),
  package: sharedLambert({ color: 0xe4bd4f }),
  port: sharedLambert({ color: 0x4e9ed6 }),
  review: sharedLambert({ color: 0xdb6f9d }),
  merge: sharedLambert({ color: 0x4eb6a1 }),
} as const;

export const glassMaterial = sharedLambert({
  color: 0x9ce2f2,
  transparent: true,
  opacity: 0.62,
  depthWrite: false,
});

/** Traffic uses this stable, compact palette instead of allocating per vehicle. */
export const vehicleMaterials = {
  blue: sharedLambert({ color: 0x4d9de0 }),
  yellow: sharedLambert({ color: 0xf7c948 }),
  orange: sharedLambert({ color: 0xf28c4b }),
  red: sharedLambert({ color: 0xe76f51 }),
  truck: sharedLambert({ color: 0x3876b6 }),
  crate: sharedLambert({ color: 0xb97843 }),
} as const;

/** People retain readable repo and mood colours at city scale. */
export const characterMaterials = {
  skin: sharedLambert({ color: 0xf3c7a6 }),
  geo: sharedLambert({ color: 0x4d9de0 }),
  b3d: sharedLambert({ color: 0xa785e8 }),
  api: sharedLambert({ color: 0x4eb6a1 }),
  web: sharedLambert({ color: 0xdb6f9d }),
  data: sharedLambert({ color: 0xf28c4b }),
  infra: sharedLambert({ color: 0x9074d4 }),
  happy: sharedLambert({ color: 0x65bd7d }),
  calm: sharedLambert({ color: 0x4d9de0 }),
  watching: sharedLambert({ color: 0xf7c948 }),
  pacing: sharedLambert({ color: 0xf28c4b }),
  annoyed: sharedLambert({ color: 0xdb6f9d }),
  angry: sharedLambert({ color: 0xe76f51 }),
} as const;

/** Basic materials stay bright without adding a second light source for small glows. */
export const emissiveMaterials = {
  worker: sharedBasic({ color: 0xffdc72 }),
  crate: sharedBasic({ color: 0xffd166 }),
  fire: sharedBasic({ color: 0xff8b3d, transparent: true, opacity: 0.92, depthWrite: false }),
  beam: sharedBasic({ color: 0x8be9fd, transparent: true, opacity: 0.78, depthWrite: false }),
  firework: sharedBasic({ color: 0xff79c6 }),
  merge: sharedBasic({ color: 0x7ce4cf }),
  warning: sharedBasic({ color: 0xffd166, transparent: true, opacity: 0.86, depthWrite: false }),
} as const;

/** Shared effect shaders avoid a material allocation for every spectacle. */
export const fxMaterials = {
  cloud: sharedLambert({ color: 0xf7fbff, transparent: true, opacity: 0.88, depthWrite: false }),
  smoke: sharedPoints({ color: 0x73808c, size: 1.8, transparent: true, opacity: 0.58, depthWrite: false }),
  fire: sharedBasic({ color: 0xff8b3d, transparent: true, opacity: 0.88, depthWrite: false }),
  spark: sharedPoints({ color: 0xffd166, size: 0.3, transparent: true, opacity: 0.95, depthWrite: false }),
  dust: sharedBasic({ color: 0xc9aa84, transparent: true, opacity: 0.62, depthWrite: false }),
  debris: sharedLambert({ color: 0x8f9cab }),
  beam: sharedBasic({ color: 0x8be9fd, transparent: true, opacity: 0.72, depthWrite: false }),
  warning: sharedBasic({ color: 0xffd166, transparent: true, opacity: 0.8, depthWrite: false }),
  wind: sharedPoints({ color: 0xe6f7ff, size: 0.44, transparent: true, opacity: 0.64, depthWrite: false }),
  rain: sharedPoints({ color: 0x85c6f4, size: 0.16, transparent: true, opacity: 0.78, depthWrite: false }),
  confetti: sharedBasic({ color: 0xffffff, vertexColors: true, transparent: true, opacity: 0.96, depthWrite: false }),
  particle: sharedPoints({ size: 0.35, vertexColors: true, transparent: true, opacity: 0.96, depthWrite: false }),
  overlay: sharedBasic({ color: 0xffffff, transparent: true, opacity: 0.45, depthWrite: false }),
} as const;

/** Releases this module's singleton materials after every mesh using them is gone. */
export function disposeMaterials(): void {
  if (materialsDisposed) return;
  materialsDisposed = true;
  for (const material of sharedMaterials) material.dispose();
}
