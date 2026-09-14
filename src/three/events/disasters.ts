import * as THREE from 'three';
import type { Vec3 } from '../../domain/ids';
import { characterMaterials, emissiveMaterials, fxMaterials, vehicleMaterials } from '../core/materials';
import { VisualEventController } from './controllerBase';
import type { EventVisuals } from './visuals';
import type { EventController, EventStageContext } from './types';

/** Tornado: a full funnel crosses the city and lifts short-lived debris bursts. */
export class TornadoController extends VisualEventController implements EventController {
  start(ctx: EventStageContext): void {
    const visuals = this.begin(ctx);
    const funnelMaterial = visuals.ownMaterial(fxMaterials.cloud.clone());
    funnelMaterial.opacity = 0.74;
    const funnel = visuals.tornado(funnelMaterial);
    visuals.root.add(funnel);
    visuals.root.position.set(ctx.focus.x - 30, ctx.focus.y, ctx.focus.z - 18);
    this.hold(ctx.fx.wind());

    let travel = 0;
    this.frame((dtSeconds) => {
      travel = (travel + dtSeconds / 17) % 1;
      visuals.root.position.x = ctx.focus.x - 30 + travel * 58;
      visuals.root.position.z = ctx.focus.z - 18 + travel * 34;
      funnel.rotation.y += dtSeconds * 3;
      funnel.rotation.z = Math.sin(travel * Math.PI * 8) * 0.08;
    });
    this.debrisBurst(visuals.root.position);
    this.later(2_000, () => this.shakeLoop());
    ctx.damp('tornado', 0.4);
  }

  private debrisBurst(position: THREE.Vector3): void {
    if (!this.running) return;
    const at = { x: position.x, y: position.y + 0.2, z: position.z };
    const burst = this.hold(this.ctx.fx.debris(at, 3.4));
    this.ctx.fx.dust(at);
    this.later(1_500, () => this.releaseHandle(burst));
    this.later(1_800, () => this.debrisBurst(position));
  }

  private shakeLoop(): void {
    if (!this.running) return;
    this.ctx.fx.shake(0.05, 500);
    this.later(3_000, () => this.shakeLoop());
  }

  stop(): void {
    if (this.running) this.ctx.damp('tornado', null);
    super.stop();
  }
}

/** UFO: a saucer arrives, beams up a visual stand-in, then returns it safely. */
export class UfoController extends VisualEventController implements EventController {
  start(ctx: EventStageContext): void {
    const visuals = this.begin(ctx);
    const ufo = visuals.ufo();
    ufo.position.set(ctx.focus.x - 36, ctx.focus.y + 14, ctx.focus.z - 16);
    visuals.root.add(ufo);

    const shadowGeometry = new THREE.CircleGeometry(1, 20);
    const shadow = new THREE.Mesh(shadowGeometry, fxMaterials.dust);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(ctx.focus.x - 36, ctx.focus.y + 0.04, ctx.focus.z - 16);
    shadow.scale.set(2.2, 1.1, 1);
    ctx.scene.add(shadow);
    this.track(shadow, () => shadowGeometry.dispose());

    let flight = 0;
    let abducted = false;
    this.frame((dtSeconds) => {
      flight = Math.min(1, flight + dtSeconds / 5);
      const eased = flight * flight * (3 - 2 * flight);
      ufo.position.x = ctx.focus.x - 36 + eased * 36;
      ufo.position.z = ctx.focus.z - 16 + eased * 16;
      ufo.position.y = ctx.focus.y + 14 + Math.sin(flight * Math.PI * 7) * 0.8;
      ufo.rotation.y += dtSeconds * 0.7;
      shadow.position.x = ufo.position.x;
      shadow.position.z = ufo.position.z;
      shadow.scale.x = 1.1 + (ufo.position.y - ctx.focus.y) * 0.11;
      shadow.scale.y = shadow.scale.x * 0.45;
      if (!abducted && flight >= 1) {
        abducted = true;
        this.abduct(visuals, ufo.position, ctx.focus);
      }
    });
  }

  private abduct(visuals: EventVisuals, source: THREE.Vector3, target: Vec3): void {
    if (!this.running) return;
    const beam = this.hold(this.ctx.fx.beam(
      { x: source.x, y: source.y - 0.5, z: source.z },
      { x: target.x, y: target.y, z: target.z },
    ));
    const decoy = visuals.person(characterMaterials.angry);
    decoy.position.set(target.x, target.y, target.z);
    visuals.root.add(decoy);
    const thought = visuals.placard(emissiveMaterials.warning);
    thought.position.set(target.x + 1.1, target.y, target.z);
    thought.scale.setScalar(0.5);
    visuals.root.add(thought);

    let cycle = 0;
    this.frame((dtSeconds) => {
      cycle = (cycle + dtSeconds) % 7.2;
      let lift = 0;
      if (cycle < 2.8) {
        lift = cycle * 1.3;
      } else if (cycle > 4.4) {
        lift = (7.2 - cycle) * 1.3;
      } else {
        lift = 3.64;
      }
      decoy.position.y = target.y + lift;
      thought.position.y = target.y + lift;
      thought.rotation.z = Math.sin(cycle * 5) * 0.1;
    });
    this.later(8_000, () => this.releaseHandle(beam));
  }
}

