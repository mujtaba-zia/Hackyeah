import * as THREE from 'three';
import type { Vec3 } from '../../domain/ids';
import { PIPELINE_LEGS, REVIEW_WAITING_SPOTS } from '../world/cityPlan';
import { characterMaterials, emissiveMaterials, vehicleMaterials } from '../core/materials';
import { VisualEventController } from './controllerBase';
import type { EventController, EventStageContext } from './types';

/** Bug invasion: small crawling bugs swarm the affected engineering district. */
export class BugInvasionController extends VisualEventController implements EventController {
  start(ctx: EventStageContext): void {
    const visuals = this.begin(ctx);
    const bugs: THREE.Group[] = [];
    for (let index = 0; index < 9; index += 1) {
      const bug = visuals.bug();
      visuals.root.add(bug);
      bugs.push(bug);
    }
    const chasers = [visuals.person(characterMaterials.happy), visuals.person(characterMaterials.b3d)];
    for (let index = 0; index < chasers.length; index += 1) {
      chasers[index].position.set(ctx.focus.x - 4 + index * 8, ctx.focus.y, ctx.focus.z + 3);
      visuals.root.add(chasers[index]);
    }

    let phase = 0;
    this.frame((dtSeconds) => {
      phase += dtSeconds;
      for (let index = 0; index < bugs.length; index += 1) {
        const angle = phase * (0.9 + (index % 3) * 0.14) + (index / bugs.length) * Math.PI * 2;
        const radius = 1.8 + (index % 4) * 0.52;
        const bug = bugs[index];
        bug.position.set(
          ctx.focus.x + Math.cos(angle) * radius,
          ctx.focus.y + 0.04,
          ctx.focus.z + Math.sin(angle * 1.7) * (1.2 + (index % 3) * 0.35),
        );
        bug.rotation.y = -angle;
        bug.rotation.z = Math.sin(phase * 9 + index) * 0.16;
      }
      for (let index = 0; index < chasers.length; index += 1) {
        chasers[index].position.x = ctx.focus.x - 4 + index * 8 + Math.sin(phase * 2 + index) * 1.2;
        chasers[index].position.y = ctx.focus.y + Math.abs(Math.sin(phase * 6 + index)) * 0.1;
      }
    });
  }
}

/** Pull request protest: waving placards make Review Hall visibly busy. */
export class PrProtestController extends VisualEventController implements EventController {
  start(ctx: EventStageContext): void {
    const visuals = this.begin(ctx);
    const review = this.landmarkPoint('geo-review', ctx.focus);
    const signs: THREE.Group[] = [];
    const protesters: THREE.Group[] = [];
    const boardMaterials = [emissiveMaterials.warning, emissiveMaterials.merge, emissiveMaterials.firework] as const;
    for (let index = 0; index < 8; index += 1) {
      const spot = REVIEW_WAITING_SPOTS[index % REVIEW_WAITING_SPOTS.length];
      const sign = visuals.placard(boardMaterials[index % boardMaterials.length]);
      sign.position.set(spot.x, spot.y, spot.z);
      visuals.root.add(sign);
      signs.push(sign);
      if (index % 2 === 0) {
        const protester = visuals.person(index % 4 === 0 ? characterMaterials.annoyed : characterMaterials.angry);
        protester.position.set(spot.x - 0.45, spot.y, spot.z + 0.28);
        visuals.root.add(protester);
        protesters.push(protester);
      }
    }
    const leadSign = visuals.placard(emissiveMaterials.warning);
    leadSign.position.set(review.x, review.y, review.z - 1.4);
    leadSign.scale.setScalar(1.25);
    visuals.root.add(leadSign);
    signs.push(leadSign);

    let phase = 0;
    this.frame((dtSeconds) => {
      phase += dtSeconds;
      for (let index = 0; index < signs.length; index += 1) {
        signs[index].rotation.z = Math.sin(phase * (2.8 + index * 0.13) + index) * 0.24;
      }
      for (let index = 0; index < protesters.length; index += 1) {
        protesters[index].position.y = Math.abs(Math.sin(phase * 4 + index)) * 0.1;
      }
    });
  }
}

/** Deployment parade: a float follows the last pipeline leg and throws confetti. */
export class ParadeController extends VisualEventController implements EventController {
  start(ctx: EventStageContext): void {
    const visuals = this.begin(ctx);
    const route = PIPELINE_LEGS[PIPELINE_LEGS.length - 1];
    if (!route || route.length < 2) return;
    const float = visuals.paradeFloat();
    float.position.set(route[0].x, route[0].y, route[0].z);
    visuals.root.add(float);
    for (let index = 0; index < Math.min(4, route.length); index += 1) {
      const fan = visuals.person(index % 2 === 0 ? characterMaterials.happy : characterMaterials.geo);
      fan.position.set(route[index].x + 1.3, route[index].y, route[index].z + 1);
      visuals.root.add(fan);
    }

    let segment = 0;
    let progress = 0;
    let phase = 0;
    this.frame((dtSeconds) => {
      phase += dtSeconds;
      const from = route[segment];
      const to = route[(segment + 1) % route.length];
      const distance = Math.max(0.1, Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z));
      progress += (dtSeconds * 4.4) / distance;
      if (progress >= 1) {
        progress -= 1;
        segment = (segment + 1) % route.length;
      }
      const next = route[(segment + 1) % route.length];
      const current = route[segment];
      float.position.set(
        current.x + (next.x - current.x) * progress,
        current.y + Math.sin(phase * 5) * 0.06,
        current.z + (next.z - current.z) * progress,
      );
      float.rotation.y = -Math.atan2(next.z - current.z, next.x - current.x);
    });
    this.confettiLoop(float);
  }

  private confettiLoop(float: THREE.Group): void {
    if (!this.running) return;
    this.ctx.fx.confetti({ x: float.position.x, y: float.position.y + 1.3, z: float.position.z }, 18);
    this.later(1_400, () => this.confettiLoop(float));
  }
}

