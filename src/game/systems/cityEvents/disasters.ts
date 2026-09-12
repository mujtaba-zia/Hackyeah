import Phaser from 'phaser';
import { EMERGENCY_ROUTE, VEHICLE_ROUTES } from '../../world/cityLayout';
import { tileToWorld } from '../../world/iso';
import { TrackedController, type EventController, type EventStageContext } from './types';

/** Tornado: a funnel crosses part of the city, then repair crews tidy up. */
export class TornadoController extends TrackedController implements EventController {
  start(ctx: EventStageContext): void {
    this.ctx = ctx;
    const { x, y } = ctx.focus;
    const funnel = this.track(
      ctx.scene.add.image(x - 700, y - 120, 'ev-tornado').setDepth(y + 900).setAlpha(0),
    );
    this.hold(ctx.fx.wind());

    this.tween({ targets: funnel, alpha: 1, duration: 900 });
    this.tween({
      targets: funnel,
      x: x + 620,
      y: y + 160,
      duration: 17_000,
      ease: 'Sine.inOut',
      onUpdate: () => funnel.setDepth(funnel.y + 900),
    });
    // Debris is spawned along the path in short bursts rather than pinned to the
    // funnel every frame, which keeps the effect cheap and self cleaning.
    this.debrisBurst(funnel);

    this.tween({
      targets: funnel,
      angle: { from: -4, to: 4 },
      duration: 600,
      yoyo: true,
      repeat: -1,
    });

    // Shake whenever the funnel is near a landmark.
    this.later(2_000, () => this.shakeLoop());
    ctx.traffic.setActivity(0.4);
    ctx.pedestrians.setActivity(0.3);
  }

  private debrisBurst(funnel: Phaser.GameObjects.Image) {
    if (!this.running) return;
    const burst = this.ctx.fx.debris(funnel.x, funnel.y - 40, 60);
    this.ctx.fx.dust(funnel.x, funnel.y);
    this.later(1_500, () => burst.destroy());
    this.later(1_800, () => this.debrisBurst(funnel));
  }

  private shakeLoop() {
    if (!this.running) return;
    this.ctx.fx.shake(0.005, 500);
    this.later(3_000, () => this.shakeLoop());
  }

  stop(): void {
    this.ctx?.traffic.setActivity(1);
    this.ctx?.pedestrians.setActivity(1);
    super.stop();
  }
}

/**
 * UFO: flies in, hovers, beams up a decoy copy of a nearby citizen and puts it
 * back. It never touches a real pull request, only a throwaway sprite.
 */
export class UfoController extends TrackedController implements EventController {
  start(ctx: EventStageContext): void {
    this.ctx = ctx;
    const { x, y } = ctx.focus;
    const ufo = this.track(ctx.scene.add.image(x - 900, y - 320, 'ev-ufo').setDepth(y + 2000));
    const shadow = this.track(
      ctx.scene.add.ellipse(x - 900, y, 120, 50, 0x0b2030, 0.22).setDepth(y - 1),
    );

    this.tween({
      targets: [ufo, shadow],
      x,
      duration: 5_000,
      ease: 'Sine.inOut',
      onComplete: () => this.abduct(x, y),
    });
    this.tween({
      targets: ufo,
      y: y - 300,
      duration: 1_600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
    });
  }

  private abduct(x: number, y: number) {
    if (!this.running) return;
    const ctx = this.ctx;
    this.hold(ctx.fx.beam(x, y - 300, 300));

    // A visual stand in, so the pull request simulation is never touched.
    const decoy = this.track(ctx.scene.add.image(x, y, 'pr-angry').setDepth(y + 2100));
    const bubble = this.track(
      ctx.scene.add
        .text(x, y - 60, 'At least somebody noticed me.', {
          fontFamily: 'Inter, system-ui, sans-serif',
          fontSize: '13px',
          color: '#12202e',
          backgroundColor: '#ffffffdd',
          padding: { x: 8, y: 4 },
        })
        .setOrigin(0.5)
        .setDepth(y + 2200),
    );

    this.tween({
      targets: [decoy, bubble],
      y: `-=210`,
      duration: 3_000,
      ease: 'Sine.inOut',
      onComplete: () => {
        this.tween({
          targets: [decoy, bubble],
          y: `+=210`,
          duration: 2_200,
          delay: 1_500,
          ease: 'Bounce.out',
          onComplete: () => {
            bubble.destroy();
            ctx.fx.stars(x, y - 20);
          },
        });
      },
    });
  }
}

