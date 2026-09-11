import Phaser from 'phaser';
import { VEHICLE_ROUTES } from '../world/cityLayout';
import { tileToWorld, type TilePos } from '../world/iso';

const VEHICLE_TEXTURES = ['a-car', 'a-car2', 'a-van', 'a-truck', 'a-bus'] as const;

interface Vehicle {
  sprite: Phaser.GameObjects.Image;
  route: readonly TilePos[];
  speed: number;
}

/**
 * Keeps city roads active with cheap, independent tweened traffic.
 */
export class TrafficSystem {
  private readonly scene: Phaser.Scene;
  private readonly vehicles: Vehicle[] = [];
  private readonly activeTweens = new Set<Phaser.Tweens.Tween>();
  private activity = 1;
  private destroyed = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;

    const vehicleCount = Phaser.Math.Between(12, 18);
    const routeOffset = Phaser.Math.Between(0, VEHICLE_ROUTES.length - 1);

    for (let index = 0; index < vehicleCount; index += 1) {
      const route = VEHICLE_ROUTES[(routeOffset + index) % VEHICLE_ROUTES.length];

      if (route.length < 2) {
        continue;
      }

      const legIndex = Phaser.Math.Between(0, route.length - 1);
      const nextLegIndex = (legIndex + 1) % route.length;
      const start = tileToWorld(route[legIndex]);
      const destination = tileToWorld(route[nextLegIndex]);
      const offset = Phaser.Math.FloatBetween(0.05, 0.95);
      const x = Phaser.Math.Linear(start.x, destination.x, offset);
      const y = Phaser.Math.Linear(start.y, destination.y, offset);
      const texture = VEHICLE_TEXTURES[Phaser.Math.Between(0, VEHICLE_TEXTURES.length - 1)];
      const sprite = scene.add.image(x, y, texture).setDepth(y).setFlipX(destination.x < start.x);
      const vehicle = {
        sprite,
        route,
        speed: Phaser.Math.FloatBetween(70, 120),
      };

      this.vehicles.push(vehicle);
      this.driveLeg(vehicle, legIndex);
    }
  }

  /** Dampens the visual city after a failed pipeline without changing its routes. */
  setActivity(level: number): void {
    this.activity = Phaser.Math.Clamp(level, 0.2, 1);

    for (const tween of this.activeTweens) {
      tween.setTimeScale(this.activity);
    }

    const alpha = 0.8 + this.activity * 0.2;

    for (const vehicle of this.vehicles) {
      vehicle.sprite.setAlpha(alpha);
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

    for (const vehicle of this.vehicles) {
      vehicle.sprite.destroy();
    }
    this.vehicles.length = 0;
  }

  private driveLeg(vehicle: Vehicle, legIndex: number): void {
    if (this.destroyed) {
      return;
    }

    const nextLegIndex = (legIndex + 1) % vehicle.route.length;
    const target = tileToWorld(vehicle.route[nextLegIndex]);
    const distance = Phaser.Math.Distance.Between(vehicle.sprite.x, vehicle.sprite.y, target.x, target.y);
    vehicle.sprite.setFlipX(target.x < vehicle.sprite.x);

    let tween: Phaser.Tweens.Tween;
    tween = this.scene.tweens.add({
      targets: vehicle.sprite,
      x: target.x,
      y: target.y,
      duration: (distance / vehicle.speed) * 1000,
      ease: 'Linear',
      onUpdate: () => vehicle.sprite.setDepth(vehicle.sprite.y),
      onComplete: () => {
        this.activeTweens.delete(tween);
        this.driveLeg(vehicle, nextLegIndex);
      },
    });
    tween.setTimeScale(this.activity);
    this.activeTweens.add(tween);
  }
}
