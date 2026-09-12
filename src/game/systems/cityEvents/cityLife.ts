import Phaser from 'phaser';
import { CITY_CENTER, PIPELINE_LEGS, REVIEW_WAITING_SPOTS } from '../../world/cityLayout';
import { tileToWorld } from '../../world/iso';
import { TrackedController, type EventController, type EventStageContext } from './types';

/** Bug invasion: cartoon bugs swarm the test and build districts. */
export class BugInvasionController extends TrackedController implements EventController {
  start(ctx: EventStageContext): void {
    this.ctx = ctx;
    const { x, y } = ctx.focus;

    for (let i = 0; i < 9; i++) {
      const angle = (i / 9) * Math.PI * 2;
      const bug = this.track(
        ctx.scene.add
          .image(x + Math.cos(angle) * 40, y + Math.sin(angle) * 20, 'ev-bug')
          .setDepth(y + 20 + i)
          .setScale(0.6 + (i % 3) * 0.15),
      );
      this.wander(bug, x, y);
    }

    // Two workers give chase, which is the joke.
    for (let i = 0; i < 2; i++) {
      const chaser = this.track(
        ctx.scene.add.image(x - 70 + i * 140, y + 30, 'a-worker-panic').setDepth(y + 30),
      );
      this.tween({
        targets: chaser,
        x: chaser.x + (i === 0 ? 80 : -80),
        duration: 1_800,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.inOut',
      });
    }
  }

  private wander(bug: Phaser.GameObjects.Image, cx: number, cy: number) {
    if (!this.running) return;
    const targetX = cx + Phaser.Math.Between(-150, 150);
    const targetY = cy + Phaser.Math.Between(-70, 70);
    bug.setFlipX(targetX < bug.x);
    this.tween({
      targets: bug,
      x: targetX,
      y: targetY,
      duration: Phaser.Math.Between(1_400, 2_600),
      ease: 'Sine.inOut',
      onUpdate: () => bug.setDepth(bug.y + 20),
      onComplete: () => this.wander(bug, cx, cy),
    });
  }
}

/** Pull request protest: placards and chanting outside Review Hall. */
export class PrProtestController extends TrackedController implements EventController {
  start(ctx: EventStageContext): void {
    this.ctx = ctx;
    const signs = ['ev-sign-a', 'ev-sign-b', 'ev-sign-c'];
    const spots = REVIEW_WAITING_SPOTS.slice(0, 8);

    spots.forEach((tile, i) => {
      const { x, y } = tileToWorld(tile);
      const sign = this.track(
        ctx.scene.add.image(x + 12, y - 26, signs[i % signs.length]).setDepth(y + 40),
      );
      this.tween({
        targets: sign,
        angle: { from: -12, to: 12 },
        duration: 700 + i * 60,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.inOut',
      });

      // A few extra protesters so the crowd reads even when PRs are elsewhere.
      if (i % 2 === 0) {
        const protester = this.track(
          ctx.scene.add.image(x - 10, y, 'pr-annoyed').setDepth(y + 39),
        );
        this.tween({
          targets: protester,
          y: y - 5,
          duration: 420 + i * 40,
          yoyo: true,
          repeat: -1,
        });
      }
    });

    const chant = this.track(
      ctx.scene.add
        .text(ctx.focus.x, ctx.focus.y - 120, 'REVIEW US', {
          fontFamily: 'Inter, system-ui, sans-serif',
          fontSize: '15px',
          color: '#7a2b1f',
          backgroundColor: '#ffe9a8dd',
          padding: { x: 8, y: 4 },
        })
        .setOrigin(0.5)
        .setDepth(ctx.focus.y + 200),
    );
    this.tween({ targets: chant, y: chant.y - 10, duration: 900, yoyo: true, repeat: -1 });
  }
}

/** Deployment parade: a float drives the pipeline road, throwing confetti. */
export class ParadeController extends TrackedController implements EventController {
  start(ctx: EventStageContext): void {
    this.ctx = ctx;
    const leg = PIPELINE_LEGS[PIPELINE_LEGS.length - 1] ?? [];
    const route = leg.map((tile) => tileToWorld(tile));
    if (route.length < 2) return;

    const float = this.track(
      ctx.scene.add.image(route[0].x, route[0].y, 'ev-float').setDepth(route[0].y),
    );
    this.drive(float, route, 1);

    // Cheering crowd along the way.
    route.slice(0, 3).forEach((point, i) => {
      const fan = this.track(
        ctx.scene.add.image(point.x + 30, point.y + 18, 'a-worker-cheer').setDepth(point.y + 5),
      );
      this.tween({
        targets: fan,
        y: fan.y - 8,
        duration: 380 + i * 50,
        yoyo: true,
        repeat: -1,
      });
    });

    this.confettiLoop(float);
  }