/** Meteor: a falling rock, growing shadow and crater leave a visible but temporary impact. */
export class MeteorController extends VisualEventController implements EventController {
  start(ctx: EventStageContext): void {
    const visuals = this.begin(ctx);
    const meteor = visuals.meteor();
    meteor.position.set(ctx.focus.x - 22, ctx.focus.y + 30, ctx.focus.z - 19);
    meteor.scale.setScalar(0.75);
    visuals.root.add(meteor);

    const shadowGeometry = new THREE.CircleGeometry(1, 20);
    const shadow = new THREE.Mesh(shadowGeometry, fxMaterials.dust);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(ctx.focus.x, ctx.focus.y + 0.03, ctx.focus.z);
    shadow.scale.set(0.45, 0.28, 1);
    ctx.scene.add(shadow);
    this.track(shadow, () => shadowGeometry.dispose());

    let elapsed = 0;
    this.frame((dtSeconds) => {
      elapsed += dtSeconds;
      const progress = Math.min(1, elapsed / 2.6);
      const fall = progress * progress;
      meteor.position.x = ctx.focus.x - 22 * (1 - fall);
      meteor.position.y = ctx.focus.y + 30 * (1 - fall);
      meteor.position.z = ctx.focus.z - 19 * (1 - fall);
      meteor.rotation.x += dtSeconds * 6;
      meteor.rotation.z += dtSeconds * 4;
      meteor.scale.setScalar(0.75 + fall * 0.7);
      shadow.scale.set(0.45 + fall * 3.2, 0.28 + fall * 1.7, 1);
      if (progress < 1) return;

      meteor.removeFromParent();
      shadow.removeFromParent();
      this.impact(visuals, ctx.focus);
      return false;
    });
  }

  private impact(visuals: EventVisuals, at: Vec3): void {
    if (!this.running) return;
    this.ctx.fx.explosion(at);
    this.ctx.fx.flash(0xffd9a0, 220);
    const crater = visuals.crater();
    crater.position.set(at.x, at.y + 0.05, at.z);
    visuals.root.add(crater);
    this.later(1_200, () => {
      const worker = visuals.person(characterMaterials.happy);
      worker.position.set(at.x - 2.2, at.y, at.z + 0.7);
      visuals.root.add(worker);
      let repair = 0;
      this.frame((dtSeconds) => {
        repair += dtSeconds;
        worker.position.x = at.x - 2.2 + Math.min(1.4, repair * 0.45);
        worker.position.y = at.y + Math.abs(Math.sin(repair * 6)) * 0.08;
      });
    });
    this.later(10_200, () => {
      let fade = 0;
      this.frame((dtSeconds) => {
        fade += dtSeconds;
        const scale = Math.max(0, 1 - fade / 3.5);
        crater.scale.setScalar(scale * 2.4);
        if (fade < 3.5) return;
        crater.removeFromParent();
        return false;
      });
    });
  }
}

/** Factory fire: persistent flames, smoke, evacuation and an arriving fire truck. */
export class FactoryFireController extends VisualEventController implements EventController {
  start(ctx: EventStageContext): void {
    const visuals = this.begin(ctx);
    const flameAt = { x: ctx.focus.x, y: ctx.focus.y + 2.2, z: ctx.focus.z };
    this.hold(ctx.fx.fire(flameAt));
    this.hold(ctx.fx.smoke({ x: ctx.focus.x - 0.7, y: ctx.focus.y + 3.1, z: ctx.focus.z }, { colour: 0x4b5563, rate: 130 }));
    this.hold(ctx.fx.warningPulse(ctx.focus));

    const runners: THREE.Group[] = [];
    for (let index = 0; index < 3; index += 1) {
      const runner = visuals.person(characterMaterials.angry);
      runner.position.set(ctx.focus.x, ctx.focus.y, ctx.focus.z);
      visuals.root.add(runner);
      runners.push(runner);
    }
    let evacuation = 0;
    this.frame((dtSeconds) => {
      evacuation = Math.min(1, evacuation + dtSeconds / 1.8);
      for (let index = 0; index < runners.length; index += 1) {
        const runner = runners[index];
        runner.position.x = ctx.focus.x + (index - 1) * 3.1 * evacuation;
        runner.position.z = ctx.focus.z + (2.6 + index * 0.6) * evacuation;
        runner.position.y = ctx.focus.y + Math.abs(Math.sin(evacuation * 18 + index)) * 0.1;
      }
    });

    this.later(2_500, () => this.sendTruck(visuals, ctx.focus));
  }

