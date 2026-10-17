import * as THREE from "three";
import type { Link } from "../../shared/types";

export interface LinkVisual {
  readonly mesh: THREE.Mesh<THREE.TubeGeometry, THREE.MeshBasicMaterial>;
  data: Link;
  update(link: Link): void;
  animate(time: number): void;
  dispose(): void;
}

const ARC_SEGMENTS = 24;
const CALM_RADIUS = 0.07;
const BROKEN_RADIUS = 0.12;
const CALM_COLOUR = 0x58dbea;

/**
 * A cable arcing from a tower to a covered district. Real geometry rather than
 * GL lines, because browsers draw every GL line one pixel wide.
 */
function createArcGeometry(link: Link): THREE.TubeGeometry {
  const dx = link.to.x - link.from.x;
  const dz = link.to.z - link.from.z;
  const height = Math.min(5.5, 1.25 + Math.hypot(dx, dz) * 0.16);
  const points: THREE.Vector3[] = [];
  for (let index = 0; index <= ARC_SEGMENTS; index += 1) {
    const t = index / ARC_SEGMENTS;
    points.push(new THREE.Vector3(link.from.x + dx * t, 0.95 + Math.sin(Math.PI * t) * height, link.from.z + dz * t));
  }
  const radius = link.broken ? BROKEN_RADIUS : CALM_RADIUS;
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), ARC_SEGMENTS * 2, radius, 6, false);
}

function linkSignature(link: Link): string {
  return `${link.from.x}:${link.from.z}:${link.to.x}:${link.to.z}:${link.broken}`;
}

export function createLinkVisual(initial: Link): LinkVisual {
  const material = new THREE.MeshBasicMaterial({ color: CALM_COLOUR, transparent: true, opacity: 0.75, depthWrite: false });
  const mesh = new THREE.Mesh(createArcGeometry(initial), material);
  mesh.name = `link:${initial.id}`;
  mesh.renderOrder = 6;
  let data = initial;
  let signature = linkSignature(initial);

  return {
    mesh,
    get data(): Link {
      return data;
    },
    set data(next: Link) {
      data = next;
    },
    update(next: Link): void {
      const nextSignature = linkSignature(next);
      if (nextSignature !== signature) {
        mesh.geometry.dispose();
        mesh.geometry = createArcGeometry(next);
        signature = nextSignature;
      }
      if (!next.broken) {
        material.color.setHex(CALM_COLOUR);
        material.opacity = 0.75;
      }
      data = next;
    },
    animate(time: number): void {
      if (!data.broken) return;
      const pulse = 0.62 + (Math.sin(time * 5.2) + 1) * 0.19;
      material.opacity = pulse;
      material.color.setRGB(1, 0.15 + pulse * 0.12, 0.24 + pulse * 0.12);
    },
    dispose(): void {
      mesh.geometry.dispose();
      material.dispose();
      mesh.removeFromParent();
    },
  };
}