  private confettiLoop(float: Phaser.GameObjects.Image) {
    if (!this.running) return;
    this.ctx.fx.confetti(float.x, float.y - 40, 18);
    this.later(1_400, () => this.confettiLoop(float));
  }

  private drive(
    float: Phaser.GameObjects.Image,
    route: { x: number; y: number }[],
    index: number,
  ) {
    if (!this.running) return;
    if (index >= route.length) {
      this.drive(float, route, 0);
      return;
    }
    const target = route[index];
    const distance = Phaser.Math.Distance.Between(float.x, float.y, target.x, target.y);
    float.setFlipX(target.x < float.x);
    this.tween({
      targets: float,
      x: target.x,
      y: target.y,
      duration: Math.max(200, (distance / 90) * 1000),
      onUpdate: () => float.setDepth(float.y),
      onComplete: () => this.drive(float, route, index + 1),
    });
  }
}

/** Fireworks over the city centre. */
export class FireworksController extends TrackedController implements EventController {
  start(ctx: EventStageContext): void {
    this.ctx = ctx;
    this.burst();
  }

  private burst() {
    if (!this.running) return;
    const centre = tileToWorld(CITY_CENTER);
    const x = centre.x + Phaser.Math.Between(-260, 260);
    const y = centre.y - Phaser.Math.Between(180, 330);
    const shell = this.track(this.ctx.scene.add.image(x, y, 'ev-firework').setDepth(2_100_000));
    this.tween({
      targets: shell,
      scale: { from: 0.2, to: 2.2 },
      alpha: { from: 1, to: 0 },
      duration: 900,
      onComplete: () => shell.destroy(),
    });
    this.ctx.fx.confetti(x, y, 22);
    this.ctx.fx.stars(x, y);
    this.later(Phaser.Math.Between(700, 1_500), () => this.burst());
  }
}

/** Rainbow: a wholesome arc after a recovery. */
export class RainbowController extends TrackedController implements EventController {
  start(ctx: EventStageContext): void {
    this.ctx = ctx;
    const centre = tileToWorld(CITY_CENTER);
    const bow = this.track(
      ctx.scene.add
        .image(centre.x, centre.y - 260, 'ev-rainbow')
        .setDepth(1_900_000)
        .setAlpha(0)
        .setScale(1.6),
    );
    this.tween({ targets: bow, alpha: 0.85, duration: 2_500 });
    this.tween({ targets: bow, y: bow.y - 14, duration: 4_000, yoyo: true, repeat: -1 });
  }
}

/** Repair crews: visible healing after a rough patch. */
export class RepairCrewController extends TrackedController implements EventController {
  start(ctx: EventStageContext): void {
    this.ctx = ctx;
    const { x, y } = ctx.focus;
    for (let i = 0; i < 3; i++) {
      const crew = this.track(
        ctx.scene.add
          .image(x - 90 + i * 70, y + 26 + i * 6, i === 1 ? 'a-worker-hammer' : 'a-repair')
          .setDepth(y + 24 + i),
      );
      this.tween({
        targets: crew,
        y: crew.y - 6,
        duration: 340 + i * 60,
        yoyo: true,
        repeat: -1,
      });
      const cone = this.track(
        ctx.scene.add.image(crew.x + 22, crew.y + 12, 'p-cone').setDepth(y + 23 + i),
      );
      void cone;
    }
    this.dustLoop(x, y);
  }

  private dustLoop(x: number, y: number) {
    if (!this.running) return;
    this.ctx.fx.dust(x + Phaser.Math.Between(-60, 60), y + 10);
    this.later(2_200, () => this.dustLoop(x, y));
  }
}

/** Construction boom: scaffolding rises while the city is thriving. */
export class ConstructionController extends TrackedController implements EventController {
  start(ctx: EventStageContext): void {
    this.ctx = ctx;
    const { x, y } = ctx.focus;
    const scaffold = this.track(
      ctx.scene.add.image(x + 90, y + 40, 'p-scaffold').setDepth(y + 40).setAlpha(0),
    );
    this.tween({ targets: scaffold, alpha: 1, duration: 1_200 });

    const builder = this.track(
      ctx.scene.add.image(x + 60, y + 54, 'a-worker-hammer').setDepth(y + 42),
    );
    this.tween({
      targets: builder,
      angle: { from: -8, to: 8 },
      duration: 260,
      yoyo: true,
      repeat: -1,
    });
    this.later(1_000, () => this.dustLoop(x + 90, y + 60));
  }

  private dustLoop(x: number, y: number) {
    if (!this.running) return;
    this.ctx.fx.dust(x, y);
    this.later(2_600, () => this.dustLoop(x, y));
  }
}
