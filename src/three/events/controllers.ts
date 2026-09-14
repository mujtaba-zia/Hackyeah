import * as THREE from 'three';
import { characterMaterials, fxMaterials, vehicleMaterials } from '../core/materials';
import { CITIES, PIPELINE_LEGS, REVIEW_WAITING_SPOTS } from '../world/cityPlan';
import type { Vec3 } from '../../domain/ids';
import { EventVisuals } from './visuals';
import { TrackedController, type EventController, type EventStageContext } from './types';

/** One shared mesh factory: every controller borrows it, none owns it. */
const visuals = new EventVisuals();

export function disposeEventVisuals(): void {
  visuals.dispose();
}

const above = (point: Vec3, height: number): Vec3 => ({ x: point.x, y: point.y + height, z: point.z });

/** Tornado: a funnel crosses the city, lifting debris and rattling the streets. */
class TornadoController extends TrackedController implements EventController {
  start(ctx: EventStageContext): void {
    this.ctx = ctx;
    // Solid grey and large: a translucent dust cone was invisible against the
    // pale skyline at the default camera distance.
    const funnel = this.track(visuals.tornado(fxMaterials.debris));
    funnel.scale.set(15, 52, 15);
    funnel.position.set(ctx.focus.x - 55, ctx.focus.y + 26, ctx.focus.z - 38);
    ctx.scene.add(funnel);

    this.hold(ctx.fx.wind());
    ctx.damp('tornado', 0.4);

    let travelled = 0;
    this.frame((dt, elapsed) => {
      travelled += dt;
      funnel.position.x = ctx.focus.x - 55 + travelled * 7;
      funnel.position.z = ctx.focus.z - 38 + travelled * 4;
      funnel.rotation.y = elapsed * 5;
      funnel.scale.x = 15 + Math.sin(elapsed * 4) * 1.2;
      funnel.scale.z = funnel.scale.x;
    });

    this.debrisBurst(funnel);
    this.shakeLoop();
  }

  private debrisBurst(funnel: THREE.Object3D) {
    if (!this.running) return;
    // Held as well as timed, so a burst still in flight when the event ends is
    // owned by the controller rather than orphaned by its cancelled timer.
    const burst = this.hold(
      this.ctx.fx.debris({ x: funnel.position.x, y: funnel.position.y, z: funnel.position.z }, 7),
    );
    this.later(1_600, () => this.releaseHandle(burst));
    this.later(1_900, () => this.debrisBurst(funnel));
  }

  private shakeLoop() {
    if (!this.running) return;
    this.ctx.fx.shake(0.004, 500);
    this.later(3_000, () => this.shakeLoop());
  }

  stop(): void {
    this.ctx?.damp('tornado', null);
    super.stop();
  }
}

/** UFO: flies in, beams up a decoy citizen and puts it back unharmed. */
class UfoController extends TrackedController implements EventController {
  start(ctx: EventStageContext): void {
    this.ctx = ctx;
    const saucer = this.track(visuals.ufo());
    const start = { x: ctx.focus.x - 160, y: ctx.focus.y + 52, z: ctx.focus.z - 40 };
    saucer.position.set(start.x, start.y, start.z);
    ctx.scene.add(saucer);

    let t = 0;
    this.frame((dt, elapsed) => {
      t = Math.min(1, t + dt / 6);
      saucer.position.x = start.x + (ctx.focus.x - start.x) * t;
      saucer.position.z = start.z + (ctx.focus.z - start.z) * t;
      saucer.position.y = start.y + Math.sin(elapsed * 1.5) * 2;
      saucer.rotation.y = elapsed * 1.2;
    });

    this.later(6_000, () => this.abduct(saucer));
  }

  private abduct(saucer: THREE.Object3D) {
    if (!this.running) return;
    const ctx = this.ctx;
    const ground = { x: saucer.position.x, y: ctx.focus.y, z: saucer.position.z };
    this.hold(ctx.fx.beam({ x: saucer.position.x, y: saucer.position.y - 4, z: saucer.position.z }, ground));

    // A throwaway stand in, so no real pull request is ever touched.
    const decoy = this.track(visuals.person(characterMaterials.angry));
    decoy.position.set(ground.x, ground.y, ground.z);
    ctx.scene.add(decoy);

    let lift = 0;
    this.frame((dt) => {
      lift = Math.min(1, lift + dt / 4);
      decoy.position.y = ground.y + lift * 34;
      decoy.rotation.y += dt * 3;
    });
    this.later(9_000, () => ctx.fx.sparks(above(ground, 2), 0x8be9fd, 18));
  }
}

