import Phaser from 'phaser';
import { PEDESTRIAN_ROUTES } from '../world/cityLayout';
import { tileToWorld, type TilePos } from '../world/iso';

const PEDESTRIAN_TEXTURES = ['a-ped-a', 'a-ped-b', 'a-ped-c'] as const;

interface PedestrianMotion {
  x: number;
  y: number;
  bob: number;
}

interface Pedestrian {
  sprite: Phaser.GameObjects.Image;
  route: readonly TilePos[];
  speed: number;
  motion: PedestrianMotion;
}

/**
 * Adds pedestrian movement without a simulation or per-frame scene work.
 */
export class PedestrianSystem {
  private readonly scene: Phaser.Scene;
  private readonly pedestrians: Pedestrian[] = [];
  private readonly activeTweens = new Set<Phaser.Tweens.Tween>();
  private activity = 1;
  private destroyed = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;

    const pedestrianCount = Phaser.Math.Between(10, 14);
    const routeOffset = Phaser.Math.Between(0, PEDESTRIAN_ROUTES.length - 1);

    for (let index = 0; index < pedestrianCount; index += 1) {
      const route = PEDESTRIAN_ROUTES[(routeOffset + index) % PEDESTRIAN_ROUTES.length];

      if (route.length < 2) {
        continue;
      }

      const legIndex = Phaser.Math.Between(0, route.length - 1);
      const nextLegIndex = (legIndex + 1) % route.length;
      const start = tileToWorld(route[legIndex]);
      const destination = tileToWorld(route[nextLegIndex]);
      const offset = Phaser.Math.FloatBetween(0.05, 0.95);
      const motion = {
        x: Phaser.Math.Linear(start.x, destination.x, offset),
        y: Phaser.Math.Linear(start.y, destination.y, offset),
        bob: 0,
      };
      const texture = PEDESTRIAN_TEXTURES[Phaser.Math.Between(0, PEDESTRIAN_TEXTURES.length - 1)];
      const sprite = scene.add.image(motion.x, motion.y, texture).setDepth(motion.y);
      const pedestrian = {
        sprite,
        route,
        speed: Phaser.Math.FloatBetween(22, 38),
        motion,
      };

      this.pedestrians.push(pedestrian);
      this.startBob(pedestrian);
      this.walkLeg(pedestrian, legIndex);
    }
  }

  /** Dampens the visual city after a failed pipeline without changing its routes. */
  setActivity(level: number): void {
    this.activity = Phaser.Math.Clamp(level, 0.2, 1);

    for (const tween of this.activeTweens) {
      tween.setTimeScale(this.activity);
    }

    const alpha = 0.8 + this.activity * 0.2;

    for (const pedestrian of this.pedestrians) {
      pedestrian.sprite.setAlpha(alpha);
    }
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }

    this.destroyed = true;

    for (const tween of this.activeTweens) {
      tween.stop();
      tween.remove();
      tween.destroy();
    }
    this.activeTweens.clear();

    for (const pedestrian of this.pedestrians) {
      pedestrian.sprite.destroy();
    }
    this.pedestrians.length = 0;
  }

  private startBob(pedestrian: Pedestrian): void {
    const tween = this.scene.tweens.add({
      targets: pedestrian.motion,
      bob: -3,
      duration: Phaser.Math.Between(450, 700),
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
      onUpdate: () => this.updateDisplay(pedestrian),
    });
    tween.setTimeScale(this.activity);
    this.activeTweens.add(tween);
  }

  private walkLeg(pedestrian: Pedestrian, legIndex: number): void {
    if (this.destroyed) {
      return;
    }

    const nextLegIndex = (legIndex + 1) % pedestrian.route.length;
    const target = tileToWorld(pedestrian.route[nextLegIndex]);
    const distance = Phaser.Math.Distance.Between(
      pedestrian.motion.x,
      pedestrian.motion.y,
      target.x,
      target.y,
    );

    let tween: Phaser.Tweens.Tween;
    tween = this.scene.tweens.add({
      targets: pedestrian.motion,
      x: target.x,
      y: target.y,
      duration: (distance / pedestrian.speed) * 1000,
      ease: 'Linear',
      onUpdate: () => this.updateDisplay(pedestrian),
      onComplete: () => {
        this.activeTweens.delete(tween);
        this.walkLeg(pedestrian, nextLegIndex);
      },
    });
    tween.setTimeScale(this.activity);
    this.activeTweens.add(tween);
  }

  private updateDisplay(pedestrian: Pedestrian): void {
    pedestrian.sprite
      .setPosition(pedestrian.motion.x, pedestrian.motion.y + pedestrian.motion.bob)
      .setDepth(pedestrian.motion.y);
  }
}
