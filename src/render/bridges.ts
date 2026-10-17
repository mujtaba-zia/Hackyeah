import * as THREE from "three";
import type { Bridge } from "../../shared/types";
import type { RenderAssets } from "./assets";

export interface BridgeVisual {
  readonly group: THREE.Group;
  update(bridge: Bridge): void;
  dispose(): void;
}

function bridgeSignature(bridge: Bridge): string {
  return `${bridge.from.x}:${bridge.from.z}:${bridge.to.x}:${bridge.to.z}`;
}

function createBridgeContent(bridge: Bridge, assets: RenderAssets): { group: THREE.Group; ropeGeometry: THREE.BufferGeometry } {
  const group = new THREE.Group();
  const dx = bridge.to.x - bridge.from.x;
  const dz = bridge.to.z - bridge.from.z;
  const length = Math.max(0.1, Math.hypot(dx, dz));
  const plankCount = Math.max(2, Math.ceil(length / 0.72));
  group.position.set((bridge.from.x + bridge.to.x) / 2, 0.15, (bridge.from.z + bridge.to.z) / 2);
  group.rotation.y = Math.atan2(-dz, dx);

  for (let index = 0; index < plankCount; index += 1) {
    const plank = new THREE.Mesh(assets.bridgePlankGeometry, assets.bridgeMaterial);
    plank.position.x = -length / 2 + ((index + 0.5) / plankCount) * length;
    plank.rotation.y = index % 2 === 0 ? 0.02 : -0.02;
    group.add(plank);
  }

  const leftPost = new THREE.Mesh(assets.bridgePostGeometry, assets.bridgeMaterial);
  const rightPost = new THREE.Mesh(assets.bridgePostGeometry, assets.bridgeMaterial);
  leftPost.position.set(-length / 2 + 0.2, 0.35, 0);
  rightPost.position.set(length / 2 - 0.2, 0.35, 0);
  group.add(leftPost, rightPost);

  const ropeGeometry = new THREE.BufferGeometry();
  ropeGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      [-length / 2 + 0.2, 0.68, -0.31, 0, 0.42, -0.31, length / 2 - 0.2, 0.68, -0.31],
      3,
    ),
  );
  const backRopeGeometry = ropeGeometry.clone();
  const frontRope = new THREE.Line(ropeGeometry, assets.bridgeRopeMaterial);
  const backRope = new THREE.Line(backRopeGeometry, assets.bridgeRopeMaterial);
  backRope.position.z = 0.62;
  group.add(frontRope, backRope);
  // Both lines need their own geometry because the group owns their lifetime.
  return { group, ropeGeometry: backRopeGeometry };
}

export function createBridgeVisual(initial: Bridge, assets: RenderAssets): BridgeVisual {
  const group = new THREE.Group();
  group.name = `bridge:${initial.id}`;
  let signature = bridgeSignature(initial);
  let content = createBridgeContent(initial, assets);
  group.add(content.group);

  return {
    group,
    update(next: Bridge): void {
      const nextSignature = bridgeSignature(next);
      if (nextSignature === signature) return;
      group.remove(content.group);
      content.ropeGeometry.dispose();
      const frontRope = content.group.children[content.group.children.length - 2];
      if (frontRope instanceof THREE.Line) frontRope.geometry.dispose();
      content = createBridgeContent(next, assets);
      group.add(content.group);
      signature = nextSignature;
    },
    dispose(): void {
      content.ropeGeometry.dispose();
      const frontRope = content.group.children[content.group.children.length - 2];
      if (frontRope instanceof THREE.Line) frontRope.geometry.dispose();
      group.removeFromParent();
    },
  };
}