/** Meteor: a shadow, an impact and a crater that repair crews tidy away. */
class MeteorController extends TrackedController implements EventController {
  start(ctx: EventStageContext): void {
    this.ctx = ctx;
    const rock = this.track(visuals.meteor());
    rock.scale.setScalar(3.4);
    const from = { x: ctx.focus.x - 120, y: ctx.focus.y + 190, z: ctx.focus.z - 90 };
    rock.position.set(from.x, from.y, from.z);
    ctx.scene.add(rock);

    let t = 0;
    this.frame((dt) => {
      t = Math.min(1, t + dt / 3);
      rock.position.x = from.x + (ctx.focus.x - from.x) * t;
      rock.position.y = from.y + (ctx.focus.y + 2 - from.y) * t;
      rock.position.z = from.z + (ctx.focus.z - from.z) * t;
      rock.rotation.x += dt * 4;
      if (t >= 1) {
        this.impact(rock);
        return false;
      }
    });
  }

  private impact(rock: THREE.Object3D) {
    const ctx = this.ctx;
    this.releaseObject(rock);
    ctx.fx.explosion(above(ctx.focus, 1));
    ctx.fx.flash(0xffd9a0, 220);

    const crater = this.track(visuals.crater());
    crater.position.set(ctx.focus.x, ctx.focus.y + 0.1, ctx.focus.z);
    ctx.scene.add(crater);

    this.later(1_400, () => {
      const crew = this.track(visuals.person(characterMaterials.infra));
      crew.position.set(ctx.focus.x + 6, ctx.focus.y, ctx.focus.z + 4);
      ctx.scene.add(crew);
      this.frame((_dt, elapsed) => {
        crew.position.y = ctx.focus.y + Math.abs(Math.sin(elapsed * 5)) * 0.4;
      });
    });
  }
}

/** Factory fire: flames, alarm ring, evacuating workers and a fire truck. */
class FactoryFireController extends TrackedController implements EventController {
  start(ctx: EventStageContext): void {
    this.ctx = ctx;
    this.hold(ctx.fx.fire(above(ctx.focus, 6)));
    this.hold(ctx.fx.smoke(above(ctx.focus, 12), { colour: 0x4b5563, rate: 26 }));
    this.hold(ctx.fx.warningPulse(above(ctx.focus, 0.4)));

    for (let i = 0; i < 3; i++) {
      const worker = this.track(visuals.person(characterMaterials.annoyed));
      worker.position.set(ctx.focus.x, ctx.focus.y, ctx.focus.z);
      ctx.scene.add(worker);
      const angle = (i / 3) * Math.PI * 2;
      this.frame((dt) => {
        worker.position.x += Math.cos(angle) * dt * 6;
        worker.position.z += Math.sin(angle) * dt * 6;
      });
    }

    this.later(2_500, () => {
      const truck = this.track(visuals.fireTruck());
      truck.position.set(ctx.focus.x - 60, ctx.focus.y, ctx.focus.z - 30);
      ctx.scene.add(truck);
      this.frame((dt) => {
        const dx = ctx.focus.x - 12 - truck.position.x;
        const dz = ctx.focus.z - truck.position.z;
        const distance = Math.hypot(dx, dz);
        if (distance < 0.5) return false;
        truck.position.x += (dx / distance) * dt * 22;
        truck.position.z += (dz / distance) * dt * 22;
        truck.rotation.y = Math.atan2(dx, dz);
      });
    });
  }
}

/** Blackout: the city dims, flickers, then maintenance restores power. */
class BlackoutController extends TrackedController implements EventController {
  private previousIntensity = 1;

  start(ctx: EventStageContext): void {
    this.ctx = ctx;
    ctx.damp('blackout', 0.5);

    // Dim the key light rather than covering the screen, so the city stays readable.
    const light = ctx.scene.getObjectByName('key-light');
    if (light instanceof THREE.DirectionalLight) {
      this.previousIntensity = light.intensity;
      let phase = 0;
      this.frame((dt) => {
        phase += dt;
        const flicker = phase > 6 && phase < 7 ? 0.8 : 0.28;
        light.intensity = this.previousIntensity * flicker;
      });
    }

    this.later(13_000, () => {
      const crew = this.track(visuals.person(characterMaterials.infra));
      crew.position.set(ctx.focus.x + 4, ctx.focus.y, ctx.focus.z + 4);
      ctx.scene.add(crew);
      ctx.fx.sparks(above(ctx.focus, 3), 0xffd166, 14);
    });
  }

  stop(): void {
    const light = this.ctx?.scene.getObjectByName('key-light');
    if (light instanceof THREE.DirectionalLight) light.intensity = this.previousIntensity;
    this.ctx?.damp('blackout', null);
    super.stop();
  }
}

