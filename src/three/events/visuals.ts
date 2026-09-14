import * as THREE from 'three';
import { characterMaterials, emissiveMaterials, vehicleMaterials } from '../core/materials';

/**
 * A small owned geometry kit keeps temporary event props cheap and disposable.
 * Materials come from the shared palette, so the kit only releases geometry and
 * any material clone explicitly handed to it.
 */
export class EventVisuals {
  readonly root = new THREE.Group();

  private readonly geometries: THREE.BufferGeometry[];
  private readonly ownedMaterials: THREE.Material[] = [];
  private disposed = false;

  private readonly boxGeometry = new THREE.BoxGeometry(1, 1, 1);
  private readonly headGeometry = new THREE.SphereGeometry(1, 10, 8);
  private readonly bodyGeometry = new THREE.CylinderGeometry(0.76, 1, 1, 8);
  private readonly wheelGeometry = new THREE.CylinderGeometry(1, 1, 0.34, 10);
  private readonly coneGeometry = new THREE.ConeGeometry(1, 1, 10);
  private readonly tornadoGeometry = new THREE.CylinderGeometry(1, 0.12, 1, 16, 1, true);
  private readonly meteorGeometry = new THREE.IcosahedronGeometry(1, 1);
  private readonly craterGeometry = new THREE.TorusGeometry(1, 0.23, 8, 24);
  private readonly rainbowGeometry = new THREE.TorusGeometry(1, 0.06, 6, 28, Math.PI);

  constructor() {
    this.geometries = [
      this.boxGeometry,
      this.headGeometry,
      this.bodyGeometry,
      this.wheelGeometry,
      this.coneGeometry,
      this.tornadoGeometry,
      this.meteorGeometry,
      this.craterGeometry,
      this.rainbowGeometry,
    ];
  }

  /** Register a cloned material with the event root that owns it. */
  ownMaterial<T extends THREE.Material>(material: T): T {
    this.ownedMaterials.push(material);
    return material;
  }

  person(bodyMaterial: THREE.Material): THREE.Group {
    const person = new THREE.Group();
    const body = new THREE.Mesh(this.bodyGeometry, bodyMaterial);
    body.position.y = 0.52;
    body.scale.set(0.24, 0.62, 0.2);
    const head = new THREE.Mesh(this.headGeometry, characterMaterials.skin);
    head.position.y = 1.22;
    head.scale.setScalar(0.22);
    person.add(body, head);
    return person;
  }

  bug(): THREE.Group {
    const bug = new THREE.Group();
    const body = new THREE.Mesh(this.headGeometry, characterMaterials.angry);
    body.position.y = 0.18;
    body.scale.set(0.28, 0.16, 0.38);
    bug.add(body);
    for (let index = 0; index < 3; index += 1) {
      const leftLeg = new THREE.Mesh(this.bodyGeometry, characterMaterials.angry);
      leftLeg.position.set(-0.24, 0.12, (index - 1) * 0.18);
      leftLeg.rotation.z = Math.PI * 0.36;
      leftLeg.scale.set(0.035, 0.22, 0.035);
      const rightLeg = new THREE.Mesh(this.bodyGeometry, characterMaterials.angry);
      rightLeg.position.set(0.24, 0.12, (index - 1) * 0.18);
      rightLeg.rotation.z = -Math.PI * 0.36;
      rightLeg.scale.set(0.035, 0.22, 0.035);
      bug.add(leftLeg, rightLeg);
    }
    return bug;
  }

  placard(boardMaterial: THREE.Material): THREE.Group {
    const sign = new THREE.Group();
    const pole = new THREE.Mesh(this.bodyGeometry, vehicleMaterials.crate);
    pole.position.y = 0.54;
    pole.scale.set(0.045, 0.62, 0.045);
    const board = new THREE.Mesh(this.boxGeometry, boardMaterial);
    board.position.y = 1.1;
    board.scale.set(0.62, 0.38, 0.06);
    sign.add(pole, board);
    return sign;
  }

  car(material: THREE.Material): THREE.Group {
    const car = new THREE.Group();
    const body = new THREE.Mesh(this.boxGeometry, material);
    body.position.y = 0.3;
    body.scale.set(1.15, 0.38, 0.54);
    const cabin = new THREE.Mesh(this.boxGeometry, material);
    cabin.position.set(-0.12, 0.64, 0);
    cabin.scale.set(0.54, 0.32, 0.43);
    car.add(body, cabin);
    for (const x of [-0.62, 0.62]) {
      for (const z of [-0.34, 0.34]) {
        const wheel = new THREE.Mesh(this.wheelGeometry, vehicleMaterials.crate);
        wheel.position.set(x, 0.16, z);
        wheel.rotation.z = Math.PI / 2;
        wheel.scale.set(0.17, 0.17, 0.17);
        car.add(wheel);
      }
    }
    return car;
  }