/** Meteor: shadow, impact, crater, dust, then the crater fades away. */
export class MeteorController extends TrackedController implements EventController {
  start(ctx: EventStageContext): void {
    this.ctx = ctx;
    const { x, y } = ctx.focus;
    const shadow = this.track(ctx.scene.add.ellipse(x, y, 20, 10, 0x0b2030, 0.3).setDepth(y - 1));
    const rock = this.track(
      ctx.scene.add.image(x - 420, y - 620, 'ev-meteor').setDepth(y + 3000).setAngle(35),
    );

    this.tween({ targets: shadow, scaleX: 6, scaleY: 6, duration: 2_600 });
    this.tween({
      targets: rock,
      x,
      y: y - 8,
      duration: 2_600,
      ease: 'Quad.in',
      onComplete: () => this.impact(x, y, shadow, rock),
    });
  }

  private impact(
    x: number,
    y: number,
    shadow: Phaser.GameObjects.Ellipse,
    rock: Phaser.GameObjects.Image,
  ) {
    if (!this.running) return;
    const ctx = this.ctx;
    rock.destroy();
    shadow.destroy();
    ctx.fx.explosion(x, y);
    ctx.fx.flash(0xffd9a0, 220);

    const crater = this.track(ctx.scene.add.image(x, y, 'ev-crater').setDepth(y - 2).setAlpha(0));
    this.tween({ targets: crater, alpha: 1, duration: 400 });
    this.later(1_200, () => {
      // Repair crew tidies the crater, so nothing is permanently destroyed.
      const worker = this.track(ctx.scene.add.image(x - 60, y + 10, 'a-repair').setDepth(y + 12));
      this.tween({ targets: worker, x: x - 20, duration: 2_000 });
      this.tween({
        targets: worker,
        y: worker.y - 5,
        duration: 380,
        yoyo: true,
        repeat: -1,
      });
      this.later(9_000, () => this.tween({ targets: crater, alpha: 0, duration: 3_500 }));
    });
  }
}

/** Factory fire: flames on a landmark, alarm ring, firefighters, fire truck. */
export class FactoryFireController extends TrackedController implements EventController {
  start(ctx: EventStageContext): void {
    this.ctx = ctx;
    const { x, y } = ctx.focus;
    this.hold(ctx.fx.fire(x, y - 30, y + 20));
    this.hold(ctx.fx.smoke(x - 10, y - 90, { tint: 0x555555, rate: 130, depth: y + 30 }));
    this.hold(ctx.fx.warningPulse(x, y + 6));

    // Workers evacuate, firefighters arrive.
    for (let i = 0; i < 3; i++) {
      const runner = this.track(
        ctx.scene.add.image(x, y, 'a-worker-panic').setDepth(y + 14 + i),
      );
      this.tween({
        targets: runner,
        x: x + (i - 1) * 90 + (i === 1 ? 20 : 0),
        y: y + 60 + i * 8,
        duration: 1_600 + i * 200,
        ease: 'Sine.out',
      });
    }

    this.later(2_500, () => {
      const route = EMERGENCY_ROUTE.map((tile) => tileToWorld(tile));
      const truck = this.track(
        ctx.scene.add.image(route[0].x, route[0].y, 'a-firetruck').setDepth(route[0].y),
      );
      this.driveThrough(truck, route, 1);
      const crew = this.track(ctx.scene.add.image(x + 40, y + 24, 'a-firefighter').setDepth(y + 16));
      this.tween({ targets: crew, x: x + 8, duration: 2_400, delay: 2_000 });
    });
  }