  private sendTruck(visuals: EventVisuals, target: Vec3): void {
    if (!this.running) return;
    const truck = visuals.fireTruck();
    truck.position.set(target.x - 20, target.y, target.z + 8);
    truck.rotation.y = -Math.PI / 2;
    visuals.root.add(truck);
    const crew = visuals.person(characterMaterials.happy);
    crew.position.set(target.x + 3.2, target.y, target.z + 1.2);
    visuals.root.add(crew);

    let travel = 0;
    this.frame((dtSeconds) => {
      travel = Math.min(1, travel + dtSeconds / 2.8);
      truck.position.x = target.x - 20 + travel * 17;
      truck.position.z = target.z + 8 - travel * 6.8;
      crew.position.y = target.y + Math.abs(Math.sin(travel * 22)) * 0.08;
    });
  }
}

/** Blackout: camera dimming and flickering window props make the power loss readable. */
export class BlackoutController extends VisualEventController implements EventController {
  start(ctx: EventStageContext): void {
    this.begin(ctx);
    const veilGeometry = new THREE.PlaneGeometry(2, 2);
    const veilMaterial = fxMaterials.overlay.clone();
    veilMaterial.color.setHex(0x0a1a2f);
    veilMaterial.opacity = 0;
    const veil = new THREE.Mesh(veilGeometry, veilMaterial);
    veil.renderOrder = 9_000;
    ctx.renderer.camera.add(veil);
    this.track(veil, () => {
      veilGeometry.dispose();
      veilMaterial.dispose();
    });

    const windowsGeometry = new THREE.BoxGeometry(0.38, 0.72, 0.08);
    const windows = new THREE.Group();
    const windowMeshes: THREE.Mesh[] = [];
    const ids = [
      'geo-build',
      'geo-test',
      'geo-security',
      'geo-package',
      'geo-port',
      'geo-review',
      'geo-merge',
      'b3d-build',
      'b3d-test',
    ] as const;
    for (let index = 0; index < ids.length; index += 1) {
      const point = this.landmarkPoint(ids[index], ctx.focus);
      for (let offset = 0; offset < 3; offset += 1) {
        const window = new THREE.Mesh(windowsGeometry, emissiveMaterials.warning);
        window.position.set(point.x - 0.48 + offset * 0.48, point.y + 1.4, point.z + 0.56);
        windows.add(window);
        windowMeshes.push(window);
      }
    }
    ctx.scene.add(windows);
    this.track(windows, () => windowsGeometry.dispose());

    let elapsed = 0;
    this.frame((dtSeconds) => {
      elapsed += dtSeconds;
      const distance = ctx.renderer.camera.near + 0.02;
      const halfHeight = Math.tan(THREE.MathUtils.degToRad(ctx.renderer.camera.fov * 0.5)) * distance;
      veil.position.set(0, 0, -distance);
      veil.scale.set(halfHeight * ctx.renderer.camera.aspect, halfHeight, 1);
      if (elapsed < 1.2) {
        veilMaterial.opacity = (elapsed / 1.2) * 0.45;
      } else if (elapsed < 13) {
        veilMaterial.opacity = 0.45 + (elapsed > 6 && elapsed < 6.6 ? Math.sin(elapsed * 42) * 0.2 : 0);
      } else {
        veilMaterial.opacity = Math.max(0, 0.45 * (1 - (elapsed - 13) / 4));
      }
      for (let index = 0; index < windowMeshes.length; index += 1) {
        windowMeshes[index].visible = elapsed < 17 && Math.sin(elapsed * (5 + index % 3) + index) > -0.1;
      }
    });
    ctx.damp('blackout', 0.5);
  }

  stop(): void {
    if (this.running) this.ctx.damp('blackout', null);
    super.stop();
  }
}

/** Traffic jam: an obvious knot of near-stationary vehicles reduces city activity. */
export class TrafficJamController extends VisualEventController implements EventController {
  start(ctx: EventStageContext): void {
    const visuals = this.begin(ctx);
    const cars: THREE.Group[] = [];
    const materials = [
      vehicleMaterials.blue,
      vehicleMaterials.yellow,
      vehicleMaterials.orange,
      vehicleMaterials.red,
      vehicleMaterials.truck,
    ] as const;
    for (let index = 0; index < 7; index += 1) {
      const car = visuals.car(materials[index % materials.length]);
      car.position.set(ctx.focus.x - 5.4 + index * 1.72, ctx.focus.y, ctx.focus.z + (index % 2) * 0.85);
      car.rotation.y = index % 2 === 0 ? -Math.PI / 2 : Math.PI / 2;
      visuals.root.add(car);
      cars.push(car);
      if (index % 3 === 0) {
        const cone = visuals.trafficCone();
        cone.position.set(car.position.x, ctx.focus.y, car.position.z - 0.8);
        visuals.root.add(cone);
      }
    }
    let phase = 0;
    this.frame((dtSeconds) => {
      phase += dtSeconds;
      for (let index = 0; index < cars.length; index += 1) {
        cars[index].position.x += Math.sin(phase * 6 + index) * dtSeconds * 0.08;
      }
    });
    ctx.damp('traffic-jam', 0.45);
  }

  stop(): void {
    if (this.running) this.ctx.damp('traffic-jam', null);
    super.stop();
  }
}
