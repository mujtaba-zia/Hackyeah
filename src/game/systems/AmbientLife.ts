import Phaser from 'phaser';
import { CAR_ROUTE, CITY_CENTER } from '../world/cityLayout';
import { tileToWorld } from '../world/iso';

/**
 * Three cheap purely-visual effects so the city is not dead:
 * a looping car, drifting clouds, and a fountain splash.
 * No simulation, no pathfinding.
 */
export function createAmbientLife(scene: Phaser.Scene): void {
  // --- car looping around the ring road ---
  const route = CAR_ROUTE.map((tile) => tileToWorld(tile));
  const car = scene.add.image(route[0].x, route[0].y, 'a-car').setDepth(route[0].y);

  const driveTo = (index: number) => {
    const target = route[index];
    const from = { x: car.x, y: car.y };
    const distance = Phaser.Math.Distance.Between(from.x, from.y, target.x, target.y);
    scene.tweens.add({
      targets: car,
      x: target.x,
      y: target.y,
      duration: (distance / 90) * 1000,
      onUpdate: () => car.setDepth(car.y),
      onComplete: () => driveTo((index + 1) % route.length),
    });
  };
  driveTo(1);

  // --- drifting clouds ---
  for (let i = 0; i < 3; i++) {
    const cloud = scene.add
      .image(-400 + i * 420, -260 + i * 120, 'fx-cloud')
      .setDepth(100000)
      .setAlpha(0.65)
      .setScale(0.8 + i * 0.25);
    scene.tweens.add({
      targets: cloud,
      x: cloud.x + 1600,
      duration: 46000 + i * 9000,
      repeat: -1,
      delay: i * 4000,
    });
  }

  // --- fountain splash at the city centre ---
  const center = tileToWorld(CITY_CENTER);
  scene.add
    .particles(center.x, center.y - 34, 'fx-spark', {
      speed: { min: 30, max: 70 },
      angle: { min: 250, max: 290 },
      gravityY: 170,
      scale: { start: 0.45, end: 0 },
      tint: 0x9fdcff,
      lifespan: 900,
      frequency: 90,
    })
    .setDepth(center.y + 1);
}