/** Traffic jam: a queue of stopped cars with impatient bobbing. */
class TrafficJamController extends TrackedController implements EventController {
  start(ctx: EventStageContext): void {
    this.ctx = ctx;
    ctx.damp('traffic-jam', 0.45);
    const palette = [vehicleMaterials.blue, vehicleMaterials.yellow, vehicleMaterials.orange, vehicleMaterials.red];

    for (let i = 0; i < 8; i++) {
      const car = this.track(visuals.car(palette[i % palette.length]));
      car.position.set(ctx.focus.x + 6 + i * 5.5, ctx.focus.y, ctx.focus.z + 4);
      ctx.scene.add(car);
      this.frame((_dt, elapsed) => {
        car.position.y = ctx.focus.y + Math.abs(Math.sin(elapsed * 6 + i)) * 0.16;
      });
    }
  }

  stop(): void {
    this.ctx?.damp('traffic-jam', null);
    super.stop();
  }
}

/** Bug invasion: cartoon bugs crawl the district while workers give chase. */
class BugInvasionController extends TrackedController implements EventController {
  start(ctx: EventStageContext): void {
    this.ctx = ctx;
    for (let i = 0; i < 10; i++) {
      const bug = this.track(visuals.bug());
      const angle = (i / 10) * Math.PI * 2;
      bug.position.set(ctx.focus.x + Math.cos(angle) * 14, ctx.focus.y, ctx.focus.z + Math.sin(angle) * 14);
      ctx.scene.add(bug);
      const speed = 3 + (i % 4);
      this.frame((dt, elapsed) => {
        const drift = elapsed * speed * 0.35 + i;
        bug.position.x = ctx.focus.x + Math.cos(drift) * (12 + (i % 5) * 3);
        bug.position.z = ctx.focus.z + Math.sin(drift * 1.3) * (12 + (i % 4) * 3);
        bug.rotation.y = -drift;
        bug.position.y = ctx.focus.y + Math.abs(Math.sin(elapsed * 9 + i)) * 0.2;
        void dt;
      });
    }

    for (let i = 0; i < 2; i++) {
      const chaser = this.track(visuals.person(characterMaterials.watching));
      chaser.position.set(ctx.focus.x + (i === 0 ? -18 : 18), ctx.focus.y, ctx.focus.z);
      ctx.scene.add(chaser);
      this.frame((_dt, elapsed) => {
        chaser.position.x = ctx.focus.x + Math.sin(elapsed * 1.6 + i * 2) * 20;
        chaser.position.z = ctx.focus.z + Math.cos(elapsed * 1.2 + i * 2) * 14;
      });
    }
  }
}

/** Pull request protest: placards and chanting outside Review Hall. */
class PrProtestController extends TrackedController implements EventController {
  start(ctx: EventStageContext): void {
    this.ctx = ctx;
    const boards = [characterMaterials.angry, characterMaterials.annoyed, characterMaterials.watching];

    REVIEW_WAITING_SPOTS.slice(0, 8).forEach((spot, i) => {
      const placard = this.track(visuals.placard(boards[i % boards.length]));
      placard.position.set(spot.x, spot.y, spot.z);
      ctx.scene.add(placard);

      const protester = this.track(visuals.person(characterMaterials.annoyed));
      protester.position.set(spot.x + 1.4, spot.y, spot.z + 0.6);
      ctx.scene.add(protester);

      this.frame((_dt, elapsed) => {
        placard.rotation.z = Math.sin(elapsed * 3 + i) * 0.28;
        protester.position.y = spot.y + Math.abs(Math.sin(elapsed * 4 + i)) * 0.22;
      });
    });
  }
}

/** Deployment parade: a float runs the pipeline road throwing confetti. */
class ParadeController extends TrackedController implements EventController {
  start(ctx: EventStageContext): void {
    this.ctx = ctx;
    const route = PIPELINE_LEGS[PIPELINE_LEGS.length - 1] ?? [];
    if (route.length < 2) return;

    const float = this.track(visuals.paradeFloat());
    float.position.set(route[0].x, route[0].y, route[0].z);
    ctx.scene.add(float);

    let leg = 0;
    this.frame((dt) => {
      const target = route[(leg + 1) % route.length];
      const dx = target.x - float.position.x;
      const dz = target.z - float.position.z;
      const distance = Math.hypot(dx, dz);
      if (distance < 1) {
        leg = (leg + 1) % route.length;
        return;
      }
      float.position.x += (dx / distance) * dt * 12;
      float.position.z += (dz / distance) * dt * 12;
      float.rotation.y = Math.atan2(dx, dz);
    });

    this.confettiLoop(float);
  }

  private confettiLoop(float: THREE.Object3D) {
    if (!this.running) return;
    this.ctx.fx.confetti({ x: float.position.x, y: float.position.y + 5, z: float.position.z }, 20);
    this.later(1_300, () => this.confettiLoop(float));
  }
}