/** Fireworks: launched shells burst over the skyline in a repeating sequence. */
export class FireworksController extends VisualEventController implements EventController {
  start(ctx: EventStageContext): void {
    const visuals = this.begin(ctx);
    const shellsGeometry = new THREE.SphereGeometry(0.24, 10, 8);
    const shells = new THREE.Group();
    visuals.root.add(shells);
    this.track(shells, () => shellsGeometry.dispose());
    let burstIndex = 0;
    const launch: () => void = () => {
      if (!this.running) return;
      const lane = burstIndex % 5;
      const target = {
        x: ctx.focus.x - 8 + lane * 4,
        y: ctx.focus.y + 12 + (burstIndex % 3) * 2.5,
        z: ctx.focus.z - 7 + (burstIndex % 4) * 3,
      };
      const shell = new THREE.Mesh(shellsGeometry, emissiveMaterials.firework);
      shell.position.set(target.x, ctx.focus.y + 0.4, target.z);
      shells.add(shell);
      let rise = 0;
      this.frame((dtSeconds) => {
        rise += dtSeconds / 0.75;
        shell.position.y = ctx.focus.y + 0.4 + (target.y - ctx.focus.y - 0.4) * Math.min(1, rise);
        shell.scale.setScalar(1 + Math.sin(rise * Math.PI) * 0.4);
        if (rise < 1) return;
        shell.removeFromParent();
        this.ctx.fx.sparks(target, lane % 2 === 0 ? 0xff79c6 : 0xffd166, 28);
        this.ctx.fx.confetti(target, 22);
        return false;
      });
      burstIndex += 1;
      this.later(1_100 + (burstIndex % 3) * 180, launch);
    };
    launch();
  }
}

/** Rainbow: a bright procedural arc stays above the recovering city. */
export class RainbowController extends VisualEventController implements EventController {
  start(ctx: EventStageContext): void {
    const visuals = this.begin(ctx);
    const rainbow = visuals.rainbow([
      vehicleMaterials.red,
      vehicleMaterials.orange,
      vehicleMaterials.yellow,
      characterMaterials.happy,
      vehicleMaterials.blue,
    ]);
    rainbow.position.set(ctx.focus.x, ctx.focus.y + 7.4, ctx.focus.z);
    rainbow.rotation.y = -Math.PI / 10;
    visuals.root.add(rainbow);
    let phase = 0;
    this.frame((dtSeconds) => {
      phase += dtSeconds;
      rainbow.position.y = ctx.focus.y + 7.4 + Math.sin(phase * 0.8) * 0.35;
      rainbow.rotation.z = Math.sin(phase * 0.4) * 0.04;
    });
  }
}

/** Repair crews and cones give failure recovery a visible, friendly consequence. */
export class RepairCrewController extends VisualEventController implements EventController {
  start(ctx: EventStageContext): void {
    const visuals = this.begin(ctx);
    const crews: THREE.Group[] = [];
    for (let index = 0; index < 3; index += 1) {
      const crew = visuals.person(index === 1 ? emissiveMaterials.worker : characterMaterials.happy);
      crew.position.set(ctx.focus.x - 2 + index * 2, ctx.focus.y, ctx.focus.z + 0.8 + index * 0.38);
      visuals.root.add(crew);
      crews.push(crew);
      const cone = visuals.trafficCone();
      cone.position.set(crew.position.x + 0.48, ctx.focus.y, crew.position.z + 0.52);
      visuals.root.add(cone);
    }
    let phase = 0;
    this.frame((dtSeconds) => {
      phase += dtSeconds;
      for (let index = 0; index < crews.length; index += 1) {
        crews[index].position.y = ctx.focus.y + Math.abs(Math.sin(phase * (4 + index) + index)) * 0.1;
      }
    });
    this.dustLoop(ctx.focus);
  }

  private dustLoop(at: Vec3): void {
    if (!this.running) return;
    this.ctx.fx.dust({ x: at.x + (Math.random() - 0.5) * 3, y: at.y + 0.15, z: at.z + (Math.random() - 0.5) * 2 });
    this.later(2_200, () => this.dustLoop(at));
  }
}

/** Construction boom: scaffolding rises with a cheerful builder and periodic dust. */
export class ConstructionController extends VisualEventController implements EventController {
  start(ctx: EventStageContext): void {
    const visuals = this.begin(ctx);
    const scaffold = visuals.scaffold();
    scaffold.position.set(ctx.focus.x + 3.2, ctx.focus.y, ctx.focus.z + 1.2);
    scaffold.scale.y = 0.06;
    visuals.root.add(scaffold);
    const builder = visuals.person(emissiveMaterials.worker);
    builder.position.set(ctx.focus.x + 1.5, ctx.focus.y, ctx.focus.z + 1.2);
    visuals.root.add(builder);

    let rise = 0;
    let phase = 0;
    this.frame((dtSeconds) => {
      rise = Math.min(1, rise + dtSeconds / 1.2);
      phase += dtSeconds;
      scaffold.scale.y = rise;
      builder.position.y = ctx.focus.y + Math.abs(Math.sin(phase * 5)) * 0.1;
      builder.rotation.z = Math.sin(phase * 8) * 0.14;
    });
    this.later(1_000, () => this.dustLoop({ x: ctx.focus.x + 3.2, y: ctx.focus.y, z: ctx.focus.z + 1.2 }));
  }

  private dustLoop(at: Vec3): void {
    if (!this.running) return;
    this.ctx.fx.dust(at);
    this.later(2_600, () => this.dustLoop(at));
  }
}