  private driveThrough(
    truck: Phaser.GameObjects.Image,
    route: { x: number; y: number }[],
    index: number,
  ) {
    if (!this.running || index >= route.length) return;
    const target = route[index];
    const distance = Phaser.Math.Distance.Between(truck.x, truck.y, target.x, target.y);
    truck.setFlipX(target.x < truck.x);
    this.tween({
      targets: truck,
      x: target.x,
      y: target.y,
      duration: Math.max(150, (distance / 220) * 1000),
      onUpdate: () => truck.setDepth(truck.y),
      onComplete: () => this.driveThrough(truck, route, index + 1),
    });
  }
}

/** Blackout: the city dims, lights flicker, then power returns. */
export class BlackoutController extends TrackedController implements EventController {
  start(ctx: EventStageContext): void {
    this.ctx = ctx;
    const camera = ctx.scene.cameras.main;
    const veil = this.track(
      ctx.scene.add
        .rectangle(0, 0, 12_000, 12_000, 0x0a1a2f, 0)
        .setOrigin(0.5)
        .setPosition(camera.midPoint.x, camera.midPoint.y)
        .setDepth(1_500_000)
        .setScrollFactor(1),
    );
    this.tween({ targets: veil, fillAlpha: 0.45, duration: 1_200 });

    // Two flickers, then a slow restore by the maintenance crew.
    this.later(6_000, () => {
      this.tween({ targets: veil, fillAlpha: 0.2, duration: 120, yoyo: true, repeat: 2 });
    });
    this.later(13_000, () => {
      this.tween({ targets: veil, fillAlpha: 0, duration: 4_000 });
      const crew = this.track(
        ctx.scene.add.image(ctx.focus.x, ctx.focus.y + 20, 'a-repair').setDepth(ctx.focus.y + 20),
      );
      this.tween({ targets: crew, y: crew.y - 6, duration: 400, yoyo: true, repeat: -1 });
    });

    ctx.traffic.setActivity(0.5);
  }

  stop(): void {
    this.ctx?.traffic.setActivity(1);
    super.stop();
  }
}

/** Traffic jam: a cluster of stationary cars with frustration marks. */
export class TrafficJamController extends TrackedController implements EventController {
  start(ctx: EventStageContext): void {
    this.ctx = ctx;
    const route = VEHICLE_ROUTES[0] ?? [];
    const anchor = route.length > 2 ? tileToWorld(route[1]) : ctx.focus;
    const textures = ['a-car', 'a-car2', 'a-van', 'a-truck', 'a-bus'];

    for (let i = 0; i < 7; i++) {
      const car = this.track(
        ctx.scene.add
          .image(anchor.x + i * 34, anchor.y + i * 17, textures[i % textures.length])
          .setDepth(anchor.y + i * 17),
      );
      this.tween({
        targets: car,
        x: car.x + 6,
        duration: 260 + i * 40,
        yoyo: true,
        repeat: -1,
        delay: i * 90,
      });
      if (i % 3 === 0) {
        const honk = this.track(
          ctx.scene.add
            .text(car.x, car.y - 26, '!', {
              fontFamily: 'Inter, system-ui, sans-serif',
              fontSize: '16px',
              color: '#e4573d',
              fontStyle: 'bold',
            })
            .setOrigin(0.5)
            .setDepth(car.depth + 2),
        );
        this.tween({ targets: honk, alpha: { from: 1, to: 0.2 }, duration: 700, yoyo: true, repeat: -1 });
      }
    }
    ctx.traffic.setActivity(0.45);
  }

  stop(): void {
    this.ctx?.traffic.setActivity(1);
    super.stop();
  }
}