  fireTruck(): THREE.Group {
    const truck = this.car(vehicleMaterials.red);
    const ladder = new THREE.Mesh(this.boxGeometry, emissiveMaterials.warning);
    ladder.position.set(0.12, 0.9, 0);
    ladder.rotation.z = -0.16;
    ladder.scale.set(1.05, 0.06, 0.15);
    truck.add(ladder);
    return truck;
  }

  paradeFloat(): THREE.Group {
    const float = new THREE.Group();
    const base = new THREE.Mesh(this.boxGeometry, vehicleMaterials.yellow);
    base.position.y = 0.35;
    base.scale.set(1.45, 0.44, 0.8);
    const crate = new THREE.Mesh(this.boxGeometry, emissiveMaterials.crate);
    crate.position.y = 0.95;
    crate.scale.set(0.66, 0.65, 0.62);
    float.add(base, crate);
    return float;
  }

  ufo(): THREE.Group {
    const saucer = new THREE.Group();
    const disc = new THREE.Mesh(this.bodyGeometry, emissiveMaterials.beam);
    disc.scale.set(1.6, 0.2, 1.6);
    const dome = new THREE.Mesh(this.headGeometry, emissiveMaterials.firework);
    dome.position.y = 0.22;
    dome.scale.set(0.58, 0.3, 0.58);
    saucer.add(disc, dome);
    for (let index = 0; index < 5; index += 1) {
      const light = new THREE.Mesh(this.headGeometry, emissiveMaterials.warning);
      const angle = (index / 5) * Math.PI * 2;
      light.position.set(Math.cos(angle) * 1.05, -0.1, Math.sin(angle) * 1.05);
      light.scale.setScalar(0.1);
      saucer.add(light);
    }
    return saucer;
  }

  tornado(material: THREE.Material): THREE.Mesh<THREE.CylinderGeometry, THREE.Material> {
    const funnel = new THREE.Mesh(this.tornadoGeometry, material);
    funnel.scale.set(4.2, 11, 4.2);
    funnel.position.y = 5.5;
    return funnel;
  }

  meteor(): THREE.Mesh<THREE.IcosahedronGeometry, THREE.Material> {
    return new THREE.Mesh(this.meteorGeometry, vehicleMaterials.orange);
  }

  crater(): THREE.Mesh<THREE.TorusGeometry, THREE.Material> {
    const crater = new THREE.Mesh(this.craterGeometry, vehicleMaterials.crate);
    crater.rotation.x = -Math.PI / 2;
    crater.scale.set(2.4, 2.4, 2.4);
    return crater;
  }

  trafficCone(): THREE.Group {
    const cone = new THREE.Group();
    const body = new THREE.Mesh(this.coneGeometry, vehicleMaterials.orange);
    body.position.y = 0.38;
    body.scale.set(0.22, 0.76, 0.22);
    const base = new THREE.Mesh(this.boxGeometry, vehicleMaterials.yellow);
    base.position.y = 0.05;
    base.scale.set(0.42, 0.08, 0.42);
    cone.add(body, base);
    return cone;
  }

  scaffold(): THREE.Group {
    const scaffold = new THREE.Group();
    for (const x of [-0.9, 0.9]) {
      for (const z of [-0.6, 0.6]) {
        const strut = new THREE.Mesh(this.boxGeometry, vehicleMaterials.yellow);
        strut.position.set(x, 1.6, z);
        strut.scale.set(0.08, 3.2, 0.08);
        scaffold.add(strut);
      }
    }
    for (const y of [0.8, 1.8, 2.8]) {
      const crossbar = new THREE.Mesh(this.boxGeometry, vehicleMaterials.yellow);
      crossbar.position.set(0, y, -0.62);
      crossbar.scale.set(1.9, 0.06, 0.07);
      const rearCrossbar = crossbar.clone();
      rearCrossbar.position.z = 0.62;
      scaffold.add(crossbar, rearCrossbar);
    }
    return scaffold;
  }

  rainbow(materials: readonly THREE.Material[]): THREE.Group {
    const rainbow = new THREE.Group();
    for (let index = 0; index < materials.length; index += 1) {
      const band = new THREE.Mesh(this.rainbowGeometry, materials[index]);
      const radius = 4.6 - index * 0.24;
      band.scale.set(radius, radius, radius);
      rainbow.add(band);
    }
    return rainbow;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.ownedMaterials) material.dispose();
    this.root.removeFromParent();
  }
}