/** Fireworks: shells burst over the skyline. */
class FireworksController extends TrackedController implements EventController {
  start(ctx: EventStageContext): void {
    this.ctx = ctx;
    this.burst();
  }

  private burst() {
    if (!this.running) return;
    const geo = CITIES.find((city) => city.id === 'geo');
    const centre = geo?.center ?? this.ctx.focus;
    const at = {
      x: centre.x + (Math.random() - 0.5) * 90,
      y: centre.y + 55 + Math.random() * 25,
      z: centre.z + (Math.random() - 0.5) * 90,
    };
    this.ctx.fx.sparks(at, 0xff79c6, 30);
    this.ctx.fx.confetti(at, 18);
    this.later(700 + Math.random() * 900, () => this.burst());
  }
}

/** Rainbow: a wholesome arc after a recovery. */
class RainbowController extends TrackedController implements EventController {
  start(ctx: EventStageContext): void {
    this.ctx = ctx;
    const geo = CITIES.find((city) => city.id === 'geo');
    const centre = geo?.center ?? ctx.focus;
    const bands = [
      characterMaterials.angry,
      characterMaterials.pacing,
      characterMaterials.watching,
      characterMaterials.happy,
      characterMaterials.calm,
      characterMaterials.b3d,
    ];
    const arc = this.track(visuals.rainbow(bands));
    arc.position.set(centre.x, centre.y + 4, centre.z - 40);
    arc.scale.setScalar(70);
    ctx.scene.add(arc);

    this.frame((_dt, elapsed) => {
      arc.position.y = centre.y + 4 + Math.sin(elapsed * 0.6) * 1.5;
    });
  }
}

/** Repair crews: visible healing after a rough patch. */
class RepairCrewController extends TrackedController implements EventController {
  start(ctx: EventStageContext): void {
    this.ctx = ctx;
    for (let i = 0; i < 3; i++) {
      const crew = this.track(visuals.person(characterMaterials.infra));
      crew.position.set(ctx.focus.x - 8 + i * 6, ctx.focus.y, ctx.focus.z + 9);
      ctx.scene.add(crew);
      this.frame((_dt, elapsed) => {
        crew.position.y = ctx.focus.y + Math.abs(Math.sin(elapsed * 5 + i)) * 0.35;
      });

      const cone = this.track(visuals.trafficCone());
      cone.position.set(ctx.focus.x - 10 + i * 6, ctx.focus.y, ctx.focus.z + 11);
      ctx.scene.add(cone);
    }
    this.dustLoop();
  }

  private dustLoop() {
    if (!this.running) return;
    this.ctx.fx.dust({ x: this.ctx.focus.x, y: this.ctx.focus.y + 1, z: this.ctx.focus.z + 9 });
    this.later(2_400, () => this.dustLoop());
  }
}

/** Construction boom: scaffolding rises while the city is thriving. */
class ConstructionController extends TrackedController implements EventController {
  start(ctx: EventStageContext): void {
    this.ctx = ctx;
    const scaffold = this.track(visuals.scaffold());
    scaffold.position.set(ctx.focus.x + 16, ctx.focus.y, ctx.focus.z + 12);
    scaffold.scale.set(6, 1, 6);
    ctx.scene.add(scaffold);

    let grown = 0;
    this.frame((dt) => {
      grown = Math.min(1, grown + dt / 8);
      scaffold.scale.y = 1 + grown * 11;
    });

    const builder = this.track(visuals.person(characterMaterials.data));
    builder.position.set(ctx.focus.x + 11, ctx.focus.y, ctx.focus.z + 12);
    ctx.scene.add(builder);
    this.frame((_dt, elapsed) => {
      builder.rotation.z = Math.sin(elapsed * 9) * 0.3;
    });

    this.dustLoop();
  }

  private dustLoop() {
    if (!this.running) return;
    this.ctx.fx.dust({ x: this.ctx.focus.x + 16, y: this.ctx.focus.y + 1, z: this.ctx.focus.z + 12 });
    this.later(2_800, () => this.dustLoop());
  }
}

/** Every event id the director can stage, mapped to its visual controller. */
export const EVENT_CONTROLLERS = {
  tornado: () => new TornadoController(),
  ufo: () => new UfoController(),
  meteor: () => new MeteorController(),
  'factory-fire': () => new FactoryFireController(),
  blackout: () => new BlackoutController(),
  'traffic-jam': () => new TrafficJamController(),
  'bug-invasion': () => new BugInvasionController(),
  'pr-protest': () => new PrProtestController(),
  'deployment-parade': () => new ParadeController(),
  fireworks: () => new FireworksController(),
  rainbow: () => new RainbowController(),
  'repair-crew': () => new RepairCrewController(),
  'construction-boom': () => new ConstructionController(),
} as const;
